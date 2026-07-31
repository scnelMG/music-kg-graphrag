from __future__ import annotations

import json
from dataclasses import asdict, dataclass


@dataclass(frozen=True, slots=True)
class Alias:
    name: str
    locale: str | None
    primary: bool


@dataclass(frozen=True, slots=True)
class ArtistCredit:
    artist_id: str
    name: str
    join_phrase: str
    aliases: tuple[Alias, ...]


@dataclass(frozen=True, slots=True)
class Track:
    recording_id: str
    position: int
    title: str
    length_ms: int | None


@dataclass(frozen=True, slots=True)
class Release:
    release_id: str
    title: str
    date: str | None
    country: str | None
    status: str | None
    track_count: int | None
    tracks: tuple[Track, ...]
    cover_art_url: str | None


@dataclass(frozen=True, slots=True)
class ReleaseGroup:
    release_group_id: str
    title: str
    primary_type: str | None


@dataclass(frozen=True, slots=True)
class Source:
    provider: str
    resource_url: str


@dataclass(frozen=True, slots=True)
class Candidate:
    candidate_id: str
    title: str
    aliases: tuple[Alias, ...]
    artist_credit: tuple[ArtistCredit, ...]
    release_group: ReleaseGroup
    releases: tuple[Release, ...]
    source: Source
    retrieved_at: str
    content_hash: str
    match_confidence: float
    review_required: bool
    review_reasons: tuple[str, ...]

    def to_json(self) -> str:
        return json.dumps(
            asdict(self),
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
