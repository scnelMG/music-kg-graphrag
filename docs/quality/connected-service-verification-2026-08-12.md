# Connected service verification record — 2026-08-12

This is the release-readiness record for the current worktree. It distinguishes
measured local behavior from external-provider and deployed-production claims.
No token, Notion page content, URL containing credentials, or user record is
included here.

## Scope

The connected path is:

```text
album or artist query
  -> MusicBrainz release group and track lookup
  -> selected record with sentiment, favourite track, and ownership
  -> Notion create or duplicate-safe update
  -> derived personal GraphDB projection
  -> evidence-ranked relisten and new-release recommendations
```

Notion remains the personal-record source of truth. The GraphDB personal graph
is a private, rebuildable derived projection. Recommendation rows identify their
record page evidence and relationship; they are not LLM-generated claims or
vector-search results.

## Measured results

| Surface | Command or artifact | Result |
| --- | --- | --- |
| Backend regression | `backend\\gradlew.bat test --no-daemon --rerun-tasks` | **100 / 100** tests passed; 0 failures, errors, or skips. |
| Focused resilience/ranking checks | MusicBrainz, Notion, and connected-service test classes | Typed provider-contract, bounded-rate-queue, multi-path score aggregation, and readiness fallback checks passed. |
| Frontend type safety | `pnpm typecheck` | **0** TypeScript errors. |
| Frontend unit/BFF checks | `pnpm test` | **42 / 42** tests passed. |
| Production frontend build | `pnpm build` | **14 / 14** Next routes generated. |
| Desktop browser workflow | Playwright desktop, 3 specs | **15 / 15** scenarios passed. |
| Mobile browser workflow | Playwright mobile, fixture-review spec | **9 / 9** scenarios passed. |
| Responsive visual evidence | `frontend/.omo/evidence/final-connected-workflow-20260812/` | **4 / 4** PNGs captured: 375, 768, 1280, and focused 375. |
| Pipeline regression | `.omo/evidence/pipeline-full-final-20260812.xml` | **151 / 151** tests passed in 117.020 s. |
| Deterministic GraphRAG evaluation | [Connected GraphRAG Measurement](connected-graphrag-measurement-2026-08-12.md) | 5 / 5 scenarios; evidence recall and claim coverage both 1.000000. |
| Deployment/script contracts | smoke, dedicated-Notion E2E guard, Cloud Run manifest tests | **15 / 15** checks passed: two PowerShell script contracts plus 13 manifest checks. |
| Live local dependency probe | current `bootJar` + `run-local-connected-readiness.ps1 -CatalogQuery "아이유"` | **PASS**: `notion:READY`, `musicbrainz:READY`, `graphdb:READY`; one real Korean catalog result and one real track were returned. Read-only: no Notion page was changed. |

The current browser capture review directly checked the following observable
states: unselected progressive disclosure, selected update form, 52 × 52 cover
fallback, inline archive confirmation, saved-record/relisten/discovery visual
separation, 375/768/1280 reflow, Korean wrapping, and focused skip navigation.
There was no visible horizontal overflow, clipped Hangul, or dashboard/AI-chat
chrome in those captures.

## Quality corrections validated in this run

| Risk | Correction | Observable consequence |
| --- | --- | --- |
| A 1 RPS MusicBrainz provider could make waiting requests exceed the interaction budget | The client rejects a local queue wait over 2 seconds as typed `MUSICBRAINZ_RATE_LIMITED` | The BFF can show a recovery message instead of holding a Cloud Run request indefinitely. |
| A malformed provider body could bypass typed error handling | MusicBrainz and Notion parse boundaries now return typed provider-contract failures | The API handler maps the failure through the established redacted boundary instead of leaking an unclassified 500. |
| The first matching catalog row could hide stronger corroborating graph paths | Recommendation candidates are accumulated by release-group ID; unique path weights are summed before deterministic ranking | The score and evidence list now reflect multiple independent artist/tag paths without duplicate counting. |
| Graph/readiness diagnostics could fail with a raw runtime exception | Unexpected dependency runtime failures reduce only that readiness component to `DEPENDENCY_UNAVAILABLE` | `/api/v1/ready` can truthfully return an unhealthy dependency state. |
| A legacy local `.env` could point personal recommendations at the canonical GraphDB repository | Only the GraphDB base URL may inherit from the legacy setting; the connected repository defaults to the separate `music-kg-personal` | Live readiness now checks the intended personal repository, never the canonical pipeline repository. |
| A destructive Notion archive had no immediate recovery | The UI requires confirmation and presents a same-session restore action | Accidental clicks have a cancel path; the restore request is individually scoped to the archived page ID. |

## Recorded troubleshooting and resolutions

