# Music KG GraphRAG Plan Improvement

> Status: research-backed amendment to `.omo/plans/music-kg-graphrag-plan.md`.
> This document does not mark any unfinished todo complete. It replaces ambiguous ordering and acceptance criteria when the two documents differ.

## Executive decision

Keep PostgreSQL as the canonical store and GraphDB as a rebuildable RDF projection. Do **not** build a general GraphRAG chatbot. Build a constrained, two-path retrieval system:

1. deterministic SPARQL/path retrieval for factual and recommendation-evidence questions;
2. optional graph-neighborhood/vector synthesis for explicitly supported broad questions.

An LLM may summarize retrieved evidence, but may not select arbitrary tools, URLs, predicates, or facts. Every answer must carry machine-readable evidence identifiers; zero support produces `INSUFFICIENT_EVIDENCE`.

This is a better MVP for a single user with sparse history: graph structure helps multi-hop explanation, while direct retrieval is simpler and more faithful for exact questions. [Microsoft GraphRAG overview](https://microsoft.github.io/graphrag/index/overview/), [GraphRAG local search](https://microsoft.github.io/graphrag/query/local_search/), [GraphRAG-Bench](https://github.com/GraphRAG-Bench/GraphRAG-Benchmark).

## Material problems in the existing plan

| Priority | Problem | Evidence in current repository | Correction |
| --- | --- | --- | --- |
| P0 | Claimed completion and artifacts are not reconciled. Todo 5 is unchecked, but ontology, SHACL, and an invalid fixture exist. | `.omo/plans/music-kg-graphrag-plan.md`, `ontology/`, `shapes/`, `data/fixtures/` | Do not treat files as completed work. Add a reconciliation gate that verifies parsing, positive/negative validation, provenance constraints, and evidence before checking Todo 5. |
| P0 | Notion field labels are mojibake/inconsistent across scope, schema, and sync task text. | `.omo/plans/...`, `docs/original-project-brief.md` | Obtain an explicit user-approved field mapping as UTF-8 data before any migration or write-capable sync code. Do not guess labels. |
| P0 | The Notion integration contract is stale: `database_id` alone is insufficient for current data-source semantics. | `.env.example`, `scripts/check-env.example.sh`, Todo 4 | Pin `NOTION_VERSION=2026-03-11`; discover/store a selected data-source ID; snapshot its property schema; test multi-source, wrong-source, 429/529, `in_trash`, and write-capability failures. [Notion 2025-09-03 migration](https://developers.notion.com/guides/get-started/upgrade-guide-2025-09-03), [Notion 2026-03-11 migration](https://developers.notion.com/guides/get-started/upgrade-guide-2026-03-11) |
| P0 | The plan permits GraphRAG without an executable faithfulness oracle or trust boundary. | Todo 13; `docs/research/graphrag-kgqa-design.md` | Add structured evidence schema, unsupported-answer test fixtures, retrieval poisoning tests, and sink-level authorization. [OpenAI prompt-injection guidance](https://openai.com/safety/prompt-injections/), [OWASP LLM Top 10](https://owasp.org/www-project-top-10-for-large-language-model-applications/). |
| P0 | Source-specific license, caching, and attribution requirements are too generic. | `docs/research/data-source-comparison.md` | Add provider policy registry and enforcement tests before metadata ingestion. MusicBrainz, Last.fm, Discogs, and cover art have materially different reuse rules. [MusicBrainz licensing](https://musicbrainz.org/doc/About/Data_License), [Last.fm API terms](https://www.last.fm/api/tos), [Discogs API terms](https://support.discogs.com/hc/en-us/articles/360009334593-API-Terms-of-Use). |
| P1 | The ontology promises source-aware evidence but its SHACL shapes do not require it. `ListeningContext` is unlinked. | `ontology/music-ontology.ttl`, `shapes/music-shapes.ttl` | Make provenance, source identifiers, confidence bounds, context links, and recommendation evidence enforceable. Use named graphs + PROV-O. [PROV-O](https://www.w3.org/TR/prov-o/), [SHACL](https://www.w3.org/TR/shacl/). |
| P1 | Postgres-to-GraphDB and embedding work has no transaction/replay contract. | Todos 2, 11–13 | Add transactional outbox, idempotent consumers, embedding versioning, and rebuild generation. [PostgreSQL triggers](https://www.postgresql.org/docs/current/trigger-definition.html), [pgvector hybrid search](https://github.com/pgvector/pgvector). |
| P1 | Acceptance criteria describe outcomes but not stable commands, fixtures, output schemas, or failure oracles. | Todos 3, 4, 12, 13 | Define a test/evidence matrix with deterministic fixtures, expected JSON/SPARQL reports, and tamper/no-evidence cases. |
| P1 | Recommender evaluation is weak for one sparse user. | `docs/research/recommendation-design.md` | Use time-aware leave-one-out, simple metadata/graph baselines, diversity/novelty/calibration, and cold-start slices. Do not claim production accuracy. [LightFM](https://github.com/lyst/lightfm/blob/0c9c31e027b976beab2385e268b58010fff46096/README.md#L14-L16), [implicit](https://github.com/benfred/implicit/blob/8a95dbe24ca675a6edd86aafb3b4cd5ae7287edf/README.md#L11-L27). |
| P2 | Compose is a scaffold but lacks dependency readiness, fixture reset, immutable image policy, restore rehearsal, and telemetry contract. | `docker-compose.yml` | Add health/readiness gate, digest pin policy for releases, Testcontainers integration tests, backup/restore rehearsal, telemetry, SBOM, and provenance. [Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/), [PostgreSQL backup](https://www.postgresql.org/docs/16/backup.html), [OpenTelemetry](https://opentelemetry.io/docs/concepts/instrumentation/). |
| P2 | GraphDB research and runtime versions disagree, so SHACL/loading behavior is not reproducibly pinned. | `docs/research/graphdb-comparison.md`, `docker-compose.yml` | Add a source-refresh decision before graph work: choose a maintained GraphDB version, document Free/Enterprise constraints, pin its release image digest, and rerun compatibility evidence. [GraphDB release notes](https://graphdb.ontotext.com/documentation/10.8/release-notes.html) |

## Non-negotiable system contracts

### Canonical-data and projection contract

- PostgreSQL is authoritative for user-owned data, normalized external identifiers, review history, jobs, outbox events, and embedding metadata.
- GraphDB is a versioned RDF projection that can be reconstructed from a specific Postgres snapshot plus a projection generation. It never receives manual edits as a source of truth.
- Each outbound projection event has a stable event ID; projector retries are at-least-once and idempotent.
- An embedding is a derived artifact keyed by entity ID, canonical-text hash, embedding provider/model/version, and creation time. New models create a new version; they do not silently overwrite the old vector.

### Identity and provider contract

- MusicBrainz release/release-group/recording MBIDs are canonical music-catalog identity when available; match aliases, sort names, and locale-sensitive candidates before human selection. [MusicBrainz identifiers](https://musicbrainz.org/doc/MusicBrainz_Identifier), [search syntax](https://musicbrainz.org/doc/Indexed_Search_Syntax)
- A provider response stores provider name, external ID, retrieved-at time, content hash, license/attribution classification, and evidence confidence. No title/artist-only automatic merge.
- MusicBrainz: meaningful User-Agent and a maximum one request per second per IP. [Rate limit](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting)
- Notion: pin `Notion-Version: 2026-03-11`; resolve a database to a selected data source, snapshot property IDs, use cursor pagination and `Retry-After`, and reject multi-source ambiguity, missing capability, `in_trash`, and destructive content-update operations. [Notion request limits](https://developers.notion.com/reference/request-limits), [2026-03-11 migration](https://developers.notion.com/guides/get-started/upgrade-guide-2026-03-11)
- Last.fm is opt-in soft enrichment, not catalog truth; it needs policy review before commercial/research use. Discogs is disabled by default until attribution/freshness/restricted-data policy is implemented.
- Cover-art URLs/provenance may be stored, but images are not redistributed or committed without a rights decision. [Cover Art Archive](https://coverartarchive.org/)

### Retrieval and answer contract

`GraphAnswer` must contain `answer`, `status`, `question_class`, `graph_snapshot_id`, `retrieval_run_id`, `evidence[]`, `coverage`, and `model_config_id`.

Each `evidence` record must include a source entity/review ID, named graph, traversed predicate path or vector-hit ID, source provider, and score. A generated claim without at least one evidence record is rejected. Allowed question classes are fixed and tested: factual lookup, 1–3-hop recommendation rationale, mood/context recommendation, and bounded taste summary. Free-form text-to-SPARQL, arbitrary URL fetch, and write-capable tools are out of scope.

### Security and privacy contract

- Treat imported metadata, Notion content, cover descriptions, and retrieved text as untrusted data, never as instructions.
- The retriever is read-only. Notion writes require an explicit application-side approval intent, a field-level diff, an idempotency key, and a user confirmation at the write sink.
- Secrets are never serialized into prompts, embeddings, evidence artifacts, or logs. Operational logs retain IDs/hashes/outcomes, not raw review bodies or authorization headers.
- Define retention/deletion propagation separately for raw imports, normalized data, GraphDB projections, embeddings, caches, prompt traces, and audit events.
- Server-side URL policy is allowlist-only for known metadata hosts; reject non-HTTPS, private/link-local address space, redirect escapes, and model-produced URLs.

## Revised delivery order

The following gates supersede the original wave ordering where they conflict. They are deliberately smaller: each gate leaves a demonstrable, independently reviewable artifact.

### Gate A — Truth, contracts, and reproducibility

1. **Reconcile existing state.** Validate/record every currently present artifact; preserve unchecked status until its stated evidence passes. Repair document encoding or move the authoritative Notion mapping into a new UTF-8 contract file approved by the owner.
2. **Write canonical contracts.** Create the Notion mapping and data-source discovery contract (`NOTION_VERSION`, database ID, data-source ID, property IDs/schema snapshot), provider-policy registry, trust-boundary matrix, retention/deletion matrix, error taxonomy, and evidence JSON schema before databases or APIs.
3. **Make local verification reproducible.** Pin runtime/tool versions, add Compose readiness checks, fixture reset, and deterministic sample IDs. Use Testcontainers for integration tests; do not rely on a long-lived local Docker state.

### Gate B — Canonical relational core

4. **Schema and migration baseline.** Implement normalized IDs, immutable audit timestamps, review/revision semantics, source records, external-ID uniqueness scoped by provider/entity kind, sync jobs, outbox events, projection generation, embedding versions, and deletion/retention state.
5. **Provider and sync safety.** Implement read-only MusicBrainz candidate search and Notion dry-run only. Make current Notion data-source discovery/versioning and a property-schema snapshot a prerequisite; add provider pacing, cursor/retry behavior, per-provider cache/attribution decisions, idempotency/conflict behavior, and user-confirmed writes as a later separately gated feature.
6. **OpenAPI and job boundary.** Define OpenAPI 3.1.2 contracts, typed error codes, idempotency header semantics, and job-state API. Spring owns HTTP/orchestration/persistence; Python owns deterministic CLI worker tasks with no shell execution. [OpenAPI](https://spec.openapis.org/oas/), [Python subprocess security](https://docs.python.org/3/library/subprocess.html#security-considerations)

### Gate C — RDF projection, validation, and queries

7. **Complete the semantic contract.** Keep the MVP small but model `hasListeningContext`, typed recommendation evidence, source/confidence/identifier provenance, and deferred-module boundaries. Use PON patterns for provenance, DOREMUS only as a future catalog-alignment extension, and legacy Music Ontology only for compatibility. [Polifonia Ontology Network](https://polifonia-project.github.io/ontology-network/), [DOREMUS](https://data.doremus.org/ontology/)
8. **Validate before and after loading.** Refresh and pin the selected GraphDB version/license mode first; then parse RDF, validate core SHACL with a pinned CLI/library, store SHACL reports, and validate GraphDB repository behavior. Repository creation must enable the intended SHACL configuration before data loading. [GraphDB SHACL](https://graphdb.ontotext.com/documentation/11.2/shacl-validation.html)
9. **Project through the outbox.** Generate named graphs by origin/run, load idempotently, and prove full rebuild from a fixture Postgres snapshot. Build a small, named SPARQL query set with machine-comparable result snapshots.

### Gate D — Retrieval, recommendation, and GraphRAG

10. **Implement transparent baselines first.** Candidate generation uses exact graph rules, lexical full-text search, and optionally vector retrieval. Rank with declared weights; filter already-reviewed items and expose the evidence path.
11. **Versioned vector retrieval.** Compare exact and ANN recall for each fixture query; use HNSW/IVFFlat only when a measurement warrants it. Fuse lexical/vector candidates only with a recorded policy (for example RRF) and rerank on full vectors where needed. [pgvector](https://github.com/pgvector/pgvector)
12. **Constrained GraphRAG.** Add summary generation only after deterministic retrieval passes. Pin graph snapshot, prompts, model configuration, and evaluation questions. Test unsupported questions, injected metadata, poisoned triples, stale projections, and repeated-run stability. [GraphRAG outputs](https://microsoft.github.io/graphrag//index/outputs/), [GraphRAG poisoning research](https://aclanthology.org/2026.acl-short.47/)
13. **Evaluate honestly.** Use time-aware leave-one-out where timestamps exist; report relevance alongside evidence coverage, unsupported-claim rate, diversity, novelty, calibration, cold-start slices, and no-evidence correctness. Counterfactual metrics are optional and require exposure logs; do not fabricate them.

### Gate E — Operational portfolio proof

14. **End-to-end fixture demo.** Drive a clean environment from seed data through candidate selection, review persistence, dry-run diff, projection rebuild, SPARQL evidence, recommendation, GraphRAG answer, and no-evidence response.
15. **Hardening.** Add structured logs and traces, data-quality checks, backup/restore rehearsal, image/dependency/SBOM provenance, privacy review, and a concise demo/interview narrative that reports limitations rather than overstating AI quality.

## Acceptance matrix that must be added to the plan

| Gate | Successful proof | Required failure proof |
| --- | --- | --- |
| A | Clean clone boots checker with fixed fixture IDs and no secrets. | Invalid/missing mapping or placeholder secret is rejected before service startup. |
| B | A repeated candidate-save or job request with the same idempotency key produces one canonical row and one outbox effect. | Different normalized external identity or an unresolved Notion conflict returns a typed conflict, never an overwrite. |
| C | Valid fixture produces parse + SHACL + GraphDB-load + SPARQL snapshot evidence. | Invalid source/confidence/review/path fixtures produce specific SHACL violations; projector retry produces no duplicate triples. |
| D | Every supported answer points to exact evidence records; vector ANN recall meets a declared fixture threshold against exact search. | Unsupported/no-evidence, prompt-injected content, poisoned triple, and missing evidence are rejected or return `INSUFFICIENT_EVIDENCE`. |
| E | Fresh-volume demo and restore rehearsal reproduce the expected data/query hashes and telemetry fields. | Mutable release image, missing SBOM/attestation, secret-bearing log, or failed restore fails the release gate. |

## Research corpus and implementation references

Primary specifications and official documentation used for this amendment:

- [W3C SHACL](https://www.w3.org/TR/shacl/), [PROV-O](https://www.w3.org/TR/prov-o/), and [RDF 1.2 Concepts](https://www.w3.org/TR/rdf12-concepts/)
- [GraphDB loading](https://graphdb.ontotext.com/documentation/11.2/load-your-data.html) and [SHACL validation](https://graphdb.ontotext.com/documentation/11.2/shacl-validation.html)
- [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API), [Cover Art Archive API](https://musicbrainz.org/doc/Cover_Art_Archive/API), [Wikidata data access](https://www.wikidata.org/wiki/Wikidata:Data_access), [Notion API introduction](https://developers.notion.com/reference/intro)
- [PostgreSQL row security](https://www.postgresql.org/docs/17/ddl-rowsecurity.html), [PostgreSQL backup](https://www.postgresql.org/docs/16/backup.html), [pgvector](https://github.com/pgvector/pgvector)
- [Spring Boot Testcontainers](https://docs.spring.io/spring-boot/reference/testing/testcontainers.html), [Testcontainers](https://testcontainers.com/), [Docker Compose readiness](https://docs.docker.com/compose/how-tos/startup-order/)
- [OpenTelemetry instrumentation](https://opentelemetry.io/docs/concepts/instrumentation/), [OWASP SSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html), [OWASP secrets management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [Microsoft GraphRAG](https://github.com/microsoft/graphrag), [WildGraphBench](https://aclanthology.org/2026.findings-acl.679/), [GraphRAG-Bench](https://github.com/GraphRAG-Bench/GraphRAG-Benchmark), [LightFM](https://github.com/lyst/lightfm), [implicit](https://github.com/benfred/implicit), and [RecBole](https://github.com/RUCAIBox/RecBole)

## Decision record

- Do not add a separate vector database in the MVP. PostgreSQL/pgvector remains enough until recall/latency evidence says otherwise.
- Do not make Microsoft GraphRAG a dependency for the first deterministic RDF-retrieval milestone. Its community-analysis pipeline is optional and must earn its operating cost.
- Do not include Discogs or Last.fm as default production providers. Their policy constraints require a provider-specific implementation decision.
- Do not treat the existing ontology files as a completed Todo 5 implementation until the strengthened validation matrix passes.
