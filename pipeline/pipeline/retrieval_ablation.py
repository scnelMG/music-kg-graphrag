from __future__ import annotations

import hashlib
import math
import re
from dataclasses import dataclass
from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from collections.abc import Sequence

    from .query_models import JsonValue
    from .retrieval_suite import RetrievalSuite, Scenario

from .embedding_identity import EmbeddingIdentity, embedding_version_key

TOP_K = 10
RECALL_THRESHOLD = 0.95
LATENCY_INCREASE_THRESHOLD = 0.20
_TOKEN = re.compile(r"[a-z0-9]+")


@dataclass(frozen=True, slots=True)
class RankingMeasurement:
    evidence_ids: tuple[str, ...]
    latency_samples_us: tuple[int, ...]


@dataclass(frozen=True, slots=True)
class FusedRankingMeasurement:
    vector_evidence_ids: tuple[str, ...]
    fused_evidence_ids: tuple[str, ...]
    vector_latency_samples_us: tuple[int, ...]
    latency_samples_us: tuple[int, ...]


class PersistentExactRetrieval(Protocol):
    def persist_embeddings(self, suite: RetrievalSuite) -> None: ...

    def measured_lexical_graph(
        self,
        suite: RetrievalSuite,
        scenario: Scenario,
    ) -> RankingMeasurement: ...

    def measured_fused(
        self,
        suite: RetrievalSuite,
        scenario: Scenario,
    ) -> FusedRankingMeasurement: ...

    def verify_exact_storage(self, suite: RetrievalSuite) -> bool: ...


def _lexical_graph(suite: RetrievalSuite, scenario: Scenario) -> tuple[str, ...]:
    query_tokens = set(_TOKEN.findall(scenario.query.casefold()))
    scored: list[tuple[int, str]] = []
    for item in suite.corpus:
        overlap = len(query_tokens & set(_TOKEN.findall(item.canonical_text.casefold())))
        graph_match = item.evidence_id in scenario.graph_evidence_ids
        if overlap or graph_match:
            scored.append((2 * int(graph_match) + overlap, item.evidence_id))
    ranked = sorted(scored, key=lambda row: (-row[0], row[1]))
    return tuple(evidence_id for _, evidence_id in ranked)


def _exact_vector(suite: RetrievalSuite, scenario: Scenario) -> tuple[str, ...]:
    scores: list[tuple[float, str]] = []
    for item in suite.corpus:
        pairs = zip(scenario.query_embedding, item.embedding, strict=True)
        scores.append((sum(left * right for left, right in pairs), item.evidence_id))
    ranked = sorted(scores, key=lambda row: (-row[0], row[1]))
    return tuple(evidence_id for _, evidence_id in ranked)


def fuse_rankings(baseline: Sequence[str], vector: Sequence[str]) -> tuple[str, ...]:
    scores: dict[str, float] = {}
    for ranking in (baseline, vector):
        for rank, evidence_id in enumerate(ranking, 1):
            scores[evidence_id] = scores.get(evidence_id, 0.0) + 1 / (60 + rank)
    return tuple(sorted(scores, key=lambda evidence_id: (-scores[evidence_id], evidence_id)))


def _recall(ranking: Sequence[str], required: Sequence[str]) -> float:
    return len(set(ranking[:TOP_K]) & set(required)) / len(required)


def _required_ranked_first(ranking: Sequence[str], required: Sequence[str]) -> bool:
    return set(ranking[: len(required)]) == set(required)


def _ratio(value: float) -> str:
    return f"{value:.6f}"


def percentile_95(samples: Sequence[int]) -> int:
    ordered = sorted(samples)
    rank = math.ceil(len(ordered) * 0.95) - 1
    return ordered[rank]


