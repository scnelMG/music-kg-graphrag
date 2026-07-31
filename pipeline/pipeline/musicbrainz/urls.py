from __future__ import annotations

from typing import Final
from urllib.parse import quote, unquote, urlencode, urlsplit

MUSICBRAINZ_API: Final = "https://musicbrainz.org/ws/2"
COVER_ART_API: Final = "https://coverartarchive.org/release"
LUCENE_SPECIAL_CHARACTERS: Final = frozenset('+-&|!(){}[]^"~*?:\\/')


def _escape_lucene_phrase(value: str) -> str:
    return "".join(
        f"\\{character}" if character in LUCENE_SPECIAL_CHARACTERS else character
        for character in value
    )


def build_release_group_search_url(title: str, artist: str, limit: int) -> str:
    escaped_title = _escape_lucene_phrase(title)
    escaped_artist = _escape_lucene_phrase(artist)
    query = f'releasegroup:"{escaped_title}" AND artist:"{escaped_artist}"'
    parameters = urlencode({"query": query, "fmt": "json", "limit": limit})
    return f"{MUSICBRAINZ_API}/release-group/?{parameters}"


def build_release_group_lookup_url(release_group_id: str) -> str:
    identifier = quote(release_group_id, safe="")
    parameters = urlencode({"inc": "releases+aliases", "fmt": "json"})
    return f"{MUSICBRAINZ_API}/release-group/{identifier}?{parameters}"


def build_artist_lookup_url(artist_id: str) -> str:
    identifier = quote(artist_id, safe="")
    return f"{MUSICBRAINZ_API}/artist/{identifier}?{urlencode({'inc': 'aliases', 'fmt': 'json'})}"


def build_release_lookup_url(release_id: str) -> str:
    identifier = quote(release_id, safe="")
    includes = "artist-credits+recordings+release-groups"
    return f"{MUSICBRAINZ_API}/release/{identifier}?{urlencode({'inc': includes, 'fmt': 'json'})}"


def build_cover_art_lookup_url(release_id: str) -> str:
    return f"{COVER_ART_API}/{quote(release_id, safe='')}"


def is_allowed_cover_image_url(image_url: str, release_id: str) -> bool:
    parsed = urlsplit(image_url)
    decoded_path = unquote(parsed.path)
    expected_prefix = f"/release/{release_id}/"
    remainder = decoded_path.removeprefix(expected_prefix)
    return (
        parsed.scheme == "https"
        and parsed.netloc.lower() == "coverartarchive.org"
        and decoded_path.startswith(expected_prefix)
        and bool(remainder)
        and all(segment not in {"", ".", ".."} for segment in remainder.split("/"))
        and not parsed.query
        and not parsed.fragment
    )
