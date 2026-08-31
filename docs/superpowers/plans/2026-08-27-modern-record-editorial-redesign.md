# Modern Record Editorial Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild every user-facing surface as a coherent, cover-led modern record editorial product while preserving routes, factual data, owner privacy, and write semantics.

**Architecture:** Keep the current server and client data boundaries. Introduce one shared navigation shell, split the global CSS by responsibility, and recompose the public discovery, catalog, owner, and trust surfaces without changing API contracts. Existing hooks remain the source of state; components receive clearer presentation boundaries and stable loading geometry.

**Tech Stack:** Next.js 15, React 19, TypeScript, native CSS, Phosphor Icons, Vitest, Playwright, Lighthouse.

## Global Constraints

- Preserve `/`, `/owner`, `/owner/workspace`, `/method`, `/privacy`, and `/terms`.
- Preserve public query parameter `q`, input field order, API contracts, owner session flow, and Notion record semantics.
- Keep public and private data boundaries unchanged.
- Use only factual album covers and truthful missing-cover states.
- Use cool monochrome tokens with one cobalt accent and system light or dark preference.
- Use `DESIGN_VARIANCE: 8`, `MOTION_INTENSITY: 4`, and `VISUAL_DENSITY: 5`.
- Keep every interactive target at least 44 by 44 pixels.
- Keep LCP below 2.5 seconds, CLS below 0.1, INP below 200 milliseconds, and Lighthouse accessibility at 100.
- Do not add a runtime design dependency.
- Do not render an em dash or en dash in visible product copy.

---

### Task 1: Lock the editorial content and state contract

**Files:**
- Modify: `frontend/tests/album-art-loading.test.ts`
- Modify: `frontend/tests/e2e/catalog-search-feedback.spec.ts`
- Modify: `frontend/tests/e2e/public-discovery-deck.spec.ts`
- Modify: `frontend/tests/e2e/ui-design.spec.ts`
- Modify: `frontend/tests/e2e/service-readiness.spec.ts`

**Interfaces:**
- Consumes: current public and owner fixture routes.
- Produces: regression expectations for compact cover status, short actions, long-query guidance, theme tokens, stable discovery geometry, and trust-page landmarks.

- [ ] **Step 1: Write failing component and browser assertions**

Add assertions equivalent to:

```ts
expect(markup).toContain("불러오는 중");
expect(markup).not.toContain("표지 불러오는 중");
await expect(page.getByRole("button", { name: "수록곡 보기" })).toBeVisible();
await expect(page.getByRole("button", { name: /수록곡 I 수록곡 보기/ })).toHaveCount(0);
await expect(page.getByText(/검색어는 .*자 이하로 입력/)).toBeVisible();
await expect(page.locator(".discovery-stage-frame")).toHaveCSS("min-height", /[1-9]/);
await expect(page.locator("html")).toHaveAttribute("lang", "ko");
```

- [ ] **Step 2: Run targeted tests and confirm the new expectations fail**

Run:

```bash
pnpm --dir frontend test -- album-art-loading.test.ts
pnpm --dir frontend exec playwright test tests/e2e/catalog-search-feedback.spec.ts tests/e2e/public-discovery-deck.spec.ts tests/e2e/ui-design.spec.ts tests/e2e/service-readiness.spec.ts --project=chromium
```

Expected: at least the compact loading copy, short action, long-query guidance, and new structural landmark assertions fail against the old UI.

- [ ] **Step 3: Keep the tests focused on behavior instead of framework output**

Remove assertions that require a serialized `loading="eager"` attribute or old `.today-recommendation` counts. Assert `fetchpriority`, visible content, and semantic landmarks instead.

- [ ] **Step 4: Commit the contract tests**

```bash
git add frontend/tests/album-art-loading.test.ts frontend/tests/e2e/catalog-search-feedback.spec.ts frontend/tests/e2e/public-discovery-deck.spec.ts frontend/tests/e2e/ui-design.spec.ts frontend/tests/e2e/service-readiness.spec.ts
git commit -m "test: define editorial archive experience"
```

### Task 2: Build the shared editorial foundation

