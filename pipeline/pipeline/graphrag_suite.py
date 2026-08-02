from __future__ import annotations

import json
from decimal import Decimal, InvalidOperation
from typing import TYPE_CHECKING, Protocol

from .graphrag_models import (
    AnswerStatus,
    EvidenceItem,
    FailureCode,
    GraphRagError,
    Scenario,
    VersionMetadata,
)

if TYPE_CHECKING:
    from pathlib import Path

    from .query_models import JsonValue

    class JsonDecoder(Protocol):
        def __call__(self, value: str) -> JsonValue: ...

    decode_json: JsonDecoder
else:
    decode_json = json.loads


def _mapping(value: JsonValue, scenario_id: str, field: str) -> dict[str, JsonValue]:
    if not isinstance(value, dict):
        raise GraphRagError(FailureCode.INVALID_OUTPUT_SCHEMA, scenario_id, field)
    return value


def _string(mapping: dict[str, JsonValue], key: str, scenario_id: str) -> str:
    value = mapping.get(key)
    if not isinstance(value, str) or not value:
        raise GraphRagError(FailureCode.INVALID_OUTPUT_SCHEMA, scenario_id, key)
    return value


def _optional_string(
    mapping: dict[str, JsonValue],
    key: str,
    scenario_id: str,
) -> str | None:
    value = mapping.get(key)
    if value is not None and not isinstance(value, str):
        raise GraphRagError(FailureCode.INVALID_OUTPUT_SCHEMA, scenario_id, key)
    return value


def _strings(
    mapping: dict[str, JsonValue],
    key: str,
    scenario_id: str,
) -> tuple[str, ...]:
    value = mapping.get(key)
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise GraphRagError(FailureCode.INVALID_OUTPUT_SCHEMA, scenario_id, key)
    return tuple(item for item in value if isinstance(item, str))


def _integer(mapping: dict[str, JsonValue], key: str, scenario_id: str) -> int:
    value = mapping.get(key)
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise GraphRagError(FailureCode.INVALID_OUTPUT_SCHEMA, scenario_id, key)
    return value


def _versions(
    mapping: dict[str, JsonValue],
    scenario_id: str,
) -> VersionMetadata:
    raw = _mapping(mapping.get("versions"), scenario_id, "versions")
    return VersionMetadata(
        system_prompt=_string(raw, "system_prompt", scenario_id),
        output_schema=_string(raw, "output_schema", scenario_id),
        provider_config=_string(raw, "provider_config", scenario_id),
        retrieval_policy=_string(raw, "retrieval_policy", scenario_id),
        graph_snapshot=_string(raw, "graph_snapshot", scenario_id),
    )


def _evidence(raw: JsonValue, scenario_id: str) -> EvidenceItem:
    item = _mapping(raw, scenario_id, "retrieval")
    return EvidenceItem(
        evidence_id=_string(item, "evidence_id", scenario_id),
        candidate_ids=_strings(item, "candidate_ids", scenario_id),
        path=_strings(item, "path", scenario_id),
        route=_string(item, "route", scenario_id),
        source_id=_string(item, "source_id", scenario_id),
        text=_string(item, "text", scenario_id),
        content_hash=_string(item, "content_hash", scenario_id),
        contradiction_key=_optional_string(item, "contradiction_key", scenario_id),
        contradiction_value=_optional_string(item, "contradiction_value", scenario_id),
    )


def parse_suite_line(raw_line: str, line_number: int) -> Scenario:
    scenario_fallback = f"line-{line_number}"
    try:
        loaded = decode_json(raw_line)
    except json.JSONDecodeError as error:
        raise GraphRagError(FailureCode.INVALID_JSON, scenario_fallback, "suite") from error
    mapping = _mapping(loaded, scenario_fallback, "scenario")
    scenario_id = _string(mapping, "scenario_id", scenario_fallback)
    raw_retrieval = mapping.get("retrieval")
    if not isinstance(raw_retrieval, list):
        raise GraphRagError(FailureCode.INVALID_OUTPUT_SCHEMA, scenario_id, "retrieval")
    raw_provider = mapping.get("provider_output")
    provider_output_json = (
        raw_provider
        if isinstance(raw_provider, str)
        else json.dumps(raw_provider, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    )
    raw_cost = mapping.get("estimated_cost_usd")
    if not isinstance(raw_cost, str):
        raise GraphRagError(FailureCode.INVALID_OUTPUT_SCHEMA, scenario_id, "estimated_cost_usd")
    try:
        cost = Decimal(raw_cost)
    except InvalidOperation as error:
        raise GraphRagError(
            FailureCode.INVALID_OUTPUT_SCHEMA,
            scenario_id,
            "estimated_cost_usd",
        ) from error
    if not cost.is_finite() or cost < 0:
        raise GraphRagError(
            FailureCode.INVALID_OUTPUT_SCHEMA,
            scenario_id,
            "estimated_cost_usd",
        )
    try:
        expected_status = AnswerStatus(_string(mapping, "expected_status", scenario_id))
    except ValueError as error:
        raise GraphRagError(
            FailureCode.INVALID_OUTPUT_SCHEMA,
            scenario_id,
            "expected_status",
        ) from error
    return Scenario(
        scenario_id=scenario_id,
        question_class=_string(mapping, "question_class", scenario_id),
        question=_string(mapping, "input", scenario_id),
        allowed_candidate_ids=_strings(mapping, "allowed_candidate_ids", scenario_id),
        required_evidence_ids=_strings(mapping, "required_evidence_ids", scenario_id),
        forbidden_claims=_strings(mapping, "forbidden_claims", scenario_id),
        expected_status=expected_status,
        expected_refusal_reason=_optional_string(
            mapping,
            "expected_refusal_reason",
            scenario_id,
        ),
        fixture_checksum=_string(mapping, "fixture_checksum", scenario_id),
        versions=_versions(mapping, scenario_id),
        input_tokens=_integer(mapping, "input_tokens", scenario_id),
        latency_ms=_integer(mapping, "latency_ms", scenario_id),
        estimated_cost_usd=raw_cost,
        retrieval=tuple(_evidence(item, scenario_id) for item in raw_retrieval),
        provider_output_json=provider_output_json,
    )


def load_suite(path: Path) -> tuple[Scenario, ...]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as error:
        raise GraphRagError(FailureCode.INVALID_JSON, "suite", str(path)) from error
    if not lines:
        raise GraphRagError(FailureCode.INVALID_JSON, "suite", "empty")
    return tuple(parse_suite_line(line, number) for number, line in enumerate(lines, 1))
