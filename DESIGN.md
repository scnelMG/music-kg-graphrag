# Music KG GraphRAG Design System

## 1. Atmosphere & Identity

The interface is an evidence review desk for technical reviewers, not an "AI dashboard" or consumer music app. It should read like a carefully typeset research workspace: calm paper-like surfaces, high-information source records, and one clear task in focus. The memorable interaction is opening an answer and seeing its evidence trail unfold as an ordered reading path, not as a glowing chatbot response.

Design read: an operational portfolio/demo for backend, data, AI/AX, public-sector IT, and bank IT reviewers, with an editorial utilitarian language. The direction uses the user-supplied Gesso and Select references only as a prompt for considered creative intent and restraint; it does not copy either site's layout, words, assets, or brand treatment.

### Non-negotiable visual guardrails

- Do not use emoji, sparkle/brain/robot metaphors, AI-purple/blue gradients, neon, glass cards, generic three-card marketing grids, or decorative graph nodes.
- Do not use a text box distinguished only by a left border. Use a titled inset region, a table row, or a full-width notice with an explicit action instead.
- Do not use the common dot-plus-rounded-pill status pattern. Present state as an inline `label: value` metadata cell, a compact square flag, or a sentence with a specific recovery action.
- Keep "AI" out of product chrome. The user-facing term is **evidence synthesis**; model/provider details belong in a collapsible provenance record.
- Use one consistent filled/bold icon family, preferably `@phosphor-icons/react`. If project constraints require `react-icons`, use its Phosphor set. Do not mix weights or fall back to emoji.
- When Korean is enabled, Korean is a first-class interface language, not English copy with particles added afterward. Preserve identifiers, numerical values, source names, direct quotations, and ontology terms exactly; write the surrounding sentence natively in Korean.

## 2. Color

### Palette

| Role | Token | Light | Dark | Usage |
| --- | --- | --- | --- | --- |
| Surface/primary | `--surface-primary` | `#f7f5f0` | `#161715` | App background |
| Surface/secondary | `--surface-secondary` | `#fffefb` | `#1d1e1b` | Panels and grouped regions |
| Surface/elevated | `--surface-elevated` | `#efede6` | `#272824` | Popovers and selected evidence panels |
| Text/primary | `--text-primary` | `#1c1d1a` | `#f4f2ec` | Headings and primary content |
| Text/secondary | `--text-secondary` | `#4e5049` | `#c9c8c0` | Explanatory content |
| Text/muted | `--text-muted` | `#74766d` | `#9fa198` | Metadata and timestamps |
| Border/default | `--border-default` | `#d8d6ce` | `#44463f` | Panel borders |
| Border/subtle | `--border-subtle` | `#e8e6df` | `#30322d` | Dividers |
| Accent/primary | `--accent-primary` | `#315e72` | `#91c6d8` | Primary action, selected evidence, links |
| Accent/hover | `--accent-hover` | `#204655` | `#c0e5ef` | Hover and active evidence states |
| Status/success | `--status-success` | `#137333` | `#57c785` | Successful save/sync validation |
| Status/warning | `--status-warning` | `#a15c00` | `#f2b84b` | Dry-run and weak-evidence states |
| Status/error | `--status-error` | `#b3261e` | `#ff8a80` | Validation and sync errors |
| Status/info | `--status-info` | `#0b57d0` | `#8ab4f8` | Informational notices |

### Rules

- Use warm monochrome surfaces with mineral blue as the only non-semantic accent. Semantic success/warning/error colors are not brand accents.
- Avoid AI-purple gradients, neon-only styling, consumer music palettes, decorative album-art dominance, and mood-board visuals.
- Color never carries state alone; pair color with text labels, icons, or structural changes.
- All text/background pairs must meet WCAG AA contrast, targeting AAA for body text where feasible.

## 3. Typography

