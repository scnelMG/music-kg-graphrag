# music-kg-graphrag-plan - Work Plan

## TL;DR (For humans)
**What you'll get:** A complete MVP plan for a data/AI backend portfolio project that starts with evidence-backed research, then turns your existing Notion music records into a searchable app database, syncs safely back to Notion, builds an ontology-driven GraphDB, and exposes grounded GraphRAG music-taste queries.

**Why this approach:** Spring Boot carries the enterprise/public-sector/financial backend story, while Python carries the ETL, RDF/SHACL, embedding, and GraphRAG work. PostgreSQL remains the system of record so Notion and GraphDB stay rebuildable instead of fragile.

**What it will NOT do:** It will not break the existing Notion album database, over-invest in frontend polish, or pretend the recommendation engine is production-grade before evidence exists.

**Effort:** Large
**Risk:** Medium - the project crosses several data boundaries, so research grounding, sync policy, identifier matching, and graph validation must be treated as first-class work.
**Decisions to sanity-check:** Ontotext GraphDB is the primary graph store, Neo4j remains a documented comparison option, MusicBrainz is the identity backbone but not the only music data source, pgvector starts as MVP vector search, and Python starts as worker/CLI first rather than a separate FastAPI service.

Your next move: start execution with LazyCodex using this plan, or ask for a high-accuracy review first. Full execution detail follows below.

---

> TL;DR (machine): Large/Medium plan to research, then build Spring Boot + Python + PostgreSQL/pgvector + Notion sync + Ontotext GraphDB + GraphRAG MVP with docs and verification.

