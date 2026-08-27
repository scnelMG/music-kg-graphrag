# Music KG White Archive Design System

## 0. Research log

- **Toss:** its public component guidance informed the deliberate primary-action hierarchy, consistent interaction states, and concise task copy. No Toss code, assets, logo, or copy is used.
- **Linear:** its design-refresh writing informed the low-noise rule: hierarchy is felt through typography, whitespace, and rules before containers. No Linear code, assets, logo, or copy is used.
- **Surface audit:** the former cool-gray canvas, equal floating cards, and duplicate visitor access prompts made a personal archive read like an unfinished SaaS setup page. The replacement is a continuous white archive whose only rich material is factual album art.
- **Direction:** **White Archive**. It is a bright music-library page with ink typography, actual covers, thin archival rules, and one reserved blue for action. The memorable object is the listener’s real-cover shelf, not an abstract dashboard panel.
- **Service-readiness audit:** the 2026-08-26 audit retained White Archive and tightened it into **Cover-led Evidence Archive**. Stable Korean fonts, factual-cover visual fixtures, restrained section labels, public trust pages, and a focused owner record state are now release contracts.

## 1. Product promise

The owner finds a real album, keeps a listening record in Notion, and returns to one grounded album for today. Public visitors may search MusicBrainz albums and tracks and may see redacted, evidence-backed recommendation albums, but never see private records, page identifiers, or write controls.

## 2. Content hierarchy

### Owner

1. A masthead and short connection state.
2. `최근 기록`: a horizontal rail of real Notion records only.
3. `오늘 다시 들을 앨범`: one grounded relisten; new discoveries are limited to two quiet rows.
4. MusicBrainz album search, selected tracks, and the progressive record editor.
5. The existing paginated Notion archive and its explicit save, archive, and restore confirmations.

### Visitor

1. A masthead describing `이 아카이브가 고른 오늘의 음악` and one clearly administrative `아카이브 관리` link.
2. A public discovery deck containing only real Album/EP recommendations from the redacted graph projection. A card moves through a deliberate like/skip decision; browser-local likes never become Notion data.
3. A liked-album list whose actions open factual catalog editions and tracks.
4. Finite real-genre search choices and the actual catalog search remain available beside the deck. If no public recommendation exists, they replace the deck; there is no dead empty recommendation panel.
5. MusicBrainz album search and selected public tracks, aligned to the same reading spine as the deck rather than an empty inherited two-column rail.

Technical IDs, graph paths, scores, provider health, sync internals, and generated-explanation implementation stay out of the default reading path. A factual reason is disclosed only when requested. No empty state can fabricate an album, cover, artist, record, score, or recommendation.

## 3. Visual language

White Archive is a continuous white canvas rather than a gray field of elevated cards. Real album art supplies visual density; rules and whitespace establish the archive structure. The product does not use gradients, glass, emoji, KPI cards, status-pill walls, chat chrome, generic feature grids, color-extracted cover backgrounds, or copied brand treatments.

### Tokens

| Role | Token | Value |
| --- | --- | --- |
| Canvas and surface | `--canvas`, `--surface` | `#ffffff` |
| Utility surface | `--surface-subtle` | `#f7f7f5` |
| Ink / secondary / tertiary text | `--text`, `--text-secondary`, `--text-tertiary` | `#171717`, `#5f5f5a`, `#73736d` |
| Rule / strong rule | `--line`, `--line-strong` | `#e7e6e2`, `#d3d1ca` |
| Action / pressed / selection | `--blue`, `--blue-strong`, `--blue-soft`, `--blue-soft-line` | `#2f6fed`, `#1f56c2`, `#eef4ff`, `#dce8ff` |
| Cover-only elevation | `--shadow-cover` | `0 8px 20px rgb(17 17 17 / 14%)` |

Spacing uses a 4px scale. Controls use an 8px radius; small utility states can use 8px; covers use 4px or less. A broad surface shadow is forbidden.

## 4. Typography and copy

- UI: native `Malgun Gothic`, `Apple SD Gothic Neo`, `Noto Sans KR`, and system sans-serif fallbacks render immediately without a blocking CJK font download.
- Archive display and recommendation reason: self-hosted `Noto Serif KR Variable`, loaded after first paint, then Georgia and system serif fallbacks. Korean and Latin text inside one title must stay in the same family.
- Masthead: `clamp(2.25rem, 5vw, 4.5rem)` with tight tracking and balanced wrapping.
- One heading per decision area. Supporting text is one sentence unless it gives a recovery path.
- Korean uses `word-break: keep-all` and `text-wrap: pretty`; `.keep-together` protects only a short complete phrase.
- Actions use concise verbs: `음반 찾기`, `기록 보기`, `Notion에 저장하기`.

## 5. Primitives and states

### Masthead

An archive title, a single promise, and one truthful owner/connection affordance. Visitor state has exactly one owner-space link; owner state does not repeat an access CTA.

### Cover rail