def evaluate(
    suite: RetrievalSuite,
    suite_bytes: bytes,
    retrieval: PersistentExactRetrieval | None = None,
) -> dict[str, JsonValue]:
    scenario_payloads: list[JsonValue] = []
    totals = {"baseline": 0.0, "vector": 0.0, "fused": 0.0}
    required_ranked_first = True
    baseline_samples: list[int] = []
    fused_samples: list[int] = []
    if retrieval is not None:
        retrieval.persist_embeddings(suite)
    for scenario in suite.scenarios:
        if retrieval is None:
            baseline = _lexical_graph(suite, scenario)
            vector = _exact_vector(suite, scenario)
            scenario_baseline_latency = scenario.baseline_latency_ms
            scenario_vector_latency = scenario.vector_latency_ms
            scenario_fused_latency = scenario.fused_latency_ms
            fused = fuse_rankings(baseline, vector)
        else:
            baseline_measurement = retrieval.measured_lexical_graph(suite, scenario)
            fused_measurement = retrieval.measured_fused(suite, scenario)
            baseline = baseline_measurement.evidence_ids
            vector = fused_measurement.vector_evidence_ids
            baseline_samples.extend(baseline_measurement.latency_samples_us)
            fused_samples.extend(fused_measurement.latency_samples_us)
            scenario_baseline_latency = percentile_95(
                baseline_measurement.latency_samples_us,
            )
            scenario_vector_latency = percentile_95(
                fused_measurement.vector_latency_samples_us,
            )
            scenario_fused_latency = percentile_95(fused_measurement.latency_samples_us)
            fused = fused_measurement.fused_evidence_ids
        recalls = {
            "baseline": _recall(baseline, scenario.required_evidence_ids),
            "vector": _recall(vector, scenario.required_evidence_ids),
            "fused": _recall(fused, scenario.required_evidence_ids),
        }
        for method, recall in recalls.items():
            totals[method] += recall
        required_ranked_first = required_ranked_first and _required_ranked_first(
            vector,
            scenario.required_evidence_ids,
        )
        scenario_payloads.append(
            {
                "scenario_id": scenario.scenario_id,
                "required_evidence_ids": list(scenario.required_evidence_ids),
                "retrieved_evidence_ids": {
                    "lexical_graph": list(baseline[:TOP_K]),
                    "vector_exact": list(vector[:TOP_K]),
                    "fused": list(fused[:TOP_K]),
                },
                "retrieval_recall": {method: _ratio(value) for method, value in recalls.items()},
                "evidence_recall": {method: _ratio(value) for method, value in recalls.items()},
                "latency_ms" if retrieval is None else "latency_us": {
                    "lexical_graph": scenario_baseline_latency,
                    "vector_exact": scenario_vector_latency,
                    "fused": scenario_fused_latency,
                },
                "estimated_cost_usd": scenario.estimated_cost_usd,
            },
        )
    count = len(suite.scenarios)
    aggregate = {method: value / count for method, value in totals.items()}
    if retrieval is None:
        baseline_p95 = percentile_95(
            tuple(scenario.baseline_latency_ms for scenario in suite.scenarios),
        )
        fused_p95 = percentile_95(
            tuple(scenario.fused_latency_ms for scenario in suite.scenarios),
        )
    else:
        baseline_p95 = percentile_95(baseline_samples)
        fused_p95 = percentile_95(fused_samples)
    latency_increase = (fused_p95 - baseline_p95) / baseline_p95
    non_regressive = aggregate["fused"] >= aggregate["baseline"]
    recall_at_10_evaluable = len(suite.corpus) > TOP_K
    exact_passed = recall_at_10_evaluable and aggregate["vector"] >= RECALL_THRESHOLD
    latency_passed = latency_increase <= LATENCY_INCREASE_THRESHOLD
    local_quality_passed = non_regressive and required_ranked_first and latency_passed
    persistent_pgvector_verified = (
        retrieval is not None and retrieval.verify_exact_storage(suite)
    )
    passed = local_quality_passed and exact_passed and persistent_pgvector_verified
    metadata = suite.metadata
    versions: list[JsonValue] = [
        {
            "evidence_id": item.evidence_id,
            "content_hash": item.content_hash,
            "embedding_version": embedding_version_key(
                EmbeddingIdentity(
                    evidence_id=item.evidence_id,
                    content_hash=item.content_hash,
                    provider=metadata.provider,
                    model=metadata.model,
                    dimension=metadata.dimension,
                    normalisation=metadata.normalisation,
                    policy_version=suite.policy_version,
                    embedding_version=metadata.version,
                ),
            ),
        }
        for item in suite.corpus
    ]
    embedding_payload: dict[str, JsonValue] = {
        "version": metadata.version,
        "provider": metadata.provider,
        "model": metadata.model,
        "dimension": metadata.dimension,
        "normalisation": metadata.normalisation,
        "evaluation": {
            "backend": metadata.evaluation_backend,
            "algorithm": metadata.evaluation_algorithm,
            "metric": metadata.evaluation_metric,
            "persistent": metadata.evaluation_persistent,
        },
        "versions": versions,
    }
    payload: dict[str, JsonValue] = {
        "contract_version": "retrieval-ablation/2.0.0",
        "status": "PASSED" if passed else "REJECTED",
        "vector_feature_enabled": passed,
        "policy_version": suite.policy_version,
        "baseline_error_analysis_reference": suite.baseline_error_analysis_reference,
        "suite_sha256": f"sha256:{hashlib.sha256(suite_bytes).hexdigest()}",
        "embedding_metadata": embedding_payload,
        "latency_measurement": {
            "source": "declared-fixture"
            if retrieval is None
            else "observed-query-wall-clock",
            "unit": "ms" if retrieval is None else "us",
            "samples_per_method": 0
            if retrieval is None
            else len(baseline_samples),
            "fusion_execution": "declared"
            if retrieval is None
            else "parallel-end-to-end-wall-clock",
        },
        "metrics": {
            "required_evidence_recall": {
                method: _ratio(value) for method, value in aggregate.items()
            },
            "latency_p95_ms" if retrieval is None else "latency_p95_us": {
                "lexical_graph": baseline_p95,
                "fused": fused_p95,
            },
            "estimated_cost_usd_max": max(
                scenario.estimated_cost_usd for scenario in suite.scenarios
            ),
        },
        "release_gate": {
            "all_thresholds_passed": passed,
            "local_quality_thresholds_passed": local_quality_passed,
            "required_evidence_ranked_first": required_ranked_first,
            "recall_at_10_evaluable": recall_at_10_evaluable,
            "persistent_pgvector_verified": persistent_pgvector_verified,
            "required_evidence_non_regressive": non_regressive,
            "exact_recall_at_10": _ratio(aggregate["vector"])
            if recall_at_10_evaluable
            else None,
            "exact_recall_threshold": "0.950000",
            "latency_threshold_passed": latency_passed,
            "p95_latency_increase": _ratio(latency_increase),
            "p95_latency_increase_threshold": "0.200000",
        },
        "scenarios": scenario_payloads,
    }
    return payload
