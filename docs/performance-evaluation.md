# Performance Evaluation And Improvement Baseline

This service measures correctness, latency, external-call pressure, and failure bounds separately. A single latency number is not enough for a GraphRAG feature: an answer can be fast and unsupported, or correct but blocked by a provider's request budget.

For the separate browser workflow quality record, including E2E counts, responsive viewport coverage, and UX remediation history, see [Record Workflow UX Validation](quality/record-workflow-ux-validation-2026-08-12.md).

The latest measurement rerun, including the explicit rejected vector ablation and the connected-service measurement boundary, is recorded in [Connected GraphRAG Measurement](quality/connected-graphrag-measurement-2026-08-12.md).

## What Is Measured

| Surface | Metric | Current contract | Why it matters |
| --- | --- | --- | --- |
| GraphRAG evidence verifier | required-evidence recall, claim-evidence coverage, scenario pass rate | Must remain `1.000000` on the golden suite | Prevents fast but uncited recommendations. |
| GraphRAG evidence verifier | p50 and p95 execution latency in microseconds | Measured by `pipeline.benchmark_graphrag` | Measures only the deterministic evidence verifier, not a fixture declaration. |
| Retrieval ablation | recall@10, required-evidence recall, declared p95 change | Separate lexical/graph/vector/fused comparison | Decides whether vector retrieval earns its operational cost. |
| Personal insights | Notion list, GraphDB projection, and catalog-gateway work units per request | One cold computation, zero additional work for an immediate cache hit | Limits duplicate work without returning fabricated data. |
| GraphDB | query timeout and timeout response behavior | Five-second timeout, fail closed | Bounds a stuck graph query and never presents a partial answer as complete. |
| Notion and MusicBrainz | request rate and retry behavior | Provider-specific limits remain the ceiling | A local cache must not bypass upstream terms or rate limits. |

## Reproducible Commands

Run these from the repository root on a clean local checkout. The benchmark output path is deliberately outside versioned data because latency is machine-dependent.

```powershell
pipeline\.venv\Scripts\python.exe -m pipeline.benchmark_graphrag `
  --suite data\evaluations\graphrag-golden.jsonl `
  --iterations 50 `
  --output .tmp\performance\graphrag-verifier.json

pipeline\.venv\Scripts\python.exe -m pipeline.evaluate_graphrag `
  --suite data\evaluations\graphrag-golden.jsonl `
  --output .tmp\performance\graphrag-quality.json

pipeline\.venv\Scripts\python.exe -m pipeline.ablate_retrieval `
  --suite data\evaluations\retrieval-golden.jsonl `
  --output .tmp\performance\retrieval-ablation.json

Set-Location backend
.\gradlew.bat test --tests org.musickg.backend.connected.ConnectedMusicServiceTest --no-daemon

