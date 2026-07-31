# ruff: noqa: PLR2004, S101
from __future__ import annotations

import hashlib
import json
from urllib.parse import parse_qs, urlsplit

import pytest

from pipeline.musicbrainz.adapter import (
    AdapterConfig,
    MalformedResponseError,
    MusicBrainzAdapter,
    Runtime,
    TransportResponse,
    TransportUnavailableError,
    UserAgentPolicyError,
)
from pipeline.musicbrainz.urls import (
    build_artist_lookup_url,
    build_release_group_lookup_url,
    build_release_group_search_url,
    build_release_lookup_url,
)

from .musicbrainz_test_support import (
    CONTACTABLE_USER_AGENT,
    FakeClock,
    FakeSleeper,
    FakeTransport,
    artist_lookup,
    candidate_outcomes,
    enriched_release_group,
    live_adapter,
    release_group_lookup,
    release_lookup,
    response,
    search_hit,
)

SEARCH_URL = (
    "https://musicbrainz.org/ws/2/release-group/"
    "?query=releasegroup%3A%22Crumbling%22+AND+artist%3A%22Mid%5C-Air+Thief%22"
    "&fmt=json&limit=5"
)
GROUP_URL = "https://musicbrainz.org/ws/2/release-group/rg-1?inc=releases%2Baliases&fmt=json"
ARTIST_URL = "https://musicbrainz.org/ws/2/artist/artist-1?inc=aliases&fmt=json"
RELEASE_URL = (
    "https://musicbrainz.org/ws/2/release/release-kr"
    "?inc=artist-credits%2Brecordings%2Brelease-groups&fmt=json"
)
COVER_URL = "https://coverartarchive.org/release/release-kr"


def test_url_builders_use_provider_compatible_resources_and_includes() -> None:
    # Given / When / Then
    assert build_release_group_search_url("Crumbling", "Mid-Air Thief", 5) == SEARCH_URL
    assert build_release_group_lookup_url("rg/1") == (
        "https://musicbrainz.org/ws/2/release-group/rg%2F1?inc=releases%2Baliases&fmt=json"
    )
    assert build_artist_lookup_url("artist/1") == (
        "https://musicbrainz.org/ws/2/artist/artist%2F1?inc=aliases&fmt=json"
    )
    assert build_release_lookup_url("release/1") == (
        "https://musicbrainz.org/ws/2/release/release%2F1"
        "?inc=artist-credits%2Brecordings%2Brelease-groups&fmt=json"
    )


def test_search_url_escapes_lucene_syntax_as_literal_input() -> None:
    # Given
    title = 'A "quote" \\ + - && || ! (x) {y} [z] ^ ~ * ? : /'
    artist = 'Artist "name" \\ +tag'
    expected_query = 'releasegroup:"A \\"quote\\" \\\\ \\+ \\- \\&\\& \\|\\| \\! \\(x\\) \\{y\\} \\[z\\] \\^ \\~ \\* \\? \\: \\/" AND artist:"Artist \\"name\\" \\\\ \\+tag"'  # noqa: E501

    # When
    url = build_release_group_search_url(title, artist, 5)

    # Then
    assert parse_qs(urlsplit(url).query) == {
        "query": [expected_query],
        "fmt": ["json"],
        "limit": ["5"],
    }


def test_search_uses_bounded_lookups_for_aliases_and_release_variants() -> None:
    # Given
    adapter, transport, _ = live_adapter(candidate_outcomes())

    # When
    candidate = adapter.search_release_groups("Crumbling", "Mid-Air Thief")[0]

    # Then
    assert [call[0] for call in transport.calls] == [SEARCH_URL, GROUP_URL, ARTIST_URL]
    assert [alias.name for alias in candidate.artist_credit[0].aliases] == [
        "Mid-Air Thief",
        "공중도둑",
    ]
    assert [release.release_id for release in candidate.releases] == [
        "release-kr",
        "release-kr-digital",
    ]
    assert all(release.tracks == () for release in candidate.releases)
    assert all(release.cover_art_url is None for release in candidate.releases)


