from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import TYPE_CHECKING, Final, Self, cast, final

import httpx2
from rdflib import Dataset, Graph, Literal, URIRef
from rdflib.namespace import RDF, XSD
from rdflib.plugins.parsers.notation3 import BadSyntax

from .graphdb_http import create_client, parse_count
from .graphdb_receipts import (
    ProjectionReceipt,
    ReceiptIdentity,
    ReceiptState,
    TerminalReceipt,
    parse_receipt,
    parse_terminal_receipt,
    receipt_graph_iri,
    receipt_payload,
    terminal_receipt_graph_iri,
    terminal_receipt_payload,
    verify_identity,
)
from .projection_store import (
    EVENT_IDENTITY_CONFLICT,
    GraphPayload,
    GraphSnapshot,
    RepositorySnapshot,
    RetryableRepositoryError,
    TerminalRepositoryError,
    graph_payload,
)

if TYPE_CHECKING:
    from pathlib import Path
    from types import TracebackType

    from .projection_models import ProjectionEvent


SHAPES_GRAPH: Final = "http://rdf4j.org/schema/rdf4j#SHACLShapeGraph"
SHACL_REPORT_MEDIA_TYPE: Final = "application/shacl-validation-report+n-quads"
SHACL_VALIDATION_REPORT: Final = URIRef(
    "http://www.w3.org/ns/shacl#ValidationReport",
)
SHACL_CONFORMS: Final = URIRef("http://www.w3.org/ns/shacl#conforms")
OK: Final = frozenset({200, 201, 204})
HTTP_NOT_FOUND: Final = 404
HTTP_SERVER_ERROR: Final = 500
POST_LOAD_MISMATCH: Final = "GRAPHDB_POST_LOAD_MISMATCH"
READBACK_MALFORMED: Final = "GRAPHDB_READBACK_MALFORMED"
CONFIG_MALFORMED: Final = "GRAPHDB_CONFIG_MALFORMED"
SHACL_NOT_ENABLED: Final = "GRAPHDB_SHACL_NOT_ENABLED"
SHAPES_MISMATCH: Final = "GRAPHDB_SHAPES_MISMATCH"
RECEIPT_WRITE_MISMATCH: Final = "GRAPHDB_RECEIPT_WRITE_MISMATCH"
TERMINAL_RECEIPT_MISMATCH: Final = "GRAPHDB_TERMINAL_RECEIPT_MISMATCH"
UNAVAILABLE: Final = "GRAPHDB_UNAVAILABLE"
REPLAY_NOT_TERMINAL: Final = "GRAPHDB_REPLAY_NOT_TERMINAL"


@dataclass(frozen=True, slots=True)
class GraphDbConfig:
    base_url: str
    repository_id: str
    repository_config: Path
    shapes: Path


