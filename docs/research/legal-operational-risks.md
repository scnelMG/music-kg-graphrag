# Legal And Operational Risks

Access date for all sources: 2026-07-01.

## Risk Register

| Risk | Evidence | Mitigation |
| --- | --- | --- |
| MusicBrainz overuse | MusicBrainz requires a meaningful User-Agent and no more than one call per second per client. Sources: https://musicbrainz.org/doc/MusicBrainz_API and https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting | Central rate limiter, backoff, contactable User-Agent in env/config, fixture tests that avoid live API calls. |
| Cover art licensing/provenance | Cover Art Archive is tied to MusicBrainz releases and hosted by Internet Archive. Source: https://coverartarchive.org/ | Store URL/provenance; do not rehost covers in repo; cache only if terms allow and attribution is retained. |
| Wikidata query load | Wikidata asks clients to use User-Agent etiquette, compressed responses, 429 Retry-After handling, and scoped WDQS queries. Source: https://www.wikidata.org/wiki/Wikidata:Data_access | Use scoped entity lookups, cache QID enrichment, avoid broad WDQS scans. |
| Last.fm terms and API key | Last.fm API requires a key and has API terms. Sources: https://www.last.fm/api/intro and https://www.last.fm/api/tos | Optional enrichment only; fail gracefully when no key is configured. |
| Spotify policy constraints | Spotify API access requires developer setup and policy compliance. Sources: https://developer.spotify.com/documentation/web-api and https://developer.spotify.com/policy | Do not require Spotify for MVP; document as future optional source. |
| Discogs terms/rate limits | Discogs API has developer docs and API terms. Sources: https://www.discogs.com/developers and https://support.discogs.com/hc/en-us/articles/360009334333-API-Terms-of-Use | Defer canonical use; treat as optional enrichment with explicit attribution/rate limiting. |
| Notion overwrite risk | Notion updates mutate page properties; rate limits average 3 requests/second and require Retry-After handling. Sources: https://developers.notion.com/reference/request-limits and https://developers.notion.com/reference/patch-page | Dry-run by default, field-level diff, conflict state, no schema mutations, no trashing unless explicit. |
| Privacy of personal reviews | User review text can reveal private preferences or notes. | Keep fixture demo private-data-free; redact logs; do not send private reviews to third-party enrichment APIs except the configured LLM path with explicit opt-in. |
| LLM hallucination | RAG research conditions generation on retrieval, but generation can still produce unsupported text. Source: https://arxiv.org/abs/2005.11401 | Require cited evidence paths and insufficient-evidence fallback. |

## Operational Requirements

- No secrets in repository.
- `.env.example` later must include User-Agent/contact, API keys, Notion token/database ID, GraphDB, PostgreSQL, and LLM settings without values.
- Tests must use fixtures/mocks for external APIs by default.
- Evidence files must not include raw tokens, Notion page private contents, cookies, or full env dumps.
- Sync jobs must be resumable and idempotent because external APIs can rate-limit mid-run.
