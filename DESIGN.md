# Music KG GraphRAG Design System

## 1. Atmosphere & Identity

The interface is a quiet evidence command center for technical reviewers. It should feel like a backend/data portfolio demo: compact, legible, inspectable, and trustworthy. The signature is evidence-first density: every recommendation, sync action, and graph claim has a visible path back to source data.

Design read: operational portfolio/demo UI for backend, data, and AI reviewers. Taste reference: technical data-product restraint inspired by ClickHouse-style density, adapted away from neon-heavy branding into a neutral graph/evidence workspace.

## 2. Color

### Palette

| Role | Token | Light | Dark | Usage |
| --- | --- | --- | --- | --- |
| Surface/primary | `--surface-primary` | `#f7f8fa` | `#101214` | App background |
| Surface/secondary | `--surface-secondary` | `#ffffff` | `#171a1f` | Panels and grouped regions |
| Surface/elevated | `--surface-elevated` | `#f1f3f5` | `#20242b` | Popovers and selected evidence panels |
| Text/primary | `--text-primary` | `#15171a` | `#f4f6f8` | Headings and primary content |
| Text/secondary | `--text-secondary` | `#4d5560` | `#b7c0cc` | Explanatory content |
| Text/muted | `--text-muted` | `#6e7783` | `#8f99a8` | Metadata and timestamps |
| Border/default | `--border-default` | `#d7dce2` | `#353b45` | Panel borders |
| Border/subtle | `--border-subtle` | `#e8ebef` | `#272c34` | Dividers |
| Accent/primary | `--accent-primary` | `#6b5b00` | `#d9c438` | Primary action and evidence highlight |
| Accent/hover | `--accent-hover` | `#4f4300` | `#f0da4d` | Hover and active evidence states |
| Accent/secondary | `--accent-secondary` | `#005f73` | `#50b7c8` | Graph path and link accents |
| Status/success | `--status-success` | `#137333` | `#57c785` | Successful save/sync validation |
| Status/warning | `--status-warning` | `#a15c00` | `#f2b84b` | Dry-run and weak-evidence states |
| Status/error | `--status-error` | `#b3261e` | `#ff8a80` | Validation and sync errors |
| Status/info | `--status-info` | `#0b57d0` | `#8ab4f8` | Informational notices |

### Rules

- Use a restrained neutral base with one evidence accent and one graph-link accent.
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

- Primary: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- Mono: `"JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace`

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
- Desktop command center: search/candidate/review workflow on the left, sync/graph/GraphRAG evidence on the right.
- No horizontal scrolling at 320px width or 200% zoom.
- Interactive targets must be at least 44px by 44px with an 8px minimum gap where adjacent.

## 5. Components

### CommandBar

- **Structure**: page title, environment badge, dry-run status, primary utility actions.
- **Variants**: local, fixture-demo, real-service-pending.
- **States**: default, focus, loading, error.
- **Accessibility**: visible labels for all controls, keyboard reachable in DOM order.
- **Motion**: no decorative motion; state transitions use opacity only.

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

### SyncStatusPanel

- **Structure**: Notion dry-run diff, conflict markers, write-disabled status, timestamp.
- **Variants**: dry-run-clean, dry-run-conflict, missing-env, disabled.
- **States**: loading, success, warning, error, no-changes.
- **Accessibility**: conflicts include plain-language guidance and field names.

### EvidencePathViewer

- **Structure**: graph path list, source IDs, SPARQL query reference, provenance labels.
- **Variants**: path-list, query-preview, no-evidence.
- **States**: collapsed, expanded, focused, copied, empty, error.
- **Accessibility**: graph paths are readable as ordered text, not only visual nodes.

### GraphRAGAnswerPanel

- **Structure**: answer, evidence coverage marker, graph paths, vector hits, insufficient-evidence fallback.
- **Variants**: answered, partial-evidence, insufficient-evidence, provider-missing.
- **States**: asking, streaming-disabled, answered, no-evidence, error.
- **Accessibility**: answer updates use polite live regions; citations are keyboard reachable.

## 6. Motion & Interaction

| Type | Duration | Easing | Usage |
| --- | --- | --- | --- |
| Micro | 100ms | ease-out | Button press and row selection |
| Standard | 180ms | ease-in-out | Panel expand/collapse |
| Feedback | 150ms | ease-out | Save/sync status change |

Rules:

- Motion must communicate state, hierarchy, or feedback. No decorative loops.
- Respect `prefers-reduced-motion` by removing non-essential transitions.
- Loading states use skeleton rows or inline progress text, not generic spinners.
- Error format: what happened plus the recovery action.
- The flow must define empty, loading, error, no-evidence, and missing-config states before product screens are built.

## 7. Depth & Surface

Depth strategy: borders plus tonal shifts.

| Level | Treatment | Usage |
| --- | --- | --- |
| Base | `--surface-primary` | Page background |
| Panel | `1px solid var(--border-default)` on `--surface-secondary` | Primary work regions |
| Evidence | `1px solid var(--accent-primary)` on `--surface-elevated` | Selected evidence or active path |
| Conflict | `1px solid var(--status-warning)` | Dry-run conflict or weak evidence |
| Error | `1px solid var(--status-error)` | Blocking validation issue |

Cards stay at 8px radius or less. Avoid cards inside cards; repeated rows and panels should use dividers, table-like lists, or unframed layouts when possible.
