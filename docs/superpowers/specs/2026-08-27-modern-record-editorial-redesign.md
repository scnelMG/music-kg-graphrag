# Modern Record Editorial Redesign

## 1. Goal

Turn the existing music archive into a production-grade editorial music product without changing its factual data sources, public and owner privacy boundary, URL structure, or Notion record model. The public experience must feel like a modern independent record publication. The owner experience must feel like the private working side of the same archive, not a separate SaaS dashboard.

## 2. Design read

This is a full visual overhaul of a personal taste archive for design-conscious music listeners. The visual family is modern record editorial: factual album covers, asymmetric composition, precise sans typography, cool monochrome surfaces, and one cobalt accent.

- `DESIGN_VARIANCE: 8`
- `MOTION_INTENSITY: 4`
- `VISUAL_DENSITY: 5`
- Redesign mode: overhaul visuals, preserve content model and information architecture.
- Foundation: Next.js, React, native CSS, semantic design tokens, Phosphor icons.

The current White Archive direction has useful truthfulness and accessibility rules, but the presentation is too narrow, linear, and dependent on repeated headings, rules, and text rows. The redesign keeps factual covers and honest fallback states while replacing the document-like composition.

## 3. Product principles

1. The cover is the product material. Real album covers carry visual interest. No generated album art, decorative photography, gradients, fake screenshots, or fabricated recommendations are used.
2. Discovery is immediate. A visitor sees one grounded album and one clear action in the first viewport.
3. Search is a primary path. It remains visible and understandable without competing with the featured album.
4. Personal data remains private. Public UI never renders private records, Notion identifiers, scores, evidence paths, or write controls.
5. Loading is designed. Every asynchronous region reserves its final geometry and has a truthful skeleton, empty state, and recovery action.
6. The interface is one product. Public, owner, access, legal, loading, and error pages use the same tokens and composition rules.

## 4. Information architecture

Existing routes remain unchanged:

- `/`: public discovery, genre exploration, catalog search, edition and track selection.
- `/owner`: owner authentication.
- `/owner/workspace`: private recommendations, records, catalog search, and Notion writes.
- `/method`, `/privacy`, `/terms`: public trust pages.

Existing form names and URL behavior remain unchanged. The public catalog form keeps the `q` query parameter and the same field order. Existing API contracts, analytics-sensitive IDs, keyboard behavior, local browser likes, and owner session flow remain intact.

## 5. Global visual system

### 5.1 Color

The palette uses cool monochrome neutrals and one cobalt accent.

- Light canvas: cool off-white, not pure white.
- Light elevated surface: a slightly brighter neutral.
- Dark canvas: blue-black charcoal, not pure black.
- Dark elevated surface: a lighter charcoal.
- Text: high-contrast near-black or cool off-white.
- Secondary text: neutral gray that meets WCAG AA.
- Accent: cobalt for links, primary actions, focus, and selected state only.
- Semantic success, warning, and danger colors appear only in real feedback states.

Light and dark tokens follow `prefers-color-scheme`. The page does not invert theme inside individual sections.

### 5.2 Typography

- Display and UI use the native Korean sans stack already present in the project.
- The Noto Serif display treatment is retired from primary headings. It may remain only in long-form recommendation reasons when it materially improves reading.
- Headlines use strong sans weight, restrained scale, tight but safe tracking, and complete Korean phrase wrapping.
- Primary hero headlines remain within two lines on desktop.
- Buttons use one or two short words and never include a dynamic album title.
- Compact cover states use `불러오는 중` or `표지 없음`, not a phrase that can orphan one syllable.

### 5.3 Shape and material

- Album covers use a small four-pixel radius.
- Controls and inputs use a consistent twelve-pixel radius.
- Content panels use a consistent sixteen-pixel radius only where a bounded interactive surface is required.
- Broad generic card shadows are prohibited. Cover shadows are allowed because they express the physical record object.
- Repeated horizontal rules are reduced. Spacing, background contrast, and grouped compositions establish hierarchy.

### 5.4 Layout

- Global content width is 1280 pixels with responsive gutters.
- Public desktop uses an asymmetric twelve-column grid.
- Owner desktop uses a wide working grid with a focused task column and cover-based context.
- Below 768 pixels every asymmetric region becomes a strict single column.
- The document owns vertical scrolling. Only the personal cover rail may scroll horizontally.

## 6. Public experience

### 6.1 Global header

A compact single-line header contains the archive wordmark, `음악 찾기`, `추천 방식`, and `아카이브 관리`. On mobile, secondary trust navigation moves to the footer while the brand and owner entry remain visible. Header height stays below 72 pixels.

### 6.2 Featured discovery stage

The first viewport is a two-part editorial stage:

- One large factual cover with a fixed aspect ratio and reserved loading geometry.
- Album title, artist, one concise recommendation reason, progress, and short actions.

The primary action is `수록곡 보기`. Secondary actions are `넘기기` and `좋아요`. Dynamic album titles never appear inside button labels.

The next album is represented by a subtle offset cover layer when another factual album exists. Advancing uses an overlapping crossfade and short horizontal transform. The outgoing and incoming content overlap during the transition so the stage never becomes blank. Reduced motion switches instantly without transform.