@final
class GraphDbRepository:
    """Own the mutable HTTP session and verified named-graph readback cache."""

    def __init__(self, config: GraphDbConfig) -> None:
        self._config = config
        self._client = create_client(config.base_url)
        self._network_calls = 0
        self._ready = False
        self._verified: dict[str, GraphPayload] = {}

    @property
    def mode(self) -> str:
        return "graphdb"

    @property
    def network_calls(self) -> int:
        return self._network_calls

    def ensure_ready(self) -> None:
        self._ensure_repository()

    def __enter__(self) -> Self:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        _ = exc_type, exc_value, traceback
        self._client.close()

    def reset(self) -> None:
        response = self._request(
            "DELETE",
            f"/rest/repositories/{self._config.repository_id}",
            allowed=frozenset({200, 204, 404}),
            error_code="GRAPHDB_RESET_FAILED",
        )
        _ = response
        self._ready = False
        self._verified.clear()

    def record_terminal(self, event_id: str, error_code: str) -> None:
        self._ensure_repository()
        graph_iri = terminal_receipt_graph_iri(event_id)
        self._put_graph(
            graph_iri,
            terminal_receipt_payload(event_id, error_code),
            error_code="GRAPHDB_TERMINAL_RECEIPT_WRITE_REJECTED",
        )
        stored = self._read_terminal_receipt(graph_iri)
        if stored != TerminalReceipt(event_id=event_id, error_code=error_code):
            raise TerminalRepositoryError(TERMINAL_RECEIPT_MISMATCH)

    def clear_terminal(self, event_id: str) -> None:
        self._ensure_repository()
        self._delete_graph(terminal_receipt_graph_iri(event_id))

    def prepare_replay(self, event_id: str) -> None:
        self._ensure_repository()
        terminal_graph = terminal_receipt_graph_iri(event_id)
        if self._read_terminal_receipt(terminal_graph) is None:
            raise TerminalRepositoryError(REPLAY_NOT_TERMINAL)
        receipt_graph = receipt_graph_iri(event_id)
        receipt = parse_receipt(self._read_graph(receipt_graph), receipt_graph)
        if receipt is not None:
            if receipt.state is ReceiptState.COMMITTED:
                raise TerminalRepositoryError(EVENT_IDENTITY_CONFLICT)
            self._delete_graph(receipt_graph)
        self._delete_graph(terminal_graph)

    def terminal_event_ids(self, event_ids: tuple[str, ...]) -> tuple[str, ...]:
        self._ensure_repository()
        return tuple(
            sorted(
                {
                    event_id
                    for event_id in event_ids
                    if self._read_terminal_receipt(
                        terminal_receipt_graph_iri(event_id),
                    )
                    is not None
                },
            ),
        )

    def apply(self, event: ProjectionEvent, payload: GraphPayload) -> bool:
        self._ensure_repository()
        payload = _normalize_graphdb_payload(payload, event.graph_iri)
        identity = ReceiptIdentity(
            event_id=event.event_id,
            graph_iri=event.graph_iri,
            payload_sha256=payload.sha256,
        )
        receipt_graph = receipt_graph_iri(event.event_id)
        receipt = parse_receipt(self._read_graph(receipt_graph), receipt_graph)
        created = receipt is None
        if receipt is None:
            self._claim_receipt(identity)
            receipt = self._read_receipt(receipt_graph)
        verify_identity(receipt, identity)
        current = self._read_graph(event.graph_iri)
        if (
            current.sha256 == payload.sha256
            and self._query_count(event.graph_iri) == payload.triple_count
        ):
            if receipt.state is ReceiptState.PENDING:
                self._write_receipt(identity, ReceiptState.COMMITTED)
            self._verified[event.graph_iri] = current
            return created
        self._put_graph(
            event.graph_iri,
            payload,
            error_code="GRAPHDB_LOAD_REJECTED",
        )
        verified = self._read_graph(event.graph_iri)
        count = self._query_count(event.graph_iri)
        if verified.sha256 != payload.sha256 or count != payload.triple_count:
            raise TerminalRepositoryError(POST_LOAD_MISMATCH)
        self._write_receipt(identity, ReceiptState.COMMITTED)
        self._verified[event.graph_iri] = verified
        return created

    def snapshot(self) -> RepositorySnapshot:
        refreshed = {
            graph_iri: self._read_graph(graph_iri)
            for graph_iri in sorted(self._verified)
        }
        self._verified = refreshed
        graphs = tuple(
            GraphSnapshot(
                graph=graph_iri,
                triple_count=payload.triple_count,
                sha256=payload.sha256,
            )
            for graph_iri, payload in refreshed.items()
        )
        lines = tuple(
            line
            for graph_iri in sorted(refreshed)
            for line in refreshed[graph_iri].nquads
        )
        return RepositorySnapshot(
            graphs=graphs,
            triple_count=len(lines),
            repository_sha256=hashlib.sha256("".join(lines).encode()).hexdigest(),
        )

    def nquads(self) -> str:
        return "".join(
            line
            for graph_iri in sorted(self._verified)
            for line in self._verified[graph_iri].nquads
        )

    def _ensure_repository(self) -> None:
        if self._ready:
            return
        path = f"/rest/repositories/{self._config.repository_id}"
        response = self._request(
            "GET",
            path,
            allowed=frozenset({200, 404}),
            error_code="GRAPHDB_REPOSITORY_READ_FAILED",
        )
        if response.status_code == HTTP_NOT_FOUND:
            _ = self._request(
                "POST",
                "/rest/repositories",
                files={
                    "config": (
                        self._config.repository_config.name,
                        self._config.repository_config.read_bytes(),
                        "text/turtle",
                    ),
                },
                error_code="GRAPHDB_REPOSITORY_CREATE_FAILED",
            )
            response = self._request(
                "GET",
                path,
                error_code="GRAPHDB_REPOSITORY_READ_FAILED",
            )
        self._verify_shacl_config(response.text)
        _ = self._request(
            "PUT",
            f"/repositories/{self._config.repository_id}/statements",
            params={"context": f"<{SHAPES_GRAPH}>"},
            headers={"Content-Type": "text/turtle"},
            content=self._config.shapes.read_bytes(),
            error_code="GRAPHDB_SHAPES_REJECTED",
        )
        expected_shapes = Graph()
        try:
            _ = expected_shapes.parse(self._config.shapes, format="turtle")
        except (BadSyntax, ValueError) as error:
            raise TerminalRepositoryError(READBACK_MALFORMED) from error
        expected = graph_payload(expected_shapes, SHAPES_GRAPH)
        actual = self._read_graph(SHAPES_GRAPH)
        if (
            actual.sha256 != expected.sha256
            or actual.triple_count != expected.triple_count
        ):
            raise TerminalRepositoryError(SHAPES_MISMATCH)
        self._ready = True

    def _read_receipt(self, graph_iri: str) -> ProjectionReceipt:
        receipt = parse_receipt(self._read_graph(graph_iri), graph_iri)
        if receipt is None:
            raise TerminalRepositoryError(RECEIPT_WRITE_MISMATCH)
        return receipt

    def _read_terminal_receipt(self, graph_iri: str) -> TerminalReceipt | None:
        return parse_terminal_receipt(self._read_graph(graph_iri), graph_iri)

    def _write_receipt(
        self,
        identity: ReceiptIdentity,
        state: ReceiptState,
    ) -> None:
        graph_iri = receipt_graph_iri(identity.event_id)
        self._put_graph(
            graph_iri,
            receipt_payload(identity, state),
            error_code="GRAPHDB_RECEIPT_WRITE_REJECTED",
        )
        stored = self._read_receipt(graph_iri)
        verify_identity(stored, identity)
        if stored.state is not state:
            raise TerminalRepositoryError(RECEIPT_WRITE_MISMATCH)

    def _claim_receipt(self, identity: ReceiptIdentity) -> None:
        graph_iri = receipt_graph_iri(identity.event_id)
        payload = receipt_payload(identity, ReceiptState.PENDING)
        triples = "".join(payload.ntriples)
        update = (
            f"INSERT {{ GRAPH <{graph_iri}> {{ {triples} }} }} "
            f"WHERE {{ FILTER NOT EXISTS "
            f"{{ GRAPH <{graph_iri}> {{ ?s ?p ?o }} }} }}"
        )
        _ = self._request(
            "POST",
            f"/repositories/{self._config.repository_id}/statements",
            data={"update": update},
            error_code="GRAPHDB_RECEIPT_WRITE_REJECTED",
        )

    def _put_graph(
        self,
        graph_iri: str,
        payload: GraphPayload,
        *,
        error_code: str,
    ) -> None:
        _ = self._request(
            "PUT",
            f"/repositories/{self._config.repository_id}/statements",
            params={"context": f"<{graph_iri}>"},
            headers={"Content-Type": "application/n-triples"},
            content="".join(payload.ntriples).encode(),
            error_code=error_code,
        )

    def _delete_graph(self, graph_iri: str) -> None:
        _ = self._request(
            "DELETE",
            f"/repositories/{self._config.repository_id}/statements",
            params={"context": f"<{graph_iri}>"},
            allowed=frozenset({200, 204, 404}),
            error_code="GRAPHDB_TERMINAL_RECEIPT_DELETE_REJECTED",
        )

    def _read_graph(self, graph_iri: str) -> GraphPayload:
        response = self._request(
            "GET",
            f"/repositories/{self._config.repository_id}/statements",
            params={"context": f"<{graph_iri}>"},
            headers={"Accept": "application/n-triples"},
            error_code="GRAPHDB_READBACK_FAILED",
        )
        graph = Graph()
        try:
            _ = graph.parse(data=response.text, format="nt")
        except (BadSyntax, ValueError) as error:
            raise TerminalRepositoryError(READBACK_MALFORMED) from error
        return graph_payload(graph, graph_iri)

    def _query_count(self, graph_iri: str) -> int:
        query = (
            "SELECT (COUNT(*) AS ?count) WHERE "
            f"{{ GRAPH <{graph_iri}> {{ ?s ?p ?o }} }}"
        )
        response = self._request(
            "POST",
            f"/repositories/{self._config.repository_id}",
            data={"query": query},
            headers={"Accept": "application/sparql-results+json"},
            error_code="GRAPHDB_SPARQL_VERIFY_FAILED",
        )
        return parse_count(response.text)

    def _verify_shacl_config(self, value: str) -> None:
        try:
            payload = cast("object", json.loads(value))
        except (json.JSONDecodeError, TypeError) as error:
            raise TerminalRepositoryError(CONFIG_MALFORMED) from error
        if not isinstance(payload, dict):
            raise TerminalRepositoryError(CONFIG_MALFORMED)
        config = cast("dict[str, object]", payload)
        if config.get("id") != self._config.repository_id:
            raise TerminalRepositoryError(CONFIG_MALFORMED)
        params = config.get("params")
        if not isinstance(params, dict):
            raise TerminalRepositoryError(CONFIG_MALFORMED)
        parameters = cast("dict[str, object]", params)
        if (
            _config_value(parameters, "isShacl") != "true"
            or _config_value(parameters, "validationEnabled") != "true"
            or _config_value(parameters, "shapesGraph") != SHAPES_GRAPH
        ):
            raise TerminalRepositoryError(SHACL_NOT_ENABLED)

    def _request(  # noqa: PLR0913
        self,
        method: str,
        path: str,
        *,
        allowed: frozenset[int] = OK,
        error_code: str,
        params: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
        content: bytes | None = None,
        data: dict[str, str] | None = None,
        files: dict[str, tuple[str, bytes, str]] | None = None,
    ) -> httpx2.Response:
        self._network_calls += 1
        try:
            response = self._client.request(
                method,
                path,
                params=params,
                headers=headers,
                content=content,
                data=data,
                files=files,
            )
        except httpx2.RequestError as error:
            raise RetryableRepositoryError(UNAVAILABLE) from error
        if response.status_code in allowed:
            return response
        if _is_shacl_validation_failure(response):
            raise TerminalRepositoryError(error_code)
        if response.status_code >= HTTP_SERVER_ERROR:
            raise RetryableRepositoryError(UNAVAILABLE)
        raise TerminalRepositoryError(error_code)