## Scope
### Must have
- Evidence-backed research package before implementation: related work, music metadata source comparison, graph database comparison, recommendation/GraphRAG design, licensing/terms, and operational constraints.
- A repository structure that separates service backend, data/AI pipeline, ontology assets, SPARQL queries, documentation, and evidence artifacts.
- Spring Boot backend for album logging, search orchestration, review storage, sync status, recommendation results, and health endpoints.
- PostgreSQL as canonical app DB with normalized entities for artist, album, track, user review, external IDs, metadata source, Notion mapping, sync jobs, and optional embeddings.
- Python data pipeline for MusicBrainz/Cover Art Archive metadata retrieval, entity normalization, RDF generation, SHACL validation, GraphDB loading, embedding generation, and GraphRAG retrieval.
- Music metadata source strategy: MusicBrainz for canonical artist/album/track identifiers and release data, Cover Art Archive for cover art, Last.fm for tags/similarity/recommendation hints when API access is available, and Wikidata for public knowledge enrichment after research validation.
- Notion compatibility with the current "앨범 목록" database fields: 앨범명, 가수, 앨범커버, 개인 감상평, 개인 최애곡, 앨범 보유.
- Safe Notion sync policy: no destructive schema updates, no user-entered rating/favorite/ownership overwrite without explicit app-side intent.
- RDF/OWL ontology, SHACL shapes, sample RDF output, GraphDB load script, and at least 5 SPARQL queries.
- MVP GraphRAG flow that answers music-taste questions using graph evidence and returns citations/evidence paths.
- Portfolio documentation: README, architecture, data model, ontology design, sync policy, GraphRAG design, demo script, and interview talking points.
- Agent-executable verification for every implementation task.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Must not alter or delete existing Notion properties/views.
- Must not rely on manual album cover lookup as the primary workflow.
- Must not require Spotify/Apple Music links for MVP.
- Must not build a large visual frontend before the backend/data path is complete.
- Must not hardcode API tokens, Notion IDs, DB passwords, or LLM keys.
- Must not use real paid/external write operations except the user's authorized Notion workspace actions.
- Must not claim "AI recommendation accuracy" without a small documented evaluation.
- Must not use an LLM to invent metadata when external sources do not have it; mark unknowns explicitly.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: tests-after for scaffold/docs tasks, TDD for core mapping/sync/retrieval logic once module boundaries exist.
- Java verification: `./gradlew test`, `./gradlew bootRun` or profile-specific smoke run, Spring controller/service tests, repository tests with Testcontainers where feasible.
- Python verification: `pytest`, `ruff check`, RDF/SHACL validation command, sample pipeline dry run with fixture data.
- Data verification: SQL migration applies cleanly; sample import creates deterministic rows; Notion sync dry-run shows expected payload; GraphDB load can be replayed from generated TTL.
- Graph verification: SPARQL query snapshots saved under `.omo/evidence/`; GraphRAG responses include graph paths and do not answer from unsupported facts.
- Research verification: every design claim in `docs/research/` must cite a primary source, paper, official documentation, or clearly marked secondary source; each cited source must produce an actionable design implication.
- Evidence: `.omo/evidence/task-<N>-music-kg-graphrag-plan.<ext>` for each todo.

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.
- Wave 0: research grounding. Produce evidence-backed decisions before schema, ontology, data source, recommendation, and GraphRAG implementation.
- Wave 1: foundation and contracts. Create repo skeleton, local infra, data model, API contract, Notion sync contract, ontology contract, and documentation baseline.
- Wave 2: ingestion and storage. Implement album search, metadata normalization, persistence, Notion import/export dry-run, RDF/SHACL build, and GraphDB load.
- Wave 3: retrieval and service completion. Implement recommendation queries, vector retrieval, GraphRAG orchestration, API endpoints, and demo scenarios.
- Wave 4: portfolio hardening. Add docs, evaluation, observability, security/config review, and final QA artifacts.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 0 | none | 1,2,3,4,5,6,7,12,13 | none |
| 1 | 0 | 2,3,4,5,6 | none |
| 2 | 0,1 | 7,8,9,10 | 3,4,5,6 |
| 3 | 0,1 | 7,8,9,10 | 2,4,5,6 |
| 4 | 0,1 | 9,10,11 | 2,3,5,6 |
| 5 | 0,1 | 11,12,13 | 2,3,4,6 |
| 6 | 0,1 | 15,16 | 2,3,4,5 |
| 7 | 2,3 | 14,15 | 8,9,11 |
| 8 | 2,3 | 14,15 | 7,9,11 |
| 9 | 2,3,4 | 14,15 | 7,8,11 |
| 10 | 2,3,4 | 15 | 11,12 |
| 11 | 4,5 | 12,13,14 | 7,8,10 |
| 12 | 5,11 | 13,14 | 10 |
| 13 | 5,12 | 14,15 | none |
| 14 | 7,8,9,11,12,13 | 16,17 | 15 |
| 15 | 6,7,8,9,10,13 | 17 | 14 |
| 16 | 6,14 | 17 | 15 |
| 17 | 14,15,16 | final verification | none |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [x] 0. Research grounding and evidence-backed design package
  What to do / Must NOT do: Perform a 현업-style research pass before implementation. Produce `docs/research/related-work.md`, `docs/research/data-source-comparison.md`, `docs/research/graphdb-comparison.md`, `docs/research/recommendation-design.md`, `docs/research/graphrag-kgqa-design.md`, `docs/research/legal-operational-risks.md`, and `docs/research/decision-log.md`. Cover at least: Knowledge Graph recommender papers, explainable recommendation papers, GraphRAG/KGQA references, music metadata source quality, MusicBrainz/Wikidata/Last.fm/Cover Art Archive API constraints, Ontotext GraphDB vs Neo4j vs Apache Jena Fuseki vs cloud graph DBs, RDF/OWL/SPARQL/SHACL applicability, vector search choices, data licensing/terms, rate limits, privacy, and evaluation methods. Treat the current default as: Ontotext GraphDB for RDF/OWL/SPARQL/SHACL MVP, Neo4j as comparison/extension; MusicBrainz as canonical identity backbone, Cover Art Archive as mandatory cover-art companion, Last.fm as optional tags/similarity enrichment, Wikidata as optional knowledge enrichment. Do not summarize papers generically; every source must lead to a concrete decision, rejected option, risk, or implementation requirement.
  Parallelization: Wave 0 | Blocked by: none | Blocks: 1,2,3,4,5,6,7,12,13
  References (executor has NO interview context - be exhaustive): existing plan `.omo/plans/music-kg-graphrag-plan.md`; user target roles 공기업 전산직, 은행 IT/디지털, 기업 AI/AX; Notion project page `https://app.notion.com/p/3907f120758f819ebe90ebb0facb4b3d`; `outputs/tech-stack-rationale.md`; original pasted project plan.
  Acceptance criteria (agent-executable): research docs exist under `docs/research/`; `decision-log.md` contains a table with columns `Decision`, `Selected option`, `Alternatives`, `Evidence`, `Tradeoff`, `Impact on implementation`; at least 12 high-quality sources are cited, with at least 5 primary/official technical docs and at least 4 academic or research-style sources; data-source comparison scores MusicBrainz, Cover Art Archive, Wikidata, Last.fm, and optional Spotify/Discogs on coverage, identifiers, track data, genre/tag quality, cover art, Korean/indie coverage risk, API limits, auth/cost, licensing/terms, and implementation complexity; GraphDB comparison explains why the MVP chooses or rejects Ontotext GraphDB, Neo4j, Jena Fuseki, and a managed cloud graph DB; recommendation design defines offline evaluation examples and failure cases.
  QA scenarios (name the exact tool + invocation): happy: run a docs citation/link check and save output to `.omo/evidence/task-0-music-kg-graphrag-plan.txt`; failure: run a script/check that fails if a research source has no resulting design implication or if `decision-log.md` has empty evidence cells, and save the failure check output.
  Commit: Y | docs(research): ground graph music recommender design

