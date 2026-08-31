from __future__ import annotations

import json
import re
import threading
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import TYPE_CHECKING, Final, Self, cast, final, override
from urllib.parse import parse_qs, unquote, urlsplit

from rdflib import Graph, Literal, Namespace
from rdflib.namespace import XSD

if TYPE_CHECKING:
    from pathlib import Path

GRAPH_PATTERN: Final = re.compile(r"GRAPH <([^>]+)>")
RECEIPT_INSERT_PATTERN: Final = re.compile(
    r"INSERT\s*\{\s*GRAPH <([^>]+)>\s*\{\s*(.*?)\s*\}\s*\}\s*WHERE",
    re.DOTALL,
)
RECEIPT_GRAPH_PREFIX: Final = (
    "https://w3id.org/music-kg-graphrag/graph/projection-receipts/"
)
TERMINAL_RECEIPT_GRAPH_PREFIX: Final = (
    "https://w3id.org/music-kg-graphrag/graph/projection-terminal-receipts/"
)
SAIL: Final = Namespace("http://www.openrdf.org/config/sail#")
SAIL_SHACL: Final = Namespace("http://rdf4j.org/config/sail/shacl#")
SHAPES_GRAPH: Final = "http://rdf4j.org/schema/rdf4j#SHACLShapeGraph"
SHACL_VALIDATION_REPORT: Final = (
    b'_:report <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> '
    b'<http://www.w3.org/ns/shacl#ValidationReport> .\n'
    b'_:report <http://www.w3.org/ns/shacl#conforms> '
    b'"false"^^<http://www.w3.org/2001/XMLSchema#boolean> .\n'
)


@dataclass(slots=True)
class GraphDbState:
    """Capture observable HTTP state for the ephemeral GraphDB wire fake."""

    repository_config: bytes
    repository_exists: bool = False
    graphs: dict[str, bytes] = field(default_factory=dict)
    calls: list[tuple[str, str]] = field(default_factory=list)
    repository_creations: int = 0
    reject_data_load: bool = False
    fail_data_load_retryably: bool = False
    corrupt_shapes_readback: bool = False


