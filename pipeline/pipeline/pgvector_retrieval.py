from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from time import perf_counter_ns
from typing import TYPE_CHECKING, Final, final, override

import psycopg

from .embedding_identity import EmbeddingIdentity, embedding_version_key
from .retrieval_ablation import (
    TOP_K,
    FusedRankingMeasurement,
    RankingMeasurement,
    fuse_rankings,
)

if TYPE_CHECKING:
    from collections.abc import Sequence

    from .retrieval_suite import RetrievalSuite, Scenario


BENCHMARK_REPETITIONS: Final = 20
_SCHEMA: Final = """
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS retrieval_embeddings (
    embedding_version_key text PRIMARY KEY,
    evidence_id text NOT NULL,
    content_hash text NOT NULL,
    provider text NOT NULL,
    model text NOT NULL,
    dimension integer NOT NULL CHECK (dimension > 0),
    normalisation text NOT NULL,
    retrieval_policy_version text NOT NULL,
    embedding_policy_version text NOT NULL,
    canonical_text text NOT NULL,
    embedding vector NOT NULL,
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);
"""
_INSERT: Final = """
INSERT INTO retrieval_embeddings(
    embedding_version_key, evidence_id, content_hash, provider, model, dimension,
    normalisation, retrieval_policy_version, embedding_policy_version,
    canonical_text, embedding
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::vector)
ON CONFLICT (embedding_version_key) DO NOTHING
"""
_EXACT_SEARCH: Final = """
SELECT evidence_id
FROM retrieval_embeddings
WHERE embedding_version_key = ANY(%s)
ORDER BY embedding <=> %s::vector, evidence_id
LIMIT %s
"""
_LEXICAL_GRAPH_SEARCH: Final = """
SELECT evidence_id
FROM retrieval_embeddings
WHERE embedding_version_key = ANY(%s)
AND (
    evidence_id = ANY(%s)
    OR to_tsvector('simple', canonical_text) @@ plainto_tsquery('simple', %s)
)
ORDER BY
    (evidence_id = ANY(%s)) DESC,
    ts_rank_cd(
        to_tsvector('simple', canonical_text),
        plainto_tsquery('simple', %s)
    ) DESC,
    evidence_id
LIMIT %s
"""


@dataclass(frozen=True, slots=True)
class EmbeddingVersionConflictError(RuntimeError):
    embedding_version_key: str

    @override
    def __str__(self) -> str:
        return f"immutable embedding version conflict: {self.embedding_version_key}"


def _vector_literal(vector: Sequence[float]) -> str:
    return "[" + ",".join(format(component, ".12g") for component in vector) + "]"


def _identity(suite: RetrievalSuite, evidence_id: str, content_hash: str) -> EmbeddingIdentity:
    metadata = suite.metadata
    return EmbeddingIdentity(
        evidence_id=evidence_id,
        content_hash=content_hash,
        provider=metadata.provider,
        model=metadata.model,
        dimension=metadata.dimension,
        normalisation=metadata.normalisation,
        policy_version=suite.policy_version,
        embedding_version=metadata.version,
    )


def _version_keys(suite: RetrievalSuite) -> tuple[str, ...]:
    return tuple(
        embedding_version_key(_identity(suite, item.evidence_id, item.content_hash))
        for item in suite.corpus
    )