- [x] 1. Scaffold repository, developer workflow, and local services
  What to do / Must NOT do: Create a coherent repo layout for `backend/`, `pipeline/`, `ontology/`, `queries/`, `docs/`, `data/fixtures/`, `scripts/`, and `.omo/evidence/`. Add Docker Compose for PostgreSQL with pgvector and GraphDB. Add `.env.example`, README quick start, and task runner commands. Do not put real tokens in files.
  Parallelization: Wave 1 | Blocked by: 0 | Blocks: 2,3,4,5,6
  References (executor has NO interview context - be exhaustive): Todo 0 research package; `outputs/tech-stack-rationale.md`; Notion project page "음악 Knowledge Graph & GraphRAG 추천 서비스 기획"; this plan's Scope and Commit strategy.
  Acceptance criteria (agent-executable): `docker compose config` exits 0; repo has all required top-level folders; `.env.example` lists Notion, MusicBrainz User-Agent, GraphDB, PostgreSQL, and LLM variables without secrets.
  QA scenarios (name the exact tool + invocation): happy: `docker compose config > .omo/evidence/task-1-music-kg-graphrag-plan.txt`; failure: run config with a deliberately missing required env from a copied test env and save the validation/error behavior to the same evidence file.
  Commit: Y | chore(scaffold): initialize music knowledge graph workspace

- [ ] 2. Define PostgreSQL relational schema and migrations
  What to do / Must NOT do: Model canonical tables for artists, albums, tracks, album_artists, user_reviews, favorite_tracks, album_ownership, external_ids, metadata_sources, notion_pages, sync_jobs, embeddings, and audit timestamps. Preserve Notion labels exactly: `애착 앨범`, `마음에 쏙`, `꽤 괜`, `쏘쏘..`, `내 취향 아님..`. Do not encode Notion as the only source of truth.
  Parallelization: Wave 1 | Blocked by: 0,1 | Blocks: 7,8,9,10
  References: Todo 0 `docs/research/data-source-comparison.md` and `decision-log.md`; `outputs/tech-stack-rationale.md` sections "PostgreSQL 역할", "Notion 역할"; observed Notion fields in prior fetch: 앨범명, 가수, 앨범커버, 개인 감상평, 개인 최애곡, 앨범 보유.
  Acceptance criteria: migrations apply to a clean DB; constraints prevent duplicate external IDs per source; enum/check constraints cover rating labels and sync states; rollback strategy is documented.
  QA scenarios: happy: run migration against local PostgreSQL and export `psql \\d` schema snapshot to `.omo/evidence/task-2-music-kg-graphrag-plan.txt`; failure: attempt invalid rating label and duplicate external ID, record constraint failures.
  Commit: Y | feat(db): add canonical music data schema