class GraphDbHandler(BaseHTTPRequestHandler):
    @property
    def _state(self) -> GraphDbState:
        return cast("GraphDbServer", self.server).state

    def do_GET(self) -> None:
        path = urlsplit(self.path)
        self._state.calls.append(("GET", path.path))
        if path.path == "/rest/repositories/music-kg":
            if not self._state.repository_exists:
                self._respond(404)
                return
            self._respond(
                200,
                _repository_config_json(self._state.repository_config),
                "application/json",
            )
            return
        if path.path == "/repositories/music-kg/statements":
            context = _context(path.query)
            body = self._state.graphs.get(context, b"")
            if (
                self._state.corrupt_shapes_readback
                and context == "http://rdf4j.org/schema/rdf4j#SHACLShapeGraph"
            ):
                body = b""
            self._respond(
                200,
                body,
                "application/n-triples",
            )
            return
        self._respond(404)

    def do_POST(self) -> None:  # noqa: PLR0911
        path = urlsplit(self.path)
        self._state.calls.append(("POST", path.path))
        body = self._body()
        if path.path == "/rest/repositories":
            if (
                b"rdf4j:ShaclSail" not in body
                or b"validationEnabled true" not in body
            ):
                self._respond(400)
                return
            self._state.repository_exists = True
            self._state.repository_creations += 1
            self._respond(201)
            return
        if path.path in {
            "/repositories/music-kg",
            "/repositories/music-kg/statements",
        }:
            form = parse_qs(body.decode())
            updates = form.get("update")
            if updates is not None:
                matched_insert = RECEIPT_INSERT_PATTERN.search(updates[0])
                if matched_insert is None:
                    self._respond(400)
                    return
                graph_iri, triples = matched_insert.groups()
                _ = self._state.graphs.setdefault(
                    graph_iri,
                    triples.strip().encode() + b"\n",
                )
                self._respond(204)
                return
            if path.path == "/repositories/music-kg/statements":
                self._respond(400)
                return
            query = form["query"][0]
            matched = GRAPH_PATTERN.search(query)
            if matched is None:
                self._respond(400)
                return
            triple_count = len(
                self._state.graphs.get(matched.group(1), b"").splitlines(),
            )
            payload = {
                "head": {"vars": ["count"]},
                "results": {
                    "bindings": [
                        {
                            "count": {
                                "type": "literal",
                                "value": str(triple_count),
                            },
                        },
                    ],
                },
            }
            self._respond(
                200,
                json.dumps(payload).encode(),
                "application/sparql-results+json",
            )
            return
        self._respond(404)

    def do_PUT(self) -> None:
        path = urlsplit(self.path)
        self._state.calls.append(("PUT", path.path))
        if path.path != "/repositories/music-kg/statements":
            self._respond(404)
            return
        context = _context(path.query)
        body = self._body()
        if (
            self._state.reject_data_load
            and context != "http://rdf4j.org/schema/rdf4j#SHACLShapeGraph"
            and not context.startswith(RECEIPT_GRAPH_PREFIX)
            and not context.startswith(TERMINAL_RECEIPT_GRAPH_PREFIX)
        ):
            self._respond(
                500,
                SHACL_VALIDATION_REPORT,
                "application/shacl-validation-report+n-quads;charset=UTF-8",
            )
            return
        if (
            self._state.fail_data_load_retryably
            and context != SHAPES_GRAPH
            and not context.startswith(RECEIPT_GRAPH_PREFIX)
            and not context.startswith(TERMINAL_RECEIPT_GRAPH_PREFIX)
        ):
            self._respond(503, b"service unavailable")
            return
        content_type = self.headers.get_content_type()
        if content_type in {"text/turtle", "application/n-triples"}:
            graph = Graph()
            rdf_format = "turtle" if content_type == "text/turtle" else "nt"
            _ = graph.parse(data=body.decode(), format=rdf_format)
            for subject, predicate, value in tuple(graph):
                if isinstance(value, Literal) and value.datatype == XSD.string:
                    _ = graph.remove((subject, predicate, value))
                    _ = graph.add((subject, predicate, Literal(str(value))))
            serialized = graph.serialize(format="nt")
            body = serialized.encode()
        self._state.graphs[context] = body
        self._respond(204)

    def do_DELETE(self) -> None:
        path = urlsplit(self.path)
        self._state.calls.append(("DELETE", path.path))
        if path.path == "/repositories/music-kg/statements":
            _ = self._state.graphs.pop(_context(path.query), None)
            self._respond(204)
            return
        if path.path != "/rest/repositories/music-kg":
            self._respond(404)
            return
        self._state.repository_exists = False
        self._state.graphs.clear()
        self._respond(204)

    @override
    def log_message(self, format: str, *args: object) -> None:
        _ = format, args

    def _body(self) -> bytes:
        content_length = int(self.headers.get("Content-Length", "0"))
        return self.rfile.read(content_length)

    def _respond(
        self,
        status: int,
        body: bytes = b"",
        content_type: str = "text/plain",
    ) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        _ = self.wfile.write(body)


@final
class GraphDbServer(ThreadingHTTPServer):
    def __init__(self, address: tuple[str, int], state: GraphDbState) -> None:
        super().__init__(address, GraphDbHandler)
        self.state = state


def _repository_config_json(config: bytes) -> bytes:
    graph = Graph()
    _ = graph.parse(data=config.decode(), format="turtle")
    shacl_sails = tuple(
        graph.subjects(SAIL.sailType, Literal("rdf4j:ShaclSail")),
    )
    shacl_sail = shacl_sails[0] if len(shacl_sails) == 1 else None
    enabled = (
        shacl_sail is not None
        and (
            shacl_sail,
            SAIL_SHACL.validationEnabled,
            Literal("true", datatype=XSD.boolean),
        )
        in graph
    )
    shapes_graph = ""
    if shacl_sail is not None:
        shapes_graph = str(graph.value(shacl_sail, SAIL_SHACL.shapesGraph) or "")
    payload = {
        "id": "music-kg",
        "params": {
            "isShacl": {"value": "true" if shacl_sail is not None else "false"},
            "validationEnabled": {"value": "true" if enabled else "false"},
            "shapesGraph": {"value": shapes_graph},
        },
    }
    return json.dumps(payload).encode()


@final
class RunningGraphDb:
    def __init__(self, repository_config: Path) -> None:
        self.state = GraphDbState(repository_config.read_bytes())
        self._server = GraphDbServer(("127.0.0.1", 0), self.state)
        self._thread = threading.Thread(target=self._server.serve_forever)

    @property
    def url(self) -> str:
        host, port = cast("tuple[str, int]", self._server.server_address)
        return f"http://{host}:{port}"

    def __enter__(self) -> Self:
        self._thread.start()
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: object,
    ) -> None:
        _ = exc_type, exc_value, traceback
        self._server.shutdown()
        self._server.server_close()
        self._thread.join()


def _context(query: str) -> str:
    encoded = parse_qs(query)["context"][0]
    return unquote(encoded).removeprefix("<").removesuffix(">")