| Attempt | Result | Resolution |
| --- | --- | --- |
| Running `pnpm` through Git Bash | Git Bash did not have pnpm on its PATH (`command not found`) | Re-ran the exact frontend gates through Windows PowerShell; all passed. |
| Browser E2E inside the sandbox | Spring's Gradle wrapper could not open its network socket (`getsockopt` permission denied) before the app started | Re-ran the same local Spring + Next browser tests through the allowed native environment; all desktop and mobile assertions passed. |
| First new backend test compilation | The anonymous readiness test omitted the required `retrievalMethod()` implementation | Completed the test double contract, then observed the intended three failing behavior tests before implementing the fixes. |
| Earlier scope audit scan after a Next build | Generated `.next` output expanded the scan and delayed the Python audit | The audit now prunes generated output before walking source; the final pipeline suite passed 151 / 151. |
| Initial skip-link visual capture | A focus-reveal transition cropped the focused link in the evidence image | Focus reveal is immediate; the refreshed 375px capture shows the entire label and outline. |
| First local readiness run | Generic `GRAPHDB_REPOSITORY=music-kg` selected the canonical repository and GraphDB correctly returned `GRAPHDB_QUERY_REJECTED` | Separated the connected repository default, then reran the same read-only probe successfully. |
| Windows PowerShell parsed the UTF-8 Korean default literal incorrectly in a new script | The local readiness runner could not parse before start | Kept the script default ASCII-safe and passed the Korean query explicitly; the live `아이유` catalog and track check passed. |

## External boundaries that remain deliberately unclaimed

1. The current local worktree has not been turned into a new immutable
   Cloud Run image and Vercel deployment by this verification run. A deployed
   revision must repeat the authenticated readiness and BFF smoke checks.
2. A destructive live Notion round trip is intentionally blocked unless a
   separately shared non-production data source is configured. The prepared
   runner plans create → verify → archive → restore → final archive without
   touching the production data source: see
   [Connected E2E Runbook](../connected-e2e-runbook.md).
3. The deterministic evaluator has no permission to claim live vector retrieval
   or LLM generation. Its current ablation correctly keeps vector/fused
   retrieval disabled until a persistent-store evaluation is proven.
4. Aggregate in-process operation counters are useful for immediate diagnosis
   but reset with a Cloud Run instance. A production alerting backend and
   retention policy still need an operator-owned monitoring destination.

## Follow-up measurement — 2026-08-14

This follow-up keeps the original 2026-08-12 result intact and records the
current worktree behavior separately.

| Surface | Observation | Correction or decision |
| --- | --- | --- |
| Deployed public catalog search | The first observed Korean album query completed in **16.7 s**; two immediate repeats completed in **0.824 s** and **0.515 s**. | This identifies a cold path rather than persistent provider latency. Validated public album and track BFF responses now declare `s-maxage=600, stale-while-revalidate=86400`. Personal Notion, insight, recommendation, and write responses do not receive this header. |
| Current frontend regression | `pnpm --dir frontend typecheck`, `pnpm --dir frontend test`, and the optimized production build completed successfully. | **54 / 54** unit and BFF tests passed. The two cache headers are covered by a BFF contract test. |
| Browser workflow | Local Spring + Next + Chromium exercised the visitor catalog path and the selected album → track → record-save path. | Both focused desktop workflows passed. The first sandbox attempt was blocked by a local socket policy; the same tests passed in the native allowed environment. |
| Current backend regression | The initial full report contained **125 assertions**: **123 passed** and **2 Testcontainers integration tests blocked** while Docker Desktop was stopped. | Docker Desktop was then started and `OutboxIntegrationTest` (**5**) plus `OutboxFailureRecoveryTest` (**1**) reran with **0 failures / 0 errors**. The environment prerequisite is restored and all **129** observed backend assertions are green across the two runs. |

The cache header reduces repeat public lookups after deployment; it cannot remove
the very first Cloud Run cold start without keeping an instance warm. The latter
would increase the monthly cost and is intentionally not enabled by this low-cost
deployment configuration. The currently deployed frontend predates this follow-up;
the improvement becomes user-visible only after a new Vercel deployment.

## Reproduction

```powershell
Set-Location C:\music-kg-graphrag

.\backend\gradlew.bat -p backend test --no-daemon --rerun-tasks

Set-Location frontend
pnpm typecheck
pnpm test
pnpm build
.\node_modules\.bin\playwright.cmd test tests/e2e/fixture-review.spec.ts tests/e2e/connected-music-desk.spec.ts tests/e2e/record-workflow-visual.spec.ts --project=desktop --workers=1
.\node_modules\.bin\playwright.cmd test tests/e2e/fixture-review.spec.ts --project=mobile --workers=1
```

For remote readiness and a safe mutation test, follow the dedicated-data-source
steps in the connected E2E runbook. Do not use a personal production Notion data
source as a test fixture.