- [ ] 3. Specify backend API contracts and DTO validation
  What to do / Must NOT do: Define Spring Boot endpoints for album search, album detail candidate fetch, review save, Notion sync status, recommendation query, and GraphRAG question. Include request/response examples and validation rules. Do not expose internal GraphDB or Notion tokens through responses.
  Parallelization: Wave 1 | Blocked by: 0,1 | Blocks: 7,8,9,10
  References: Todo 0 `docs/research/legal-operational-risks.md` for API/rate-limit/privacy constraints; current product decisions in `.omo/drafts/music-kg-graphrag.md`; this plan's Scope; Notion project page service direction.
  Acceptance criteria: OpenAPI spec or generated API docs list all MVP endpoints; invalid inputs return deterministic validation errors; DTOs include album search query, selected candidate ID, rating label, favorite track ID/manual text, ownership flag.
  QA scenarios: happy: run API docs generation or controller slice tests and save output to `.omo/evidence/task-3-music-kg-graphrag-plan.txt`; failure: submit blank query, invalid rating label, and overlong manual favorite track.
  Commit: Y | feat(api): define album logging and recommendation contracts

- [ ] 4. Define Notion sync contract and non-destructive policy
  What to do / Must NOT do: Document exact mapping between app data and current Notion fields. Implement a dry-run payload builder before enabling writes. Existing Notion properties/views must not be renamed, removed, or required to change. User-entered Notion values must not be overwritten unless app state explicitly owns the update.
  Parallelization: Wave 1 | Blocked by: 0,1 | Blocks: 9,10,15
  References: Notion DB fetch evidence: "앨범 목록" database with fields 앨범명, 가수, 앨범커버, 개인 감상평, 개인 최애곡, 앨범 보유 and existing views; user instruction "지금의 노션 양식을 바꾸면 안돼".
  Acceptance criteria: `docs/notion-sync-policy.md` exists; dry-run sync outputs a JSON payload for create/update; destructive schema changes are absent; conflict rules are explicit.
  QA scenarios: happy: generate dry-run payload from fixture review and save to `.omo/evidence/task-4-music-kg-graphrag-plan.json`; failure: simulate a Notion page with a different user rating than app state and verify conflict is marked, not overwritten.
  Commit: Y | docs(sync): define safe Notion synchronization policy

- [ ] 5. Draft ontology, SHACL, and graph naming conventions
  What to do / Must NOT do: Create `ontology/music-ontology.ttl`, `ontology/prefixes.ttl`, and `shapes/music-shapes.ttl`. Include core classes User, Artist, Album, Track, Genre, Mood, ListeningContext, UserReview, Recommendation, Source. Include relationships createdBy, containsTrack, hasGenre, hasMood, wroteReview, targetAlbum, favoriteTrack, similarTo, hasReason. Do not over-model festival features in MVP beyond a deferred extension note.
  Parallelization: Wave 1 | Blocked by: 0,1 | Blocks: 11,12,13
  References: Todo 0 `docs/research/graphdb-comparison.md`, `related-work.md`, and `decision-log.md`; attached original plan sections 7 and 8; Notion project page "온톨로지 및 GraphDB 구축"; `outputs/tech-stack-rationale.md` GraphDB section.
  Acceptance criteria: ontology parses with `rdflib`; SHACL shapes include required title, artist, album-track, review-target, rating-label constraints; README explains URI strategy.
  QA scenarios: happy: parse ontology and shapes, save parser output to `.omo/evidence/task-5-music-kg-graphrag-plan.txt`; failure: validate intentionally incomplete sample RDF and record expected SHACL violation.
  Commit: Y | feat(ontology): add music ontology and SHACL shapes

- [ ] 6. Write portfolio documentation baseline
  What to do / Must NOT do: Create `docs/architecture.md`, `docs/tech-stack-rationale.md`, `docs/portfolio-story.md`, and `docs/demo-scenarios.md`. Pull in the existing rationale and Todo 0 research decisions without losing the public/financial/AI-AX positioning. Do not make the docs sound like a generic music recommender.
  Parallelization: Wave 1 | Blocked by: 0,1 | Blocks: 15,16
  References: `outputs/tech-stack-rationale.md`; Notion project page; user target roles: 공기업 전산직, 기업 AI/AX, 은행 IT/디지털.
  Acceptance criteria: docs explain problem, architecture, stack rationale, MVP flow, and interview pitch; README links to each doc.
  QA scenarios: happy: run Markdown lint or at least link/path check and save to `.omo/evidence/task-6-music-kg-graphrag-plan.txt`; failure: deliberately check for missing linked files and confirm the checker catches them.
  Commit: Y | docs(portfolio): add architecture and interview narrative

