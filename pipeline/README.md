# Pipeline Foundation

Future Python worker/CLI boundary for:

- MusicBrainz and Cover Art Archive metadata retrieval,
- optional Last.fm and Wikidata enrichment,
- entity normalization,
- RDF generation,
- SHACL validation,
- GraphDB loading,
- embedding generation,
- GraphRAG retrieval composition.

Todo 1 adds a pinned Python package and a fixture-only CLI boundary, not metadata/RDF/GraphRAG logic. Later code must use fixtures by default, avoid live API calls in ordinary tests, and enforce MusicBrainz User-Agent plus rate-limit requirements.

```bash
uv run --directory pipeline --group dev pytest tests
uv run --directory pipeline --group dev python -m pipeline --help
```