| Level | Size | Weight | Line Height | Tracking | Usage |
| --- | --- | --- | --- | --- | --- |
| Display | `2rem` | 700 | 1.15 | 0 | App title or demo page title only |
| H1 | `1.5rem` | 700 | 1.25 | 0 | Primary workspace heading |
| H2 | `1.25rem` | 650 | 1.3 | 0 | Panel headings |
| H3 | `1rem` | 650 | 1.4 | 0 | Card and row group headings |
| Body | `1rem` | 400 | 1.55 | 0 | Default text |
| Body/sm | `0.875rem` | 400 | 1.5 | 0 | Secondary details |
| Caption | `0.75rem` | 550 | 1.4 | 0 | Labels, source tags, timestamps |
| Mono | `0.875rem` | 500 | 1.5 | 0 | IDs, query snippets, evidence paths |

Font stack:

- Primary: `"Geist", "Helvetica Neue", Arial, sans-serif`
- Editorial: `"Newsreader", Georgia, serif` for page-level questions and quoted review excerpts only
- Mono: `"Geist Mono", "SFMono-Regular", Consolas, monospace`

Locale stacks:

- Korean UI: `"Pretendard Variable", "Noto Sans KR", sans-serif`
- Korean editorial: `"Noto Serif KR", serif` for page-level questions and quoted review excerpts only
- Korean identifiers: `"IBM Plex Mono KR", "D2Coding", monospace`

Korean typesetting rules:

- Set `lang="ko"` for Korean screens; use `word-break: keep-all` with `overflow-wrap: anywhere` only for unbroken IDs and URLs. Do not insert manual line breaks into Korean sentences.
- Keep source IDs, score values, model names, MusicBrainz names, and quoted review text untransformed. Provide Korean labels around them instead of inventing translated identifiers.
- Prefer short declarative UI copy in one consistent polite-neutral register: `검토 저장`, `근거를 찾지 못했습니다`, `입력한 내용은 그대로 남아 있습니다.` Do not use exclamation marks, "결론적으로", "시사하는 바", or translationese such as `~을 통해` when a direct verb is available.
- Do not imitate naturalness with slang or arbitrary variation. Generated Korean answers may vary sentence rhythm, but every factual clause must remain traceable to the attached evidence IDs.

Body text must never render below 14px. Display text is reserved for true page-level headings, not compact panels.

## 4. Spacing & Layout

All spacing derives from a 4px base unit.

| Token | Value | Usage |
| --- | --- | --- |
| `--space-1` | 4px | Tight icon-label spacing |
| `--space-2` | 8px | Compact row gaps |
| `--space-3` | 12px | Input and chip padding |
| `--space-4` | 16px | Default panel padding |
| `--space-5` | 20px | Dense section gap |
| `--space-6` | 24px | Comfortable panel gap |
| `--space-8` | 32px | Major group separation |
| `--space-10` | 40px | Page-level rhythm |

Layout strategy:

- Mobile stack: one-column task flow with source/evidence panels beneath the active task.
- Tablet split: primary action column plus contextual evidence column.
- Desktop review desk: a narrow context rail, a central work sheet for search/review, and an evidence inspector that opens only when there is something to inspect. It must not default to a permanent generic left sidebar.
- No horizontal scrolling at 320px width or 200% zoom.
- Interactive targets must be at least 44px by 44px with an 8px minimum gap where adjacent.

## 5. Components

### ContextRail

- **Structure**: product wordmark, current workspace, keyboard-accessible task links, and a compact environment record.
- **Variants**: expanded desktop, collapsed tablet, drawer mobile.
- **States**: default, current-page, focus, unavailable.
- **Accessibility**: landmark navigation and visible current-page text; no icon-only navigation without labels.

### WorkSheet

- **Structure**: a single active task with an editorial page title, a short factual instruction, its form/list, and a footer action area.
- **Variants**: search, candidate review, saved review, no-result, configuration-required.
- **States**: default, focus, dirty, saving, saved, error.
- **Accessibility**: semantic heading order; errors remain adjacent to their field and preserve entered text.

### SearchPanel