- [ ] 7. Implement metadata search and normalization pipeline
  What to do / Must NOT do: In Python, implement MusicBrainz album search with a proper User-Agent and <= 1 request/second behavior, Cover Art Archive lookup, and normalized candidate output. Design the source adapter so Last.fm tags/similar artists and Wikidata enrichment can be added without changing the canonical album model. Include fixtures for Korean/English albums and missing-cover cases. Do not call APIs from tests unless explicitly marked integration.
  Parallelization: Wave 2 | Blocked by: 0,2,3 | Blocks: 14,15
  References: Todo 0 `docs/research/data-source-comparison.md` and `legal-operational-risks.md`; original plan "외부 음악 메타데이터"; draft evidence that MusicBrainz has rate-limit requirements; this plan's tech stack.
  Acceptance criteria: unit tests pass with mocked MusicBrainz/Cover Art Archive responses; output includes external source IDs, title, artist names, release date when available, cover URL/file info, and tracks when available.
  QA scenarios: happy: `pytest pipeline/tests/test_metadata_search.py` with fixture responses, save output to `.omo/evidence/task-7-music-kg-graphrag-plan.txt`; failure: simulate 429/timeout/no cover and verify retry/backoff/unknown handling.
  Commit: Y | feat(pipeline): add music metadata search normalization

- [ ] 8. Implement Spring Boot album logging persistence
  What to do / Must NOT do: Implement service and repository logic for saving selected album candidates, artists, tracks, review label, favorite track/manual fallback, ownership, and external IDs. Do not duplicate artists/albums when the same external ID already exists.
  Parallelization: Wave 2 | Blocked by: 2,3 | Blocks: 14,15
  References: API contract from Todo 3; DB schema from Todo 2; user decisions on rating labels and favorite track flow.
  Acceptance criteria: service tests cover new album save, existing album update, manual favorite track fallback, invalid rating, duplicate external ID merge.
  QA scenarios: happy: run `./gradlew test --tests '*AlbumLogging*'` and save to `.omo/evidence/task-8-music-kg-graphrag-plan.txt`; failure: try duplicate external ID and invalid favorite track ID, assert clear error/conflict.
  Commit: Y | feat(backend): persist album logging records

- [ ] 9. Implement Notion import and export dry-run, then gated write
  What to do / Must NOT do: Implement read/import from existing Notion DB and export to Notion using current fields. Provide dry-run mode by default and a write mode that requires explicit env/config flag. Do not alter Notion schema in code.
  Parallelization: Wave 2 | Blocked by: 2,3,4 | Blocks: 14,15
  References: Todo 4 sync policy; Notion DB schema from fetched "앨범 목록"; user guardrail about not changing Notion form.
  Acceptance criteria: import maps existing pages into canonical app rows; export dry-run shows exact create/update payload; write path is disabled unless configured; conflicts are recorded in sync_jobs.
  QA scenarios: happy: run sync against local fixtures and save payload/log to `.omo/evidence/task-9-music-kg-graphrag-plan.json`; failure: simulate changed Notion rating and missing album cover, verify conflict/unknown state.
  Commit: Y | feat(sync): add safe Notion import export flow

- [ ] 10. Implement backend orchestration for search-to-save flow
  What to do / Must NOT do: Wire Spring Boot endpoints to Python metadata pipeline through a stable boundary: either command invocation for MVP or internal HTTP if promoted. Return candidate lists, save selected candidate, and expose sync status. Do not make the UI depend on raw MusicBrainz response shape.
  Parallelization: Wave 2 | Blocked by: 2,3,4 | Blocks: 15
  References: Todos 3,7,8,9; tech stack decision that Python can start as worker/CLI.
  Acceptance criteria: integration test covers search -> candidate selection -> save -> sync dry-run; API responses are stable DTOs.
  QA scenarios: happy: run integration test and save request/response transcript to `.omo/evidence/task-10-music-kg-graphrag-plan.txt`; failure: Python pipeline unavailable, verify backend returns recoverable error and does not create partial records.
  Commit: Y | feat(backend): orchestrate album search and save flow

