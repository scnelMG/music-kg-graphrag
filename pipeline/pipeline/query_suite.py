from __future__ import annotations

import json
import re
from typing import TYPE_CHECKING, Final, Protocol, TypeGuard

from .query_models import (
    BindingType,
    JsonValue,
    QueryCode,
    QueryRequestError,
    SuiteCase,
    TypedBinding,
)
from .query_templates import (
    GRAPH_SNAPSHOT_ID,
    MAX_HOPS,
    MAX_ROWS,
    SOURCE_ID,
    TIMEOUT_MS,
    validate_case,
)

if TYPE_CHECKING:
    from pathlib import Path

    class JsonDecoder(Protocol):
        def __call__(self, value: str) -> JsonValue: ...

    decode_json: JsonDecoder
else:
    decode_json = json.loads


UNSAFE_BINDING: Final = re.compile(
    r"[\x00-\x1f{};\"'\\]|\b(?:SERVICE|SELECT|CONSTRUCT|DESCRIBE|ASK|INSERT|DELETE|LOAD|CLEAR|DROP|CREATE|MOVE|COPY|ADD|WITH|USING|WHERE|UNION|PREFIX|BASE)\b",
    re.IGNORECASE,
)
RAW_QUERY_KEYS: Final = frozenset({"query", "raw_query", "raw_sparql", "sparql"})
CASE_KEYS: Final = frozenset(
    {
        "bindings",
        "case_id",
        "graph_snapshot_id",
        "hops",
        "oracle",
        "row_limit",
        "source_id",
        "template",
        "timeout_ms",
    },
)


def _is_mapping(value: JsonValue) -> TypeGuard[dict[str, JsonValue]]:
    return isinstance(value, dict)


def _required_string(mapping: dict[str, JsonValue], key: str, case_id: str) -> str:
    value = mapping.get(key)
    if not isinstance(value, str) or not value:
        raise QueryRequestError(QueryCode.INVALID_SUITE, case_id, key)
    return value


def _bounded_int(
    mapping: dict[str, JsonValue],
    key: str,
    default: int,
    case_id: str,
) -> int:
    value = mapping.get(key, default)
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise QueryRequestError(QueryCode.INVALID_SUITE, case_id, key)
    return value


def _parse_binding(name: str, raw: JsonValue, case_id: str) -> TypedBinding:
    if not _is_mapping(raw):
        raise QueryRequestError(QueryCode.BINDING_TYPE_REQUIRED, case_id, name)
    raw_type = raw.get("type")
    value = raw.get("value")
    if (
        not isinstance(raw_type, str)
        or isinstance(value, bool)
        or not isinstance(value, (str, int))
    ):
        raise QueryRequestError(QueryCode.BINDING_TYPE_REQUIRED, case_id, name)
    try:
        binding_type = BindingType(raw_type)
    except ValueError as error:
        raise QueryRequestError(QueryCode.BINDING_TYPE_REQUIRED, case_id, name) from error
    if isinstance(value, str) and UNSAFE_BINDING.search(value) is not None:
        raise QueryRequestError(QueryCode.UNSAFE_BINDING, case_id, name)
    return TypedBinding(name=name, binding_type=binding_type, value=value)


def _oracle_path(suite_path: Path, relative: str, case_id: str) -> Path:
    suite_root = suite_path.parent.resolve()
    candidate = (suite_root / relative).resolve()
    try:
        _ = candidate.relative_to(suite_root)
    except ValueError as error:
        raise QueryRequestError(QueryCode.INVALID_SUITE, case_id, "oracle") from error
    return candidate


def parse_suite_line(raw_line: str, suite_path: Path, line_number: int) -> SuiteCase:
    try:
        loaded = decode_json(raw_line)
    except json.JSONDecodeError as error:
        raise QueryRequestError(
            QueryCode.INVALID_SUITE,
            f"line-{line_number}",
            str(suite_path),
        ) from error
    if not _is_mapping(loaded):
        raise QueryRequestError(QueryCode.INVALID_SUITE, f"line-{line_number}", "case")
    raw_case_id = loaded.get("case_id")
    case_id = raw_case_id if isinstance(raw_case_id, str) else f"line-{line_number}"
    if RAW_QUERY_KEYS.intersection(loaded):
        raise QueryRequestError(QueryCode.RAW_QUERY_FORBIDDEN, case_id, "raw query input")
    graph_snapshot = loaded.get("graph_snapshot_id", GRAPH_SNAPSHOT_ID)
    if graph_snapshot != GRAPH_SNAPSHOT_ID:
        raise QueryRequestError(QueryCode.UNKNOWN_GRAPH, case_id, str(graph_snapshot))
    source = loaded.get("source_id", SOURCE_ID)
    if source != SOURCE_ID:
        raise QueryRequestError(QueryCode.UNKNOWN_SOURCE, case_id, str(source))
    if not set(loaded).issubset(CASE_KEYS):
        raise QueryRequestError(QueryCode.UNSAFE_BINDING, case_id, "unsupported field")
    raw_bindings = loaded.get("bindings")
    if not _is_mapping(raw_bindings):
        raise QueryRequestError(QueryCode.BINDING_TYPE_REQUIRED, case_id, "bindings")
    case = SuiteCase(
        case_id=case_id,
        template_name=_required_string(loaded, "template", case_id),
        bindings=tuple(
            _parse_binding(name, raw_bindings[name], case_id) for name in sorted(raw_bindings)
        ),
        hops=_bounded_int(loaded, "hops", MAX_HOPS, case_id),
        row_limit=_bounded_int(loaded, "row_limit", MAX_ROWS, case_id),
        timeout_ms=_bounded_int(loaded, "timeout_ms", TIMEOUT_MS, case_id),
        oracle_path=_oracle_path(
            suite_path,
            _required_string(loaded, "oracle", case_id),
            case_id,
        ),
    )
    _ = validate_case(case)
    return case


def load_suite(path: Path) -> tuple[SuiteCase, ...]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as error:
        raise QueryRequestError(QueryCode.INVALID_SUITE, "suite", str(path)) from error
    return tuple(
        parse_suite_line(line, path, line_number)
        for line_number, line in enumerate(lines, start=1)
        if line.strip()
    )


def validate_all(path: Path) -> tuple[tuple[SuiteCase, ...], tuple[QueryRequestError, ...]]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return (), (QueryRequestError(QueryCode.INVALID_SUITE, "suite", str(path)),)
    cases: list[SuiteCase] = []
    errors: list[QueryRequestError] = []
    for line_number, line in enumerate(lines, start=1):
        if not line.strip():
            continue
        try:
            cases.append(parse_suite_line(line, path, line_number))
        except QueryRequestError as error:
            errors.append(error)
    return tuple(cases), tuple(errors)
