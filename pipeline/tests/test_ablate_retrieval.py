from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from dataclasses import replace
from pathlib import Path
from typing import TYPE_CHECKING, final

from pipeline.embedding_identity import EmbeddingIdentity, embedding_version_key
from pipeline.query_suite import decode_json
from pipeline.retrieval_ablation import (
    FusedRankingMeasurement,
    RankingMeasurement,
    evaluate,
    percentile_95,
)
from pipeline.retrieval_suite import RetrievalSuite, Scenario, load_suite

if TYPE_CHECKING:
    from pipeline.query_models import JsonValue


REPOSITORY_ROOT = Path(__file__).parents[2]
GOLDEN_SUITE = REPOSITORY_ROOT / "data" / "evaluations" / "retrieval-golden.jsonl"
REGRESSION_SUITE = REPOSITORY_ROOT / "data" / "evaluations" / "retrieval-regression.jsonl"


@final
class _MeasuredRetrieval:
    def __init__(self, fused_latency_us: int) -> None:
        self._fused_latency_us = fused_latency_us

    def persist_embeddings(self, suite: RetrievalSuite) -> None:
        del suite

    def measured_lexical_graph(
        self,
        suite: RetrievalSuite,
        scenario: Scenario,
    ) -> RankingMeasurement:
        del suite
        return RankingMeasurement(scenario.required_evidence_ids, (1_000,) * 20)

    def measured_fused(
        self,
        suite: RetrievalSuite,
        scenario: Scenario,
    ) -> FusedRankingMeasurement:
        del suite
        return FusedRankingMeasurement(
            vector_evidence_ids=scenario.required_evidence_ids,
            fused_evidence_ids=scenario.required_evidence_ids,
            vector_latency_samples_us=(500,) * 20,
            latency_samples_us=(self._fused_latency_us,) * 20,
        )

    def verify_exact_storage(self, suite: RetrievalSuite) -> bool:
        del suite
        return True


def _run_ablation(suite: Path, output: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            "-m",
            "pipeline.ablate_retrieval",
            "--suite",
            str(suite),
            "--output",
            str(output),
        ],
        cwd=REPOSITORY_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )


def _load_report(path: Path) -> dict[str, JsonValue]:
    loaded = decode_json(path.read_text(encoding="utf-8"))
    assert isinstance(loaded, dict)
    return loaded


def test_golden_cli_without_database_keeps_vectors_disabled(tmp_path: Path) -> None:
    # Given: a frozen corpus whose baseline analysis identifies a semantic recall miss
    output = tmp_path / "golden.json"

    # When: all three retrieval methods are evaluated against identical scenarios
    completed = _run_ablation(GOLDEN_SUITE, output)

    # Then: suite quality is visible without treating declared pgvector metadata as proof
    assert completed.returncode == 2, completed.stderr
    report = _load_report(output)
    assert report["status"] == "REJECTED"
    assert report["vector_feature_enabled"] is False
    gate = report["release_gate"]
    metadata = report["embedding_metadata"]
    scenarios = report["scenarios"]
    assert isinstance(gate, dict)
    assert isinstance(metadata, dict)
    assert isinstance(scenarios, list)
    assert gate["all_thresholds_passed"] is False
    assert gate["local_quality_thresholds_passed"] is True
    assert gate["required_evidence_ranked_first"] is True
    assert gate["recall_at_10_evaluable"] is True
    assert gate["exact_recall_at_10"] == "1.000000"
    assert gate["persistent_pgvector_verified"] is False
    assert gate["required_evidence_non_regressive"] is True
    assert gate["p95_latency_increase"] == "0.150000"
    assert metadata["provider"] == "fixture-embedding-provider"
    assert metadata["model"] == "semantic-fixture-v2"
    assert metadata["dimension"] == 2
    assert metadata["normalisation"] == "l2"
    evaluation = metadata["evaluation"]
    assert isinstance(evaluation, dict)
    assert evaluation == {
        "algorithm": "exact",
        "backend": "postgresql",
        "metric": "cosine",
        "persistent": True,
    }
    assert report["baseline_error_analysis_reference"] == (
        "docs/retrieval-baseline-error-analysis.md#semantic-recall-miss"
    )
    assert all(isinstance(item, dict) and "retrieval_recall" in item for item in scenarios)
    assert all(isinstance(item, dict) and "evidence_recall" in item for item in scenarios)