- [ ] 11. Implement RDF generation and SHACL validation pipeline
  What to do / Must NOT do: Convert canonical app data or fixture CSV/JSON into RDF TTL following the ontology. Run SHACL validation before GraphDB load. Do not generate RDF directly from raw Notion rows without normalization.
  Parallelization: Wave 2 | Blocked by: 4,5 | Blocks: 12,13,14
  References: Todo 5 ontology/shapes; original plan sections 6-8; PostgreSQL canonical schema.
  Acceptance criteria: generated TTL contains Artist, Album, Track, UserReview triples; SHACL passes for valid fixture; invalid fixture fails with useful report.
  QA scenarios: happy: run `python -m pipeline.build_rdf --input data/fixtures --out .omo/evidence/task-11-output.ttl` and SHACL validation, save report to `.omo/evidence/task-11-music-kg-graphrag-plan.txt`; failure: remove album artist from fixture and verify SHACL violation.
  Commit: Y | feat(graph): generate RDF and validate SHACL

- [ ] 12. Add GraphDB load and SPARQL query set
  What to do / Must NOT do: Add scripts to create/load a GraphDB repository locally, load generated TTL, and run query files for artist albums, user favorite albums, missing favorite tracks, similar albums by shared genre/mood, and recommendation evidence paths. Do not depend on a manually clicked GraphDB UI step.
  Parallelization: Wave 3 | Blocked by: 0,5,11 | Blocks: 13,14
  References: Todo 0 `docs/research/graphdb-comparison.md`; original plan GraphDB/SPARQL goals; Todo 11 generated RDF; `outputs/tech-stack-rationale.md` GraphDB section.
  Acceptance criteria: one command loads fixture graph and runs all SPARQL queries; query outputs are saved as deterministic evidence snapshots.
  QA scenarios: happy: run load + query script, save outputs under `.omo/evidence/task-12-*.json`; failure: load malformed TTL and verify script stops before query execution.
  Commit: Y | feat(graph): load GraphDB and add SPARQL queries

- [ ] 13. Implement vector retrieval and GraphRAG orchestration MVP
  What to do / Must NOT do: Add embedding generation for review text/album descriptions using a replaceable adapter, store vectors in pgvector, retrieve candidates, combine graph evidence and vector hits, and generate grounded answers. Do not allow unsupported free-form recommendations without retrieved evidence.
  Parallelization: Wave 3 | Blocked by: 0,5,12 | Blocks: 14,15
  References: Todo 0 `docs/research/recommendation-design.md`, `graphrag-kgqa-design.md`, and `decision-log.md`; original plan section 10 GraphRAG 처리 흐름; Todo 12 SPARQL evidence; PostgreSQL pgvector decision.
  Acceptance criteria: question examples return answer + evidence paths + retrieved entities; no-evidence question returns "insufficient evidence" style response; LLM provider is configurable.
  QA scenarios: happy: run GraphRAG fixture questions and save JSON responses to `.omo/evidence/task-13-music-kg-graphrag-plan.json`; failure: disable LLM key or empty retrieval result and verify graceful fallback.
  Commit: Y | feat(rag): add graph grounded recommendation answers

- [ ] 14. Expose recommendation and GraphRAG APIs
  What to do / Must NOT do: Add Spring Boot endpoints that call graph/vector retrieval services and return recommendation results, reasons, graph paths, and confidence/coverage markers. Do not expose raw SPARQL injection surface.
  Parallelization: Wave 3 | Blocked by: 7,8,9,11,12,13 | Blocks: 16,17
  References: API contract from Todo 3; Graph query outputs from Todo 12; GraphRAG output from Todo 13.
  Acceptance criteria: API tests cover artist representative album, personal taste recommendation, missing favorite track query, and natural-language question; SPARQL/query parameters are whitelisted or safely templated.
  QA scenarios: happy: run API integration tests and save sample curl outputs to `.omo/evidence/task-14-music-kg-graphrag-plan.txt`; failure: malicious query string or unknown artist returns safe error/no result.
  Commit: Y | feat(api): expose graph recommendations and chat

- [ ] 15. Build end-to-end demo scenario and seed dataset
  What to do / Must NOT do: Create a reproducible demo using a small dataset from the user's style of records plus fixtures. Demonstrate search -> save -> Notion dry-run -> RDF -> SHACL -> GraphDB -> SPARQL -> GraphRAG answer. Do not require private Notion credentials for the public demo.
  Parallelization: Wave 4 | Blocked by: 6,7,8,9,10,13 | Blocks: 17
  References: Notion sample rows observed in prior query; Notion project page scenario examples; docs from Todo 6.
  Acceptance criteria: `docs/demo-scenarios.md` includes exact commands and expected outputs; demo can run with fixtures only; optional real Notion mode is clearly marked.
  QA scenarios: happy: run the full fixture demo and save transcript to `.omo/evidence/task-15-music-kg-graphrag-plan.txt`; failure: run without Notion env vars and verify fixture demo still works.
  Commit: Y | docs(demo): add reproducible portfolio walkthrough