`PersonalCoverRail` renders only supplied Notion records. It has 1:1 covers (or an honest `표지 없음` tile), title and artist metadata, and click-to-open existing record editing. It returns nothing for an empty archive. At narrow widths it is the only intentional horizontal scroll region and uses scroll snap.

### Search and selected album

Search is a real GET form with `q` in the URL. Results are a ruled list with stable 64px art. Selection adds a 3px blue rule and subtle local tint without changing row geometry; tracks expand in the selected task path.
Korean consonant-only input is stopped locally with a completed-title/artist recovery message before a provider request. A no-result state offers input clear and an actual sample search. The release-edition and track section does not render before an Album/EP is selected.
The first three rendered search-result covers and the primary recommendation cover load at high priority; later results stay lazy. Loading copy describes the listener task (`음반을 찾고 있습니다.`), never the upstream catalog provider.
Catalog type metadata keeps the factual source type internally but displays listener-facing Korean labels (`앨범`, `EP`) in the result list.
Release editions are disclosed in bounded groups of at most 20. A server recommendation is labelled, but a new record never selects it automatically: the listener explicitly chooses the factual edition before tracks and saving become available. Existing records reopen their stored edition. `발매판 더 보기` appends one truthful cursor page; a failed next page remains visible with a retry action, and the control never renders an unbounded release list.

### Recommendation

The first relisten is the primary album composition, with a large factual cover, one action, and a native reason disclosure. Discovery has at most two lightweight rows. Weak evidence gets an honest recovery state instead of a substitute record.

### Public discovery deck

`PublicDiscoveryDeck` is visitor-only. Its cards are deduplicated factual public recommendation albums; it never pads the deck. `좋아요` persists a validated minimal Album record only in the visitor's browser, while `넘기기` advances without persistence. ArrowLeft and ArrowRight operate only while the deck itself has focus and map to skip/like. `수록곡 보기` always hands the same Album object to the catalog selection workflow. When the finite deck ends, `처음부터 보기` restarts only that same factual set. The deck uses opacity and transform feedback for 160ms with no layout-property animation; reduced motion renders the state change without transform.

### Record management and feedback

The editor appears only after selection. Save, archive, and restore remain distinct confirmed Notion writes with focus restoration and truthful result text. Confirmations are named inline sections, not false modal dialogs: the page remains navigable and confirmation focus moves to the affirmative action. Loading and recovery are local, text-backed, and may not leave stale private data visible.

When an owner selects an album, the recommendation panel leaves the active composition so the factual edition, tracks, and record editor become the single decision path. `SelectedAlbumContext`, `RecordEditor`, and `RecordArchive` own selection feedback, writes, and archive management independently. The public route uses `PublicMusicDesk`; owner-only modules never enter the public page bundle.

### Service trust pages and footer

`ArchiveFooter` exposes exactly three public paths: recommendation method, privacy handling, and terms. These pages are server-rendered, share the White Archive typography and spacing, and state current graph/vector/LLM capability without promotional overclaiming. The footer remains quiet and secondary to music discovery.

## 6. Responsive and accessibility contract

- `375px`: 20px gutters, cover rail shows partial next cover and snaps horizontally; all other content is one reading column. The public discovery masthead may wrap its promise naturally across two or three complete Korean phrases and never inherits the owner's compact title clamp.
- `768px`: one calm reading column with compact controls and cover rail.
- `1280px`: masthead and rail span full width; recommendation and search can split below while DOM/task order stays meaningful. The long Notion archive returns to the full document width below that split, so an archive never leaves an empty half-page beside it.
- The document owns scrolling; no panel creates nested scrolling.
- `main#main-content` exposes a skip link, semantic headings and labels, live regions, disabled states, and a 3px focus outline. All controls are at least 44px.
- Motion is limited to state feedback and omitted for `prefers-reduced-motion`.

## 7. Truthfulness and data boundaries

Search results and covers originate in the catalog. Personal records originate in the connected Notion database. Recommendation decisions originate in personal graph and catalog evidence. An optional LLM may summarize only already-selected evidence. The frontend never invents fallback records, covers, recommendations, or scores. The public insights endpoint returns only its redacted graph recommendation projection: album title, artist, release-group ID, factual cover URL, release date when known, and an optional public `sharedMusicBrainzTag` aggregate. It omits Notion page identifiers, favourite tracks, ownership, scores, evidence paths or methods, retrieval/seed metadata, taste aggregates, and sync internals. Browser likes remain local and never become a server request. Private record DOM and all Notion mutation API calls are owner-only.

## 8. Accepted debt and handoff

`ConnectedMusicDesk` is the owner composition boundary only. `PublicMusicDesk` owns the public client island. Catalog search/edition/track state, personal workspace reads, record mutations, recommendation presentation, and catalog presentation live in focused modules under the 250-line source ceiling. Notion writes remain isolated behind explicit confirmation and the server-side duplicate lookup.

Every UI change requires browser checks at 375px, 768px, and 1280px for public and owner boundaries, CJK wrapping, overflow, focus, empty real-data behavior, and write confirmations.