**Files:**
- Create: `frontend/components/archive-navigation.tsx`
- Modify: `frontend/components/archive-masthead.tsx`
- Modify: `frontend/components/archive-footer.tsx`
- Modify: `frontend/components/album-art.tsx`
- Modify: `frontend/app/layout.tsx`
- Replace: `frontend/app/styles.css`
- Create: `frontend/app/styles/foundation.css`
- Create: `frontend/app/styles/public.css`
- Create: `frontend/app/styles/owner.css`
- Create: `frontend/app/styles/responsive.css`

**Interfaces:**
- Produces: `ArchiveNavigation({ mode }: { mode: "owner" | "public" | "service" })`, shared semantic tokens, global interaction states, compact album-art status, and stable responsive breakpoints.
- Consumes: existing routes and `ArchiveMasthead` mode values.

- [ ] **Step 1: Add the shared navigation component**

Use one-line desktop navigation with the existing routes and no new data dependency:

```tsx
type ArchiveNavigationProps = Readonly<{ readonly mode: "owner" | "public" | "service" }>;

export function ArchiveNavigation({ mode }: ArchiveNavigationProps): React.JSX.Element {
  return <nav className="archive-navigation" aria-label="주요 탐색">
    <Link className="archive-wordmark" href="/">음악 아카이브</Link>
    <div className="archive-navigation-links">
      <Link href="/#candidate-search">음악 찾기</Link>
      <Link href="/method">추천 방식</Link>
      {mode === "owner" ? <span aria-current="page">개인 기록</span> : <Link href="/owner">아카이브 관리</Link>}
    </div>
  </nav>;
}
```

- [ ] **Step 2: Recompose masthead and footer around the navigation**

Keep the existing public and owner promises but shorten them to complete Korean phrases. Public H1 becomes `오늘, 다시 들을 한 장`. Owner H1 becomes `나의 음악 기록`. The footer keeps exactly the three trust links.

- [ ] **Step 3: Make album-art loading compact and geometry-stable**

Render `불러오는 중` inside the fixed cover frame and keep `표지 없음` for missing or failed covers. Do not change the factual image URL or alt text.

- [ ] **Step 4: Split global CSS by responsibility**

`styles.css` contains only ordered imports:

```css
@import "./styles/foundation.css";
@import "./styles/public.css";
@import "./styles/owner.css";
@import "./styles/responsive.css";
```

`foundation.css` owns tokens, body, typography, navigation, controls, cover primitives, focus, and footer. `public.css` owns discovery, genre, search, and catalog. `owner.css` owns access, insights, editor, and record archive. `responsive.css` owns the 900, 767, and 639 pixel collapses plus reduced motion.

- [ ] **Step 5: Define light and dark tokens without section inversion**

Use semantic variables in `:root` and override only the variables under `@media (prefers-color-scheme: dark)`. Keep cobalt as the single accent in both modes.

- [ ] **Step 6: Run the component test, typecheck, and build**

```bash
pnpm --dir frontend test -- album-art-loading.test.ts layout-cover-art.test.ts
pnpm --dir frontend typecheck
pnpm --dir frontend build
```

Expected: all commands exit zero.

- [ ] **Step 7: Commit the shared foundation**

```bash
git add frontend/components/archive-navigation.tsx frontend/components/archive-masthead.tsx frontend/components/archive-footer.tsx frontend/components/album-art.tsx frontend/app/layout.tsx frontend/app/styles.css frontend/app/styles
git commit -m "feat: build editorial archive foundation"
```

### Task 3: Rebuild public discovery and catalog search

**Files:**
- Create: `frontend/components/public-genre-collection.tsx`
- Modify: `frontend/components/public-discovery-home.tsx`
- Modify: `frontend/components/public-discovery-deck.tsx`
- Modify: `frontend/components/public-music-desk.tsx`
- Modify: `frontend/components/music-catalog-section.tsx`
- Modify: `frontend/components/use-public-catalog-workflow.ts`
- Modify: `frontend/app/styles/public.css`
- Modify: `frontend/app/styles/responsive.css`

