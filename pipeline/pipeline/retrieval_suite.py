from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass
from json import JSONDecodeError
from typing import TYPE_CHECKING, Never, override

if TYPE_CHECKING:
    from pathlib import Path

    from .query_models import JsonValue

from .query_suite import decode_json


@dataclass(frozen=True, slots=True)
class RetrievalSuiteError(Exception):
    detail: str

    @classmethod
    def invalid(cls, field: str, expectation: str) -> RetrievalSuiteError:
        return cls(f"{field}: {expectation}")

    @override
    def __str__(self) -> str:
        return self.detail


def _fail(field: str, expectation: str) -> Never:
    error = RetrievalSuiteError.invalid(field, expectation)
    raise error


@dataclass(frozen=True, slots=True)
class CorpusItem:
    evidence_id: str
    canonical_text: str
    content_hash: str
    embedding: tuple[float, ...]


@dataclass(frozen=True, slots=True)
class Scenario:
    scenario_id: str
    query: str
    query_embedding: tuple[float, ...]
    graph_evidence_ids: tuple[str, ...]
    required_evidence_ids: tuple[str, ...]
    baseline_latency_ms: int
    vector_latency_ms: int
    fused_latency_ms: int
    estimated_cost_usd: str


@dataclass(frozen=True, slots=True)
class EmbeddingMetadata:
    version: str
    provider: str
    model: str
    dimension: int
    normalisation: str
    evaluation_backend: str
    evaluation_algorithm: str
    evaluation_metric: str
    evaluation_persistent: bool


@dataclass(frozen=True, slots=True)
class RetrievalSuite:
    policy_version: str
    baseline_error_analysis_reference: str
    metadata: EmbeddingMetadata
    corpus: tuple[CorpusItem, ...]
    scenarios: tuple[Scenario, ...]


def _mapping(value: JsonValue, field: str) -> dict[str, JsonValue]:
    if not isinstance(value, dict):
        _fail(field, "expected object")
    return value


def _string(mapping: dict[str, JsonValue], field: str) -> str:
    value = mapping.get(field)
    if not isinstance(value, str) or not value:
        _fail(field, "expected non-empty string")
    return value


def _integer(mapping: dict[str, JsonValue], field: str) -> int:
    value = mapping.get(field)
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        _fail(field, "expected positive integer")
    return value


def _boolean(mapping: dict[str, JsonValue], field: str) -> bool:
    value = mapping.get(field)
    if not isinstance(value, bool):
        _fail(field, "expected boolean")
    return value


def _strings(mapping: dict[str, JsonValue], field: str) -> tuple[str, ...]:
    value = mapping.get(field)
    if not isinstance(value, list) or not value or not all(isinstance(item, str) for item in value):
        _fail(field, "expected non-empty string array")
    return tuple(item for item in value if isinstance(item, str))


def _vector(mapping: dict[str, JsonValue], field: str, dimension: int) -> tuple[float, ...]:
    value = mapping.get(field)
    if not isinstance(value, list) or len(value) != dimension:
        _fail(field, "dimension mismatch")
    if not all(isinstance(item, int | float) and not isinstance(item, bool) for item in value):
        _fail(field, "expected numeric vector")
    vector = tuple(float(item) for item in value if isinstance(item, int | float))
    norm = math.sqrt(sum(component * component for component in vector))
    if not math.isclose(norm, 1.0, rel_tol=1e-6, abs_tol=1e-6):
        _fail(field, "expected l2-normalised vector")
    return vector


def _metadata(raw: JsonValue) -> EmbeddingMetadata:
    mapping = _mapping(raw, "embedding_metadata")
    evaluation = _mapping(mapping.get("evaluation"), "embedding_metadata.evaluation")
    return EmbeddingMetadata(
        version=_string(mapping, "version"),
        provider=_string(mapping, "provider"),
        model=_string(mapping, "model"),
        dimension=_integer(mapping, "dimension"),
        normalisation=_string(mapping, "normalisation"),
        evaluation_backend=_string(evaluation, "backend"),
        evaluation_algorithm=_string(evaluation, "algorithm"),
        evaluation_metric=_string(evaluation, "metric"),
        evaluation_persistent=_boolean(evaluation, "persistent"),
    )


