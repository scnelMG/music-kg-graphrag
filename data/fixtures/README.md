# Fixture Corpus

`manifest.json` freezes the offline fixture contract. It references checksummed anonymised albums and reviews, disables provider and LLM egress, and embeds an `UNCONFIGURED` Notion mapping. `notion-mapping-template.json` is explicitly non-live and contains no credential or real workspace identifier.

The corpus contains Korean and English records, duplicate titles and release variants, one missing-cover record, conflicting review context, and poison text marked `UNTRUSTED_TEXT`. Fixtures never contain personal data, private Notion pages, cookies, or environment dumps.