def test_reversed_semantic_ranking_fails_required_evidence_discrimination(
    tmp_path: Path,
) -> None:
    # Given: the frozen suite with the semantic query embedding reversed toward the wrong item
    reversed_suite = tmp_path / "reversed.jsonl"
    suite = decode_json(GOLDEN_SUITE.read_text(encoding="utf-8").splitlines()[0])
    assert isinstance(suite, dict)
    scenarios = suite["scenarios"]
    assert isinstance(scenarios, list)
    semantic = scenarios[1]
    assert isinstance(semantic, dict)
    semantic["query_embedding"] = [1.0, 0.0]
    _ = reversed_suite.write_text(json.dumps(suite) + "\n", encoding="utf-8")

    # When: the local deterministic evaluation ranks the reversed vectors
    output = tmp_path / "reversed.json"
    completed = _run_ablation(reversed_suite, output)

    # Then: the report witnesses the wrong first result and rejects the quality gate
    assert completed.returncode == 2
    report = _load_report(output)
    gate = report["release_gate"]
    report_scenarios = report["scenarios"]
    assert isinstance(gate, dict)
    assert isinstance(report_scenarios, list)
    semantic_report = report_scenarios[1]
    assert isinstance(semantic_report, dict)
    retrieved = semantic_report["retrieved_evidence_ids"]
    assert isinstance(retrieved, dict)
    vector_exact = retrieved["vector_exact"]
    assert isinstance(vector_exact, list)
    assert vector_exact[0] == "evidence:fixture-review-001"
    assert gate["required_evidence_ranked_first"] is False
    assert gate["local_quality_thresholds_passed"] is False
    assert report["vector_feature_enabled"] is False


def test_regression_cli_fails_gate_and_leaves_vector_disabled(tmp_path: Path) -> None:
    # Given: identical retrieval quality but a fused p95 latency regression over 20 percent
    output = tmp_path / "regression.json"

    # When: the release ablation is evaluated
    completed = _run_ablation(REGRESSION_SUITE, output)

    # Then: misleading retrieval success cannot enable the vector feature
    assert completed.returncode != 0
    report = _load_report(output)
    assert report["status"] == "REJECTED"
    assert report["vector_feature_enabled"] is False
    gate = report["release_gate"]
    assert isinstance(gate, dict)
    assert gate["all_thresholds_passed"] is False
    assert gate["latency_threshold_passed"] is False


def test_repeated_reports_are_byte_identical(tmp_path: Path) -> None:
    # Given: one immutable versioned evaluation suite
    first = tmp_path / "first.json"
    second = tmp_path / "second.json"

    # When: independent CLI processes evaluate it twice
    first_run = _run_ablation(GOLDEN_SUITE, first)
    second_run = _run_ablation(GOLDEN_SUITE, second)

    # Then: the report and its externally observed hash are deterministic
    assert first_run.returncode == second_run.returncode == 2
    assert first.read_bytes() == second.read_bytes()
    first_hash = hashlib.sha256(first.read_bytes()).digest()
    second_hash = hashlib.sha256(second.read_bytes()).digest()
    assert first_hash == second_hash


