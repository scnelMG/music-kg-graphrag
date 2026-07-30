# Frontend Demo UI Plan

Todo 1 only plans the future frontend. It does not create product screens, routes, components, or a runnable frontend app.

## Audience

Primary reviewers are backend, data, AI/AX, public-sector IT, and bank IT reviewers. They need to see operational judgment: source provenance, sync safety, database/graph boundaries, validation behavior, and GraphRAG grounding.

## Product Posture

- Portfolio data/AI backend demo UI, not a consumer music discovery app.
- Evidence-first and dense but organized.
- Album art is supporting metadata, not the dominant visual object.
- Dry-run and no-evidence behavior are first-class, not hidden edge cases.

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

### 4. Notion Dry-Run Sync Status

- Show the Notion create/update payload in dry-run form.
- Highlight fields that would change and fields intentionally left untouched.
- Show missing env, disabled writes, conflict, no-change, success, and API-error states.

### 5. Knowledge Graph Evidence Path Viewing

- Display graph paths as ordered readable text plus optional visual adjacency.
- Show source identifiers, query file references, and provenance labels.
- Support no-evidence and malformed/failed-query states.

### 6. GraphRAG Recommendation Answer

- Ask a constrained natural-language question.
- Return answer text only when graph/vector evidence exists.
- Show evidence paths, vector hits, confidence/coverage marker, and insufficient-evidence fallback.
- Never present unsupported free-form recommendations as valid answers.

## Responsive Plan

| Width | Layout | Behavior |
| --- | --- | --- |
| 320px-639px | Mobile stack | One active task at a time; evidence panels follow active content; no horizontal scroll. |
| 640px-1023px | Tablet split | Search/review workflow above or left, evidence/sync context beside or below depending on content width. |
| 1024px+ | Desktop command center | Left workflow column, right evidence/status column, persistent command bar. |

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
