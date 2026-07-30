# Pipeline Scaffold

Future Python worker/CLI boundary for:

- MusicBrainz and Cover Art Archive metadata retrieval,
- optional Last.fm and Wikidata enrichment,
- entity normalization,
- RDF generation,
- SHACL validation,
- GraphDB loading,
- embedding generation,
- GraphRAG retrieval composition.

Todo 1 intentionally does not add pipeline logic. Later code should use fixtures by default, avoid live API calls in ordinary tests, and enforce MusicBrainz User-Agent plus rate-limit requirements.
