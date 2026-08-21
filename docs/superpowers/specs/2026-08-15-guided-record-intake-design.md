# Guided Album Record Intake Design

## Goal

Remove the manual cross-site research required to add an album or EP to the
owner's Notion archive. The owner completes the whole task inside this service:
search, choose the correct release group, confirm a real track, add the small
amount of personal context, and confirm a Notion write.

## Product decision

- **MusicBrainz is the catalog source.** It supplies real artist credits,
  release-group type, release dates, release-group IDs, and track lists.
- **Notion is the personal-record source of truth.** It contains the owner's
  final listening record and remains the target of create/update/archive/
  restore writes.
- **No play-count integration.** MusicBrainz does not provide the owner's or
  the internet's album listening counts. External streaming-history integration
  is explicitly out of scope for this workflow.
- The record scope is `Album` and `EP`. Singles, live releases, and
  compilations stay discoverable but are not default choices.
- The owner always makes the final release choice. The product may rank a
  recommended choice; it must never silently select or write one.

## Owner workflow

```text
Search album or artist (Korean or original title)
  -> grouped result candidates
  -> recommended release group + alternative releases
  -> actual track list
  -> favourite track, sentiment, ownership form
  -> duplicate check
  -> explicit Notion write confirmation
```

### 1. Search

The search field accepts an artist, album title, or both. A search is a URL
state (`q`) so it can be refreshed or shared. The app sends one server-side
catalog request; the browser never talks directly to MusicBrainz.

### 2. Candidate choice

Each result is a factual release-group row with actual cover when the Cover Art
Archive has one, title, all artist credits, original release date, and type.
Missing cover remains `표지 없음`; no generated or popularity-placeholder art
is allowed.

The ranking label `추천` is deterministic and explains only the choice rule:

1. `Album` or `EP` before other release-group types.
2. Original release before a later reissue/remaster where the source exposes a
   release date.
3. Exact query/title and artist-credit match before a fuzzy match.
4. Existing Notion MBID match is marked `기록 있음`, never offered as a silent
   duplicate create.

The recommended candidate is visually first but alternatives remain equally
selectable. Reissues/remasters carry a factual release badge; the owner can
pick them when that is the intended edition.

### 3. Personal completion

Selecting a candidate loads its actual track list. The personal editor is
progressively disclosed only then. The owner chooses a favourite track and
adds the configured sentiment and ownership values. All catalog-derived fields
are prefilled and read-only in the editor.

### 4. Safe save and duplicate handling

Before rendering the final confirmation, the BFF checks the release-group MBID
against the current Notion record snapshot. A match changes the action to
`기존 기록 업데이트`; no match is `Notion에 새 기록 저장`.

The existing confirmed-write boundary remains mandatory. The request must carry
the confirmation header; direct or stale duplicate creates are rejected by the
backend. A successful write invalidates the Notion snapshot and refreshes the
archive/recommendation state.

## Architecture boundaries

```text
Owner browser
  -> Next.js BFF (validation, owner-write session, typed contracts)
  -> Spring connected API
      -> MusicBrainz + Cover Art Archive (catalog only)
      -> Notion (personal record read/write)
      -> private GraphDB (owner recommendation evidence only)
```

- MusicBrainz requests are queued, cached, typed, and identified with a
  meaningful User-Agent. The server honors its one-request-per-second policy.
- The visitor route stays catalog-only. It must not mount the editor, invoke
  Notion mutation APIs, or expose record-matching status.
- GraphRAG is not on the intake critical path. It consumes the saved personal
  record only after Notion confirms the write.

## UX and accessibility

- Results use a stable ruled list with 64px cover space; selection must not
  shift row geometry.
- The first recommendation is a ranking hint, not an opaque score. The UI says
  `앨범/EP · 원본 발매 우선` rather than exposing internal weights.
- Keyboard flow is search -> result -> track -> personal fields -> confirmed
  save. A visible focus outline, labels, live recovery text, and no nested
  scroll regions are required.
- Mobile uses a one-column flow. Covers reserve square space, and long Korean
  title/artist combinations wrap without clipping or lone particles.

## Failure behavior

- Catalog rate limit/network failure: preserve the query, show a retry path,
  do not create a speculative result.
- No cover: keep the candidate usable with the honest missing-cover tile.
- No tracks: do not enable record save until a track selection is possible;
  explain the catalog-data limitation.
- Notion/GraphDB failure: show a typed recovery state. Never report a saved
  record or refreshed recommendation before its source operation succeeds.

## Out of scope

- YouTube Music scraping, browser automation, or personal-history collection.
- Spotify/Apple/ListenBrainz account connection.
- Global album play counts or popularity used as a personal-taste substitute.
- Automatic Notion writes, generated cover images, or hardcoded album data.

## Acceptance and measurement

### Functional acceptance

1. An owner can search a Korean or original-language album/artist and choose
   an Album or EP without visiting another site.
2. The result exposes real release data and tracks; selecting an alternative
   reissue remains possible.
3. Existing release-group IDs lead to an update, not a duplicate create.
4. A visitor can search catalog music but cannot see duplicate status, private
   fields, Notion records, or write actions.
5. Provider errors and missing art remain truthful and recoverable.

### Product measures

- Median elapsed time: search submit to confirmed record.
- Owner completion rate: candidate selection to confirmed Notion write.
- Duplicate-create rejection rate and false duplicate rate.
- Catalog failure/rate-limit rate and p95 search latency.
- Manual external-search escapes, recorded only as an opt-in local usability
  study note, never by collecting browser history.

The first iteration is successful if it lowers the owner’s median record-entry
time and does not increase duplicate records or provider failures. It does not
claim a recommendation-quality improvement from play-count data.
