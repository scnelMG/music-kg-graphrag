from __future__ import annotations

from dataclasses import dataclass
from multiprocessing import get_context
from pathlib import Path
from queue import Empty
from time import perf_counter
from typing import TYPE_CHECKING, Final

from rdflib import Dataset, Literal, URIRef
from rdflib.query import ResultRow
from rdflib.term import Identifier

from .query_models import (
    BindingType,
    EvidenceRecord,
    JsonValue,
    QueryCode,
    QueryRequestError,
    SuiteCase,
    TypedBinding,
)
from .query_oracles import canonical_hash
from .query_templates import (
    GRAPH_SNAPSHOT_ID,
    MAX_ROWS,
    RETRIEVAL_RUN_ID,
    SOURCE_ID,
    TEMPLATE_VERSION,
    template_for,
)

if TYPE_CHECKING:
    from multiprocessing.queues import Queue

_REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
_BASE_DATA = _REPOSITORY_ROOT / "data" / "fixtures" / "valid" / "music-graph.ttl"
_QUERY_DATA = _REPOSITORY_ROOT / "queries" / "fixtures" / "query-data.trig"
_ONTOLOGY: Final = "https://w3id.org/music-kg-graphrag/ontology#"
_RESOURCE: Final = "https://w3id.org/music-kg-graphrag/resource/"
_SOURCE_IRI: Final = URIRef(f"{_RESOURCE}source/musicbrainz")
_QUERY_VARIABLES: Final = {"release_group": "releaseGroup"}
_RESOURCE_PREFIXES: Final = (
    (f"{_RESOURCE}release-group/", "release-group:"),
    (f"{_RESOURCE}assertion/", "assertion:"),
    (f"{_RESOURCE}festival/", "festival:"),
    (f"{_RESOURCE}release/", "release:"),
    (f"{_RESOURCE}review/", "review:"),
    (f"{_RESOURCE}context/", "context:"),
    (f"{_RESOURCE}artist/", "artist:"),
    (f"{_RESOURCE}genre/", "genre:"),
)


@dataclass(frozen=True, slots=True)
class ExecutionFailure:
    code: QueryCode
    detail: str


type ExecutionMessage = EvidenceRecord | ExecutionFailure


def load_query_dataset() -> Dataset:
    dataset = Dataset(default_union=False)
    graph = dataset.graph(URIRef(GRAPH_SNAPSHOT_ID))
    _ = graph.parse(_BASE_DATA, format="turtle")
    _ = dataset.parse(_QUERY_DATA, format="trig")
    return dataset


def _string_value(binding: TypedBinding, case_id: str) -> str:
    if not isinstance(binding.value, str):
        raise QueryRequestError(QueryCode.BINDING_TYPE_REQUIRED, case_id, binding.name)
    return binding.value


def _binding_term(binding: TypedBinding, case_id: str) -> Identifier:
    value = _string_value(binding, case_id)
    match binding.binding_type:
        case BindingType.FESTIVAL_ID:
            return URIRef(f"{_RESOURCE}festival/{value.removeprefix('festival:')}")
        case BindingType.HOPS:
            return Literal(binding.value)
        case BindingType.RELATION:
            return URIRef(f"{_ONTOLOGY}{value}")
        case BindingType.RELEASE_GROUP_ID:
            return URIRef(
                f"{_RESOURCE}release-group/{value.removeprefix('release-group:')}",
            )
        case BindingType.REVIEW_ID:
            return URIRef(f"{_RESOURCE}review/{value.removeprefix('review:')}")


def _compact(term: Identifier, case_id: str) -> str:
    if isinstance(term, Literal):
        return str(term)
    if not isinstance(term, URIRef):
        raise QueryRequestError(QueryCode.QUERY_RESULT_INVALID, case_id, str(term))
    value = str(term)
    if value.startswith(_ONTOLOGY):
        return value.removeprefix(_ONTOLOGY)
    for prefix, compact_prefix in _RESOURCE_PREFIXES:
        if value.startswith(prefix):
            return f"{compact_prefix}{value.removeprefix(prefix)}"
    return value


