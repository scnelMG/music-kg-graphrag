from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass
from enum import StrEnum, unique
from typing import TYPE_CHECKING, Final, Protocol

from rdflib import Graph
from rdflib.compare import to_canonical_graph

from .validate_rdf import SemanticInputError, validate_rdf_path

if TYPE_CHECKING:
    from .projection_models import ProjectionEvent


MAX_ATTEMPTS: Final = 3
EVENT_IDENTITY_CONFLICT: Final = "EVENT_IDENTITY_CONFLICT"


@unique
class EventState(StrEnum):
    SUCCEEDED = "SUCCEEDED"
    TERMINAL_FAILED = "TERMINAL_FAILED"


@dataclass(frozen=True, slots=True)
class EventOutcome:
    event_id: str
    state: EventState
    attempts: int
    backoff_seconds: tuple[int, ...]
    load_attempted: bool
    error_code: str | None
    duplicate: bool


@dataclass(frozen=True, slots=True)
class GraphSnapshot:
    graph: str
    triple_count: int
    sha256: str


@dataclass(frozen=True, slots=True)
class RepositorySnapshot:
    graphs: tuple[GraphSnapshot, ...]
    triple_count: int
    repository_sha256: str


@dataclass(frozen=True, slots=True)
class GraphPayload:
    ntriples: tuple[str, ...]
    nquads: tuple[str, ...]
    triple_count: int
    sha256: str


@dataclass(frozen=True, slots=True)
class RetryableRepositoryError(Exception):
    code: str


@dataclass(frozen=True, slots=True)
class TerminalRepositoryError(Exception):
    code: str


class ProjectionRepository(Protocol):
    @property
    def mode(self) -> str: ...

    @property
    def network_calls(self) -> int: ...

    def apply(self, event: ProjectionEvent, payload: GraphPayload) -> bool: ...

    def snapshot(self) -> RepositorySnapshot: ...

    def nquads(self) -> str: ...

    def reset(self) -> None: ...

    def record_terminal(self, event_id: str, error_code: str) -> None: ...

    def clear_terminal(self, event_id: str) -> None: ...

    def terminal_event_ids(self, event_ids: tuple[str, ...]) -> tuple[str, ...]: ...


class Sleeper(Protocol):
    def sleep(self, seconds: float) -> None: ...


class SystemSleeper:
    def sleep(self, seconds: float) -> None:
        time.sleep(seconds)


class FixtureRepository:
    """Mutable in-memory GraphDB wire substitute for deterministic fixture QA."""

    def __init__(self) -> None:
        self._graphs: dict[str, tuple[str, ...]] = {}
        self._applied_events: dict[str, str] = {}
        self._terminal_errors: dict[str, str] = {}

    @property
    def mode(self) -> str:
        return "fixture"

    @property
    def network_calls(self) -> int:
        return 0

    def apply(self, event: ProjectionEvent, payload: GraphPayload) -> bool:
        content_hash = payload.sha256
        existing = self._applied_events.get(event.event_id)
        if existing is not None:
            if existing != content_hash:
                raise TerminalRepositoryError(EVENT_IDENTITY_CONFLICT)
            return False
        self._graphs[event.graph_iri] = payload.nquads
        self._applied_events[event.event_id] = content_hash
        return True

    def snapshot(self) -> RepositorySnapshot:
        graphs = tuple(
            GraphSnapshot(
                graph=graph,
                triple_count=len(lines),
                sha256=_checksum(lines),
            )
            for graph, lines in sorted(self._graphs.items())
        )
        all_lines = tuple(line for graph in sorted(self._graphs) for line in self._graphs[graph])
        return RepositorySnapshot(
            graphs=graphs,
            triple_count=len(all_lines),
            repository_sha256=_checksum(all_lines),
        )

    def nquads(self) -> str:
        return "".join(line for graph in sorted(self._graphs) for line in self._graphs[graph])

    def reset(self) -> None:
        self._graphs.clear()
        self._applied_events.clear()
        self._terminal_errors.clear()

    def record_terminal(self, event_id: str, error_code: str) -> None:
        self._terminal_errors[event_id] = error_code

    def clear_terminal(self, event_id: str) -> None:
        _ = self._terminal_errors.pop(event_id, None)

    def terminal_event_ids(self, event_ids: tuple[str, ...]) -> tuple[str, ...]:
        return tuple(
            sorted(
                {
                    event_id
                    for event_id in event_ids
                    if event_id in self._terminal_errors
                },
            ),
        )


