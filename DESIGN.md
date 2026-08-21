# Music KG White Archive Design System

## 0. Research log

- **Toss:** its public component guidance informed the deliberate primary-action hierarchy, consistent interaction states, and concise task copy. No Toss code, assets, logo, or copy is used.
- **Linear:** its design-refresh writing informed the low-noise rule: hierarchy is felt through typography, whitespace, and rules before containers. No Linear code, assets, logo, or copy is used.
- **Surface audit:** the former cool-gray canvas, equal floating cards, and duplicate visitor access prompts made a personal archive read like an unfinished SaaS setup page. The replacement is a continuous white archive whose only rich material is factual album art.
- **Direction:** **White Archive**. It is a bright music-library page with ink typography, actual covers, thin archival rules, and one reserved blue for action. The memorable object is the listener’s real-cover shelf, not an abstract dashboard panel.

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

1. A masthead and one compact owner-space link.
2. A redacted recommendation band: one public discovery and up to two additional discovery rows when the connected graph has sufficient evidence. It never identifies a private relisten or record.
3. MusicBrainz album search and selected public tracks.

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

- UI: `Pretendard Variable`, `Noto Sans KR`, `Geist`, sans-serif.
- Archive display and recommendation reason: `Noto Serif KR`, Georgia, serif only.
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
Release editions are disclosed in bounded groups of at most 20. A server recommendation is labelled, but a new record never selects it automatically: the listener explicitly chooses the factual edition before tracks and saving become available. Existing records reopen their stored edition. `발매판 더 보기` appends one truthful cursor page; a failed next page remains visible with a retry action, and the control never renders an unbounded release list.

### Recommendation

The first relisten is the primary album composition, with a large factual cover, one action, and a native reason disclosure. Discovery has at most two lightweight rows. Weak evidence gets an honest recovery state instead of a substitute record.

### Record management and feedback

The editor appears only after selection. Save, archive, and restore remain distinct confirmed Notion writes with focus restoration and truthful result text. Loading and recovery are local, text-backed, and may not leave stale private data visible.

## 6. Responsive and accessibility contract

- `375px`: 20px gutters, cover rail shows partial next cover and snaps horizontally; all other content is one reading column.
- `768px`: one calm reading column with compact controls and cover rail.
- `1280px`: masthead and rail span full width; recommendation and search can split below while DOM/task order stays meaningful.
- The document owns scrolling; no panel creates nested scrolling.
- `main#main-content` exposes a skip link, semantic headings and labels, live regions, disabled states, and a 3px focus outline. All controls are at least 44px.
- Motion is limited to state feedback and omitted for `prefers-reduced-motion`.

## 7. Truthfulness and data boundaries

Search results and covers originate in the catalog. Personal records originate in the connected Notion database. Recommendation decisions originate in personal graph and catalog evidence. An optional LLM may summarize only already-selected evidence. The frontend never invents fallback records, covers, recommendations, or scores. The public insights endpoint returns only its redacted graph recommendation projection: album title, artist, release-group ID, factual cover URL, and release date when known. It omits Notion page identifiers, favourite tracks, ownership, scores, evidence paths or methods, retrieval/seed metadata, taste aggregates, and sync internals. Private record DOM and all Notion mutation API calls are owner-only.

## 8. Accepted debt and handoff

`ConnectedMusicDesk` is a composition boundary only. Catalog search/edition/track state, personal workspace reads, record mutations, recommendation presentation, and catalog presentation live in focused modules under the 250-line source ceiling. Notion writes remain isolated behind explicit confirmation and the server-side duplicate lookup.

Every UI change requires browser checks at 375px, 768px, and 1280px for public and owner boundaries, CJK wrapping, overflow, focus, empty real-data behavior, and write confirmations.