def _path_for(
    case: SuiteCase,
    row: ResultRow,
    bindings: dict[str, Identifier],
) -> tuple[str, ...]:
    template = template_for(case.case_id, case.template_name)
    terms: list[Identifier] = []
    for field in template.path_fields:
        bound = bindings.get(field)
        if bound is not None:
            terms.append(bound)
            continue
        result = row.get(field)
        if not isinstance(result, Identifier):
            raise QueryRequestError(QueryCode.QUERY_RESULT_INVALID, case.case_id, field)
        terms.append(result)
    return tuple(_compact(term, case.case_id) for term in terms)


def _execute_case(case: SuiteCase, dataset: Dataset) -> EvidenceRecord:
    template = template_for(case.case_id, case.template_name)
    bindings: dict[str, Identifier] = {
        "snapshot": URIRef(GRAPH_SNAPSHOT_ID),
        "source": _SOURCE_IRI,
    }
    for binding in case.bindings:
        query_name = _QUERY_VARIABLES.get(binding.name, binding.name)
        term = _binding_term(binding, case.case_id)
        bindings[query_name] = term
        bindings[binding.name] = term
    started = perf_counter()
    query_result = dataset.query(
        template.query_path.read_text(encoding="utf-8"),
        initBindings=bindings,
    )
    rows: list[ResultRow] = []
    for raw_row in query_result:
        if not isinstance(raw_row, ResultRow):
            raise QueryRequestError(QueryCode.QUERY_RESULT_INVALID, case.case_id, "row")
        rows.append(raw_row)
    elapsed_ms = (perf_counter() - started) * 1_000
    if elapsed_ms > case.timeout_ms:
        raise QueryRequestError(
            QueryCode.QUERY_TIMEOUT,
            case.case_id,
            f"{elapsed_ms:.3f}",
            executed=True,
        )
    if not rows:
        raise QueryRequestError(
            QueryCode.QUERY_RESULT_EMPTY,
            case.case_id,
            template.name,
            executed=True,
        )
    if len(rows) > min(case.row_limit, MAX_ROWS):
        raise QueryRequestError(
            QueryCode.ROW_LIMIT_EXCEEDED,
            case.case_id,
            str(len(rows)),
            executed=True,
        )
    paths = sorted(_path_for(case, row, bindings) for row in rows)
    path = paths[0]
    binding_types = tuple(
        (binding.name, str(binding.binding_type)) for binding in case.bindings
    )
    hash_payload: dict[str, JsonValue] = {
        "binding_types": dict(binding_types),
        "complete": True,
        "evidence_id": template.evidence_id,
        "graph_snapshot_id": GRAPH_SNAPSHOT_ID,
        "path": list(path),
        "query_hash": template.query_hash,
        "retrieval_run_id": RETRIEVAL_RUN_ID,
        "score": template.score,
        "source_id": SOURCE_ID,
        "template_name": template.name,
        "template_version": TEMPLATE_VERSION,
    }
    return EvidenceRecord(
        evidence_id=template.evidence_id,
        template_name=template.name,
        template_version=TEMPLATE_VERSION,
        path=path,
        source_id=SOURCE_ID,
        graph_snapshot_id=GRAPH_SNAPSHOT_ID,
        retrieval_run_id=RETRIEVAL_RUN_ID,
        score=template.score,
        binding_types=binding_types,
        complete=True,
        query_hash=template.query_hash,
        retrieved_hash=canonical_hash(hash_payload),
    )


def _query_worker(case: SuiteCase, messages: Queue[ExecutionMessage]) -> None:
    try:
        messages.put(_execute_case(case, load_query_dataset()))
    except QueryRequestError as error:
        messages.put(ExecutionFailure(code=error.code, detail=error.detail))


def execute_bounded_case(case: SuiteCase) -> EvidenceRecord:
    context = get_context("spawn")
    messages: Queue[ExecutionMessage] = context.Queue()
    process = context.Process(target=_query_worker, args=(case, messages), daemon=True)
    process.start()
    try:
        outcome = messages.get(timeout=case.timeout_ms / 1_000)
    except Empty as error:
        process.terminate()
        process.join()
        process.close()
        messages.close()
        messages.join_thread()
        raise QueryRequestError(
            QueryCode.QUERY_TIMEOUT,
            case.case_id,
            str(case.timeout_ms),
            executed=True,
        ) from error
    process.join()
    process.close()
    messages.close()
    messages.join_thread()
    match outcome:
        case EvidenceRecord():
            return outcome
        case ExecutionFailure(code=code, detail=detail):
            raise QueryRequestError(code, case.case_id, detail, executed=True)
