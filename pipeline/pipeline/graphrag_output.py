from __future__ import annotations

import json
from typing import TYPE_CHECKING, Protocol

from .graphrag_models import (
    AnswerStatus,
    Claim,
    FailureCode,
    GraphAnswer,
    GraphRagError,
    VersionMetadata,
)

if TYPE_CHECKING:
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
    if not isinstance(value, str):
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


def _metadata(raw: JsonValue, scenario_id: str) -> VersionMetadata:
    value = _mapping(raw, scenario_id, "metadata")
    expected_keys = {
        "graph_snapshot",
        "output_schema",
        "provider_config",
        "retrieval_policy",
        "system_prompt",
    }
    if set(value) != expected_keys:
        raise GraphRagError(FailureCode.METADATA_NONDETERMINISTIC, scenario_id, "metadata")
    return VersionMetadata(
        system_prompt=_string(value, "system_prompt", scenario_id),
        output_schema=_string(value, "output_schema", scenario_id),
        provider_config=_string(value, "provider_config", scenario_id),
        retrieval_policy=_string(value, "retrieval_policy", scenario_id),
        graph_snapshot=_string(value, "graph_snapshot", scenario_id),
    )


def _claim(raw: JsonValue, scenario_id: str) -> Claim:
    value = _mapping(raw, scenario_id, "claim")
    expected_keys = {"candidate_id", "claim_id", "evidence_ids", "text", "uncertainty"}
    if set(value) != expected_keys:
        raise GraphRagError(FailureCode.INVALID_OUTPUT_SCHEMA, scenario_id, "claim")
    uncertainty = value.get("uncertainty")
    if not isinstance(uncertainty, bool):
        raise GraphRagError(FailureCode.INVALID_OUTPUT_SCHEMA, scenario_id, "uncertainty")
    return Claim(
        claim_id=_string(value, "claim_id", scenario_id),
        text=_string(value, "text", scenario_id),
        candidate_id=_optional_string(value, "candidate_id", scenario_id),
        evidence_ids=_strings(value, "evidence_ids", scenario_id),
        uncertainty=uncertainty,
    )


def parse_provider_output(raw_json: str, scenario_id: str) -> GraphAnswer:
    try:
        loaded = decode_json(raw_json)
    except json.JSONDecodeError as error:
        raise GraphRagError(FailureCode.INVALID_JSON, scenario_id, "provider_output") from error
    value = _mapping(loaded, scenario_id, "provider_output")
    expected_keys = {
        "answer",
        "claims",
        "metadata",
        "question_class",
        "refusal_reason",
        "status",
    }
    if set(value) != expected_keys:
        raise GraphRagError(FailureCode.INVALID_OUTPUT_SCHEMA, scenario_id, "provider_output")
    raw_claims = value.get("claims")
    if not isinstance(raw_claims, list):
        raise GraphRagError(FailureCode.INVALID_OUTPUT_SCHEMA, scenario_id, "claims")
    try:
        status = AnswerStatus(_string(value, "status", scenario_id))
    except ValueError as error:
        raise GraphRagError(FailureCode.INVALID_OUTPUT_SCHEMA, scenario_id, "status") from error
    return GraphAnswer(
        status=status,
        question_class=_string(value, "question_class", scenario_id),
        answer=_string(value, "answer", scenario_id),
        claims=tuple(_claim(item, scenario_id) for item in raw_claims),
        refusal_reason=_optional_string(value, "refusal_reason", scenario_id),
        metadata=_metadata(value.get("metadata"), scenario_id),
    )
