# Music Data Source Comparison

Access date for all sources: 2026-07-01.

## Decision

Use MusicBrainz as the canonical identity backbone, Cover Art Archive as the mandatory cover-art companion, Last.fm as optional tag/similarity enrichment, Wikidata as optional public-knowledge enrichment, and Spotify/Discogs as documented comparison sources rather than MVP dependencies.

## Source Notes

- MusicBrainz API: REST API for music metadata, free for non-commercial use, no API key for reads, meaningful User-Agent required, and client applications must stay at or below one call per second. Source: https://musicbrainz.org/doc/MusicBrainz_API and https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting
- Cover Art Archive: cover art endpoint keyed by MusicBrainz release/release-group identifiers. Source: https://coverartarchive.org/
- Wikidata: CC0 data, linked-data access, WDQS SPARQL endpoint, User-Agent etiquette, 429 handling, and advice to use WDQS for scoped queries rather than fuzzy search. Source: https://www.wikidata.org/wiki/Wikidata:Data_access and https://www.mediawiki.org/wiki/Wikidata_Query_Service/User_Manual
- Last.fm API: API-key based artist/album/tag data and scrobble/community-derived similarity signals. Source: https://www.last.fm/api/intro and https://www.last.fm/api/tos
- Spotify Web API: useful commercial catalog metadata but requires app registration and has platform policy constraints; do not make it required for a portfolio fixture demo. Source: https://developer.spotify.com/documentation/web-api and https://developer.spotify.com/policy
- Discogs API: strong release/marketplace/community metadata but API use is rate-limited and licensing/terms require care. Source: https://www.discogs.com/developers and https://support.discogs.com/hc/en-us/articles/360009334333-API-Terms-of-Use

## Comparison Matrix

Scores: 5 strong, 3 usable with caveats, 1 weak or unsuitable for MVP.

| Criterion | MusicBrainz | Cover Art Archive | Wikidata | Last.fm | Spotify | Discogs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Coverage | 4 | 3 | 3 | 4 | 5 | 4 |
| Stable identifiers | 5 | 5 | 5 | 2 | 4 | 4 |
| Track data | 5 | 1 | 2 | 2 | 5 | 4 |
| Genre/tag quality | 3 | 1 | 2 | 4 | 3 | 4 |
| Cover art | 2 | 5 | 2 | 2 | 5 | 4 |
| Korean/indie risk | 3 | 3 | 2 | 3 | 4 | 3 |
| API limits | 3 | 3 | 3 | 3 | 3 | 3 |
| Auth/cost | 5 | 5 | 5 | 4 | 3 | 4 |
| Licensing/terms | 4 | 3 | 5 | 3 | 2 | 3 |
| Implementation complexity | 4 | 5 | 3 | 4 | 3 | 3 |

## Implementation Requirements

- Store every external ID in a source-qualified table: `musicbrainz_release_id`, `musicbrainz_release_group_id`, `wikidata_qid`, `lastfm_url`, `spotify_id`, `discogs_id`.
- Treat MBID as canonical when available; never merge by title and artist alone without a confidence flag.
- Rate-limit MusicBrainz to one request/second and send a contactable User-Agent.
- Query Cover Art Archive by MBID after candidate selection or in a throttled enrichment step.
- Use Last.fm tags as soft labels; never treat crowd tags as canonical genre truth.
- Use Wikidata only for public facts and entity enrichment. Do not send private review text to Wikidata.
- Add manual correction/unknown states for Korean indie albums missing from global sources.
- For Korean/indie/non-mainstream records, use this source priority: MusicBrainz for canonical release/release-group identity, Discogs for physical edition fidelity, Wikidata for cross-system linking, Last.fm for tags/presence corroboration, and Spotify only for streaming availability.
- Absence in Spotify, Wikidata, or Last.fm must not be interpreted as album nonexistence.
- Store aliases/transliterations because Korean artist/title romanization can differ across sources.

## Korean/Indie Coverage Risk Notes

The localized coverage pass found concrete examples of Korean indie/non-mainstream presence in MusicBrainz, Last.fm, Spotify, and Discogs, but also showed why absence is source-specific. MusicBrainz and Discogs are the best pair for canonical and edition-sensitive identity; Spotify is an availability source, not a catalog truth source. Later metadata normalization must preserve source provenance and support manual review when sources disagree on title, year, edition, or romanization.

## Rejected Or Deferred Options

- Spotify as mandatory: rejected for MVP because the fixture demo must run without private commercial API credentials.
- Discogs as canonical: deferred because release variants are rich but can complicate album identity resolution before the core KG exists.
- LLM metadata invention: rejected. Missing source data must become `unknown` or `manual_override`.