**Interfaces:**
- Produces: `PublicGenreCollection` with the existing four `PublicGenre` keys, a geometry-stable `PublicDiscoveryDeck`, concise catalog actions, and deterministic long-query guidance.
- Consumes: existing `usePublicInsights`, `usePublicGenreExplore`, `usePublicCatalogWorkflow`, and `CatalogAlbum` values.

- [ ] **Step 1: Extract genre exploration into a focused component**

```tsx
type PublicGenreCollectionProps = Readonly<{
  readonly activeGenre: PublicGenre | null;
  readonly disabled: boolean;
  readonly onSelect: (genre: PublicGenre) => void;
}>;
```

Render the four existing genres as real buttons with a title and concise description. Do not invent image URLs or new genres.

- [ ] **Step 2: Replace the deck row with an editorial stage**

The stage contains a fixed cover frame, title, artist, reason, progress, `수록곡 보기`, `넘기기`, and `좋아요`. The dynamic album title moves to the heading and never appears in the button label.

- [ ] **Step 3: Replace the blank midpoint with overlapping crossfade state**

Keep both outgoing and incoming album presentation in the same fixed stage frame during the 180 millisecond transition. Animate only opacity and transform. Reduced motion commits immediately.

- [ ] **Step 4: Recompose the liked list as a factual cover shelf**

Use compact cover items and the short action `열기`. Preserve browser-only storage and selection behavior.

- [ ] **Step 5: Recompose search results into a responsive album collection**

Keep each result as a button and retain `aria-pressed`, `catalogIdentity`, priority cover logic, selected tint, artist, date, and type. Render the action as `열기` or `기록 열기` without a long dynamic label.

- [ ] **Step 6: Add deterministic long-query guidance**

In `use-public-catalog-workflow.ts`, validate the existing maximum before the request and set guidance text containing the exact maximum. Keep Jamo handling and provider errors distinct.

- [ ] **Step 7: Run targeted public tests**

```bash
pnpm --dir frontend test
pnpm --dir frontend exec playwright test tests/e2e/catalog-search-feedback.spec.ts tests/e2e/public-discovery-deck.spec.ts tests/e2e/public-discovery-visual.spec.ts tests/e2e/ui-design.spec.ts --project=chromium
pnpm --dir frontend typecheck
```

Expected: unit tests and the targeted public browser suite pass.

- [ ] **Step 8: Commit the public experience**

```bash
git add frontend/components/public-genre-collection.tsx frontend/components/public-discovery-home.tsx frontend/components/public-discovery-deck.tsx frontend/components/public-music-desk.tsx frontend/components/music-catalog-section.tsx frontend/components/use-public-catalog-workflow.ts frontend/app/styles/public.css frontend/app/styles/responsive.css frontend/tests
git commit -m "feat: redesign public music discovery"
```

### Task 4: Recompose owner access, workspace, and trust pages

**Files:**
- Modify: `frontend/components/owner-session-form.tsx`
- Modify: `frontend/components/connected-music-desk.tsx`
- Modify: `frontend/components/personal-cover-rail.tsx`
- Modify: `frontend/components/music-insights-panel.tsx`
- Modify: `frontend/components/record-archive.tsx`
- Modify: `frontend/components/service-page.tsx`
- Modify: `frontend/app/owner/page.tsx`
- Modify: `frontend/app/method/page.tsx`
- Modify: `frontend/app/privacy/page.tsx`
- Modify: `frontend/app/terms/page.tsx`
- Modify: `frontend/app/styles/owner.css`
- Modify: `frontend/app/styles/responsive.css`

**Interfaces:**
- Consumes: existing owner token field, workspace hooks, Notion records, record write confirmations, and trust-page copy.
- Produces: shared editorial access layout, complete Korean headings, cover-led owner context, and readable trust pages.

- [ ] **Step 1: Replace the floating owner card with an editorial access split**

Keep the existing input and submit behavior. Compose privacy guidance beside the form on desktop and above it on mobile. Use the heading `개인 음악 기록 열기`.

- [ ] **Step 2: Recompose owner access denial**

Use `개인 기록에 접근할 수 없습니다` as one complete heading with one recovery action. Keep visitor access isolated from private components.

