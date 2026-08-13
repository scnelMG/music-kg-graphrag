# Connected GraphRAG Measurement Record (2026-08-12)

This record separates deterministic fixture verification from the connected personal-music service. It is deliberately not evidence that an external LLM or persistent vector store is running in production.

## Reproducible inputs

```powershell
pipeline\.venv\Scripts\python.exe -m pipeline.evaluate_graphrag `
  --suite data\evaluations\graphrag-golden.jsonl `
  --output .tmp\performance-2026-08-12\graphrag-quality.json

pipeline\.venv\Scripts\python.exe -m pipeline.benchmark_graphrag `
  --suite data\evaluations\graphrag-golden.jsonl `
  --iterations 50 `
  --output .tmp\performance-2026-08-12\graphrag-verifier.json

pipeline\.venv\Scripts\python.exe -m pipeline.ablate_retrieval `
  --suite data\evaluations\retrieval-golden.jsonl `
  --output .tmp\performance-2026-08-12\retrieval-ablation.json
```

The suite SHA-256 values are emitted in each JSON artifact. The local artifacts above are intentionally unversioned because benchmark timings are machine dependent.

## Observed result

| Check | Result | Release interpretation |
| --- | ---: | --- |
| Deterministic evaluator | PASS | 5 / 5 scenarios passed. |
| Required-evidence recall | 1.000000 | Every required evidence item was retrieved. |
| Claim-evidence coverage | 1.000000 | Every generated claim had at least one evidence ID. |
| Scenario pass rate | 1.000000 | Refusal and contradictory-evidence cases passed too. |
| Verifier wall-clock p50 | 877 microseconds | Local deterministic verifier only. |
| Verifier wall-clock p95 | 1,989 microseconds | Local deterministic verifier only; not a Cloud Run latency. |
| Retrieval ablation | REJECTED (exit 2) | Persistent pgvector verification remains false, so vector/fused retrieval stays disabled. |

The evaluator's 180 ms provider p95 and USD 0.001800 maximum cost are fixture declarations, not measured external runtime. The ablation reports lexical/graph recall 0.500000 versus vector/fused 1.000000 on its synthetic suite, but that is insufficient to enable a vector dependency.

## Connected-service measurements now available

The connected API records only aggregate per-operation counts and average latency in process memory. `GET /api/v1/operations` is BFF-secret protected and contains operation names, success count, failure count, total count, and average latency only. It never includes album titles, Notion IDs, request bodies, URLs, tokens, or provider responses.

`GET /api/v1/ready` probes the three runtime dependencies independently:

| Dependency | Probe | Failure behavior |
| --- | --- | --- |
| Notion | configured data-source metadata request | typed readiness code, HTTP 503 overall |
| MusicBrainz | rate-limited catalog query | typed readiness code, HTTP 503 overall |
| GraphDB | `ASK {}` against the configured private endpoint | typed readiness code, HTTP 503 overall |

Readiness and operation metrics are implemented locally in this worktree. They require the next immutable Cloud Run deployment before they can be used against the live service.

## Decisions and failed paths

1. Do not claim live vector GraphRAG. The latest ablation correctly failed its persistent-store gate.
2. Do not use fixture-declared network latency as a production SLO. Measure it through the authenticated connected smoke command after deployment.
3. Keep GraphDB traversal as the production recommendation method. It projects every stored artist credit, combines Notion evidence with MusicBrainz tags, and returns the evidence page IDs and relation for each recommendation.
4. Cache Notion full-history snapshots for 30 seconds and serialize cache refresh. This lowers repeated read pressure without hiding a successful write because create, update, archive, and restore invalidate the snapshot.
5. Bound the local MusicBrainz request queue to two seconds. A request that cannot be scheduled inside that budget returns the existing typed `MUSICBRAINZ_RATE_LIMITED` failure instead of consuming an entire Cloud Run request while waiting.
6. Aggregate independent GraphDB artist and MusicBrainz-tag paths when they reach the same real release group. The visible score is the sum of unique path weights; repeated evidence is not counted twice. This is verified with a focused service test and is not a learned preference model.
7. Treat malformed Notion and MusicBrainz payloads as typed provider-contract failures. They now follow the same redacted BFF recovery boundary as HTTP and transport failures instead of becoming an unclassified server error.

## Next measurement that needs external setup

Use a non-production Notion data source and the authenticated Cloud Run URL:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File scripts\run-connected-smoke.ps1 `
  -Mode connected -EnvironmentPath .env.e2e -BaseUrl https://your-connected-service.run.app
```

That call is read-only. A mutation E2E must use a separately shared Notion data source, never the production data source.
