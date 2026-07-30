# ULW Research Synthesis: Todo 0 Research Grounding

Workers: 13 attempted, 1 completed with usable Notion API evidence, 9 initial lanes lost by harness `not_found`, 3 recovery lanes launched. Parent filled missing axes from official docs and papers. Waves: 1 saturation + parent verification pass. Sources: 25+. Verifications: document/evidence checks.

## Executive Summary

Todo 0 is best handled with `ulw-research` because the deliverable is not implementation; it is a research-grounded design package. The selected architecture remains justified: MusicBrainz for canonical identity, Cover Art Archive for covers, optional Last.fm/Wikidata enrichment, PostgreSQL/pgvector as canonical app store and vector MVP, GraphDB as RDF/SPARQL/SHACL graph store, and GraphRAG as evidence-constrained answer generation.

The main risks are not algorithmic sophistication; they are source terms/rate limits, metadata gaps, Notion overwrite safety, weak music-domain modeling, and unsupported LLM/recommender claims. The created `docs/research/*.md` files convert those risks into concrete implementation requirements for later todos.

## Source Themes

- Music metadata: MusicBrainz is the canonical backbone because it has stable MBIDs and official API semantics; Cover Art Archive follows MusicBrainz identity; Last.fm and Wikidata are optional enrichment sources.
- Music KG literature: Polifonia, Music Meta, DOREMUS, MusicXML KG construction, and MusicBrainz-to-RDF/LinkedBrainz patterns justify RDF/SPARQL/provenance-first modeling over a generic recommender graph.
- Graph store: GraphDB best matches RDF/OWL/SPARQL/SHACL portfolio goals; Neo4j remains valuable as comparison and extension; Fuseki is a standards-friendly fallback; Neptune is deferred cloud infrastructure.
- Recommendation: use graph paths and vector retrieval first; defer trained KG recommenders until there is enough interaction data.
- GraphRAG: generate only from retrieved evidence and return insufficient-evidence responses when retrieval fails.
- Notion: dry-run and field-level conflict handling are mandatory; the API is mutable and rate-limited.

## Expansion Trace

- Initial saturation wave launched across local context, music APIs, optional sources, graph DBs, standards, KG recommendation papers, explainable/evaluation, GraphRAG/KGQA, vector retrieval, legal/ops.
- Harness returned `not_found` for initial lane IDs, so parent completed direct source verification.
- Recovery Notion lane completed and is incorporated into `legal-operational-risks.md` and `decision-log.md`.
- User requested a stronger music-domain literature axis; parent searched and incorporated Polifonia, Music Meta, DOREMUS, MusicXML KGC, and LinkedBrainz/MusicBrainz-to-RDF evidence.
- Open leads intentionally deferred to later todos: exact live Notion database schema fetch, fixture corpus construction, and implementation-specific API test design.

## Gaps

- Korean/indie coverage risk is documented as a design risk, but no quantitative coverage audit was run because Todo 0 prohibits implementation/scripting beyond document checks.
- Spotify and Discogs are compared from public docs/terms only; no credentialed API calls were made.
- Exact Ontotext GraphDB music-domain production case studies were scarce; the docs distinguish "GraphDB as RDF/SPARQL/SHACL store" from "music KG literature that validates RDF/SPARQL music modeling."
