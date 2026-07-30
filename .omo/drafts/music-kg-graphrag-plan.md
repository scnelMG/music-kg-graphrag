---
slug: music-kg-graphrag-plan
status: drafting
intent: clear
pending-action: write .omo/plans/music-kg-graphrag-plan.md
approach: Spring Boot service backend + Python data/AI pipeline + PostgreSQL/pgvector + Ontotext GraphDB + Notion sync + GraphRAG demo
---

# Draft: music-kg-graphrag-plan

## Components (topology ledger)
- C0 | Research grounding and evidence-backed design decisions | active | user's request for 현업-style research
- C1 | Search-based album logging MVP | active | pasted-text.txt, Notion DB fetch, outputs/tech-stack-rationale.md
- C2 | PostgreSQL app data model and sync state | active | outputs/tech-stack-rationale.md
- C3 | Notion import/export compatibility without breaking existing database | active | Notion DB fetch result from album list
- C4 | Python metadata, RDF, SHACL, GraphDB pipeline | active | pasted-text.txt, outputs/tech-stack-rationale.md
- C5 | SPARQL, vector search, and GraphRAG query flow | active | pasted-text.txt
- C6 | Portfolio documentation and interview narrative | active | Notion project page, outputs/tech-stack-rationale.md

## Open assumptions (announced defaults)
- Research is execution-blocking for data source, graph store, recommendation, and GraphRAG design | implementers must produce docs/research/ before core schema/ontology/API design | prevents building from vibes | reversible only by explicit user scope cut
- Frontend is kept minimal for MVP | Spring Boot API may expose simple pages or a lightweight web UI can be added later | target is data/AI backend portfolio, not UI polish | reversible
- Vector search starts with pgvector | fewer moving parts than a separate vector DB | reversible
- Ontotext GraphDB is primary graph store | better matches RDF/OWL/SPARQL/SHACL ontology goal than Neo4j-only | reversible, Neo4j comparison can be a later appendix
- Python starts as worker/CLI pipeline, not mandatory FastAPI service | lowers distributed-system overhead while keeping AI/data stack clear | reversible
- Notion existing properties remain canonical user-facing fields | user explicitly said the current Notion form must not be broken | not safely reversible without migration

## Findings (cited - path:lines)
- Current Notion album DB includes existing fields: 앨범명, 가수, 앨범커버, 개인 감상평, 개인 최애곡, 앨범 보유.
- Existing Notion views depend on current fields, including 미평가, 최애곡 추가 필요, 시간 정렬, 보유앨범.
- Existing local rationale document recommends Spring Boot + Python hybrid for 공기업 전산직, 은행 IT/디지털, 기업 AI/AX.
- Attached plan already contains ontology, SHACL, GraphDB, SPARQL, recommendation, and GraphRAG concepts; the improved plan should connect them to the real Notion logging workflow.

## Decisions (with rationale)
- Use Spring Boot for user-facing service API because it demonstrates enterprise/public-sector/financial backend skills and matches the user's prior server deployment experience.
- Use Python for metadata ETL, RDF/OWL mapping, SHACL validation, embeddings, and GraphRAG because those tasks fit the Python data/AI ecosystem.
- Use PostgreSQL as the system of record so Notion and GraphDB can be rebuilt or resynced without losing canonical app state.
- Use pgvector for MVP vector retrieval to avoid adding a separate vector DB before it is necessary.
- Use Ontotext GraphDB for the primary graph because the project explicitly aims to show ontology modeling, RDF, SPARQL, and SHACL.
- Keep Neo4j as a documented comparison/extension option because it is strong for GraphRAG examples and visualization, but do not make it the MVP graph store unless Todo 0 research overturns the ontology-first decision.
- Treat MusicBrainz as the canonical music identity backbone, not a complete recommendation dataset. Use Cover Art Archive for album covers, and evaluate Last.fm/Wikidata as enrichment layers for tags, similarity, and public knowledge.
- Keep Notion as the user's familiar music record interface and sync target; do not treat it as the only database.

## Scope IN
- Evidence-backed research package covering related work, data sources, graph DB choice, recommendation design, GraphRAG/KGQA, licensing/terms, and operational risks.
- Repository scaffold with Spring Boot backend, Python pipeline, docs, ontology, queries, and Docker Compose.
- Album search, album candidate selection, track-list favorite selection, rating labels, album ownership flag.
- PostgreSQL schema for artists, albums, tracks, user reviews, external IDs, metadata sources, Notion sync state, and embeddings.
- Notion import/export sync against the existing album database without destructive schema changes.
- MusicBrainz/Cover Art Archive first-pass metadata ingestion with API rate-limit protection.
- RDF/OWL ontology, SHACL shapes, RDF build script, GraphDB load script, SPARQL query set.
- Recommendation and GraphRAG MVP backed by graph paths and optional vector retrieval.
- Portfolio docs: architecture, ontology, pipeline, API, demo scenarios, interview script.

## Scope OUT (Must NOT have)
- Do not redesign or break the existing Notion album database/views.
- Do not require Spotify/Apple Music link paste for MVP.
- Do not build a large polished frontend before the backend/data flow works.
- Do not claim production-grade recommendation quality without evaluation data.
- Do not hardcode secrets, tokens, Notion IDs, or API keys.
- Do not add paid/external write actions beyond local development and user-authorized Notion sync.

## Open questions
- None blocking. The remaining choices are adopted defaults and can be revised later.

## Approval gate
status: approved
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->
