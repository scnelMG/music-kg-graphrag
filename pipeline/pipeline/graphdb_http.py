from __future__ import annotations

import json
import logging
import socket
from typing import TYPE_CHECKING, Final, Protocol, TypeGuard

import httpx2

from .projection_store import TerminalRepositoryError

if TYPE_CHECKING:
    type JsonValue = (
        str | int | float | bool | None | list[JsonValue] | dict[str, JsonValue]
    )

    class JsonDecoder(Protocol):
        def __call__(self, value: str) -> JsonValue: ...

    decode_json: JsonDecoder
else:
    decode_json = json.loads


LOGGER: Final = logging.getLogger(__name__)
SPARQL_RESULT_MALFORMED: Final = "GRAPHDB_SPARQL_RESULT_MALFORMED"


def _log_request(request: httpx2.Request) -> None:
    LOGGER.debug("GraphDB request %s %s", request.method, request.url)


def _log_response(response: httpx2.Response) -> None:
    LOGGER.debug(
        "GraphDB response %s %s %d",
        response.request.method,
        response.request.url,
        response.status_code,
    )


def create_client(base_url: str) -> httpx2.Client:
    limits = httpx2.Limits(
        max_connections=200,
        max_keepalive_connections=40,
        keepalive_expiry=30.0,
    )
    timeout = httpx2.Timeout(connect=5.0, read=30.0, write=10.0, pool=10.0)
    transport = httpx2.HTTPTransport(
        http2=True,
        retries=0,
        limits=limits,
        socket_options=[(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)],
    )
    return httpx2.Client(
        base_url=base_url,
        transport=transport,
        timeout=timeout,
        follow_redirects=True,
        event_hooks={"request": [_log_request], "response": [_log_response]},
    )


def _is_mapping(value: JsonValue) -> TypeGuard[dict[str, JsonValue]]:
    return isinstance(value, dict)


def parse_count(value: str) -> int:
    try:
        loaded = decode_json(value)
    except json.JSONDecodeError as error:
        raise TerminalRepositoryError(SPARQL_RESULT_MALFORMED) from error
    if not _is_mapping(loaded):
        raise TerminalRepositoryError(SPARQL_RESULT_MALFORMED)
    results = loaded.get("results")
    if not _is_mapping(results):
        raise TerminalRepositoryError(SPARQL_RESULT_MALFORMED)
    bindings = results.get("bindings")
    if not isinstance(bindings, list) or len(bindings) != 1:
        raise TerminalRepositoryError(SPARQL_RESULT_MALFORMED)
    binding = bindings[0]
    if not _is_mapping(binding):
        raise TerminalRepositoryError(SPARQL_RESULT_MALFORMED)
    count = binding.get("count")
    if not _is_mapping(count):
        raise TerminalRepositoryError(SPARQL_RESULT_MALFORMED)
    raw = count.get("value")
    if not isinstance(raw, str) or not raw.isdecimal():
        raise TerminalRepositoryError(SPARQL_RESULT_MALFORMED)
    return int(raw)
