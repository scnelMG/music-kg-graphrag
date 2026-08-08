from __future__ import annotations

import subprocess
import sys
from dataclasses import replace
from pathlib import Path
from typing import TYPE_CHECKING

import psycopg
from testcontainers.postgres import PostgresContainer

from pipeline import pgvector_retrieval
from pipeline.pgvector_retrieval import EmbeddingVersionConflictError, PgvectorExactStore
from pipeline.query_suite import decode_json
from pipeline.retrieval_ablation import evaluate
from pipeline.retrieval_suite import load_suite

if TYPE_CHECKING:
    import pytest

    from pipeline.query_models import JsonValue

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
GOLDEN_SUITE = REPOSITORY_ROOT / "data" / "evaluations" / "retrieval-golden.jsonl"
REGRESSION_SUITE = REPOSITORY_ROOT / "data" / "evaluations" / "retrieval-regression.jsonl"
PGVECTOR_IMAGE = (
    "pgvector/pgvector@sha256:"
    "a36250871de0833b8757561c72f2477ef1ddd1101afa4e617fb552e0de514c6b"
)
_PARALLEL_BARRIER_FUNCTION = """
CREATE OR REPLACE FUNCTION task11_wait_for_parallel_branch(branch integer)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
    entered_count integer;
    expires_at timestamptz := clock_timestamp() + interval '2 seconds';
BEGIN
    PERFORM pg_advisory_lock(11017, branch);
    LOOP
        SELECT count(DISTINCT objid)
        INTO entered_count
        FROM pg_locks
        WHERE locktype = 'advisory'
          AND classid = 11017
          AND objid IN (1, 2)
          AND objsubid = 2;
        IF entered_count = 2 THEN
            RETURN true;
        END IF;
        IF clock_timestamp() >= expires_at THEN
            RAISE EXCEPTION 'parallel branch did not overlap';
        END IF;
        PERFORM pg_sleep(0.005);
    END LOOP;
END;
$$;
"""


_PARALLEL_LEXICAL_GRAPH_SEARCH = """
SELECT evidence_id
FROM (SELECT task11_wait_for_parallel_branch(1)) AS barrier
CROSS JOIN retrieval_embeddings
WHERE embedding_version_key = ANY(%s)
AND %s::text[] IS NOT NULL
AND %s::text IS NOT NULL
AND %s::text[] IS NOT NULL
AND %s::text IS NOT NULL
ORDER BY evidence_id
LIMIT %s
"""
_PARALLEL_EXACT_SEARCH = """
SELECT evidence_id
FROM (SELECT task11_wait_for_parallel_branch(2)) AS barrier
CROSS JOIN retrieval_embeddings
WHERE embedding_version_key = ANY(%s)
ORDER BY embedding <=> %s::vector, evidence_id
LIMIT %s
"""
_SLOW_EXACT_SEARCH = """
SELECT evidence_id
FROM (SELECT pg_sleep(0.05)) AS latency_delay
CROSS JOIN retrieval_embeddings
WHERE embedding_version_key = ANY(%s)
ORDER BY embedding <=> %s::vector, evidence_id
LIMIT %s
"""


def test_exact_search_persists_versioned_embeddings_in_real_pgvector() -> None:
    # Given: a real PostgreSQL server with the pgvector extension available
    suite = load_suite(GOLDEN_SUITE)
    assert len(suite.corpus) > 10
    with PostgresContainer(PGVECTOR_IMAGE, driver=None) as postgres:
        database_url = postgres.get_connection_url(driver=None)
        store = PgvectorExactStore(database_url)
        store.persist_embeddings(suite)

        # When: the exact vector path ranks the semantic scenario
        ranking = store.exact_search(suite, suite.scenarios[1])

        # Then: the required evidence is first and storage/query facts are real DB state
        assert ranking[0] == suite.scenarios[1].required_evidence_ids[0]
        assert store.verify_exact_storage(suite) is True
        with psycopg.connect(database_url) as connection:
            extension = connection.execute(
                "SELECT extversion FROM pg_extension WHERE extname = 'vector'",
            ).fetchone()
            stored = connection.execute(
                """SELECT count(*), count(DISTINCT embedding_version_key)
                FROM retrieval_embeddings""",
            ).fetchone()
            approximate_indexes = connection.execute(
                """SELECT count(*) FROM pg_indexes
                WHERE tablename = 'retrieval_embeddings'
                AND (indexdef ILIKE '%hnsw%' OR indexdef ILIKE '%ivfflat%')""",
            ).fetchone()
        assert extension is not None
        assert stored == (len(suite.corpus), len(suite.corpus))
        assert approximate_indexes == (0,)