def _config_value(parameters: dict[str, object], name: str) -> str | None:
    parameter = parameters.get(name)
    if not isinstance(parameter, dict):
        return None
    value = cast("dict[str, object]", parameter).get("value")
    return value if isinstance(value, str) else None


def _is_shacl_validation_failure(response: httpx2.Response) -> bool:
    content_type = cast("str", response.headers.get("content-type", ""))
    media_type = content_type.partition(";")[0].lower()
    if media_type != SHACL_REPORT_MEDIA_TYPE:
        return False
    report = Dataset()
    try:
        _ = report.parse(data=response.text, format="nquads")
    except (BadSyntax, ValueError):
        return False
    return any(
        (subject, SHACL_CONFORMS, Literal("false", datatype=XSD.boolean)) in report
        for subject in report.subjects(RDF.type, SHACL_VALIDATION_REPORT)
    )


def _normalize_graphdb_payload(
    payload: GraphPayload,
    graph_iri: str,
) -> GraphPayload:
    graph = Graph()
    _ = graph.parse(data="".join(payload.ntriples), format="nt")
    for subject, predicate, value in tuple(graph):
        if isinstance(value, Literal) and value.datatype == XSD.string:
            _ = graph.remove((subject, predicate, value))
            _ = graph.add((subject, predicate, Literal(str(value))))
    return graph_payload(graph, graph_iri)