Keyboard ArrowLeft and ArrowRight behavior remains scoped to the focused discovery stage. Browser-local likes remain local and are presented as a compact cover shelf below the stage.

### 6.3 Genre exploration

The four supported genres become a responsive editorial collection rather than a row of small outlined buttons. Each item has a strong genre name, a short functional description, and a clear hover or selected state. The component uses no invented imagery. It relies on typography, cover fragments from returned factual results when available, and the shared surface system.

Selecting a genre keeps the stage geometry stable, replaces the factual album set, and exposes a local loading or error state without shifting later content.

### 6.4 Catalog search

Search is a wide, high-contrast composition with the visible label above the input. The primary button label remains `음반 찾기`.

Results use a cover-led responsive collection:

- Two columns on wide screens.
- One column below 768 pixels.
- Stable cover geometry.
- Album title, artist, year, type, and one short `열기` action.
- Selected state uses cobalt border and background tint without changing geometry.

Consonant-only input, empty results, long input, provider failure, and retry states receive distinct messages. Long input must explain the valid maximum instead of using a generic service failure.

Edition and track selection becomes a focused detail workspace immediately after the selected result. It keeps factual release data, bounded pagination, and current selection semantics.

## 7. Owner experience

### 7.1 Owner access

The centered floating login card is removed. The access page becomes a balanced editorial split:

- A concise explanation of the private archive and browser-only session behavior.
- A focused authentication form with the existing field name, order, and submit behavior.

On mobile the explanation precedes the form. The main heading uses a complete phrase and avoids the previous `나의 Notion 기록을 엽니다` mixed-language emphasis.

### 7.2 Owner workspace

The owner workspace begins with the same global header and a compact connection message. The primary sequence is:

1. Recent records as a factual cover wall or horizontal rail.
2. One grounded album for today with clear reason disclosure.
3. Catalog search and album selection.
4. Record editor and explicit save confirmation.
5. Existing archive management and restore flow.

When an album is selected, its detail and record workflow becomes the dominant task surface. Private records retain honest missing-cover fallbacks. Long record collections use grouped cover-based rows and bounded pagination instead of an unbroken thin-rule ledger.

Owner access denial uses the same access composition with a short complete heading, clear recovery copy, and one return action.

## 8. Trust pages and footer

Method, privacy, and terms pages use a wider reading frame with a compact in-page contents list on desktop and a single column on mobile. Existing legal meaning is preserved. Korean clauses are grouped with markup that prevents auxiliary predicates and short particles from being orphaned.

The footer contains the service description and exactly the three existing trust links. It remains visually secondary and uses the same theme tokens.

## 9. State and motion contract

- Cover skeletons reserve the exact final width and height.
- Discovery, genre, search, editions, tracks, records, and owner checks each have local loading, empty, error, and ready states.
- No full-page spinner is introduced.
- No animation changes layout properties.
- Discovery crossfade uses opacity and transform for at most 180 milliseconds.
- Buttons use a subtle pressed transform.
- All automatic motion is disabled under `prefers-reduced-motion`.
- Font loading and data insertion must keep CLS below 0.1.

## 10. Accessibility

- Existing skip link, `main#main-content`, heading hierarchy, labels, live regions, and keyboard operation remain.
- Every interactive target is at least 44 by 44 pixels.
- Focus uses one visible cobalt outline with at least three-pixel contrast separation.
- Light and dark text, input, placeholder, button, and error colors meet WCAG AA.
- Album art keeps factual alternative text. Loading and missing states expose concise accessible labels.
- Focus order follows the visible task order at every breakpoint.

## 11. Performance

- No new runtime design dependency is required.
- Existing Phosphor icons and native CSS are reused.
- Above-the-fold cover space is reserved and primary factual cover loading remains prioritized.
- Later cover images remain lazy.
- No scroll listeners, parallax, canvas, backdrop blur, or animated filters are added.
- Target Lighthouse values are LCP below 2.5 seconds, CLS below 0.1, INP below 200 milliseconds, and accessibility 100.

## 12. Test and acceptance matrix

Automated checks:

- Existing frontend unit tests pass.
- New component tests assert short action labels, deterministic long-query guidance, preserved public and owner boundaries, and stable semantic landmarks.
- TypeScript check passes.
- Production build passes.
- React Doctor has no new source errors.

Browser checks at 375, 768, and 1280 pixels:

- Public loading, ready, genre, English search, Korean search, Jamo guidance, long input, selected album, deck rest, deck transition, deck settled, and liked shelf.
- Owner access, denial, connected workspace, selected record, save confirmation, archive confirmation, and restore confirmation.
- Method, privacy, and terms.
- Light and dark system themes.
- Keyboard focus order, reduced motion, no horizontal overflow, and no CJK orphaning or clipping.
- Console contains no unexpected errors or warnings.
- Network requests match expected routes and status handling.

The redesign is complete only when the fresh browser captures show real component output, Lighthouse meets the stated targets, and the visual QA review finds no blocking product or evidence defect.
