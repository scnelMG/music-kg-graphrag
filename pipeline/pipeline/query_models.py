from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum, unique
from typing import TYPE_CHECKING, override

if TYPE_CHECKING:
    from pathlib import Path


type JsonValue = str | int | float | bool | None | list[JsonValue] | dict[str, JsonValue]


@unique
class BindingType(StrEnum):
    FESTIVAL_ID = "festival_id"
    HOPS = "hops"
    RELATION = "relation"
    RELEASE_GROUP_ID = "release_group_id"
    REVIEW_ID = "review_id"


@unique
class QueryCode(StrEnum):
    BINDING_TYPE_REQUIRED = "BINDING_TYPE_REQUIRED"
    FIXTURE_ORACLE_INVALID = "FIXTURE_ORACLE_INVALID"
    HOP_LIMIT_EXCEEDED = "HOP_LIMIT_EXCEEDED"
    INVALID_SUITE = "INVALID_SUITE"
    RAW_QUERY_FORBIDDEN = "RAW_QUERY_FORBIDDEN"
    QUERY_RESULT_EMPTY = "QUERY_RESULT_EMPTY"
    QUERY_RESULT_INVALID = "QUERY_RESULT_INVALID"
    QUERY_TIMEOUT = "QUERY_TIMEOUT"
    ROW_LIMIT_EXCEEDED = "ROW_LIMIT_EXCEEDED"
    TIMEOUT_LIMIT_EXCEEDED = "TIMEOUT_LIMIT_EXCEEDED"
    UNKNOWN_ENTITY = "UNKNOWN_ENTITY"
    UNKNOWN_GRAPH = "UNKNOWN_GRAPH"
    UNKNOWN_SOURCE = "UNKNOWN_SOURCE"
    UNKNOWN_TEMPLATE = "UNKNOWN_TEMPLATE"
    UNSAFE_BINDING = "UNSAFE_BINDING"
    UNSUPPORTED_RELATION = "UNSUPPORTED_RELATION"


@dataclass(slots=True)
class QueryRequestError(Exception):
    code: QueryCode
    case_id: str
    detail: str
    executed: bool = False

    @override
    def __str__(self) -> str:
        return f"{self.code}: {self.case_id}: {self.detail}"


@dataclass(frozen=True, slots=True)
class TypedBinding:
    name: str
    binding_type: BindingType
    value: str | int


@dataclass(frozen=True, slots=True)
class SuiteCase:
    case_id: str
    template_name: str
    bindings: tuple[TypedBinding, ...]
    hops: int
    row_limit: int
    timeout_ms: int
    oracle_path: Path


@dataclass(frozen=True, slots=True)
class EvidenceRecord:
    evidence_id: str
    template_name: str
    template_version: str
    path: tuple[str, ...]
    source_id: str
    graph_snapshot_id: str
    retrieval_run_id: str
    score: str
    binding_types: tuple[tuple[str, str], ...]
    complete: bool
    query_hash: str
    retrieved_hash: str


@dataclass(frozen=True, slots=True)
class SnapshotReport:
    status: str
    suite_sha256: str
    snapshot_hash: str
    executed_query_count: int
    results: tuple[EvidenceRecord, ...]
    errors: tuple[QueryRequestError, ...]