Set-Location ..
powershell -ExecutionPolicy Bypass -File scripts\test-start-personal-graphdb.ps1
```

The performance CLI must not be substituted for the release evaluator. The evaluator output is intentionally deterministic and keeps its fixture-declared provider latency separate; the benchmark reports wall-clock verifier latency and is expected to vary by machine.

## Measured Baseline (2026-08-12)

The local 50-iteration golden run produced 250 verifier samples across five scenarios:

| Metric | Result |
| --- | ---: |
| Verifier p50 | 879 microseconds |
| Verifier p95 | 1,415 microseconds |
| Required-evidence recall | 1.000000 |
| Claim-evidence coverage | 1.000000 |
| Scenario pass rate | 1.000000 |
| Fixture-declared provider p95 | 180 ms |
| Fixture-declared maximum provider cost | USD 0.001800 |

The last two values are **not measured runtime latency or cost**. They are scenario declarations retained for the deterministic release gate.

The retrieval-ablation fixture reports a useful quality trade-off: lexical/graph required-evidence recall is `0.500000`, while exact vector and fused retrieval are `1.000000`; its declared fused p95 is 115 ms versus 100 ms lexical/graph (+15%). The report is correctly `REJECTED` for live enablement because persistent pgvector has not been verified. Do not claim that vector retrieval is running in the personal service until a real persistent-store run passes.

## Improvements Applied

### 0. Grounded LLM explanation evaluation boundary (2026-08-13)

The optional LLM layer is evaluated separately from recommendation quality. It receives only a bounded
set of graph-retrieved public facts after an explicit listener request; it never supplies a rank or a
candidate. The release contract is therefore qualitative and adversarial before it is a latency target:

| Check | Acceptance rule | Automated boundary |
| --- | --- | --- |
| Citation faithfulness | Every returned citation label belongs to the supplied retrieval context | Unknown labels fail closed as `LLM_RESPONSE_UNGROUNDED`. |
| Privacy | No Notion page ID, source URL, private memo, or secret reaches browser/LLM context | Controller and BFF contract tests strip internal IDs. |
| Deterministic fallback | Disabled or unavailable LLM never removes or reranks graph recommendations | Service and browser E2E keep the original recommendation visible. |
| Latency and cost | Record real provider p50/p95, input/output tokens, and cost only after an authenticated non-production run | No fixture/provider estimate is reported as production performance. |

The current repository has not run an authenticated external LLM measurement, so it intentionally makes
no quality, latency, token, or cost claim for generated wording. Compare candidate implementations with
the same bounded evidence set, fixed model/version, temperature `0`, and a manually labelled set of
at least 30 personal-record questions. Report citation precision, unsupported-claim rate, user useful-rate,
p50/p95 end-to-end latency, input/output tokens, and cost per successful explanation. Do not enable a
provider for production merely because its prose sounds better.

### 1. Incremental Notion-to-private-GraphDB synchronization (2026-08-13)

The personal recommendation path now has a measurable read-work contract rather than relying on the
30-second cache alone. The first request with no checkpoint performs one full Notion bootstrap and one
batch private-graph projection. A later refresh reads only `last_edited_time > checkpoint - 2 seconds`,
replaces only changed page triples, and then calculates taste, relisten, tags, and discovery from the
private GraphDB record snapshot.

| Two consecutive synchronization runs | Full Notion list reads | Changed-record reads | Full GraphDB clears |
| --- | ---: | ---: | ---: |
| First bootstrap | 1 | 0 | 1 batch initialization only |
| Unchanged subsequent refresh | 0 | 1 | 0 |

The focused `PersonalGraphSyncServiceTest` and `ConnectedMusicServiceTest` assert this exact call
shape. Save, archive, and restore each mutate only the affected page’s private graph triples after the
Notion operation has succeeded. The explicit reconciliation endpoint is the only normal path allowed to
perform another full comparison; it is intended for records archived directly in Notion.

No end-to-end provider latency number is claimed for this change: Notion, GraphDB, and MusicBrainz
latency depend on the deployed project and user data. The behavior above is a verified work-unit reduction,
not an invented millisecond benchmark.

### 2. Coalesced 30-second personal-insight snapshot

`ConnectedMusicService.personalInsights()` now reuses one immutable snapshot for an unchanged 30-second Notion-cache window and coalesces concurrent callers. A successful create, update, or archive invalidates it immediately.

The focused service test proves the observable call budget for two back-to-back insight requests:

| Work unit | Prior uncached behavior for two calls | Current behavior for two calls | Reduction on the repeated request |
| --- | ---: | ---: | ---: |
| Notion record-list read | 2 | 1 | 100% of repeated work |
| GraphDB project-and-retrieve | 2 | 1 | 100% of repeated work |
| Catalog-gateway lookups (tag/artist path in the test) | 4 | 2 | 100% of repeated work |

This cache is intentionally short and write-invalidated: it reduces duplicate service work without making a successful save invisible. It does not cache album search, and it does not replace the MusicBrainz client's own HTTP cache or upstream rate limiting.

### 3. GraphDB tail-latency and correctness bound

The personal GraphDB repository configuration changes the unlimited query timeout from `0` to `5` seconds and enables `throw-QueryEvaluationException-on-timeout`. A request that exceeds the bound fails instead of silently using partial results. This is a tail-bound and correctness improvement, not a claim that every query is five seconds faster.

### 4. Measured GraphRAG verifier benchmark

`pipeline.benchmark_graphrag` measures each scenario with `perf_counter_ns`, emits p50/p95 using nearest-rank percentile calculation, and repeats the same evidence-quality checks used by the deterministic evaluator. It deliberately excludes GraphDB, Notion, MusicBrainz, network transport, and any future LLM provider. Those require separate authenticated integration runs and must never be inferred from fixture values.

## Provider And Graph Constraints

- MusicBrainz clients must stay at or below one request per second and use a meaningful User-Agent. The client-side rate gate and caches are therefore a provider-compliance mechanism, not merely an optimization. Source: <https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting>.
- Notion documents an average integration limit of three requests per second and requires callers to honor `429` and `Retry-After`. The existing retry/backoff remains required even with the 30-second snapshot. Source: <https://developers.notion.com/reference/request-limits>.
- GraphDB supports query timeouts and can throw on timeout instead of yielding partial results. Source: <https://graphdb.ontotext.com/documentation/11.2/query-monitoring.html>.
- Microsoft GraphRAG distinguishes retrieval/search patterns with different resource trade-offs. This service keeps a deterministic graph-evidence verifier as its correctness gate and treats vector retrieval as an ablation-gated extension. Source: <https://microsoft.github.io/graphrag/query/overview/>.

## Operating Rules

1. Run the deterministic quality evaluator and the performance benchmark together; accept a speed improvement only if the three quality ratios do not regress.
2. Treat a failed GraphDB timeout as an explicit unavailable-evidence state, never as a low-confidence answer.
3. Enable persistent vector retrieval only after a real pgvector ablation report passes `persistent_pgvector_verified`; fixture vector results alone are insufficient.
4. Record the machine, iteration count, suite SHA-256, and provider mode with every latency comparison. Do not compare local verifier microseconds with Cloud Run end-to-end milliseconds.
