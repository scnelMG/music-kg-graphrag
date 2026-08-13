# Record Workflow UX Validation — 2026-08-12

## Purpose and scope

This record captures the observable quality results and the remediation decisions for the connected music-record workflow. The scope is the browser experience from album search through record selection, Notion record mutation, archive confirmation, personal-history display, and recommendation presentation.

It is **not** a recommendation-quality study, an external-provider availability SLO, or proof of a live Notion write. The browser scenarios use deterministic BFF route responses so that UI regressions are repeatable. Live-service and GraphRAG performance claims remain in [Performance Evaluation](../performance-evaluation.md).

## Quantified result snapshot

| Surface | Metric | Result | Evidence |
| --- | --- | ---: | --- |
| Type safety | TypeScript errors | 0 | `pnpm typecheck` |
| Frontend unit tests | Passing tests | 40 / 40 | `pnpm test` |
| Production build | Generated Next pages | 14 / 14 | `pnpm build` |
| Desktop workflow E2E | Passing scenarios | 13 / 13 | `.omo/evidence/record-workflow-e2e-final-current.log` |
| Mobile workflow E2E | Passing scenarios | 8 / 8 | `.omo/evidence/record-workflow-e2e-mobile-final.log` |
| Responsive capture coverage | Selected-record/archive widths | 3 / 3: 375, 768, 1280 px | `frontend/.omo/evidence/record-workflow-ui-final/` |
| Keyboard capture coverage | Focused skip-link state | 1 / 1 at 375 px | `frontend/.omo/evidence/record-workflow-ui-final/record-workflow-focus-375.png` |
| Independent visual review | Final verdicts | 2 / 2 PASS | `record_workflow_visual_a_final`, `record_workflow_visual_b_final` reviews |

The full-page screenshots have these measured dimensions: 375 × 3,097 px, 768 × 2,605 px, and 1,280 × 1,809 px. The keyboard-focus capture is 375 × 2,500 px. In each responsive scenario, Playwright asserted that `document.documentElement.scrollWidth` equals the viewport width.

## Behavioral coverage

| User-visible behavior | Automated proof |
| --- | --- |
| Record controls remain hidden until an album is selected | Desktop and mobile E2E |
| A selected album reveals sentiment, real track selection, ownership, and save | Desktop and mobile E2E |
| An existing Notion record prefills an update rather than creating a duplicate | Desktop and mobile E2E |
| A stale track response cannot restore a cleared selection | Desktop and mobile E2E |
| A search URL with `?q=` restores the input and re-executes the search | Desktop and mobile E2E |
| Cancelling archive issues no DELETE request | Desktop and mobile E2E |
| Confirming archive refreshes the record list without that entry | Desktop and mobile E2E |
| The first keyboard stop exposes a skip link and moves focus to `main#main-content` | Desktop E2E plus focused capture |
| Service outage leaves the search form available and fabricates no records or recommendations | Desktop and mobile E2E |

## Remediation log

| Finding | Why it mattered | Applied correction | Verification after correction |
| --- | --- | --- | --- |
| The listening form appeared before a listener chose an album | It looked like a disabled or incomplete screen and asked for context-free input | Rendered the editor only for `selected !== null`; the explanation and record-management list remain visible | Pre-selection E2E passes on desktop and mobile |
| Archive action executed immediately | A mistaken click could hide a real Notion record | Added an inline, record-specific confirmation with consequences, cancel, confirm, initial focus, and focus restoration on cancel | Cancel path sends 0 DELETE requests; confirm path removes the row after refresh |
| Personal history and discoveries had weak visual ownership cues | A listener could confuse their own record with a proposed new album | Added explicit eyebrow labels and distinct personal/relisten/discovery row treatments using existing tokens | Fresh 375/768/1280 visual PASS |
| Candidate selection changed row padding | Selection made the list appear to jump | Kept candidate padding constant across rest, hover, and selected states; selection uses color/background/inset only | Responsive browser scenarios pass without overflow or row collision |
| Album artwork could shift and a failed image could remain failed after its URL changed | Rows could move during image load; a later valid cover could be hidden by stale local state | Reserved 52 × 52 intrinsic geometry, lazy loading, async decoding, stable fallback, and URL-keyed failure state | Source review and final visual review PASS |
| Searches could not be shared or reopened | The browser URL did not represent the displayed result set | Added native `q` form metadata, URL replacement on submit, initial URL restoration, and URL-driven re-search | Shared-URL E2E passes on desktop and mobile |
| Keyboard users had no fast entry to content | Repeated navigation had to be traversed before the workspace | Added `본문으로 건너뛰기` before the main landmark and an explicit focus target | Dedicated 375px focus capture and E2E pass |
| The first focused skip-link capture was cropped | It could not prove that a keyboard user could read the control | Removed the reveal transition so focus makes the entire link visible immediately, then recaptured | Both independent final visual reviewers PASS |
| Korean text split `가수 연결` across lines at 375px | The phrase read unnaturally on the narrow layout | Kept the semantic phrase together and shortened the surrounding clause | Fresh 375px capture and CJK visual review PASS |
| A stale test expected a hidden favorite-track select to be disabled after a new search | The assertion reflected the prior always-visible form, not the corrected progressive-disclosure contract | Changed the assertion to require that the control is absent after selection clears | Delayed-response regression scenario passes |
| Initial Playwright startup collided with the local test environment | A default port and Gradle startup path caused incomplete test transcripts | Used isolated/reused local Next servers for the completed browser runs; product assertions remained unchanged | Complete desktop and mobile logs recorded above |

## Reproduction checklist

Run from `frontend/`:

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

For the focused deterministic workflow suite:

```powershell
.\node_modules\.bin\playwright.cmd test tests/e2e/fixture-review.spec.ts tests/e2e/connected-music-desk.spec.ts --project=desktop --workers=1
.\node_modules\.bin\playwright.cmd test tests/e2e/fixture-review.spec.ts --project=mobile --workers=1
```

Before comparing results, record the current commit SHA, operating system, Node version, test project, viewport, and whether the run uses live providers or deterministic intercepted responses. Do not compare the E2E elapsed time with the GraphRAG verifier microsecond benchmark: they measure different systems.

## Follow-up metrics worth adding

These are intentionally not reported as current results because instrumentation does not exist yet:

- Live Notion write/update/archive success rate and duplicate-prevention rate in a dedicated test database.
- MusicBrainz search and track-fetch p50/p95 latency, timeout rate, cache hit rate, and 429 rate.
- Personal GraphRAG recommendation coverage, evidence-path completeness, novelty rate, and user acceptance/skip rate.
- Archive-confirmation cancellation rate, which can reveal accidental-click risk without recording personal content.
- Accessibility audits for keyboard-only completion time and screen-reader announcement correctness.

Every future metric entry should state its source, sample size, collection window, provider mode, and whether it is measured or fixture-declared.
