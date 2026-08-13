# Grounded LLM GraphRAG Verification (2026-08-13)

## Scope

This verification covers the opt-in explanation layer only. It does not claim a
live external LLM call, vector retrieval, Microsoft GraphRAG global/community
search, or an improvement to recommendation quality.

## Observed checks

| Boundary | Result | Evidence |
| --- | --- | --- |
| Provider response is strict JSON and cites only supplied labels | Pass | `OpenAiCompatibleGroundedExplanationGeneratorTest` |
| Unknown citation labels fail closed | Pass | `LLM_RESPONSE_UNGROUNDED` test |
| Disabled provider preserves deterministic recommendation | Pass | `ConnectedMusicServiceTest` |
| Public recommendation/insight/discovery responses omit Notion page IDs | Pass | controller and BFF contract tests |
| Browser calls explanation only after explicit click | Pass | Playwright desktop and mobile scenario |
| Existing relisten and discovery cards remain after generated explanation | Pass | same Playwright scenario |

## Commands run

```powershell
backend\gradlew.bat -p backend test --tests '*ConnectedMusicApiControllerTest' `
  --tests '*ConnectedMusicServiceTest' --tests '*OpenAiCompatibleGroundedExplanationGeneratorTest' `
  --tests '*GroundedLlmPropertiesTest' --no-daemon

Set-Location frontend
pnpm typecheck
pnpm test
pnpm build
$env:TASK12_UI_E2E_PORT='3315'
$env:TASK12_UI_E2E_BACKEND_PORT='18185'
.\node_modules\.bin\playwright.CMD test tests\e2e\connected-music-desk.spec.ts --grep=grounded --workers=1
```

The focused backend suite, frontend typecheck, 44 frontend unit tests, production
build, and two viewport browser scenario passed. The browser screenshots are at
`frontend/test-results/connected-music-desk-Given-244a2-hanging-the-recommendations-{desktop,mobile}/grounded-explanation.png`.

## What requires a later measured run

No provider credential was configured for this local verification. Before enabling
the feature remotely, run a non-production provider test with a fixed model and
temperature `0`, then record real end-to-end p50/p95, input/output tokens, cost,
citation precision, unsupported-claim rate, and listener useful-rate. The service
must remain disabled if that evaluation is missing.