@final
class PgvectorExactStore:
    def __init__(self, database_url: str) -> None:
        self._database_url = database_url
        with psycopg.connect(self._database_url) as connection:
            _ = connection.execute(_SCHEMA)

    def persist_embeddings(self, suite: RetrievalSuite) -> None:
        metadata = suite.metadata
        with psycopg.connect(self._database_url) as connection:
            for item in suite.corpus:
                identity = _identity(suite, item.evidence_id, item.content_hash)
                version_key = embedding_version_key(identity)
                vector_literal = _vector_literal(item.embedding)
                _ = connection.execute(
                    _INSERT,
                    (
                        version_key,
                        item.evidence_id,
                        item.content_hash,
                        metadata.provider,
                        metadata.model,
                        metadata.dimension,
                        metadata.normalisation,
                        suite.policy_version,
                        metadata.version,
                        item.canonical_text,
                        vector_literal,
                    ),
                )
                matches = connection.execute(
                    """SELECT count(*) FROM retrieval_embeddings WHERE
                    embedding_version_key = %s AND evidence_id = %s AND content_hash = %s
                    AND provider = %s AND model = %s AND dimension = %s
                    AND normalisation = %s AND retrieval_policy_version = %s
                    AND embedding_policy_version = %s AND canonical_text = %s
                    AND embedding = %s::vector""",
                    (
                        version_key,
                        item.evidence_id,
                        item.content_hash,
                        metadata.provider,
                        metadata.model,
                        metadata.dimension,
                        metadata.normalisation,
                        suite.policy_version,
                        metadata.version,
                        item.canonical_text,
                        vector_literal,
                    ),
                ).fetchone()
                if matches != (1,):
                    raise EmbeddingVersionConflictError(version_key)

    def exact_search(self, suite: RetrievalSuite, scenario: Scenario) -> tuple[str, ...]:
        with psycopg.connect(self._database_url) as connection:
            rows = connection.execute(
                _EXACT_SEARCH,
                (list(_version_keys(suite)), _vector_literal(scenario.query_embedding), TOP_K),
            ).fetchall()
        return tuple(row[0] for row in rows)

    def measured_fused(
        self,
        suite: RetrievalSuite,
        scenario: Scenario,
    ) -> FusedRankingMeasurement:
        vector_samples: list[int] = []
        fused_samples: list[int] = []
        baseline_ranking: tuple[str, ...] = ()
        vector_ranking: tuple[str, ...] = ()
        fused_ranking: tuple[str, ...] = ()
        lexical_parameters = (
            list(_version_keys(suite)),
            list(scenario.graph_evidence_ids),
            scenario.query,
            list(scenario.graph_evidence_ids),
            scenario.query,
            TOP_K,
        )
        vector_parameters = (
            list(_version_keys(suite)),
            _vector_literal(scenario.query_embedding),
            TOP_K,
        )
        with (
            psycopg.connect(self._database_url) as lexical_connection,
            psycopg.connect(self._database_url) as vector_connection,
            ThreadPoolExecutor(max_workers=2) as executor,
        ):
            def lexical_search() -> tuple[str, ...]:
                rows = lexical_connection.execute(
                    _LEXICAL_GRAPH_SEARCH,
                    lexical_parameters,
                ).fetchall()
                return tuple(row[0] for row in rows)

            def vector_search() -> tuple[tuple[str, ...], int]:
                vector_started = perf_counter_ns()
                rows = vector_connection.execute(
                    _EXACT_SEARCH,
                    vector_parameters,
                ).fetchall()
                elapsed_us = (perf_counter_ns() - vector_started) // 1_000
                return tuple(row[0] for row in rows), elapsed_us

            for _ in range(BENCHMARK_REPETITIONS):
                started = perf_counter_ns()
                lexical_future = executor.submit(lexical_search)
                vector_future = executor.submit(vector_search)
                baseline_ranking = lexical_future.result()
                vector_ranking, vector_elapsed_us = vector_future.result()
                fused_ranking = fuse_rankings(baseline_ranking, vector_ranking)
                fused_samples.append((perf_counter_ns() - started) // 1_000)
                vector_samples.append(vector_elapsed_us)
        return FusedRankingMeasurement(
            vector_evidence_ids=vector_ranking,
            fused_evidence_ids=fused_ranking,
            vector_latency_samples_us=tuple(vector_samples),
            latency_samples_us=tuple(fused_samples),
        )

    def measured_lexical_graph(
        self,
        suite: RetrievalSuite,
        scenario: Scenario,
    ) -> RankingMeasurement:
        samples: list[int] = []
        ranking: tuple[str, ...] = ()
        parameters = (
            list(_version_keys(suite)),
            list(scenario.graph_evidence_ids),
            scenario.query,
            list(scenario.graph_evidence_ids),
            scenario.query,
            TOP_K,
        )
        with psycopg.connect(self._database_url) as connection:
            for _ in range(BENCHMARK_REPETITIONS):
                started = perf_counter_ns()
                rows = connection.execute(_LEXICAL_GRAPH_SEARCH, parameters).fetchall()
                samples.append((perf_counter_ns() - started) // 1_000)
                ranking = tuple(row[0] for row in rows)
        return RankingMeasurement(ranking, tuple(samples))

    def verify_exact_storage(self, suite: RetrievalSuite) -> bool:
        keys = _version_keys(suite)
        with psycopg.connect(self._database_url) as connection:
            extension = connection.execute(
                "SELECT count(*) FROM pg_extension WHERE extname = 'vector'",
            ).fetchone()
            stored = connection.execute(
                """SELECT count(*) FROM retrieval_embeddings
                WHERE embedding_version_key = ANY(%s)""",
                (list(keys),),
            ).fetchone()
            approximate_indexes = connection.execute(
                """SELECT count(*) FROM pg_indexes
                WHERE tablename = 'retrieval_embeddings'
                AND (indexdef ILIKE '%hnsw%' OR indexdef ILIKE '%ivfflat%')""",
            ).fetchone()
        return extension == (1,) and stored == (len(keys),) and approximate_indexes == (0,)

    def persisted_version_count(self) -> int:
        with psycopg.connect(self._database_url) as connection:
            row = connection.execute("SELECT count(*) FROM retrieval_embeddings").fetchone()
        return 0 if row is None else row[0]