- [ ] 16. Add observability, config, and security hardening for portfolio credibility
  What to do / Must NOT do: Add Spring Actuator health endpoint, structured logging, config profiles, secret handling documentation, API error model, and basic rate-limit/retry controls for external APIs. Do not log tokens or raw LLM prompts containing private data by default.
  Parallelization: Wave 4 | Blocked by: 6,14 | Blocks: 17
  References: `outputs/tech-stack-rationale.md` Spring Boot operational rationale; external API rate-limit findings; user target roles where operation matters.
  Acceptance criteria: health endpoint reports app/DB status; logs redact secrets; MusicBrainz requests respect rate limit; config docs list all env vars.
  QA scenarios: happy: run health endpoint and config validation, save output to `.omo/evidence/task-16-music-kg-graphrag-plan.txt`; failure: missing required env var or invalid external API config fails fast with clear message.
  Commit: Y | chore(ops): add observability and safe configuration

- [ ] 17. Finalize portfolio package and interview materials
  What to do / Must NOT do: Produce final README, architecture diagram, ERD, ontology diagram or table, API examples, GraphRAG evidence examples, tech stack rationale, limitations, and next steps. Update the Notion project page with final implementation summary once artifacts exist. Do not oversell incomplete features.
  Parallelization: Wave 4 | Blocked by: 14,15,16 | Blocks: final verification
  References: all docs and evidence artifacts; Notion page `https://app.notion.com/p/3907f120758f819ebe90ebb0facb4b3d`; `outputs/tech-stack-rationale.md`.
  Acceptance criteria: README can guide a fresh run; docs answer "why this stack", "why GraphDB", "how sync is safe", "how GraphRAG is grounded"; Notion page has an implementation summary/changelog.
  QA scenarios: happy: run a fresh-start doc walkthrough in a clean shell and save transcript to `.omo/evidence/task-17-music-kg-graphrag-plan.txt`; failure: intentionally omit a setup step from a dry run and verify README/troubleshooting points to the fix.
  Commit: Y | docs(portfolio): finalize project narrative and handoff

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit
  Verify every Must Have is covered by at least one completed todo, every Must NOT guardrail has a corresponding check, and every evidence file referenced by todos exists.
- [ ] F2. Code quality review
  Review Java and Python code for correctness, error handling, sync safety, secret handling, test quality, and avoidable complexity.
- [ ] F3. Real manual QA
  Run the fixture end-to-end demo through the actual service surface: API calls, DB rows, dry-run Notion payload, RDF/SHACL, GraphDB query, and GraphRAG response.
- [ ] F4. Scope fidelity
  Confirm the delivered project remains a data/AI backend portfolio project and has not drifted into a generic frontend music app or unsupported recommendation demo.

## Commit strategy
- Commit per todo when each todo passes its acceptance criteria.
- Keep commits reviewable and scoped: scaffold, db, api, sync, ontology, pipeline, graph, rag, docs, ops.
- Do not commit secrets, local `.env`, generated large files, or private Notion exports.
- Before any push/PR, run `git diff --stat`, `git diff --check`, Java tests, Python tests, and the fixture demo.

## Success criteria
- A new developer can run the fixture demo locally from README without private Notion credentials.
- The real Notion sync path is safe-by-default and dry-run-first.
- Existing Notion database shape is preserved.
- Spring Boot clearly owns user-facing backend responsibilities.
- Python clearly owns metadata/RDF/SHACL/GraphRAG pipeline responsibilities.
- PostgreSQL is the canonical app database; GraphDB and Notion are derived/synchronized surfaces.
- At least 5 SPARQL queries work against loaded fixture data.
- At least 3 GraphRAG demo questions return answers with graph/vector evidence.
- Portfolio docs explicitly map the work to 공기업 전산직, 은행 IT/디지털, and 기업 AI/AX interview narratives.