def test_identity_change_creates_a_new_persisted_embedding_version() -> None:
    # Given: one persisted suite identity in real pgvector storage
    suite = load_suite(GOLDEN_SUITE)
    with PostgresContainer(PGVECTOR_IMAGE, driver=None) as postgres:
        database_url = postgres.get_connection_url(driver=None)
        store = PgvectorExactStore(database_url)
        store.persist_embeddings(suite)
        original_count = store.persisted_version_count()

        # When: the provider identity changes without overwriting the original version
        changed = replace(
            suite,
            metadata=replace(suite.metadata, provider="fixture-embedding-provider-v2"),
        )
        store.persist_embeddings(changed)

        # Then: both complete immutable embedding versions remain persisted
        assert store.persisted_version_count() == original_count * 2


def test_same_identity_cannot_silently_change_persisted_vector() -> None:
    # Given: one immutable embedding version already persisted in real pgvector
    suite = load_suite(GOLDEN_SUITE)
    with PostgresContainer(PGVECTOR_IMAGE, driver=None) as postgres:
        store = PgvectorExactStore(postgres.get_connection_url(driver=None))
        store.persist_embeddings(suite)
        changed_first = replace(suite.corpus[0], embedding=suite.corpus[1].embedding)
        conflicting = replace(suite, corpus=(changed_first, *suite.corpus[1:]))

        # When: different vector bytes are presented under the same complete identity
        try:
            store.persist_embeddings(conflicting)
        except EmbeddingVersionConflictError as error:
            conflict = error
        else:
            conflict = None

        # Then: persistence fails closed instead of overwriting or accepting stale storage
        assert conflict is not None


