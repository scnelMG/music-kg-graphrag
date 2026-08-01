from __future__ import annotations

import hashlib
import json
from typing import TYPE_CHECKING, Protocol, TypeGuard

from .query_models import EvidenceRecord, JsonValue, QueryCode, QueryRequestError, SuiteCase
from .query_templates import (
    GRAPH_SNAPSHOT_ID,
    RETRIEVAL_RUN_ID,
    SOURCE_ID,
    TEMPLATE_VERSION,
    template_for,
)

if TYPE_CHECKING:
    class JsonDecoder(Protocol):
        def __call__(self, value: str) -> JsonValue: ...

    decode_json: JsonDecoder
else:
    decode_json = json.loads


def _is_mapping(value: JsonValue) -> TypeGuard[dict[str, JsonValue]]:
    return isinstance(value, dict)


def canonical_hash(payload: JsonValue) -> str:
    encoded = json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode()
    return f"sha256:{hashlib.sha256(encoded).hexdigest()}"


def _required_string(mapping: dict[str, JsonValue], key: str, case_id: str) -> str:
    value = mapping.get(key)
    if not isinstance(value, str) or not value:
        raise QueryRequestError(QueryCode.FIXTURE_ORACLE_INVALID, case_id, key)
    return value


def _string_list(mapping: dict[str, JsonValue], key: str, case_id: str) -> tuple[str, ...]:
    raw = mapping.get(key)
    if not isinstance(raw, list) or not raw or not all(isinstance(item, str) for item in raw):
        raise QueryRequestError(QueryCode.FIXTURE_ORACLE_INVALID, case_id, key)
    return tuple(item for item in raw if isinstance(item, str))


def evidence_payload(record: EvidenceRecord) -> dict[str, JsonValue]:
    return {
        "binding_types": dict(record.binding_types),
        "complete": record.complete,
        "evidence_id": record.evidence_id,
        "graph_snapshot_id": record.graph_snapshot_id,
        "path": list(record.path),
        "query_hash": record.query_hash,
        "retrieval_run_id": record.retrieval_run_id,
        "retrieved_hash": record.retrieved_hash,
        "score": record.score,
        "source_id": record.source_id,
        "template_name": record.template_name,
        "template_version": record.template_version,
    }


def load_oracle(case: SuiteCase) -> EvidenceRecord:
    try:
        loaded = decode_json(case.oracle_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as error:
        raise QueryRequestError(
            QueryCode.FIXTURE_ORACLE_INVALID,
            case.case_id,
            str(case.oracle_path),
        ) from error
    if not _is_mapping(loaded):
        raise QueryRequestError(QueryCode.FIXTURE_ORACLE_INVALID, case.case_id, "oracle")
    template = template_for(case.case_id, case.template_name)
    evidence_id = _required_string(loaded, "evidence_id", case.case_id)
    score = _required_string(loaded, "score", case.case_id)
    path = _string_list(loaded, "path", case.case_id)
    if _required_string(loaded, "query_hash", case.case_id) != template.query_hash:
        raise QueryRequestError(QueryCode.FIXTURE_ORACLE_INVALID, case.case_id, "query_hash")
    hash_payload: dict[str, JsonValue] = {
        "binding_types": {
            binding.name: str(binding.binding_type) for binding in case.bindings
        },
        "complete": True,
        "evidence_id": evidence_id,
        "graph_snapshot_id": GRAPH_SNAPSHOT_ID,
        "path": list(path),
        "query_hash": template.query_hash,
        "retrieval_run_id": RETRIEVAL_RUN_ID,
        "score": score,
        "source_id": SOURCE_ID,
        "template_name": case.template_name,
        "template_version": TEMPLATE_VERSION,
    }
    retrieved_hash = canonical_hash(hash_payload)
    if _required_string(loaded, "retrieved_hash", case.case_id) != retrieved_hash:
        raise QueryRequestError(QueryCode.FIXTURE_ORACLE_INVALID, case.case_id, "retrieved_hash")
    return EvidenceRecord(
        evidence_id=evidence_id,
        template_name=case.template_name,
        template_version=TEMPLATE_VERSION,
        path=path,
        source_id=SOURCE_ID,
        graph_snapshot_id=GRAPH_SNAPSHOT_ID,
        retrieval_run_id=RETRIEVAL_RUN_ID,
        score=score,
        binding_types=tuple(
            (binding.name, str(binding.binding_type)) for binding in case.bindings
        ),
        complete=True,
        query_hash=template.query_hash,
        retrieved_hash=retrieved_hash,
    )


def validate_oracle(case: SuiteCase, executed: EvidenceRecord) -> EvidenceRecord:
    if load_oracle(case) != executed:
        raise QueryRequestError(
            QueryCode.FIXTURE_ORACLE_INVALID,
            case.case_id,
            "execution",
            executed=True,
        )
    return executed