- **Structure**: album search input, source scope selector, submit action, result summary.
- **Variants**: idle, loading, results, empty, rate-limited, error.
- **States**: default, hover, active, focus, disabled, loading, empty, error.
- **Accessibility**: validation text is programmatically associated with input; loading and result count use live region announcements.

### CandidateList

- **Structure**: structured result rows with title, artist, source IDs, cover availability, confidence marker.
- **Variants**: compact, evidence-expanded, selected.
- **States**: default, hover, active, focus, selected, no-cover, conflict.
- **Accessibility**: selectable rows expose selected state; source IDs remain copyable text.

### ReviewForm

- **Structure**: rating label, personal review, favorite track/manual fallback, ownership input.
- **Variants**: draft, saved, invalid, conflict.
- **States**: default, focus, dirty, saving, saved, error.
- **Accessibility**: exact rating labels are visible text, not color-only chips; errors preserve typed input.

### OperationalRecord

- **Structure**: a compact definition list for environment, dry-run result, last attempt, and next available action; the diff opens inline below it.
- **Variants**: dry-run-clean, dry-run-conflict, missing-env, disabled.
- **States**: loading, success, warning, error, no-changes.
- **Accessibility**: each state is written in plain language with recovery guidance, never conveyed by a dot, hue, or generic badge alone.

### EvidencePathViewer

- **Structure**: graph path list, source IDs, SPARQL query reference, provenance labels.
- **Variants**: path-list, query-preview, no-evidence.
- **States**: collapsed, expanded, focused, copied, empty, error.
- **Accessibility**: graph paths are readable as ordered text, not only visual nodes.

### EvidenceSynthesisPanel

- **Structure**: answer, claim-to-evidence map, graph paths, vector hits, and an insufficient-evidence explanation.
- **Variants**: answered, partial-evidence, insufficient-evidence, provider-missing.
- **States**: asking, answered, no-evidence, error.
- **Accessibility**: answer updates use polite live regions; citations are keyboard reachable.
- **Korean copy**: use a short evidence-led answer, then `근거` as a plain section label. If evidence is insufficient, state what is missing and the next safe action; never pad the answer with generic summaries.

## 6. Motion & Interaction

| Type | Duration | Easing | Usage |
| --- | --- | --- | --- |
| Micro | 100ms | ease-out | Button press and row selection |
| Standard | 180ms | ease-in-out | Panel expand/collapse |
| Feedback | 150ms | ease-out | Save/sync status change |

Rules:

- Motion must communicate state, hierarchy, or feedback. No decorative loops, chatbot typing theatrics, or ambient visual effects.
- The micro-interaction budget is three patterns only: input focus and valid selection, evidence-inspector expand/collapse, and saved/copied confirmation. Each uses the token durations below and transform/opacity only.
- Do not use easter eggs, confetti, parallax, cursor-following effects, or animation that implies a result was saved, synchronized, or verified before the backend confirms it.
- Respect `prefers-reduced-motion` by removing non-essential transitions.
- Loading states use skeleton rows or inline progress text, not generic spinners.
- Error format: what happened plus the recovery action.
- The flow must define empty, loading, error, no-evidence, and missing-config states before product screens are built.

## 7. Depth & Surface

Depth strategy: borders plus tonal shifts, with a faint paper-grain texture at low opacity only if it remains readable and respects reduced-transparency preferences.

| Level | Treatment | Usage |
| --- | --- | --- |
| Base | `--surface-primary` | Page background |
| Panel | `1px solid var(--border-default)` on `--surface-secondary` | Primary work regions |
| Evidence | `1px solid var(--accent-primary)` on `--surface-elevated` | Selected evidence or active path |
| Conflict | `1px solid var(--status-warning)` | Dry-run conflict or weak evidence |
| Error | `1px solid var(--status-error)` | Blocking validation issue |

Cards stay at 8px radius or less. Avoid cards inside cards; repeated rows and panels should use dividers, table-like lists, or unframed layouts when possible. A status is a labeled datum, not a pill.