def test_measured_fused_requires_overlapping_real_pgvector_branches(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Given: a real pgvector database whose SQL branches rendezvous only while concurrent
    suite = load_suite(GOLDEN_SUITE)
    monkeypatch.setattr(pgvector_retrieval, "BENCHMARK_REPETITIONS", 1)
    monkeypatch.setattr(
        pgvector_retrieval,
        "_LEXICAL_GRAPH_SEARCH",
        _PARALLEL_LEXICAL_GRAPH_SEARCH,
    )
    monkeypatch.setattr(
        pgvector_retrieval,
        "_EXACT_SEARCH",
        _PARALLEL_EXACT_SEARCH,
    )
    with PostgresContainer(PGVECTOR_IMAGE, driver=None) as postgres:
        database_url = postgres.get_connection_url(driver=None)
        with psycopg.connect(database_url) as connection:
            _ = connection.execute(_PARALLEL_BARRIER_FUNCTION)
        store = PgvectorExactStore(database_url)
        store.persist_embeddings(suite)

        # When: fused retrieval runs its lexical and exact-vector branches
        measurement = store.measured_fused(suite, suite.scenarios[1])

    # Then: both rendezvous points completed, which serial execution cannot satisfy
    assert len(measurement.vector_latency_samples_us) == 1
    assert len(measurement.latency_samples_us) == 1


def test_real_pgvector_report_rejects_only_latency_gate(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Given: a correctly ranked real pgvector suite with delay only in exact-vector SQL
    suite = load_suite(GOLDEN_SUITE)
    monkeypatch.setattr(
        pgvector_retrieval,
        "_EXACT_SEARCH",
        _SLOW_EXACT_SEARCH,
    )
    with PostgresContainer(PGVECTOR_IMAGE, driver=None) as postgres:
        database_url = postgres.get_connection_url(driver=None)
        store = PgvectorExactStore(database_url)

        # When: the observed real-storage report measures the deliberately slower fused path
        report = evaluate(suite, GOLDEN_SUITE.read_bytes(), store)

    # Then: intact ranking and persistence gates leave latency as the sole rejection cause
    gate = report["release_gate"]
    assert isinstance(gate, dict)
    assert gate["required_evidence_ranked_first"] is True
    assert gate["required_evidence_non_regressive"] is True
    assert gate["recall_at_10_evaluable"] is True
    assert gate["exact_recall_at_10"] == "1.000000"
    assert gate["persistent_pgvector_verified"] is True
    latency_increase = gate["p95_latency_increase"]
    assert isinstance(latency_increase, str)
    assert float(latency_increase) > 0.20
    assert gate["latency_threshold_passed"] is False
    assert gate["local_quality_thresholds_passed"] is False
    assert gate["all_thresholds_passed"] is False
    assert report["vector_feature_enabled"] is False


def test_real_pgvector_cli_enables_only_happy_exact_gate(tmp_path: Path) -> None:
    # Given: one real pgvector database and happy/regressed versions of the same suite
    with PostgresContainer(PGVECTOR_IMAGE, driver=None) as postgres:
        database_url = postgres.get_connection_url(driver=None)

        # When: both suites run through the public CLI against persistent exact storage
        results: list[tuple[subprocess.CompletedProcess[str], dict[str, JsonValue]]] = []
        for suite in (GOLDEN_SUITE, REGRESSION_SUITE):
            output = tmp_path / f"{suite.stem}.json"
            completed = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "pipeline.ablate_retrieval",
                    "--suite",
                    str(suite),
                    "--output",
                    str(output),
                    "--postgres-dsn",
                    database_url,
                ],
                cwd=REPOSITORY_ROOT,
                check=False,
                capture_output=True,
                text=True,
            )
            report = decode_json(output.read_text(encoding="utf-8"))
            assert isinstance(report, dict)
            results.append((completed, report))

        # Then: real measured happy evidence enables and a ranking regression fails closed
        happy_result, happy = results[0]
        regression_result, regression = results[1]
        assert happy_result.returncode == 0, happy_result.stderr
        assert happy["vector_feature_enabled"] is True
        happy_gate = happy["release_gate"]
        assert isinstance(happy_gate, dict)
        assert happy_gate["persistent_pgvector_verified"] is True
        assert happy_gate["exact_recall_at_10"] == "1.000000"
        measurement = happy["latency_measurement"]
        metrics = happy["metrics"]
        scenarios = happy["scenarios"]
        assert isinstance(measurement, dict)
        assert isinstance(metrics, dict)
        assert isinstance(scenarios, list)
        assert measurement["source"] == "observed-query-wall-clock"
        assert measurement["fusion_execution"] == "parallel-end-to-end-wall-clock"
        assert measurement["unit"] == "us"
        latency_p95 = metrics["latency_p95_us"]
        assert isinstance(latency_p95, dict)
        baseline_p95 = latency_p95["lexical_graph"]
        fused_p95 = latency_p95["fused"]
        assert isinstance(baseline_p95, int)
        assert isinstance(fused_p95, int)
        assert happy_gate["p95_latency_increase"] == (
            f"{(fused_p95 - baseline_p95) / baseline_p95:.6f}"
        )
        assert all(
            isinstance(scenario, dict)
            and "latency_us" in scenario
            and "latency_ms" not in scenario
            for scenario in scenarios
        )
        assert regression_result.returncode == 2
        assert regression["vector_feature_enabled"] is False