def test_release_group_lookup_preserves_korean_and_english_title_aliases() -> None:
    # Given
    adapter, transport, _ = live_adapter(candidate_outcomes())

    # When
    candidate = adapter.search_release_groups("Crumbling", "Mid-Air Thief")[0]

    # Then
    assert [call[0] for call in transport.calls] == [SEARCH_URL, GROUP_URL, ARTIST_URL]
    assert [(alias.name, alias.locale) for alias in candidate.aliases] == [
        ("무너지기", "ko"),
        ("Crumbling", "en"),
    ]


def test_release_lookup_uses_valid_includes_and_normalizes_tracks() -> None:
    # Given
    adapter, transport, _ = live_adapter([response(release_lookup())])

    # When
    candidate = adapter.lookup_release("release-kr")

    # Then
    assert [call[0] for call in transport.calls] == [RELEASE_URL]
    assert candidate.releases[0].tracks[0].recording_id == "recording-1"
    assert candidate.releases[0].tracks[0].length_ms == 243000


def test_cover_lookup_is_explicit_and_missing_cover_returns_none() -> None:
    # Given
    adapter, transport, _ = live_adapter([response({}, status_code=404)])

    # When
    cover = adapter.lookup_cover_art("release-kr")

    # Then
    assert cover is None
    assert [call[0] for call in transport.calls] == [COVER_URL]


@pytest.mark.parametrize(
    "image_url",
    [
        "https://archive.org/download/release-kr/front.jpg",
        "https://coverartarchive.org.evil.invalid/release/release-kr/front.jpg",
        "http://coverartarchive.org/release/release-kr/front.jpg",
        "https://coverartarchive.org/release/other-release/front.jpg",
        "https://coverartarchive.org/release/release-kr/../other/front.jpg",
    ],
)
def test_cover_lookup_rejects_urls_outside_allowed_https_release_path(image_url: str) -> None:
    # Given
    adapter, _, _ = live_adapter([response({"images": [{"front": True, "image": image_url}]})])

    # When
    cover = adapter.lookup_cover_art("release-kr")

    # Then
    assert cover is None


def test_cover_lookup_accepts_exact_allowed_https_release_path() -> None:
    # Given
    expected = "https://coverartarchive.org/release/release-kr/front-1200.jpg"
    adapter, _, _ = live_adapter([response({"images": [{"front": True, "image": expected}]})])

    # When
    cover = adapter.lookup_cover_art("release-kr")

    # Then
    assert cover == expected


@pytest.mark.parametrize(
    "user_agent",
    [
        "placeholder",
        "example-user-agent/0.1",
        "music-kg/0.1",
        "music-kg/0.1 (fixture-contact@example.invalid)",
    ],
)
def test_placeholder_user_agent_refusal(user_agent: str) -> None:
    # Given
    transport = FakeTransport([])
    clock = FakeClock()

    # When / Then
    with pytest.raises(UserAgentPolicyError):
        _ = MusicBrainzAdapter(
            AdapterConfig(user_agent=user_agent, fixture_mode=False),
            Runtime(transport=transport, clock=clock, sleeper=FakeSleeper(clock)),
        )
    assert transport.calls == []


def test_fixture_mode_makes_zero_calls_by_default() -> None:
    # Given
    transport = FakeTransport([])
    clock = FakeClock()
    adapter = MusicBrainzAdapter(
        AdapterConfig(),
        Runtime(transport=transport, clock=clock, sleeper=FakeSleeper(clock)),
    )

    # When
    candidates = adapter.search_release_groups("anything", "anyone")

    # Then
    assert candidates == ()
    assert transport.calls == []


def test_rate_limit_enforces_one_request_per_second() -> None:
    # Given
    adapter, transport, sleeper = live_adapter(
        [response({"release-groups": []}), response({"release-groups": []})],
    )

    # When
    _ = adapter.search_release_groups("Crumbling", "Mid-Air Thief")
    _ = adapter.search_release_groups("Second", "Artist")

    # Then
    assert len(transport.calls) == 2
    assert sleeper.calls == [1.0]


