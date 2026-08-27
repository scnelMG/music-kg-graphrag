# Music KG Modern Record Editorial Design System

## 0. Research log

- Product audit: 38 responsive QA captures from 2026-08-27 showed a reliable semantic structure but a narrow document layout, repeated rules, generic access card, long dynamic action labels, CJK orphaning, and a blank discovery transition midpoint.
- Existing system: White Archive established factual-cover truthfulness, public and owner separation, one cobalt action color, explicit focus, and honest loading or missing-cover states. These contracts remain.
- Taste routing: `design-taste-frontend`, the frontend redesign reference, and designpowers Lane B/C were applied. The selected direction is modern record editorial, not SaaS, dashboard, glass, or marketing-page styling.
- Interaction reference: beui.dev `action-swap` informed overlapping incoming and outgoing layers, short blur or opacity swaps, interruptible actions, and a reduced-motion instant path. The project adapts the mechanism with native CSS because Motion is not a dependency.
- Asset decision: real catalog album covers are the visual material. No generated cover, stock photo, decorative illustration, or fabricated recommendation is allowed.

## 1. Product promise and people

The service helps a visitor discover one grounded album, explore a small set of real genres, and search factual catalog releases. The owner uses the same product language to reopen private listening records and manage confirmed Notion writes.

### Inclusive personas

- Public listener: wants an immediate album, a clear reason, and a fast path to tracks without understanding the graph or providers.
- Archive owner: wants recent records, one useful recommendation, reliable search, and explicit save, archive, and restore confirmations.
- Keyboard or low-vision listener: needs visible focus, logical DOM order, stable layouts, high contrast, and no hidden pointer-only action.
- Motion-sensitive or cognitively loaded listener: needs short plain labels, local feedback, predictable recovery, and a complete reduced-motion path.

## 2. Distinctive direction

Modern Record Editorial places a real cover inside a cool, ink-like publication grid. The memorable moment is an album changing inside a stable physical stage while its cover, title, reason, and actions remain readable. The atmosphere comes from cover material, cool tonal layers, asymmetric whitespace, and one cobalt action ramp.

- `DESIGN_VARIANCE: 8`
- `MOTION_INTENSITY: 4`
- `VISUAL_DENSITY: 5`
- Theme: system light and dark through semantic tokens, never section-level inversion.
- Anti-references: generic SaaS cards, cream craft palettes, AI-purple gradients, glass, equal feature grids, emoji, oversized serif manifestos, fake album art, status-pill walls, and decorative motion.

## 3. Tokens

### Color

Light mode:

| Role | Token | Value |
| --- | --- | --- |
| Canvas | `--canvas` | `#f4f6f8` |
| Primary surface | `--surface` | `#fbfcfd` |
| Elevated surface | `--surface-elevated` | `#ffffff` |
| Muted surface | `--surface-muted` | `#e9edf2` |
| Primary ink | `--text` | `#121821` |
| Secondary ink | `--text-secondary` | `#4e5a68` |
| Tertiary ink | `--text-tertiary` | `#6b7683` |
| Rule | `--line` | `#d8dee6` |
| Strong rule | `--line-strong` | `#b9c3cf` |
| Cobalt | `--accent` | `#245bd6` |
| Cobalt hover | `--accent-strong` | `#1645b5` |
| Cobalt soft | `--accent-soft` | `#e4ecff` |

Dark mode:

| Role | Token | Value |
| --- | --- | --- |
| Canvas | `--canvas` | `#0d131b` |
| Primary surface | `--surface` | `#121a24` |
| Elevated surface | `--surface-elevated` | `#182231` |
| Muted surface | `--surface-muted` | `#202c3b` |
| Primary ink | `--text` | `#f2f5f8` |
| Secondary ink | `--text-secondary` | `#b7c0cb` |
| Tertiary ink | `--text-tertiary` | `#96a3b2` |
| Rule | `--line` | `#2c3949` |
| Strong rule | `--line-strong` | `#455468` |
| Cobalt | `--accent` | `#76a0ff` |
| Cobalt hover | `--accent-strong` | `#9bbaff` |
| Cobalt soft | `--accent-soft` | `#1b315f` |

