from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, final

from pipeline.musicbrainz.adapter import (
    AdapterConfig,
    MusicBrainzAdapter,
    Runtime,
    TransportResponse,
    TransportUnavailableError,
)

if TYPE_CHECKING:
    from collections.abc import Sequence

    from pipeline.musicbrainz.json_types import JsonObject, JsonValue


CONTACTABLE_USER_AGENT = "music-kg/0.1 (mailto:catalog@music-kg.kr)"


@final
class FakeClock:
    def __init__(self) -> None:
        self.elapsed: float = 0.0

    def advance(self, seconds: float) -> None:
        self.elapsed += seconds

    def now(self) -> datetime:
        return datetime(2026, 7, 31, 9, 0, tzinfo=UTC) + timedelta(seconds=self.elapsed)

    def monotonic(self) -> float:
        return self.elapsed


@final
class FakeSleeper:
    def __init__(self, clock: FakeClock) -> None:
        self.clock: FakeClock = clock
        self.calls: list[float] = []

    def sleep(self, seconds: float) -> None:
        self.calls.append(seconds)
        self.clock.advance(seconds)


@final
class FakeTransport:
    def __init__(
        self,
        outcomes: Sequence[TransportResponse | TransportUnavailableError],
    ) -> None:
        self.outcomes: list[TransportResponse | TransportUnavailableError] = list(outcomes)
        self.calls: list[tuple[str, dict[str, str]]] = []

    def get(self, url: str, headers: dict[str, str]) -> TransportResponse:
        self.calls.append((url, headers))
        outcome = self.outcomes.pop(0)
        match outcome:
            case TransportUnavailableError():
                raise outcome
            case TransportResponse():
                return outcome


def response(payload: JsonObject, status_code: int = 200) -> TransportResponse:
    return TransportResponse(status_code=status_code, body=payload)


def artist_credit(artist_id: str = "artist-1") -> list[JsonValue]:
    return [
        {
            "name": "공중도둑",
            "joinphrase": "",
            "artist": {"id": artist_id, "name": "공중도둑"},
        },
    ]


def search_hit(
    group_id: str = "rg-1",
    score: int = 96,
    artist_id: str = "artist-1",
) -> JsonObject:
    return {
        "id": group_id,
        "title": "무너지기",
        "primary-type": "Album",
        "score": score,
        "artist-credit": artist_credit(artist_id),
    }


def release_group_lookup(
    group_id: str = "rg-1",
    release_id: str = "release-kr",
    title: str = "무너지기",
) -> JsonObject:
    return {
        "id": group_id,
        "title": title,
        "primary-type": "Album",
        "aliases": [
            {"name": "무너지기", "locale": "ko", "primary": True},
            {"name": "Crumbling", "locale": "en", "primary": True},
        ],
        "artist-credit": artist_credit(),
        "releases": [
            {
                "id": release_id,
                "title": title,
                "date": "2018-07-20",
                "country": "KR",
                "status": "Official",
                "track-count": 10,
            },
            {
                "id": f"{release_id}-digital",
                "title": "Crumbling",
                "date": "2018-08-01",
                "country": "XW",
                "status": "Official",
                "track-count": 10,
            },
        ],
    }


def artist_lookup(artist_id: str = "artist-1") -> JsonObject:
    return {
        "id": artist_id,
        "name": "공중도둑",
        "aliases": [
            {"name": "Mid-Air Thief", "locale": "en", "primary": True},
            {"name": "공중도둑", "locale": "ko", "primary": True},
        ],
    }


def enriched_release_group(title: str = "무너지기") -> JsonObject:
    group = release_group_lookup(title=title)
    group["score"] = 96
    group["artist-credit"] = [
        {
            "name": "공중도둑",
            "joinphrase": "",
            "artist": {
                "id": "artist-1",
                "name": "공중도둑",
                "aliases": artist_lookup()["aliases"],
            },
        },
    ]
    return group


def release_lookup() -> JsonObject:
    return {
        "id": "release-kr",
        "title": "무너지기",
        "date": "2018-07-20",
        "country": "KR",
        "status": "Official",
        "release-group": {
            "id": "rg-1",
            "title": "무너지기",
            "primary-type": "Album",
        },
        "artist-credit": artist_credit(),
        "media": [
            {
                "tracks": [
                    {
                        "position": 1,
                        "title": "왜?",
                        "length": 243000,
                        "recording": {"id": "recording-1", "title": "왜?"},
                    },
                ],
            },
        ],
    }


def candidate_outcomes(
    group_id: str = "rg-1",
    title: str = "무너지기",
) -> list[TransportResponse]:
    return [
        response({"release-groups": [search_hit(group_id=group_id)]}),
        response(release_group_lookup(group_id=group_id, title=title)),
        response(artist_lookup()),
    ]


def live_adapter(
    outcomes: Sequence[TransportResponse | TransportUnavailableError],
    config: AdapterConfig | None = None,
) -> tuple[MusicBrainzAdapter, FakeTransport, FakeSleeper]:
    transport = FakeTransport(outcomes)
    clock = FakeClock()
    sleeper = FakeSleeper(clock)
    selected_config = config or AdapterConfig(
        user_agent=CONTACTABLE_USER_AGENT,
        fixture_mode=False,
    )
    adapter = MusicBrainzAdapter(
        selected_config,
        Runtime(transport=transport, clock=clock, sleeper=sleeper),
    )
    return adapter, transport, sleeper
