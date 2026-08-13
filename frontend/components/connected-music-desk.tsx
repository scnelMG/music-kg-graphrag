"use client";

import { ArrowRight, MagnifyingGlass, WarningCircle } from "@phosphor-icons/react/ssr";
import ky from "ky";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import { requestBff } from "../lib/review-bff-contract";
import { connectedMusicFailureKind } from "../lib/connected-music-failure";
import { personalWriteConfirmationHeader } from "../lib/personal-write-intent";
import { AlbumArt } from "./album-art";
import { ListeningRecordSection } from "./listening-record-section";

const albumSchema = z.object({
  artist: z.string().min(1),
  artistCredits: z.array(z.string().min(1)).min(1),
  coverUrl: z.string().url().or(z.literal("")),
  firstReleaseDate: z.string(),
  releaseGroupMbid: z.string().min(1),
  title: z.string().min(1)
});
const albumsSchema = z.object({ albums: z.array(albumSchema) });
const ownerSessionSchema = z.object({ owner: z.boolean() });
const formOptionsSchema = z.object({ sentiments: z.array(z.string().min(1)) });
const savedSchema = z.object({
  notionLastEditedAt: z.string().datetime(),
  operation: z.union([z.literal("ARCHIVED"), z.literal("CREATED"), z.literal("RESTORED"), z.literal("UPDATED")])
});
const trackSchema = z.object({
  position: z.number().int().positive(),
  recordingMbid: z.string().min(1),
  title: z.string().min(1)
});
const tracksSchema = z.object({ tracks: z.array(trackSchema) });
const existingRecordSchema = z.object({
  albumTitle: z.string().min(1),
  artist: z.string().min(1),
  artistCredits: z.array(z.string().min(1)).min(1),
  coverUrl: z.string().url().or(z.literal("")),
  favouriteTrack: z.string(),
  lastEditedAt: z.string().datetime(),
  owned: z.boolean(),
  recordHandle: z.string().min(1),
  releaseGroupMbid: z.string(),
  sentiment: z.string()
});
const recordsSchema = z.object({
  nextCursor: z.string().min(1).nullable().default(null),
  records: z.array(existingRecordSchema)
});
const countSchema = z.object({ count: z.number().int().positive(), value: z.string().min(1) });
const personalGraphRetrievalMethodSchema = z.enum([
  "PERSONAL_EVIDENCE_GRAPH_TRAVERSAL",
  "PERSISTENT_GRAPHDB_PERSONAL_EVIDENCE_RETRIEVAL"
]);
const tasteSchema = z.object({
  artists: z.array(countSchema),
  favouriteTracks: z.array(countSchema),
  recordCount: z.number().int().positive(),
  sentiments: z.array(countSchema)
});
const graphTastePayloadSchema = z.object({
  personalRecordCount: z.number().int().positive(),
  relisten: z.array(z.object({
    artist: z.string().min(1),
    coverUrl: z.string().url().or(z.literal("")),
    evidenceMethod: z.literal("PERSONAL_RECORD_RELISTEN"),
    favouriteTrack: z.string(),
    owned: z.boolean(),
    releaseGroupMbid: z.string(),
    title: z.string().min(1)
  })).default([]),
  recommendations: z.array(albumSchema.omit({ artistCredits: true }).extend({
    evidenceMethod: personalGraphRetrievalMethodSchema,
    evidencePaths: z.array(z.object({ relation: z.enum(["RECORDED_BY", "SHARES_MUSICBRAINZ_TAG"]), value: z.string().min(1) })),
    score: z.number().int().positive()
  })),
  retrievalMethod: personalGraphRetrievalMethodSchema,
  seedArtist: z.string()
});
const graphTasteSchema = graphTastePayloadSchema.extend({
  generatedByLlm: z.literal(false)
});
const syncStateSchema = z.object({
  changedRecordCount: z.number().int().nonnegative(),
  lastSuccessfulAt: z.string().datetime().nullable(),
  stale: z.boolean(),
  status: z.enum(["CURRENT", "STALE", "UNINITIALIZED"])
});
const personalInsightsSchema = z.object({
  graphTaste: graphTastePayloadSchema,
  taste: tasteSchema,
  syncState: syncStateSchema.optional().default({
    changedRecordCount: 0,
    lastSuccessfulAt: null,
    stale: false,
    status: "UNINITIALIZED"
  })
});
const explanationStatusSchema = z.enum(["GENERATED", "DISABLED", "UNAVAILABLE"]);
const groundedExplanationSchema = z.object({
  answer: z.string().max(600),
  citations: z.array(z.object({
    artist: z.string().min(1),
    label: z.string().regex(/^E[1-9][0-9]*$/),
    recordTitle: z.string().min(1),
    relation: z.enum(["GRAPH_RETRIEVED", "RECORDED_BY", "SHARES_MUSICBRAINZ_TAG"])
  })),
  status: explanationStatusSchema
}).superRefine((value, context) => {
  const generated = value.status === "GENERATED";
  if (generated && (value.answer.trim().length === 0 || value.citations.length === 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Generated explanation requires citations." });
  }
  if (!generated && (value.answer.length > 0 || value.citations.length > 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Unavailable explanations must not include content." });
  }
});

export type Album = z.infer<typeof albumSchema>;
export type ExistingRecord = z.infer<typeof existingRecordSchema>;
type Taste = z.infer<typeof tasteSchema>;
type GraphTaste = z.infer<typeof graphTasteSchema>;
type SyncState = z.infer<typeof syncStateSchema>;
export type Track = z.infer<typeof trackSchema>;
export type Availability = "error" | "loading" | "ready";
type OwnerAccess = "checking" | "owner" | "visitor";
export type RecordState = "error" | "loading" | "ready";
type SearchState = "empty" | "error" | "idle" | "loading" | "results";
export type SaveState = "idle" | "saving" | "success" | "error";
export type TrackState = "empty" | "error" | "idle" | "loading" | "ready";
type InsightState = "error" | "loading" | "ready";
type GroundedExplanation = z.infer<typeof groundedExplanationSchema>;
type ExplanationState = "disabled" | "generated" | "idle" | "loading" | "unavailable";

function failureText(failure: Readonly<{ code?: string; message: string }>): string {
  switch (connectedMusicFailureKind(failure.code ?? failure.message)) {
    case "notion-not-shared": return "Notion에서 음악 감상 데이터베이스를 열고 이 서비스의 Internal Integration을 연결한 뒤 다시 시도해 주세요.";
    case "notion-unauthorized": return "Notion Integration 토큰 또는 데이터베이스 접근 권한을 확인해 주세요.";
    case "notion-rate-limited": return "Notion 요청이 잠시 많습니다. 잠시 뒤 다시 시도해 주세요.";
    case "catalog-rate-limited": return "MusicBrainz 요청이 잠시 제한되었습니다. 잠시 뒤 다시 검색해 주세요.";
    case "personal-graph-unavailable": return "개인 추천 근거 그래프에 잠시 연결할 수 없습니다. 기록은 변경하지 않았으니 잠시 뒤 다시 시도해 주세요.";
    case "insufficient-history": return "아직 분석할 개인 기록이 없습니다. 첫 음반을 저장하면 취향과 추천 근거가 생깁니다.";
    case "configuration": return "서비스 연결 설정이 아직 완료되지 않았습니다. 서버의 Notion과 MusicBrainz 설정을 확인해 주세요.";
    case "owner-session-required": return "개인 Notion 기록은 소유자 세션에서만 열립니다. /owner에서 소유자 확인을 완료해 주세요.";
    case "unavailable": return "요청을 완료하지 못했습니다. 잠시 뒤 다시 시도해 주세요.";
  }
}

export function existingRecordFor(album: Album, records: readonly ExistingRecord[]): ExistingRecord | undefined {
  return records.find((record) => record.releaseGroupMbid === album.releaseGroupMbid
    || (record.releaseGroupMbid.length === 0
      && record.albumTitle.trim().toLowerCase() === album.title.trim().toLowerCase()
      && record.artist.trim().toLowerCase() === album.artist.trim().toLowerCase()));
}

export function ConnectedMusicDesk(): React.JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [availability, setAvailability] = useState<Availability>("loading");
  const [ownerAccess, setOwnerAccess] = useState<OwnerAccess>("checking");
  const [query, setQuery] = useState(() => searchParams.get("q")?.trim() ?? "");
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [searchMessage, setSearchMessage] = useState("");
  const [albums, setAlbums] = useState<readonly Album[]>([]);
  const [selected, setSelected] = useState<Album | null>(null);
  const [tracks, setTracks] = useState<readonly Track[]>([]);
  const [trackState, setTrackState] = useState<TrackState>("idle");
  const [trackMessage, setTrackMessage] = useState("");
  const [records, setRecords] = useState<readonly ExistingRecord[]>([]);
  const [nextRecordCursor, setNextRecordCursor] = useState<string | null>(null);
  const [loadingMoreRecords, setLoadingMoreRecords] = useState(false);
  const [recordMessage, setRecordMessage] = useState("");
  const [recordState, setRecordState] = useState<RecordState>("loading");
  const [sentiments, setSentiments] = useState<readonly string[]>([]);
  const [sentiment, setSentiment] = useState("");
  const [favouriteTrack, setFavouriteTrack] = useState("");
  const [owned, setOwned] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [archiveCandidate, setArchiveCandidate] = useState<ExistingRecord | null>(null);
  const [archivedRecord, setArchivedRecord] = useState<ExistingRecord | null>(null);
  const [taste, setTaste] = useState<Taste | null>(null);
  const [graphTaste, setGraphTaste] = useState<GraphTaste | null>(null);
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [insightMessage, setInsightMessage] = useState("개인 기록을 불러오는 중입니다.");
  const [insightState, setInsightState] = useState<InsightState>("loading");
  const [groundedExplanation, setGroundedExplanation] = useState<GroundedExplanation | null>(null);
  const [explanationState, setExplanationState] = useState<ExplanationState>("idle");
  const requestGeneration = useRef(0);
  const insightGeneration = useRef(0);
  const explanationGeneration = useRef(0);
  const recordGeneration = useRef(0);
  const trackGeneration = useRef(0);
  const executedSearchQuery = useRef<string | null>(null);

  async function loadInsights(): Promise<void> {
    const generation = insightGeneration.current + 1;
    insightGeneration.current = generation;
    explanationGeneration.current += 1;
    setGroundedExplanation(null);
    setExplanationState("idle");
    setInsightState("loading");
    setTaste(null);
    setGraphTaste(null);
    setSyncState(null);
    setInsightMessage("개인 기록과 추천을 불러오는 중입니다.");
    const outcome = await requestBff(
      ky.get("/api/music/insights", { throwHttpErrors: false }),
      personalInsightsSchema
    );
    if (generation !== insightGeneration.current) return;
    if (outcome.kind === "failure") {
      setInsightState("error");
      setInsightMessage(failureText(outcome));
      return;
    }
    setTaste(outcome.value.taste);
    setSyncState(outcome.value.syncState ?? {
      changedRecordCount: 0,
      lastSuccessfulAt: null,
      stale: false,
      status: "UNINITIALIZED"
    });
    setGraphTaste({
      ...outcome.value.graphTaste,
      generatedByLlm: false,
      relisten: outcome.value.graphTaste.relisten ?? []
    });
    setInsightState("ready");
    setInsightMessage("");
  }

  async function generateGroundedExplanation(): Promise<void> {
    if (graphTaste === null || insightState !== "ready") return;
    const generation = explanationGeneration.current + 1;
    explanationGeneration.current = generation;
    setGroundedExplanation(null);
    setExplanationState("loading");
    const outcome = await requestBff(
      ky.post("/api/music/insights/explanation", { throwHttpErrors: false }),
      groundedExplanationSchema
    );
    if (generation !== explanationGeneration.current) return;
    if (outcome.kind === "failure") {
      setExplanationState("unavailable");
      return;
    }
    setGroundedExplanation(outcome.value);
    switch (outcome.value.status) {
      case "GENERATED":
        setExplanationState("generated");
        return;
      case "DISABLED":
        setExplanationState("disabled");
        return;
      case "UNAVAILABLE":
        setExplanationState("unavailable");
        return;
    }
  }

  async function loadRecords(cursor: string | null = null, append = false): Promise<void> {
    const generation = recordGeneration.current + 1;
    recordGeneration.current = generation;
    if (append) {
      setLoadingMoreRecords(true);
    } else {
      setRecordState("loading");
      setRecordMessage("");
      setRecords([]);
      setNextRecordCursor(null);
    }
    const outcome = await requestBff(ky.get("/api/music/records", {
      searchParams: cursor === null ? undefined : { cursor },
      throwHttpErrors: false
    }), recordsSchema);
    if (generation !== recordGeneration.current) return;
    setLoadingMoreRecords(false);
    if (outcome.kind === "failure") {
      if (!append) {
        setRecordState("error");
        setRecordMessage(failureText(outcome));
      }
      return;
    }
    setRecords((current) => append ? [...current, ...outcome.value.records] : outcome.value.records);
    setNextRecordCursor(outcome.value.nextCursor ?? null);
    setRecordState("ready");
  }

  async function loadMoreRecords(): Promise<void> {
    if (nextRecordCursor === null || loadingMoreRecords) return;
    await loadRecords(nextRecordCursor, true);
  }

  async function reloadPersonalWorkspace(): Promise<void> {
    await Promise.all([loadRecords(), loadInsights()]);
  }

  async function refreshPersonalWorkspace(): Promise<void> {
    const outcome = await requestBff(
      ky.post("/api/music/sync", { throwHttpErrors: false }),
      syncStateSchema
    );
    if (outcome.kind === "failure") {
      explanationGeneration.current += 1;
      setGroundedExplanation(null);
      setExplanationState("idle");
      setTaste(null);
      setGraphTaste(null);
      setSyncState(null);
      setInsightState("error");
      setInsightMessage(failureText(outcome));
      return;
    }
    setSyncState(outcome.value);
    await reloadPersonalWorkspace();
  }

  async function loadTracks(album: Album, existingFavouriteTrack = ""): Promise<void> {
    const generation = trackGeneration.current + 1;
    trackGeneration.current = generation;
    setTrackState("loading");
    setTracks([]);
    setFavouriteTrack("");
    const outcome = await requestBff(
      ky.get(`/api/music/albums/${encodeURIComponent(album.releaseGroupMbid)}/tracks`, { throwHttpErrors: false }),
      tracksSchema
    );
    if (generation !== trackGeneration.current) return;
    if (outcome.kind === "failure") {
      setTrackState("error");
      setTrackMessage(failureText(outcome));
      return;
    }
    const selectedFavourite = outcome.value.tracks.find((track) => track.title === existingFavouriteTrack)?.title ?? "";
    setTracks(outcome.value.tracks);
    setFavouriteTrack(selectedFavourite);
    setTrackState(outcome.value.tracks.length === 0 ? "empty" : "ready");
    setTrackMessage(outcome.value.tracks.length === 0 ? "MusicBrainz에서 선택할 수 있는 수록곡을 찾지 못했습니다."
      : existingFavouriteTrack.length > 0 && selectedFavourite.length === 0 ? "기존 최애곡을 이 발매 그룹의 실제 수록곡에서 찾지 못했습니다. 다시 선택해 주세요."
      : "");
  }

  useEffect(() => {
    void requestBff(ky.get("/api/owner/session", { throwHttpErrors: false }), ownerSessionSchema).then((outcome) => {
      setOwnerAccess(outcome.kind === "failure" || !outcome.value.owner ? "visitor" : "owner");
    });
  }, []);

  useEffect(() => {
    if (ownerAccess !== "owner") return;
    void requestBff(ky.get("/api/music/form-options", { throwHttpErrors: false }), formOptionsSchema).then(async (optionsOutcome) => {
      if (optionsOutcome.kind === "failure") {
        setAvailability("error");
        const message = failureText(optionsOutcome);
        setInsightState("error");
        setInsightMessage(message);
        setRecordState("error");
        setRecordMessage(message);
        return;
      }
      setSentiments(optionsOutcome.value.sentiments);
      setAvailability("ready");
      await reloadPersonalWorkspace();
    });
  }, [ownerAccess]);

  function clearSearch(): void {
    requestGeneration.current += 1;
    trackGeneration.current += 1;
    setAlbums([]);
    setSelected(null);
    setTracks([]);
    setTrackState("idle");
    setFavouriteTrack("");
    setSentiment("");
    setOwned(false);
    setSaveState("idle");
    setSaveMessage("");
    setSearchMessage("");
  }

  async function search(nextQuery = query.trim()): Promise<void> {
    const normalizedQuery = nextQuery.trim();
    if (normalizedQuery.length === 0) return;
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;
    executedSearchQuery.current = normalizedQuery;
    setSearchState("loading");
    trackGeneration.current += 1;
    setAlbums([]);
    setSelected(null);
    setTracks([]);
    setTrackState("idle");
    setFavouriteTrack("");
    setSentiment("");
    setOwned(false);
    setSaveState("idle");
    setSaveMessage("");
    setSearchMessage("");
    const outcome = await requestBff(
      ky.get("/api/music/albums", { searchParams: { q: normalizedQuery }, throwHttpErrors: false }),
      albumsSchema
    );
    if (generation !== requestGeneration.current) return;
    if (outcome.kind === "failure") {
      setSearchState("error");
      setSearchMessage(failureText(outcome));
      return;
    }
    setAlbums(outcome.value.albums);
    setSearchState(outcome.value.albums.length === 0 ? "empty" : "results");
  }

  async function save(): Promise<void> {
    if (selected === null || sentiment.length === 0 || favouriteTrack.trim().length === 0) return;
    setSaveState("saving");
    setSaveMessage("");
    const outcome = await requestBff(ky.post("/api/music/records", {
      headers: { [personalWriteConfirmationHeader]: "true" },
      json: {
        albumTitle: selected.title,
        artist: selected.artist,
        artistCredits: selected.artistCredits,
        coverUrl: selected.coverUrl,
        favouriteTrack: favouriteTrack.trim(),
        owned,
        releaseGroupMbid: selected.releaseGroupMbid,
        sentiment
      },
      throwHttpErrors: false
    }), savedSchema);
    if (outcome.kind === "failure") {
      setSaveState("error");
      setSaveMessage(failureText(outcome));
      return;
    }
    setSaveState("success");
    setSaveMessage(outcome.value.operation === "CREATED" ? "Notion 음악 감상 데이터베이스에 새 기록을 저장했습니다." : "Notion의 같은 음반 기록을 최신 내용으로 갱신했습니다.");
    await reloadPersonalWorkspace();
  }

  function selectAlbum(album: Album): void {
    const existing = existingRecordFor(album, records);
    setSelected(album);
    setSentiment(existing?.sentiment ?? "");
    setOwned(existing?.owned ?? false);
    setSaveState("idle");
    setSaveMessage("");
    void loadTracks(album, existing?.favouriteTrack ?? "");
  }

  async function archiveRecord(recordHandle: string): Promise<void> {
    const archived = records.find((record) => record.recordHandle === recordHandle) ?? null;
    const outcome = await requestBff(ky.delete(`/api/music/records/${encodeURIComponent(recordHandle)}`, {
      headers: { [personalWriteConfirmationHeader]: "true" },
      throwHttpErrors: false
    }), savedSchema);
    if (outcome.kind === "failure") {
      setSaveState("error");
      setSaveMessage(failureText(outcome));
      return;
    }
    setSaveState("success");
    setSaveMessage("Notion 기록을 보관 처리했습니다.");
    setArchiveCandidate(null);
    setArchivedRecord(archived);
    await reloadPersonalWorkspace();
  }

  async function restoreRecord(record: ExistingRecord): Promise<void> {
    const outcome = await requestBff(ky.post(
      `/api/music/records/${encodeURIComponent(record.recordHandle)}/restore`,
      { headers: { [personalWriteConfirmationHeader]: "true" }, throwHttpErrors: false }
    ), savedSchema);
    if (outcome.kind === "failure") {
      setSaveState("error");
      setSaveMessage(failureText(outcome));
      return;
    }
    setArchivedRecord(null);
    setSaveState("success");
    setSaveMessage("Notion 기록을 복원했습니다.");
    await reloadPersonalWorkspace();
  }

  function editRecord(record: ExistingRecord): void {
    const album: Album = {
      artist: record.artist,
      artistCredits: record.artistCredits,
      coverUrl: record.coverUrl,
      firstReleaseDate: "",
      releaseGroupMbid: record.releaseGroupMbid,
      title: record.albumTitle
    };
    selectAlbum(album);
  }

  const saveEnabled = ownerAccess === "owner" && availability === "ready" && selected !== null && trackState === "ready" && sentiment.length > 0 && favouriteTrack.length > 0 && saveState !== "saving";
  const selectedExistingRecord = selected === null ? undefined : existingRecordFor(selected, records);
  const connectionLabel = ownerAccess === "checking"
    ? "개인 공간 확인 중"
    : ownerAccess === "visitor"
      ? "공개 앨범 검색"
      : availability === "loading"
        ? "개인 기록 연결 확인 중"
        : availability === "ready"
          ? "개인 기록 연결됨"
          : "개인 기록 연결 오류";

  function submitSearch(): void {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length === 0) return;
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("q", normalizedQuery);
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
    void search(normalizedQuery);
  }

  useEffect(() => {
    const sharedQuery = searchParams.get("q")?.trim() ?? "";
    if (sharedQuery.length === 0) {
      if (executedSearchQuery.current !== null) {
        executedSearchQuery.current = null;
        setQuery("");
        setSearchState("idle");
        clearSearch();
      }
      return;
    }
    if (ownerAccess !== "checking" && executedSearchQuery.current !== sharedQuery) {
      setQuery(sharedQuery);
      void search(sharedQuery);
    }
  }, [ownerAccess, searchParams]);

  return <><a className="skip-link" href="#main-content">본문으로 건너뛰기</a><main className="music-journal" id="main-content" tabIndex={-1}>
    <header className="journal-header" data-owner-access={ownerAccess}>
      <h1>나의 음악 기록</h1>
      <p className="journal-intro">{ownerAccess === "owner" ? <>앨범이나 가수를 찾아 고르고, 최애곡과 감상을 남기세요. 기록은 Notion에 저장됩니다. <span className="keep-together">다음 추천의 근거가 됩니다.</span></> : <>앨범이나 가수를 찾아 실제 앨범과 수록곡을 확인하세요. 개인 기록과 추천은 <span className="keep-together">소유자 세션에서만 열립니다.</span></>}</p>
      <div className="journal-context"><p>연결 상태: <strong>{availability === "loading" ? "확인 중" : availability === "ready" ? "실제 데이터 연결됨" : "설정 필요"}</strong></p></div>
    </header>
    <div className="connection-status" role="status">연결 상태: <strong>{connectionLabel}</strong></div>
    <nav className="task-navigation" aria-label="음악 기록 순서"><a href="#candidate-search">음반 찾기</a><a href="#listening-record">내 기록 남기기</a><a href="#personal-insights">취향과 추천 보기</a></nav>
    <section className="journal-workspace" aria-label="음악 기록 작업공간">
      <section className="journal-page" aria-labelledby="search-heading">
        <section className="search-section" id="candidate-search">
          <p className="section-kicker">음반 찾기</p><h2 id="search-heading">무슨 앨범을 찾고 있나요?</h2>
          <p className="instruction">앨범명 또는 가수명을 입력하면 MusicBrainz의 실제 release group 결과를 보여줍니다.</p>
          <form className="search-row" method="get" action={pathname} onSubmit={(event) => { event.preventDefault(); submitSearch(); }}>
            <label htmlFor="album-search">앨범명 또는 가수</label>
            <input id="album-search" name="q" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="예: Kind of Blue 또는 김사월" autoComplete="off" inputMode="search" enterKeyHint="search" />
            <button type="submit" disabled={searchState === "loading"}><MagnifyingGlass size={18} weight="bold" aria-hidden="true" />{searchState === "loading" ? "찾는 중" : "음반 찾기"}</button>
          </form>
          <div className="result-region" aria-live="polite" aria-busy={searchState === "loading"}>
            <p className="result-caption">{searchState === "results" ? `찾은 음반 ${albums.length}개` : "검색 결과"}</p>
            {searchState === "idle" && <p className="result-message">검색하면 실제 앨범 목록이 여기에 나타납니다.</p>}
            {searchState === "loading" && <div className="loading-record"><span />MusicBrainz를 조회하고 있습니다.</div>}
            {searchState === "empty" && <p className="result-message">일치하는 앨범을 찾지 못했습니다. 표기나 가수명을 바꿔 다시 검색해 보세요.</p>}
            {searchState === "error" && <p className="result-message">{searchMessage}</p>}
            {albums.map((album) => <button className={`candidate-row${selected?.releaseGroupMbid === album.releaseGroupMbid ? " selected" : ""}`} type="button" key={album.releaseGroupMbid} onClick={() => selectAlbum(album)} aria-pressed={selected?.releaseGroupMbid === album.releaseGroupMbid}>
              <span className="candidate-main"><AlbumArt album={album} /><span><strong>{album.title}</strong><small>{album.artist}{album.firstReleaseDate.length > 0 ? ` · ${album.firstReleaseDate}` : ""}</small></span></span><span className="selection-label"><ArrowRight size={16} weight="bold" aria-hidden="true" />{ownerAccess === "owner" ? existingRecordFor(album, records) === undefined ? "기록하기" : "기록 갱신" : "수록곡 보기"}</span>
            </button>)}
          </div>
        </section>
        {ownerAccess === "owner" ? <ListeningRecordSection archiveCandidate={archiveCandidate} archivedRecord={archivedRecord} availability={availability} favouriteTrack={favouriteTrack} loadingMoreRecords={loadingMoreRecords} nextRecordCursor={nextRecordCursor} onArchive={archiveRecord} onCancelArchive={() => setArchiveCandidate(null)} onFavouriteTrackChange={setFavouriteTrack} onLoadMoreRecords={loadMoreRecords} onOwnedChange={setOwned} onReloadRecords={loadRecords} onRequestArchive={setArchiveCandidate} onRestore={restoreRecord} onSave={save} onSentimentChange={setSentiment} onSelectRecord={editRecord} owned={owned} recordMessage={recordMessage} records={records} recordState={recordState} saveEnabled={saveEnabled} saveMessage={saveMessage} saveState={saveState} selected={selected} selectedExistingRecord={selectedExistingRecord} sentiment={sentiment} sentiments={sentiments} trackMessage={trackMessage} trackState={trackState} tracks={tracks} /> : <><section className="catalog-album-detail" aria-live="polite"><p className="section-kicker">수록곡 확인</p>{selected === null ? <p>앨범을 고르면 MusicBrainz 수록곡을 여기에서 확인할 수 있습니다.</p> : <><h3>{selected.title}</h3><p>{selected.artist}</p>{trackState === "loading" && <p>수록곡을 불러오는 중입니다.</p>}{trackState === "error" && <p>{trackMessage}</p>}{trackState === "empty" && <p>확인 가능한 수록곡이 없습니다.</p>}{trackState === "ready" && <ol className="catalog-track-list">{tracks.map((track) => <li key={track.recordingMbid}>{track.title}</li>)}</ol>}</>}</section><section className="owner-access-note" aria-label="개인 기록 안내"><p className="section-kicker">개인 기록</p><h3>내 Notion 기록과 추천은 소유자만 볼 수 있습니다.</h3><p>공개 검색으로 앨범과 수록곡을 확인할 수 있습니다. 개인 기록을 관리하려면 소유자 확인을 완료하세요.</p><a className="owner-access-link" href="/owner">소유자 확인으로 이동</a></section></>}
      </section>
      {ownerAccess === "owner" ? <aside className="insight-region" id="personal-insights" aria-label="개인 취향과 추천">
        <section className="insight-note" aria-live="polite"><header className="insight-heading"><div><p className="section-kicker">내 취향의 흐름</p><h2>추천과 근거</h2></div><button className="insight-refresh" type="button" disabled={insightState === "loading"} onClick={() => void refreshPersonalWorkspace()}>{insightState === "loading" ? "불러오는 중" : "내 기록 새로 고침"}</button></header>
          {syncState?.stale && <p className="sync-notice" role="status">Notion 변경을 아직 가져오지 못해 마지막으로 동기화된 기록을 표시합니다.</p>}
          {taste === null ? <div className="insight-state"><WarningCircle size={20} weight="fill" aria-hidden="true" /><div><strong>{insightState === "loading" ? "개인 기록을 불러오고 있습니다." : "아직 개인화 추천을 만들 수 없습니다."}</strong><p>{insightMessage}</p>{insightState === "error" && <button className="insight-refresh" type="button" onClick={() => void refreshPersonalWorkspace()}>내 기록 다시 동기화</button>}</div></div> : <>
            <section className="evidence-answer"><p className="section-kicker">실제 기록에서 읽은 취향</p><h3>{taste.recordCount}개의 Notion 기록을 기준으로 <span className="keep-together">취향의 흐름을 정리했습니다.</span></h3><dl className="technical-record"><div><dt>많이 기록한 가수</dt><dd>{taste.artists.slice(0, 3).map((item) => `${item.value} ${item.count}회`).join(", ")}</dd></div><div><dt>자주 남긴 감상</dt><dd>{taste.sentiments.slice(0, 3).map((item) => `${item.value} ${item.count}회`).join(", ")}</dd></div></dl></section>
            {graphTaste !== null && <section className="recommendation-note"><p className="section-kicker">다음에 들을 것</p><h3>{graphTaste.seedArtist}의 기록에서 출발했습니다.</h3>{graphTaste.relisten.length > 0 && <><p className="recommendation-group-heading">다시 듣기</p><p>마지막으로 기록을 수정한 순서로, 당신이 남긴 실제 앨범 기록을 <span className="keep-together">다시 보여드립니다.</span></p><div className="recommendation-list">{graphTaste.relisten.map((album) => <article key={album.releaseGroupMbid} className="relisten-entry"><AlbumArt album={album} /><div><p className="entry-eyebrow">내가 남긴 기록</p><strong>{album.title}</strong><span>{album.artist}{album.favouriteTrack.length > 0 ? ` · 최애곡 ${album.favouriteTrack}` : ""}{album.owned && <> · <span className="keep-together">보유 기록</span></>}</span></div></article>)}</div></>}<p className="recommendation-group-heading">새 발견</p><p>개인 기록의 MusicBrainz 태그와 <span className="keep-together">가수 연결</span>을 따라가며, 이미 기록한 앨범은 제외합니다.</p>{graphTaste.recommendations.length === 0 ? <p>아직 새 추천을 만들 수 있는 결과가 없습니다.</p> : <div className="recommendation-list">{graphTaste.recommendations.map((album) => <article key={album.releaseGroupMbid} className="discovery-entry"><AlbumArt album={album} /><div><p className="entry-eyebrow">그래프 근거로 찾은 새 앨범</p><strong>{album.title}</strong><span>{album.artist} · 근거 점수 {album.score}</span><span>{album.evidencePaths.map((path) => path.relation === "SHARES_MUSICBRAINZ_TAG" ? `내 기록의 MusicBrainz 태그: ${path.value}` : `내 기록의 가수 연결: ${path.value}`).join(" · ")}</span></div></article>)}</div>}<details className="technical-disclosure"><summary>개인 기록 그래프 검색 근거</summary><p>다시 들을 앨범: 같은 가수의 실제 Notion 기록을 마지막 수정 시각으로 정렬</p><p>새 발견: 개인 기록의 MusicBrainz 태그 또는 가수 연결을 따라간 실제 release group</p><p>추천은 실제 Notion 기록, GraphDB 탐색, MusicBrainz 결과로 결정합니다. 선택형 설명은 그 근거를 바꾸지 않습니다.</p><p className="mono">Notion 내부 식별자는 브라우저와 설명 모델에 전송하지 않습니다.</p></details></section>}
            {graphTaste !== null && <section className="grounded-explanation" aria-live="polite"><p className="section-kicker">선택형 설명</p><h3>이미 찾은 근거를 문장으로 읽기</h3><p>버튼을 누를 때에만 앨범·가수·감상·최애곡 근거가 선택한 외부 언어 모델에 전달됩니다. Notion 내부 ID와 비공개 메모는 보내지 않습니다.</p><button className="insight-refresh grounded-explanation-trigger" type="button" disabled={explanationState === "loading"} onClick={() => void generateGroundedExplanation()}>{explanationState === "loading" ? "근거를 정리하는 중" : "근거로 설명 만들기"}</button>{explanationState === "generated" && groundedExplanation !== null && <div className="grounded-explanation-answer" data-testid="grounded-explanation"><p>{groundedExplanation.answer}</p><ul>{groundedExplanation.citations.map((citation) => <li key={citation.label}>{citation.recordTitle} · {citation.artist}</li>)}</ul></div>}{explanationState === "disabled" && <p className="grounded-explanation-state">설명 모델이 아직 연결되지 않았습니다. 그래프 근거 추천은 그대로 사용할 수 있습니다.</p>}{explanationState === "unavailable" && <p className="grounded-explanation-state">설명 모델이 지금 응답하지 않습니다. 추천 근거는 그대로 확인할 수 있습니다. 잠시 뒤 다시 시도해 주세요.</p>}</section>}
          </>}
        </section>
      </aside> : <aside className="insight-region" aria-label="개인 추천 안내"><section className="owner-access-note"><p className="section-kicker">개인 추천</p><h2>기록이 연결되면 취향의 흐름을 보여드립니다.</h2><p>이 공간은 공개 방문자에게 추천을 만들어 보이지 않습니다. 소유자 세션에서만 Notion 기록과 GraphRAG 근거를 읽습니다.</p><a className="owner-access-link" href="/owner">소유자 확인으로 이동</a></section></aside>}
    </section>
  </main></>;
}
