from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum, unique
from typing import Final
from urllib.parse import quote

from rdflib import Graph, Literal, Namespace, URIRef

from .projection_store import (
    EVENT_IDENTITY_CONFLICT,
    GraphPayload,
    TerminalRepositoryError,
    graph_payload,
)

RECEIPT_GRAPH_PREFIX: Final = (
    "https://w3id.org/music-kg-graphrag/graph/projection-receipts/"
)
TERMINAL_RECEIPT_GRAPH_PREFIX: Final = (
    "https://w3id.org/music-kg-graphrag/graph/projection-terminal-receipts/"
)
RECEIPT: Final = Namespace(
    "https://w3id.org/music-kg-graphrag/ontology/projection-receipt#",
)
RECEIPT_MALFORMED: Final = "GRAPHDB_RECEIPT_MALFORMED"


@unique
class ReceiptState(StrEnum):
    PENDING = "PENDING"
    COMMITTED = "COMMITTED"


@dataclass(frozen=True, slots=True)
class ReceiptIdentity:
    event_id: str
    graph_iri: str
    payload_sha256: str


@dataclass(frozen=True, slots=True)
class ProjectionReceipt:
    identity: ReceiptIdentity
    state: ReceiptState


@dataclass(frozen=True, slots=True)
class TerminalReceipt:
    event_id: str
    error_code: str


def receipt_graph_iri(event_id: str) -> str:
    return f"{RECEIPT_GRAPH_PREFIX}{quote(event_id, safe='')}"


def terminal_receipt_graph_iri(event_id: str) -> str:
    return f"{TERMINAL_RECEIPT_GRAPH_PREFIX}{quote(event_id, safe='')}"


def receipt_payload(
    identity: ReceiptIdentity,
    state: ReceiptState,
) -> GraphPayload:
    graph_iri = receipt_graph_iri(identity.event_id)
    subject = URIRef(f"{graph_iri}#receipt")
    graph = Graph()
    _ = graph.add((subject, RECEIPT.eventId, Literal(identity.event_id)))
    _ = graph.add((subject, RECEIPT.targetGraph, URIRef(identity.graph_iri)))
    _ = graph.add(
        (subject, RECEIPT.payloadSha256, Literal(identity.payload_sha256)),
    )
    _ = graph.add((subject, RECEIPT.state, Literal(str(state))))
    return graph_payload(graph, graph_iri)


def parse_receipt(payload: GraphPayload, graph_iri: str) -> ProjectionReceipt | None:
    if payload.triple_count == 0:
        return None
    graph = Graph()
    _ = graph.parse(data="".join(payload.ntriples), format="nt")
    subjects = tuple(graph.subjects(RECEIPT.eventId))
    if len(subjects) != 1:
        raise TerminalRepositoryError(RECEIPT_MALFORMED)
    subject = subjects[0]
    event_ids = tuple(graph.objects(subject, RECEIPT.eventId))
    target_graphs = tuple(graph.objects(subject, RECEIPT.targetGraph))
    payload_hashes = tuple(graph.objects(subject, RECEIPT.payloadSha256))
    states = tuple(graph.objects(subject, RECEIPT.state))
    if (
        len(event_ids) != 1
        or len(target_graphs) != 1
        or len(payload_hashes) != 1
        or len(states) != 1
        or not isinstance(event_ids[0], Literal)
        or not isinstance(target_graphs[0], URIRef)
        or not isinstance(payload_hashes[0], Literal)
        or not isinstance(states[0], Literal)
    ):
        raise TerminalRepositoryError(RECEIPT_MALFORMED)
    try:
        state = ReceiptState(str(states[0]))
    except ValueError as error:
        raise TerminalRepositoryError(RECEIPT_MALFORMED) from error
    identity = ReceiptIdentity(
        event_id=str(event_ids[0]),
        graph_iri=str(target_graphs[0]),
        payload_sha256=str(payload_hashes[0]),
    )
    if receipt_graph_iri(identity.event_id) != graph_iri:
        raise TerminalRepositoryError(RECEIPT_MALFORMED)
    return ProjectionReceipt(identity=identity, state=state)


def verify_identity(
    receipt: ProjectionReceipt,
    expected: ReceiptIdentity,
) -> None:
    if receipt.identity != expected:
        raise TerminalRepositoryError(EVENT_IDENTITY_CONFLICT)


def terminal_receipt_payload(event_id: str, error_code: str) -> GraphPayload:
    graph_iri = terminal_receipt_graph_iri(event_id)
    subject = URIRef(f"{graph_iri}#terminal")
    graph = Graph()
    _ = graph.add((subject, RECEIPT.eventId, Literal(event_id)))
    _ = graph.add((subject, RECEIPT.state, Literal("TERMINAL")))
    _ = graph.add((subject, RECEIPT.errorCode, Literal(error_code)))
    return graph_payload(graph, graph_iri)


def parse_terminal_receipt(
    payload: GraphPayload,
    graph_iri: str,
) -> TerminalReceipt | None:
    if payload.triple_count == 0:
        return None
    graph = Graph()
    _ = graph.parse(data="".join(payload.ntriples), format="nt")
    subjects = tuple(graph.subjects(RECEIPT.state, Literal("TERMINAL")))
    if len(subjects) != 1:
        raise TerminalRepositoryError(RECEIPT_MALFORMED)
    subject = subjects[0]
    event_ids = tuple(graph.objects(subject, RECEIPT.eventId))
    error_codes = tuple(graph.objects(subject, RECEIPT.errorCode))
    if (
        len(event_ids) != 1
        or len(error_codes) != 1
        or not isinstance(event_ids[0], Literal)
        or not isinstance(error_codes[0], Literal)
    ):
        raise TerminalRepositoryError(RECEIPT_MALFORMED)
    receipt = TerminalReceipt(
        event_id=str(event_ids[0]),
        error_code=str(error_codes[0]),
    )
    if terminal_receipt_graph_iri(receipt.event_id) != graph_iri:
        raise TerminalRepositoryError(RECEIPT_MALFORMED)
    return receipt