- [ ] **Step 3: Make recent records the owner visual context**

Keep factual covers, missing-cover states, click behavior, and horizontal mobile scroll. On desktop, use a cover wall or wider rail with consistent item geometry.

- [ ] **Step 4: Rebalance insights, search, editor, and archive**

Today’s grounded album is the first decision area. Catalog selection becomes dominant when active. Record archive actions remain explicit and confirmations stay inline with focus restoration.

- [ ] **Step 5: Recompose trust pages without changing legal meaning**

Add the shared navigation, a compact contents list generated from the existing sections, and readable section grouping. Protect short Korean predicate phrases with `keep-together` spans only where the existing captures showed orphaning.

- [ ] **Step 6: Run owner and trust browser tests**

```bash
pnpm --dir frontend exec playwright test tests/e2e/owner-readiness.spec.ts tests/e2e/connected-music-desk.spec.ts tests/e2e/record-workflow-visual.spec.ts tests/e2e/service-readiness.spec.ts --project=chromium
pnpm --dir frontend typecheck
pnpm --dir frontend build
```

Expected: owner boundary, read-only state, record confirmations, and service pages pass.

- [ ] **Step 7: Commit owner and trust surfaces**

```bash
git add frontend/components frontend/app/owner frontend/app/method frontend/app/privacy frontend/app/terms frontend/app/styles/owner.css frontend/app/styles/responsive.css frontend/tests/e2e
git commit -m "feat: unify owner and trust surfaces"
```

### Task 5: Complete production visual and performance verification

**Files:**
- Modify only when evidence finds a defect: files changed in Tasks 2 to 4.
- Create evidence: `.omo/evidence/editorial-redesign-20260827/`

**Interfaces:**
- Consumes: production build, stable Preview backend, public and owner fixture scenarios.
- Produces: fresh desktop, tablet, mobile, light, dark, reduced-motion, accessibility, network, console, and Lighthouse evidence.

- [ ] **Step 1: Run full static and automated verification**

```bash
pnpm --dir frontend test
pnpm --dir frontend typecheck
pnpm --dir frontend build
pnpm --dir frontend doctor
pnpm --dir frontend test:e2e
```

Expected: all required suites exit zero. Any pre-existing infrastructure failure is recorded separately and may not hide a UI failure.

- [ ] **Step 2: Start the production frontend against the stable Preview backend**

Use the existing environment and owner fixture mechanisms. Do not log backend secrets or owner tokens.

- [ ] **Step 3: Capture the full responsive state matrix**

Capture 375, 768, and 1280 pixel screenshots for public loading, discovery rest, transition midpoint, settled state, every genre, English and Korean search, Jamo guidance, long query, selected album, owner access, owner denial, connected workspace, record confirmations, and all trust pages. Capture light and dark modes plus reduced motion.

- [ ] **Step 4: Inspect browser console, network, accessibility, and overflow**

Require zero unexpected console errors, correct status handling, logical heading and focus order, 44 pixel controls, no horizontal overflow, and no clipped or orphaned Korean text.

- [ ] **Step 5: Run Lighthouse desktop and mobile**

Record performance, accessibility, best practices, SEO, LCP, CLS, and TBT. Fix any CLS above 0.1 or LCP above 2.5 seconds before continuing.

- [ ] **Step 6: Run taste pre-flight and visual QA**

Audit every visible string, CTA wrap, contrast, shape consistency, theme consistency, eyebrow count, loading or empty or error state, factual image boundary, reduced motion, and design-token usage. Invoke the required visual QA reviewers and repeat until both return approval on the same revision.

- [ ] **Step 7: Run final diff and regression checks**

```bash
git diff --check
git status --short
git diff --stat HEAD~4..HEAD
```

Confirm performance and backend work that existed before the redesign remains untouched unless a direct conflict required an explicitly recorded change.

- [ ] **Step 8: Commit final evidence-driven corrections**

```bash
git add frontend
git commit -m "fix: polish editorial archive experience"
```

Only create this commit when Task 5 produced actual corrections. If no correction is required, do not create an empty commit.
