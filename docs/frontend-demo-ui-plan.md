# Frontend Demo UI Plan

Todo 1 only plans the future frontend. It does not create product screens, routes, components, or a runnable frontend app.

## Audience

Primary reviewers are backend, data, AI/AX, public-sector IT, and bank IT reviewers. They need to see operational judgment: source provenance, sync safety, database/graph boundaries, validation behavior, and GraphRAG grounding.

## Product Posture

- Portfolio data/AI backend demo UI, not a consumer music discovery app.
- Evidence-first and dense but organized.
- Album art is supporting metadata, not the dominant visual object.
- Dry-run and no-evidence behavior are first-class, not hidden edge cases.
- Evidence synthesis is a bounded capability inside the review flow, not a generic chat destination.

## Visual Direction and Anti-Pattern Guardrails

- Use an editorial review-desk composition: compact context rail, one central work sheet, and a conditional evidence inspector. Avoid a default full-height left navigation plus a wall of dashboard cards.
- Use a warm neutral palette with mineral blue as the only non-semantic accent. No purple/blue AI gradients, neon, glassmorphism, oversized music imagery, or decorative graph visualizations.
- Use Geist for UI, Newsreader only for page-level questions/review quotations, and Geist Mono for provenance IDs, scores, timestamps, and query references. Do not use Inter.
- Use one bold/fill icon family (`@phosphor-icons/react`, or its `react-icons` equivalent if required); no emoji and no mixed icon weights.
- Replace left-rule callout boxes with titled inset regions, definition lists, or full-width actionable notices.
- Replace dot-plus-pill statuses with explicit metadata cells such as `Sync: dry-run only`, square flags, or recovery sentences. Color is supplementary, never the sole state signal.
- Use "evidence synthesis" in visible UI. Model/provider identifiers appear only in the provenance disclosure.

## Korean Language Quality

- Korean screens declare `lang="ko"` and use `Pretendard Variable` (fallback `Noto Sans KR`) for UI, `Noto Serif KR` only for editorial questions/quoted reviews, and a Korean-capable monospace fallback for IDs.
- Preserve IDs, scores, source names, direct quotations, MusicBrainz names, and ontology terms exactly. Translate their surrounding labels, never the identifier itself.
- Write concise, evidence-first Korean: `근거를 찾지 못했습니다. 질문 범위를 좁히거나 검토 기록을 추가하세요.` Do not use translationese, mechanical `첫째/둘째/셋째`, filler conclusions, excessive English parentheticals, decorative punctuation, or AI-style overexplaining.
- Generated Korean answers must be claim-addressable: each factual sentence maps to visible evidence IDs. A Korean fluency pass must never rewrite evidence, numbers, named entities, or the refusal condition.
- Visual QA includes Korean long/short labels, unbroken identifiers, 200% zoom, and mobile line wrapping. Korean sentences must use natural wrapping; IDs may wrap only as an emergency overflow behavior.

## Design Reference Operating Rules

- `getdesign.md` is an optional comparative library, not a replacement for this project's `DESIGN.md`. Before a new screen is implemented, the executor may inspect one relevant reference for component anatomy or spacing, then must map the useful part to existing project tokens. Do not copy a brand's logo, text, assets, or complete layout.
- Design Spells is approved only as a source of interaction ideas for the three defined patterns: field/selection feedback, evidence-inspector expand/collapse, and confirmed save/copy feedback. Motion remains optional, keyboard-safe, and disabled or reduced under `prefers-reduced-motion`.
- Wall of Portfolios is useful only for a later portfolio case-study review. It does not define this product UI and is not an implementation dependency.
- Do not import 21st.dev components wholesale. Its registry can copy third-party code and dependencies into the repository; use it only after a specific component has passed dependency, accessibility, license, visual-token, and bundle-size review. There is no approved 21st.dev dependency for the first implementation slice.
- Do not send private previews, personal review data, authenticated pages, API responses, or secrets to an external URL-to-design-audit service. The project uses local Playwright screenshots and documented visual QA instead.

## Planned Flows

### 1. Album Search

- Enter album title and optional artist.
- Show search state, rate-limit-safe loading state, empty state, and source error state.
- Results expose MusicBrainz IDs, release dates, artist names, cover-art availability, and confidence/provenance.

### 2. Candidate Selection

- Select one canonical candidate from normalized results.
- Show candidate details without exposing raw external API response shape.
- Display conflicts or low-confidence matches as review-required states.

### 3. Personal Review Input

- Capture rating label, personal review text, favorite track or manual fallback, and ownership.
- Preserve exact Notion-compatible labels later defined by backend/domain contracts.
- Save flow must include draft, saving, saved, validation error, and conflict states.

### 4. Notion Dry-Run Operational Record

- Show the Notion create/update payload in dry-run form.
- Highlight fields that would change and fields intentionally left untouched.
- Show missing env, disabled writes, conflict, no-change, success, and API-error states as a labeled operational record with the exact recovery step.

### 5. Knowledge Graph Evidence Path Viewing

- Display graph paths as ordered readable text plus optional visual adjacency.
- Show source identifiers, query file references, and provenance labels.
- Support no-evidence and malformed/failed-query states.

### 6. Evidence Synthesis Answer

- Ask a constrained natural-language question.
- Return answer text only when graph/vector evidence exists.
- Show an answer claim-to-evidence map, graph paths, vector hits, explicit coverage text, and insufficient-evidence fallback.
- Never present unsupported free-form recommendations as valid answers.

## Responsive Plan

| Width | Layout | Behavior |
| --- | --- | --- |
| 320px-639px | Mobile stack | One active task at a time; evidence panels follow active content; no horizontal scroll. |
| 640px-1023px | Tablet split | Search/review workflow above or left, evidence/sync context beside or below depending on content width. |
| 1024px+ | Desktop review desk | Compact context rail, central work sheet, and a conditional evidence inspector; no permanent generic dashboard sidebar. |

At 200% zoom, content remains usable without horizontal scrolling. Touch targets are at least 44px by 44px.

## State Matrix

| Area | Required states |
| --- | --- |
| Search | idle, loading, results, empty, error, rate-limited |
| Candidate selection | default, focused, selected, low-confidence, no-cover, source-conflict |
| Review save | draft, invalid, saving, saved, conflict, error |
| Notion dry-run | missing-env, disabled, no-change, diff-ready, conflict, API-error |
| KG evidence | loading, paths-found, expanded, copied, no-evidence, query-error |
| GraphRAG answer | asking, answered, partial-evidence, insufficient-evidence, provider-missing, error |

## Accessibility Requirements

- WCAG AA contrast minimum for text and UI boundaries.
- Visible focus indicators on every interactive element.
- Keyboard-only completion of all planned flows.
- Screen-reader-readable evidence paths; graph information cannot rely on node diagrams alone.
- Loading, save, sync, and answer updates use live-region announcements.
- Error states include recovery instructions and preserve user input.
- No information communicated by color alone.

## Deferred Until Later Todos

- React or other frontend app setup.
- Component implementation.
- API wiring.
- Graph visualization implementation.
- Product screen visual QA.
