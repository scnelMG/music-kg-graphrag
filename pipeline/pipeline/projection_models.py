from __future__ import annotations

import json
import re
from dataclasses import dataclass
from enum import StrEnum, unique
from typing import TYPE_CHECKING, Final, Protocol, TypeGuard, override

if TYPE_CHECKING:
    from pathlib import Path

    class JsonDecoder(Protocol):
        def __call__(self, value: str) -> JsonValue: ...

    decode_json: JsonDecoder
else:
    decode_json = json.loads


type JsonValue = str | int | float | bool | None | list[JsonValue] | dict[str, JsonValue]

SAFE_COMPONENT: Final = re.compile(r"^[a-z0-9][a-z0-9._-]{0,63}$")
MAX_FIXTURE_RETRY_FAILURES: Final = 2


@unique
class ManifestCode(StrEnum):
    FIXTURE_MODE_REQUIRED = "FIXTURE_MODE_REQUIRED"
    INVALID = "INVALID_PROJECTION_MANIFEST"
    MALFORMED = "MALFORMED_PROJECTION_MANIFEST"
    REPLAY_NOT_TERMINAL = "REPLAY_EVENT_NOT_TERMINAL"
    UNKNOWN_REPLAY_EVENT = "UNKNOWN_REPLAY_EVENT"
    UNSAFE_IDENTIFIER = "UNSAFE_PROJECTION_IDENTIFIER"


@dataclass(frozen=True, slots=True)
class ProjectionEvent:
    event_id: str
    source: str
    generation: str
    rdf_path: Path
    fixture_retry_failures: int

    @property
    def graph_iri(self) -> str:
        return (
            f"https://w3id.org/music-kg-graphrag/graph/{self.source}/generation/{self.generation}"
        )


@dataclass(frozen=True, slots=True)
class ProjectionManifest:
    path: Path
    events: tuple[ProjectionEvent, ...]


@dataclass(frozen=True, slots=True)
class ProjectionManifestError(Exception):
    code: ManifestCode
    detail: str

    @override
    def __str__(self) -> str:
        return f"{self.code}: {self.detail}"


def _is_mapping(value: JsonValue) -> TypeGuard[dict[str, JsonValue]]:
    return isinstance(value, dict)


def _is_list(value: JsonValue) -> TypeGuard[list[JsonValue]]:
    return isinstance(value, list)


def _required_string(mapping: dict[str, JsonValue], key: str) -> str:
    value = mapping.get(key)
    if not isinstance(value, str) or not value:
        raise ProjectionManifestError(ManifestCode.INVALID, key)
    return value


def _safe_component(value: str, field: str) -> str:
    if SAFE_COMPONENT.fullmatch(value) is None:
        raise ProjectionManifestError(ManifestCode.UNSAFE_IDENTIFIER, field)
    return value


def load_projection_manifest(path: Path) -> ProjectionManifest:
    try:
        loaded = decode_json(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as error:
        raise ProjectionManifestError(ManifestCode.MALFORMED, str(path)) from error
    if not _is_mapping(loaded) or loaded.get("fixture_mode") is not True:
        raise ProjectionManifestError(ManifestCode.FIXTURE_MODE_REQUIRED, str(path))
    projection = loaded.get("projection")
    if not _is_mapping(projection):
        raise ProjectionManifestError(ManifestCode.INVALID, "projection")
    generation = _safe_component(
        _required_string(projection, "generation"),
        "generation",
    )
    raw_events = projection.get("events")
    if not _is_list(raw_events) or not raw_events:
        raise ProjectionManifestError(ManifestCode.INVALID, "events")

    events: list[ProjectionEvent] = []
    for raw_event in raw_events:
        if not _is_mapping(raw_event):
            raise ProjectionManifestError(ManifestCode.INVALID, "event")
        event_id = _safe_component(_required_string(raw_event, "event_id"), "event_id")
        source = _safe_component(_required_string(raw_event, "source"), "source")
        relative_path = _required_string(raw_event, "rdf_path")
        retry_failures = raw_event.get("fixture_retry_failures", 0)
        if (
            isinstance(retry_failures, bool)
            or not isinstance(retry_failures, int)
            or not 0 <= retry_failures <= MAX_FIXTURE_RETRY_FAILURES
        ):
            raise ProjectionManifestError(
                ManifestCode.INVALID,
                "fixture_retry_failures",
            )
        events.append(
            ProjectionEvent(
                event_id=event_id,
                source=source,
                generation=generation,
                rdf_path=(path.parent / relative_path).resolve(),
                fixture_retry_failures=retry_failures,
            ),
        )
    return ProjectionManifest(path=path.resolve(), events=tuple(events))