def _checksum(lines: tuple[str, ...]) -> str:
    return hashlib.sha256("".join(lines).encode()).hexdigest()


def graph_payload(graph: Graph, graph_iri: str) -> GraphPayload:
    canonical = to_canonical_graph(graph)
    ntriples = tuple(
        sorted(
            f"{subject.n3()} {predicate.n3()} {value.n3()} .\n"
            for subject, predicate, value in canonical
        ),
    )
    nquads = tuple(
        line.removesuffix(" .\n") + f" <{graph_iri}> .\n" for line in ntriples
    )
    return GraphPayload(
        ntriples=ntriples,
        nquads=nquads,
        triple_count=len(nquads),
        sha256=_checksum(nquads),
    )


def load_graph_payload(path: str, graph_iri: str) -> GraphPayload:
    graph = Graph()
    _ = graph.parse(path, format="turtle")
    return graph_payload(graph, graph_iri)


def project_event(
    event: ProjectionEvent,
    repository: ProjectionRepository,
    *,
    max_attempts: int = MAX_ATTEMPTS,
    sleeper: Sleeper | None = None,
) -> EventOutcome:
    try:
        validation = validate_rdf_path(event.rdf_path)
    except SemanticInputError as error:
        return EventOutcome(
            event_id=event.event_id,
            state=EventState.TERMINAL_FAILED,
            attempts=1,
            backoff_seconds=(),
            load_attempted=False,
            error_code=str(error.code),
            duplicate=False,
        )
    if not validation.conforms:
        return EventOutcome(
            event_id=event.event_id,
            state=EventState.TERMINAL_FAILED,
            attempts=1,
            backoff_seconds=(),
            load_attempted=False,
            error_code=(
                validation.error_codes[0] if validation.error_codes else "SHACL_NONCONFORMANT"
            ),
            duplicate=False,
        )

    payload = load_graph_payload(str(event.rdf_path), event.graph_iri)
    backoffs: list[int] = []
    selected_sleeper = SystemSleeper() if sleeper is None else sleeper
    for attempt in range(1, max_attempts + 1):
        if attempt <= event.fixture_retry_failures:
            backoffs.append(1 << (attempt - 1))
            continue
        try:
            applied = repository.apply(event, payload)
        except RetryableRepositoryError as error:
            if attempt < max_attempts:
                delay = 1 << (attempt - 1)
                backoffs.append(delay)
                selected_sleeper.sleep(float(delay))
                continue
            return EventOutcome(
                event_id=event.event_id,
                state=EventState.TERMINAL_FAILED,
                attempts=attempt,
                backoff_seconds=tuple(backoffs),
                load_attempted=True,
                error_code=error.code,
                duplicate=False,
            )
        except TerminalRepositoryError as error:
            return EventOutcome(
                event_id=event.event_id,
                state=EventState.TERMINAL_FAILED,
                attempts=attempt,
                backoff_seconds=tuple(backoffs),
                load_attempted=True,
                error_code=error.code,
                duplicate=False,
            )
        return EventOutcome(
            event_id=event.event_id,
            state=EventState.SUCCEEDED,
            attempts=attempt,
            backoff_seconds=tuple(backoffs),
            load_attempted=True,
            error_code=None,
            duplicate=not applied,
        )
    return EventOutcome(
        event_id=event.event_id,
        state=EventState.TERMINAL_FAILED,
        attempts=max_attempts,
        backoff_seconds=tuple(backoffs),
        load_attempted=True,
        error_code="GRAPHDB_UNAVAILABLE",
        duplicate=False,
    )