def _corpus(raw: JsonValue, metadata: EmbeddingMetadata) -> tuple[CorpusItem, ...]:
    if not isinstance(raw, list) or not raw:
        _fail("corpus", "expected non-empty array")
    items: list[CorpusItem] = []
    for value in raw:
        mapping = _mapping(value, "corpus")
        text = _string(mapping, "canonical_text")
        content_hash = _string(mapping, "content_hash")
        actual_hash = f"sha256:{hashlib.sha256(text.encode()).hexdigest()}"
        if content_hash != actual_hash:
            _fail("corpus.content_hash", "stale canonical text")
        items.append(
            CorpusItem(
                evidence_id=_string(mapping, "evidence_id"),
                canonical_text=text,
                content_hash=content_hash,
                embedding=_vector(mapping, "embedding", metadata.dimension),
            ),
        )
    if len({item.evidence_id for item in items}) != len(items):
        _fail("corpus.evidence_id", "duplicate")
    return tuple(items)


def _scenarios(raw: JsonValue, dimension: int) -> tuple[Scenario, ...]:
    if not isinstance(raw, list) or not raw:
        _fail("scenarios", "expected non-empty array")
    scenarios: list[Scenario] = []
    for value in raw:
        mapping = _mapping(value, "scenarios")
        scenarios.append(
            Scenario(
                scenario_id=_string(mapping, "scenario_id"),
                query=_string(mapping, "query"),
                query_embedding=_vector(mapping, "query_embedding", dimension),
                graph_evidence_ids=_strings(mapping, "graph_evidence_ids"),
                required_evidence_ids=_strings(mapping, "required_evidence_ids"),
                baseline_latency_ms=_integer(mapping, "baseline_latency_ms"),
                vector_latency_ms=_integer(mapping, "vector_latency_ms"),
                fused_latency_ms=_integer(mapping, "fused_latency_ms"),
                estimated_cost_usd=_string(mapping, "estimated_cost_usd"),
            ),
        )
    return tuple(scenarios)


def load_suite(path: Path) -> RetrievalSuite:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
        if len(lines) != 1:
            _fail("suite", "expected exactly one JSONL record")
        loaded = decode_json(lines[0])
    except (OSError, JSONDecodeError) as error:
        suite_error = RetrievalSuiteError.invalid("suite", str(path))
        raise suite_error from error
    mapping = _mapping(loaded, "suite")
    metadata = _metadata(mapping.get("embedding_metadata"))
    local_characterization = (
        metadata.evaluation_backend == "local-deterministic"
        and metadata.evaluation_algorithm == "exhaustive"
        and not metadata.evaluation_persistent
    )
    persistent_exact = (
        metadata.evaluation_backend == "postgresql"
        and metadata.evaluation_algorithm == "exact"
        and metadata.evaluation_persistent
    )
    if metadata.normalisation != "l2" or metadata.evaluation_metric != "cosine":
        _fail("embedding_metadata", "l2-normalised cosine required")
    if not local_characterization and not persistent_exact:
        _fail("embedding_metadata.evaluation", "local characterization or persistent exact")
    corpus = _corpus(mapping.get("corpus"), metadata)
    scenarios = _scenarios(mapping.get("scenarios"), metadata.dimension)
    known = {item.evidence_id for item in corpus}
    if any(not set(scenario.required_evidence_ids) <= known for scenario in scenarios):
        _fail("required_evidence_ids", "unknown evidence")
    return RetrievalSuite(
        policy_version=_string(mapping, "policy_version"),
        baseline_error_analysis_reference=_string(mapping, "baseline_error_analysis_reference"),
        metadata=metadata,
        corpus=corpus,
        scenarios=scenarios,
    )
