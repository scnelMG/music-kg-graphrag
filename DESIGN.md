# Music KG Connected Design System

## 0. Research log

- **Reference study:** Toss Design System’s official [color foundations](https://tossmini-docs.toss.im/tds-mobile/foundation/colors/) and [component guidance](https://developers-apps-in-toss.toss.im/design/components.html) informed the cool-neutral base, clear action hierarchy, generous target sizes, and short task-first copy. No Toss code, assets, logo, or product copy is used.
- **Existing-product audit:** the previous warm paper treatment made the connected service feel like a static journal and exposed too much implementation detail. The redesign keeps the real Notion, MusicBrainz, and GraphRAG flows but makes one next action visible at a time.
- **Design choice:** Clear Blue A1 — a calm, bright personal music space led by **오늘의 한 장**, with record management as a separate, deliberate task.

## 1. Product promise

Music KG helps its owner find an album, save a real listening record to Notion, and return to one well-grounded album for today. Public visitors can search real MusicBrainz albums and tracks; private records and recommendations never render until owner access is confirmed.

## 2. Content hierarchy

1. **Today:** one relisten recommendation, if the graph has adequate evidence.
2. **Discover:** at most two new albums, secondary to today’s choice.
3. **Find:** real album and artist search with the selected album’s actual tracks.
4. **Record:** selected-album fields only, then the owner’s paginated Notion archive.

Technical implementation, graph paths, scores, provider health, sync internals, IDs, and optional LLM explanation are never shown by default. A native disclosure exposes only a concise user-facing reason on request. No empty state may fabricate an album, cover, artist, record, score, or recommendation.

## 3. Visual language

The surface is light, clear, and quietly tactile rather than glossy. It uses a cool gray page background, elevated white surfaces, a single confident blue action color, and restrained semantic feedback. The UI must not use gradients, glass effects, emoji icons, metric dashboards, status pills, heavy card grids, chat chrome, or copied brand treatments.

### Tokens

| Role | Token | Value |
| --- | --- | --- |
| Page | `--bg` | `#f2f4f6` |
| Surface | `--surface` | `#ffffff` |
| Subtle surface | `--surface-subtle` | `#f7f9fc` |
| Primary text | `--text` | `#191f28` |
| Secondary text | `--text-secondary` | `#4e5968` |
| Tertiary text | `--text-tertiary` | `#697586` |
| Border | `--line` | `#e5e8eb` |
| Action | `--blue` | `#3182f6` |
| Action pressed | `--blue-strong` | `#1b64da` |
| Selection | `--blue-soft` | `#e8f3ff` |
| Success | `--success` | `#20a56a` |
| Warning | `--warning` | `#d88900` |
| Danger | `--danger` | `#e2484d` |
| Focus | `--focus` | `#0064ff` |

Spacing uses a 4px scale. Radius is purposeful: 12px for controls, 16px for grouped rows, and 24px for the main workspace. Shadows are limited to surface elevation and focus; they never decorate non-interactive text.

## 4. Typography and copy

- UI: `Pretendard Variable`, `Noto Sans KR`, `Geist`, sans-serif.
- Reading rationale: `Noto Serif KR`, Georgia, serif.
- Use Korean task language: “오늘 다시 들을 앨범”, “음반 찾기”, “기록 남기기”.
- One heading per decision area; supporting copy is one sentence unless a recovery path needs two.
- Korean uses `word-break: keep-all`; short predicates and object phrases use `.keep-together` only where it prevents a semantic break.

## 5. Primitives and states

### Header and navigation

The header is a compact product identity and owner-aware navigation. Public and checking states show only public search navigation; owner-only controls appear only after explicit owner confirmation.

### Today card

The first private recommendation is a single elevated surface with cover, album, artist, favourite-track context, and a single “기록 보기” action when a matching saved record exists. Its reason is hidden in `<details>` under “왜 이 앨범인가요?”. If evidence is insufficient, show a short honest recovery state instead of a substitute recommendation.

### Discovery list

At most two MusicBrainz discovery rows appear below the today card. They are visually lighter than the today card and never show ranking scores by default.

### Search and record

Search is a real GET form with `q` in the URL. Results use stable image dimensions and a non-shifting selected state. The record editor is progressively disclosed only after a user selects an album. Save, archive, and restore are separate confirmed Notion writes with focus management and honest results.

### Feedback

Loading is short, local, and text-backed. Errors identify the unavailable user task and offer a retry. A personal workspace retry invalidates every older recommendation, graph, explanation, sync, and record response before the new request begins; stale private data may never remain on screen.

## 6. Responsive and accessibility contract

- `375px`: one reading column; recommendation appears before search; controls remain at least 44px tall.
- `768px`: one calm reading column with compact grouped controls.
- `1280px`: search/record and recommendation occupy a balanced two-column workspace; DOM order stays recommendation then work so mobile has the correct priority.
- The page owns scrolling; panels never create nested scrolling.
- `main#main-content` has a visible skip link, focusable target, semantic headings, labels, live regions, disabled states, and a 3px focus outline.
- Motion is limited to meaningful opacity/transform feedback and is removed under `prefers-reduced-motion`.

## 7. Truthfulness and data boundaries

All search results and covers come from MusicBrainz-related catalog responses. Personal records come from the connected Notion database. Recommendation decisions come from the personal graph and catalog evidence; an optional LLM may only summarize already selected evidence. The frontend never creates client-side fallback records, recommendations, covers, or scores.

## 8. Accepted debt and handoff

`ConnectedMusicDesk` still coordinates several real API states. This redesign keeps its API boundary stable to reduce Notion-write risk. If future product work expands the home further, extract the recommendation workspace as its own typed component before adding new behavior. Every UI change must be verified at 375px, 768px, and 1280px with interaction, loading/error, and CJK checks.
