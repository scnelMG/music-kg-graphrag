from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, replace
from typing import TYPE_CHECKING, Final, Protocol, final, override

from .normalize import (
    NormalizationError,
    artist_ids,
    enrich_artist_aliases,
    normalize_release,
    normalize_release_group,
    required_identifier,
)
from .urls import (
    build_artist_lookup_url,
    build_cover_art_lookup_url,
    build_release_group_lookup_url,
    build_release_group_search_url,
    build_release_lookup_url,
    is_allowed_cover_image_url,
)

if TYPE_CHECKING:
    from collections.abc import Mapping
    from datetime import datetime

    from .json_types import JsonValue
    from .models import Candidate


RETRYABLE_STATUS: Final[frozenset[int]] = frozenset({429, 500, 502, 503, 504})
OK_STATUS: Final[frozenset[int]] = frozenset({200})
COVER_STATUS: Final[frozenset[int]] = frozenset({200, 404})
NOT_FOUND_STATUS: Final = 404
PLACEHOLDER_PATTERN: Final = re.compile(
    r"placeholder|replace[- ]?with|example-user-agent|@example\.|\.invalid\b",
    re.IGNORECASE,
)
CONTACT_PATTERN: Final = re.compile(
    r"(?:mailto:)?[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|https://[^\s)]+",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class AdapterConfig:
    user_agent: str | None = None
    fixture_mode: bool = True
    candidate_limit: int = 5
    cache_ttl_seconds: float = 86_400.0
    max_attempts: int = 3
    max_backoff_seconds: float = 2.0


@dataclass(frozen=True, slots=True)
class TransportResponse:
    status_code: int
    body: JsonValue


@dataclass(frozen=True, slots=True)
class UserAgentPolicyError(Exception):
    user_agent: str | None

    @override
    def __str__(self) -> str:
        return "live MusicBrainz access requires a non-placeholder contactable User-Agent"


@dataclass(frozen=True, slots=True)
class TransportUnavailableError(Exception):
    url: str

    @override
    def __str__(self) -> str:
        return f"provider transport unavailable for {self.url}"


@dataclass(frozen=True, slots=True)
class ProviderUnavailableError(Exception):
    url: str
    attempts: int

    @override
    def __str__(self) -> str:
        return f"provider unavailable after {self.attempts} attempts: {self.url}"


@dataclass(frozen=True, slots=True)
class ProviderResponseError(Exception):
    url: str
    status_code: int

    @override
    def __str__(self) -> str:
        return f"provider returned HTTP {self.status_code}: {self.url}"


@dataclass(frozen=True, slots=True)
class MalformedResponseError(Exception):
    url: str

    @override
    def __str__(self) -> str:
        return f"provider returned malformed JSON: {self.url}"


class Transport(Protocol):
    def get(self, url: str, headers: dict[str, str]) -> TransportResponse: ...


class Clock(Protocol):
    def now(self) -> datetime: ...

    def monotonic(self) -> float: ...


class Sleeper(Protocol):
    def sleep(self, seconds: float) -> None: ...


@dataclass(frozen=True, slots=True)
class Runtime:
    transport: Transport
    clock: Clock
    sleeper: Sleeper


@dataclass(frozen=True, slots=True)
class CachedResponse:
    response: TransportResponse
    stored_at: float
    retrieved_at: str


@final
class MusicBrainzAdapter:
    def __init__(self, config: AdapterConfig, runtime: Runtime) -> None:
        valid_user_agent = (
            config.user_agent is not None
            and "/" in config.user_agent
            and PLACEHOLDER_PATTERN.search(config.user_agent) is None
            and CONTACT_PATTERN.search(config.user_agent) is not None
        )
        if not config.fixture_mode and not valid_user_agent:
            raise UserAgentPolicyError(user_agent=config.user_agent)
        self._config = config
        self._runtime = runtime
        self._cache: dict[str, CachedResponse] = {}
        self._last_request_started: float | None = None

    def search_release_groups(self, title: str, artist: str) -> tuple[Candidate, ...]:
        if self._config.fixture_mode:
            return ()
        candidate_limit = min(max(self._config.candidate_limit, 1), 25)
        url = build_release_group_search_url(title, artist, candidate_limit)
        response, retrieved_at = self._get(url)
        payload = self._mapping(response.body, url)
        groups = payload.get("release-groups")
        if not isinstance(groups, list):
            raise MalformedResponseError(url=url)
        candidates: list[Candidate] = []
        try:
            for group in groups[:candidate_limit]:
                search_result = self._mapping(group)
                group_id = required_identifier(search_result.get("id"))
                lookup_url = build_release_group_lookup_url(group_id)
                lookup_response, retrieved_at = self._get(lookup_url)
                group_details = dict(self._mapping(lookup_response.body, lookup_url))
                group_details["score"] = search_result.get("score")
                artist_credits = group_details.get("artist-credit") or search_result.get(
                    "artist-credit",
                )
                aliases_by_artist: dict[str, JsonValue] = {}
                for artist_id in artist_ids(artist_credits):
                    artist_url = build_artist_lookup_url(artist_id)
                    artist_response, _ = self._get(artist_url)
                    artist_details = self._mapping(artist_response.body, artist_url)
                    aliases_by_artist[artist_id] = artist_details.get("aliases", [])
                group_details["artist-credit"] = enrich_artist_aliases(
                    artist_credits,
                    aliases_by_artist,
                )
                candidates.append(normalize_release_group(group_details, retrieved_at, {}))
        except NormalizationError as error:
            raise MalformedResponseError(url=url) from error
        identity_counts = Counter(
            (
                candidate.title.casefold(),
                tuple(credit.name.casefold() for credit in candidate.artist_credit),
            )
            for candidate in candidates
        )
        return tuple(
            replace(
                candidate,
                review_required=True,
                review_reasons=("AMBIGUOUS_TITLE_ARTIST",),
            )
            if identity_counts[
                (
                    candidate.title.casefold(),
                    tuple(credit.name.casefold() for credit in candidate.artist_credit),
                )
            ]
            > 1
            else candidate
            for candidate in candidates
        )

    def lookup_release(self, release_id: str) -> Candidate:
        if self._config.fixture_mode:
            raise ProviderResponseError(url="fixture-mode", status_code=0)
        url = build_release_lookup_url(release_id)
        response, retrieved_at = self._get(url)
        raw = self._mapping(response.body, url)
        try:
            return normalize_release(raw, retrieved_at, None)
        except NormalizationError as error:
            raise MalformedResponseError(url=url) from error

    def lookup_cover_art(self, release_id: str) -> str | None:
        if self._config.fixture_mode:
            return None
        url = build_cover_art_lookup_url(release_id)
        response, _ = self._get(url, accepted_status=COVER_STATUS)
        if response.status_code == NOT_FOUND_STATUS:
            return None
        payload = self._mapping(response.body, url)
        images = payload.get("images")
        if not isinstance(images, list):
            raise MalformedResponseError(url=url)
        for image in images:
            raw = self._mapping(image)
            image_url = raw.get("image")
            if (
                raw.get("front") is True
                and isinstance(image_url, str)
                and is_allowed_cover_image_url(image_url, release_id)
            ):
                return image_url
        return None

    def _get(
        self,
        url: str,
        accepted_status: frozenset[int] = OK_STATUS,
    ) -> tuple[TransportResponse, str]:
        now = self._runtime.clock.monotonic()
        cached = self._cache.get(url)
        if cached is not None and now - cached.stored_at <= self._config.cache_ttl_seconds:
            return cached.response, cached.retrieved_at
        retry_delay = 0.0
        for attempt in range(1, self._config.max_attempts + 1):
            self._wait_for_request_slot(retry_delay)
            self._last_request_started = self._runtime.clock.monotonic()
            try:
                response = self._runtime.transport.get(
                    url,
                    {"Accept": "application/json", "User-Agent": self._config.user_agent or ""},
                )
            except TransportUnavailableError:
                response = None
            if response is not None and response.status_code in accepted_status:
                retrieved_at = self._runtime.clock.now().isoformat()
                self._cache[url] = CachedResponse(
                    response=response,
                    stored_at=self._runtime.clock.monotonic(),
                    retrieved_at=retrieved_at,
                )
                return response, retrieved_at
            if response is not None and response.status_code not in RETRYABLE_STATUS:
                raise ProviderResponseError(url=url, status_code=response.status_code)
            retry_delay = min(float(1 << (attempt - 1)), self._config.max_backoff_seconds)
        raise ProviderUnavailableError(url=url, attempts=self._config.max_attempts)

    def _wait_for_request_slot(self, retry_delay: float) -> None:
        elapsed = (
            float("inf")
            if self._last_request_started is None
            else self._runtime.clock.monotonic() - self._last_request_started
        )
        delay = max(retry_delay, 1.0 - elapsed)
        if delay > 0:
            self._runtime.sleeper.sleep(delay)

    @staticmethod
    def _mapping(value: JsonValue, url: str = "provider response") -> Mapping[str, JsonValue]:
        if not isinstance(value, dict):
            raise MalformedResponseError(url=url)
        return value