Semantic feedback tokens use green, amber, and red only for actual success, warning, and danger states. All text and control combinations must meet WCAG AA.

### Spacing

The base unit is 4 pixels. CSS uses named tokens from `--space-1` through `--space-24`. Page gutters are 20 pixels at 375, 24 pixels at 768, and 32 pixels at 1280. Primary section spacing ranges from 48 to 96 pixels according to hierarchy, not mathematical repetition.

### Type

- UI and display: `Malgun Gothic`, `Apple SD Gothic Neo`, `Noto Sans KR`, system sans-serif.
- Editorial reason only: self-hosted `Noto Serif KR Variable`, then Georgia and serif fallback.
- Display: `clamp(2.6rem, 6vw, 5.8rem)`, weight 750, line height 0.98, balanced wrap.
- Section: `clamp(1.7rem, 3vw, 2.6rem)`, weight 750, line height 1.08.
- Body: 1rem with 1.65 line height and maximum 65 characters.
- Caption: 0.8125rem with tabular numbers where values change.
- Supporting text is tokenized as micro, label, wordmark, supporting, emphasis, card title, rail title, subsection, intro, album title, and responsive display roles. Components never introduce one-off font sizes.
- Korean uses `word-break: keep-all`, `overflow-wrap: break-word`, and `text-wrap: pretty`. Bound noun and predicate phrases use `.keep-phrase`; intentional title lines use `.title-line`.

### Shape and depth

- Cover radius: 4 pixels.
- Input and button radius: 12 pixels.
- Bounded interactive panel radius: 16 pixels.
- Shadows belong to factual covers only. They use a cool tinted two-layer shadow and a one-pixel rim.
- Page sections use tonal shifts and whitespace. Repeated broad card shadows are prohibited.

## 4. Layout and responsive rules

- The global shell is at most 1280 pixels wide.
- Global navigation is one line and at most 72 pixels high on desktop.
- The public feature stage uses an asymmetric twelve-column grid with a larger cover field and a focused copy field.
- Catalog results use two columns at 768 and above, one column below.
- Owner context may use a cover rail and split work area above 900 pixels. Selected record tasks become one focused column.
- Below 768 pixels every asymmetric region becomes a strict single column. No accidental horizontal scrolling is allowed.
- The document owns vertical scrolling. The personal cover rail is the only intentional horizontal scroll surface.
- Full-height access pages use `min-height: 100dvh`, never `height: 100vh`.

## 5. Reusable primitives and states

### Archive navigation

One compact landmark with brand, music search, method, and owner entry. Mobile keeps the brand and owner entry visible and moves secondary trust navigation to the footer. Current location is conveyed with `aria-current`, text weight, and color.

States: default, hover, focus, current.

### Editorial masthead

One short promise and one supporting sentence. Public title is `오늘, 다시 들을 한 장`. Owner title is `나의 음악 기록`. No duplicate owner CTA or micro-status strip.

States: public, owner, service.

### Album art

A fixed one-to-one frame containing the factual image, compact `불러오는 중` status, or honest `표지 없음` fallback. Row, shelf, and feature sizes share the same anatomy. Primary feature art has priority; later covers remain lazy.

States: loading, loaded, missing, failed.

### Discovery stage

A fixed-size feature region containing cover, album metadata, one reason, progress, and the short actions `수록곡 보기`, `넘기기`, and `좋아요`. Incoming and outgoing presentations overlap during transition. The stage never collapses or becomes empty at the midpoint.

States: loading, ready, exiting, entering, complete, reduced-motion.

### Genre collection

Exactly four factual exploration buttons: 드림 팝, 인디 록, 포크, 전자음악. Each carries a short functional description, not invented artwork. The selected genre is explicit without changing geometry.

States: default, hover, focus, selected, loading, error, empty.

### Catalog search and album result