def test_unavailable_retries_same_url_with_bounded_backoff() -> None:
    # Given
    adapter, transport, sleeper = live_adapter(
        [
            response({}, status_code=503),
            TransportUnavailableError(url=SEARCH_URL),
            response({"release-groups": []}),
        ],
    )

    # When
    candidates = adapter.search_release_groups("Crumbling", "Mid-Air Thief")

    # Then
    assert candidates == ()
    assert [call[0] for call in transport.calls] == [SEARCH_URL] * 3
    assert sleeper.calls == [1.0, 2.0]


def test_malformed_response_reports_exact_request_url() -> None:
    # Given
    adapter, transport, _ = live_adapter([TransportResponse(status_code=200, body="not-an-object")])

    # When / Then
    with pytest.raises(MalformedResponseError) as caught:
        _ = adapter.search_release_groups("Crumbling", "Mid-Air Thief")
    assert caught.value.url == SEARCH_URL
    assert [call[0] for call in transport.calls] == [SEARCH_URL]


def test_ambiguous_title_artist_results_remain_separate_and_review_required() -> None:
    # Given
    duplicate = search_hit(group_id="rg-duplicate", score=93)
    adapter, transport, _ = live_adapter(
        [
            response({"release-groups": [search_hit(), duplicate]}),
            response(release_group_lookup()),
            response(artist_lookup()),
            response(release_group_lookup(group_id="rg-duplicate", release_id="other")),
        ],
    )

    # When
    candidates = adapter.search_release_groups("Crumbling", "Mid-Air Thief")

    # Then
    assert [candidate.candidate_id for candidate in candidates] == [
        "musicbrainz:release-group:rg-1",
        "musicbrainz:release-group:rg-duplicate",
    ]
    assert all(candidate.review_required for candidate in candidates)
    assert all(candidate.review_reasons == ("AMBIGUOUS_TITLE_ARTIST",) for candidate in candidates)
    assert [call[0] for call in transport.calls] == [
        SEARCH_URL,
        GROUP_URL,
        ARTIST_URL,
        "https://musicbrainz.org/ws/2/release-group/rg-duplicate?inc=releases%2Baliases&fmt=json",
    ]


def test_content_hash_uses_enriched_provider_payload_and_changes_with_payload() -> None:
    # Given
    expected_payload = enriched_release_group()
    expected_hash = hashlib.sha256(
        json.dumps(
            expected_payload,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode(),
    ).hexdigest()
    first_adapter, _, _ = live_adapter(candidate_outcomes())
    changed_adapter, _, _ = live_adapter(candidate_outcomes(title="무너지기 (Remaster)"))

    # When
    first = first_adapter.search_release_groups("Crumbling", "Mid-Air Thief")[0]
    changed = changed_adapter.search_release_groups("Crumbling", "Mid-Air Thief")[0]

    # Then
    assert first.content_hash == expected_hash
    assert changed.content_hash != first.content_hash


def test_response_cache_expires_after_ttl_with_injected_clock() -> None:
    # Given
    config = AdapterConfig(
        user_agent=CONTACTABLE_USER_AGENT,
        fixture_mode=False,
        cache_ttl_seconds=10.0,
    )
    adapter, transport, sleeper = live_adapter(
        [*candidate_outcomes(), *candidate_outcomes()],
        config,
    )

    # When
    first = adapter.search_release_groups("Crumbling", "Mid-Air Thief")
    cached = adapter.search_release_groups("Crumbling", "Mid-Air Thief")
    sleeper.clock.advance(11.0)
    refreshed = adapter.search_release_groups("Crumbling", "Mid-Air Thief")

    # Then
    assert cached == first
    assert refreshed[0].retrieved_at != first[0].retrieved_at
    assert [call[0] for call in transport.calls] == [
        SEARCH_URL,
        GROUP_URL,
        ARTIST_URL,
        SEARCH_URL,
        GROUP_URL,
        ARTIST_URL,
    ]