def test_each_embedding_configuration_field_changes_the_version_identity() -> None:
    # Given: one canonical embedding identity and config-only or content-only revisions
    original = EmbeddingIdentity(
        evidence_id="evidence:semantic",
        content_hash="sha256:" + "1" * 64,
        provider="fixture-embedding-provider",
        model="semantic-fixture-v1",
        dimension=2,
        normalisation="l2",
        policy_version="retrieval-fusion-rrf/1.0.0",
        embedding_version="review-description-canonical/1.0.0",
    )
    revisions = (
        replace(original, content_hash="sha256:" + "2" * 64),
        replace(original, provider="replacement-provider"),
        replace(original, model="semantic-fixture-v2"),
        replace(original, dimension=3),
        replace(original, normalisation="none"),
        replace(original, policy_version="retrieval-fusion-rrf/2.0.0"),
        replace(original, embedding_version="review-description-canonical/2.0.0"),
    )

    # When: immutable keys are derived from every canonical identity
    original_version = embedding_version_key(original)
    revised_versions = {embedding_version_key(revision) for revision in revisions}

    # Then: no configuration-only or content-only re-embedding can reuse the old key
    assert len(revised_versions) == len(revisions)
    assert original_version not in revised_versions


def test_p95_uses_nearest_rank_instead_of_maximum() -> None:
    # Given: twenty benchmark samples with one high outlier above the 95th percentile
    samples = (*range(1, 20), 1_000)

    # When: the deterministic p95 is calculated
    percentile = percentile_95(samples)

    # Then: nearest-rank p95 selects sample nineteen rather than the maximum
    assert percentile == 19


def test_observed_latency_reports_end_to_end_parallel_microseconds() -> None:
    # Given: measured baseline and end-to-end fused samples with a 15 percent increase
    suite = load_suite(GOLDEN_SUITE)

    # When: the real-storage evaluation schema is produced
    report = evaluate(suite, GOLDEN_SUITE.read_bytes(), _MeasuredRetrieval(1_150))

    # Then: the critical-path claim and every observed latency field use one truthful unit
    measurement = report["latency_measurement"]
    metrics = report["metrics"]
    scenarios = report["scenarios"]
    assert isinstance(measurement, dict)
    assert isinstance(metrics, dict)
    assert isinstance(scenarios, list)
    assert measurement["fusion_execution"] == "parallel-end-to-end-wall-clock"
    assert measurement["unit"] == "us"
    assert "latency_p95_us" in metrics
    assert "latency_p95_ms" not in metrics
    assert all(
        isinstance(scenario, dict)
        and "latency_us" in scenario
        and "latency_ms" not in scenario
        for scenario in scenarios
    )


def test_observed_fused_p95_increase_rejects_real_regression() -> None:
    # Given: measured baseline p95 of 1000 us and fused end-to-end p95 of 1250 us
    suite = load_suite(GOLDEN_SUITE)

    # When: the latency release gate calculates the increase from those same paths
    report = evaluate(suite, GOLDEN_SUITE.read_bytes(), _MeasuredRetrieval(1_250))

    # Then: the 25 percent increase is reported exactly and exceeds the 20 percent gate
    gate = report["release_gate"]
    assert isinstance(gate, dict)
    assert gate["p95_latency_increase"] == "0.250000"
    assert gate["latency_threshold_passed"] is False
    assert report["vector_feature_enabled"] is False


def test_malformed_and_stale_suites_fail_closed(tmp_path: Path) -> None:
    # Given: malformed JSON and a suite whose declared canonical hash is stale
    malformed = tmp_path / "malformed.jsonl"
    stale = tmp_path / "stale.jsonl"
    _ = malformed.write_text("{not-json}\n", encoding="utf-8")
    golden = decode_json(GOLDEN_SUITE.read_text(encoding="utf-8").splitlines()[0])
    assert isinstance(golden, dict)
    corpus = golden["corpus"]
    assert isinstance(corpus, list)
    first_item = corpus[0]
    assert isinstance(first_item, dict)
    first_item["content_hash"] = "sha256:" + "0" * 64
    _ = stale.write_text(json.dumps(golden) + "\n", encoding="utf-8")

    # When: each untrusted suite crosses the CLI boundary
    malformed_result = _run_ablation(malformed, tmp_path / "malformed.json")
    stale_result = _run_ablation(stale, tmp_path / "stale.json")

    # Then: neither can create a passing or enabled report
    assert malformed_result.returncode != 0
    assert stale_result.returncode != 0
    assert _load_report(tmp_path / "malformed.json")["vector_feature_enabled"] is False
    assert _load_report(tmp_path / "stale.json")["vector_feature_enabled"] is False
