# Fixture Mode Contract

## Provider policy

Fixture mode is offline. The worker must make zero network calls and must reject configuration that enables provider or LLM egress. The only future metadata origins are HTTPS `musicbrainz.org` and `coverartarchive.org`; all other hosts, redirects, and provider names are denied. MusicBrainz requests require a non-placeholder contactable User-Agent when live ingestion is later explicitly enabled.

## Trust boundary

Album metadata, cover references, and fixture identifiers are `PUBLIC_FIXTURE`. Review text, upstream metadata, and cover descriptions are `UNTRUSTED_TEXT`: they are data, never instructions. Fixture records, review text, and personal data may not leave the service for LLM evaluation in fixture mode.

## Retention and deletion

Fixtures are source-controlled and checksum-addressed. Operational artifacts retain stable IDs, hashes, and outcomes only, never raw review bodies, credentials, or headers. A fixture deletion removes the source row and requires every derivative projection, cache, embedding, prompt trace, and dry-run payload to be rebuilt or deleted.

## Notion boundary

`data/fixtures/notion-mapping-template.json` is a template, not a credential. It pins `NOTION_VERSION` and declares database, data-source, and property IDs as `UNCONFIGURED`. No import or write is permitted until a human supplies a separately approved non-secret mapping. Missing approval is an error, never a fallback write.