The visible label remains above the `q` input. The result is a bounded cover-led item with title, artist, date, type, and one short action. Dynamic titles never enter action labels.

States: idle, loading, guidance, results, empty, error, selected, disabled.

### Access composition

An editorial explanation beside the existing authentication form. It replaces the centered SaaS card and uses the same navigation, tokens, form labels, and feedback language as the rest of the service.

States: idle, submitting, error, owner denial.

### Record confirmation

Save, archive, and restore remain explicit inline sections with focus restoration. Confirmations never become false modal dialogs.

States: pending, submitting, success, error, cancelled.

### Trust article

A readable article frame with shared navigation, one title, grouped sections, and the existing three trust links. Desktop may show a compact contents list; mobile remains one column.

## 6. Motion and interaction

- The discovery swap adapts beui.dev `action-swap`: incoming and outgoing layers overlap in a stable frame.
- Spatial movement is at most 12 pixels. Opacity and transform are the only animated properties.
- State duration is 180 milliseconds with `cubic-bezier(.16, 1, .3, 1)`.
- Controls use a 120 millisecond pressed transform of `scale(.98)` or `translateY(1px)`.
- Hover motion appears only on interactive elements and always communicates affordance.
- Under `prefers-reduced-motion: reduce`, transform animations stop and state commits immediately. Loading uses static geometry and calm opacity feedback only.
- Transitions remain interruptible. A second action is disabled only for the active 180 millisecond swap window.

## 7. Accessibility and adaptive constraints

- Preserve the skip link, `main#main-content`, semantic heading order, visible labels, live regions, disabled states, and native buttons or links.
- Minimum control target is 44 by 44 pixels.
- Focus is a three-pixel cobalt outline with a three-pixel offset.
- Do not rely on color alone for selection, current location, or feedback.
- Public and private focus order follows visible task order at 375, 768, 1280, and 200 percent zoom.
- Respect system light or dark preference and reduced motion. The product does not require a manual theme control.
- Loading, empty, error, and recovery copy uses plain Korean and states the next available action.
- Static screenshots cannot prove keyboard, screen-reader, or motion behavior. These behaviors require real browser execution.

## 8. Truthfulness, performance, and accepted debt

### Truthfulness

Catalog search and covers originate in the catalog. Personal records originate in the connected Notion database. Public recommendations originate in the redacted graph projection. The frontend never invents an album, cover, score, evidence path, or recommendation. Browser likes remain local and never become a server request.

### Performance contract

- No new runtime design dependency.
- LCP below 2.5 seconds, CLS below 0.1, and INP below 200 milliseconds.
- Lighthouse accessibility target is 100.
- Feature cover geometry is reserved before data and image completion.
- Remote art uses factual source URLs with explicit dimensions and high priority only for above-the-fold art.
- Offscreen collections may use `content-visibility: auto` with intrinsic size when browser evidence shows a benefit.

### Accepted debt

- Remote factual cover availability is not controlled by this service. A failed image must degrade to `표지 없음` without layout shift.
- Owner authentication remains a setup-token workflow. This redesign improves its composition but does not replace the authentication model.
- Music provider latency is an operational concern. The UI must remain stable and recoverable, but this design project does not change backend rate limiting.

No accessibility debt is accepted. Any major keyboard, contrast, CJK, motion, or cognitive-recovery defect blocks completion.

## 9. Verification and handoff

Every UI change requires real-browser evidence at 375, 768, and 1280 pixels for public and owner boundaries, light and dark modes, reduced motion, loading, empty, error, transition, selection, and confirmation states.

The final gate includes:

1. Frontend unit tests, typecheck, production build, React Doctor, and full Playwright suite.
2. Console, network, accessibility tree, keyboard focus, zoom, and overflow inspection.
3. Real-browser Lighthouse mobile and desktop runs.
4. Fresh visual QA screenshots and dual review.
5. Designpowers critique, accessibility, heuristic, and persona walkthrough against the same build.
6. Final review-work verdict with all major findings repaired or explicitly blocking.
