from __future__ import annotations

import hashlib
import json
from typing import TYPE_CHECKING

from .models import (
    Alias,
    ArtistCredit,
    Candidate,
    Release,
    ReleaseGroup,
    Source,
    Track,
)

if TYPE_CHECKING:
    from collections.abc import Mapping

    from .json_types import JsonObject, JsonValue


class NormalizationError(Exception):
    pass


def _mapping(value: JsonValue) -> JsonObject:
    if not isinstance(value, dict):
        raise NormalizationError
    return value


def _sequence(value: JsonValue) -> list[JsonValue]:
    if not isinstance(value, list):
        return []
    return value


def _required_text(value: JsonValue) -> str:
    if not isinstance(value, str) or not value:
        raise NormalizationError
    return value


def required_identifier(value: JsonValue) -> str:
    return _required_text(value)


def _optional_text(value: JsonValue) -> str | None:
    return value if isinstance(value, str) and value else None


def _optional_int(value: JsonValue) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _aliases(value: JsonValue) -> tuple[Alias, ...]:
    aliases: list[Alias] = []
    for item in _sequence(value):
        raw = _mapping(item)
        aliases.append(
            Alias(
                name=_required_text(raw.get("name")),
                locale=_optional_text(raw.get("locale")),
                primary=raw.get("primary") is True,
            ),
        )
    return tuple(aliases)


def _artist_credit(value: JsonValue) -> tuple[ArtistCredit, ...]:
    artist_credits: list[ArtistCredit] = []
    for item in _sequence(value):
        raw = _mapping(item)
        artist = _mapping(raw.get("artist"))
        artist_credits.append(
            ArtistCredit(
                artist_id=_required_text(artist.get("id")),
                name=_required_text(raw.get("name") or artist.get("name")),
                join_phrase=_optional_text(raw.get("joinphrase")) or "",
                aliases=_aliases(artist.get("aliases")),
            ),
        )
    if not artist_credits:
        raise NormalizationError
    return tuple(artist_credits)


def artist_ids(value: JsonValue) -> tuple[str, ...]:
    return tuple(
        _required_text(_mapping(_mapping(item).get("artist")).get("id"))
        for item in _sequence(value)
    )


def enrich_artist_aliases(
    value: JsonValue,
    aliases_by_artist: Mapping[str, JsonValue],
) -> list[JsonValue]:
    enriched: list[JsonValue] = []
    for item in _sequence(value):
        credit = dict(_mapping(item))
        artist = dict(_mapping(credit.get("artist")))
        artist_id = _required_text(artist.get("id"))
        artist["aliases"] = aliases_by_artist.get(artist_id, [])
        credit["artist"] = artist
        enriched.append(credit)
    return enriched


def _tracks(value: JsonValue) -> tuple[Track, ...]:
    tracks: list[Track] = []
    for medium in _sequence(value):
        medium_data = _mapping(medium)
        for item in _sequence(medium_data.get("tracks")):
            raw = _mapping(item)
            recording = _mapping(raw.get("recording"))
            tracks.append(
                Track(
                    recording_id=_required_text(recording.get("id")),
                    position=_optional_int(raw.get("position")) or len(tracks) + 1,
                    title=_required_text(raw.get("title") or recording.get("title")),
                    length_ms=_optional_int(raw.get("length")),
                ),
            )
    return tuple(tracks)


def _release(raw: Mapping[str, JsonValue], cover_art_url: str | None = None) -> Release:
    tracks = _tracks(raw.get("media"))
    track_count = _optional_int(raw.get("track-count"))
    if track_count is None and tracks:
        track_count = len(tracks)
    return Release(
        release_id=_required_text(raw.get("id")),
        title=_required_text(raw.get("title")),
        date=_optional_text(raw.get("date")),
        country=_optional_text(raw.get("country")),
        status=_optional_text(raw.get("status")),
        track_count=track_count,
        tracks=tracks,
        cover_art_url=cover_art_url,
    )


def _content_hash(raw: Mapping[str, JsonValue]) -> str:
    canonical = json.dumps(raw, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def normalize_release_group(
    raw: Mapping[str, JsonValue],
    retrieved_at: str,
    covers: Mapping[str, str | None],
) -> Candidate:
    group_id = _required_text(raw.get("id"))
    title = _required_text(raw.get("title"))
    releases = tuple(
        _release(item_data, covers.get(_required_text(item_data.get("id"))))
        for item in _sequence(raw.get("releases"))
        if (item_data := _mapping(item))
    )
    score = _optional_int(raw.get("score"))
    confidence = min(max((score or 0) / 100, 0.0), 1.0)
    return Candidate(
        candidate_id=f"musicbrainz:release-group:{group_id}",
        title=title,
        aliases=_aliases(raw.get("aliases")),
        artist_credit=_artist_credit(raw.get("artist-credit")),
        release_group=ReleaseGroup(
            release_group_id=group_id,
            title=title,
            primary_type=_optional_text(raw.get("primary-type")),
        ),
        releases=releases,
        source=Source(
            provider="musicbrainz",
            resource_url=f"https://musicbrainz.org/release-group/{group_id}",
        ),
        retrieved_at=retrieved_at,
        content_hash=_content_hash(raw),
        match_confidence=confidence,
        review_required=False,
        review_reasons=(),
    )


def normalize_release(
    raw: Mapping[str, JsonValue],
    retrieved_at: str,
    cover_art_url: str | None,
) -> Candidate:
    release_group = _mapping(raw.get("release-group"))
    group_id = _required_text(release_group.get("id"))
    title = _required_text(release_group.get("title"))
    merged_group = dict(release_group)
    merged_group["artist-credit"] = raw.get("artist-credit")
    merged_group["releases"] = [dict(raw)]
    candidate = normalize_release_group(
        merged_group,
        retrieved_at,
        {_required_text(raw.get("id")): cover_art_url},
    )
    return Candidate(
        candidate_id=candidate.candidate_id,
        title=title,
        aliases=candidate.aliases,
        artist_credit=candidate.artist_credit,
        release_group=ReleaseGroup(
            release_group_id=group_id,
            title=title,
            primary_type=_optional_text(release_group.get("primary-type")),
        ),
        releases=candidate.releases,
        source=candidate.source,
        retrieved_at=candidate.retrieved_at,
        content_hash=candidate.content_hash,
        match_confidence=1.0,
        review_required=False,
        review_reasons=(),
    )
