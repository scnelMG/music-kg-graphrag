"use client";

import { ArrowRight, CheckCircle, FloppyDisk, MagnifyingGlass, WarningCircle } from "@phosphor-icons/react/ssr";
import ky from "ky";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import { requestBff } from "../lib/review-bff-contract";
import { connectedMusicFailureKind } from "../lib/connected-music-failure";

const albumSchema = z.object({
  artist: z.string().min(1),
  artistCredits: z.array(z.string().min(1)).min(1),
  coverUrl: z.string().url().or(z.literal("")),
  firstReleaseDate: z.string(),
  releaseGroupMbid: z.string().min(1),
  title: z.string().min(1)
});
const albumsSchema = z.object({ albums: z.array(albumSchema) });
const healthSchema = z.object({ mode: z.literal("connected"), status: z.literal("ok") });
const formOptionsSchema = z.object({ sentiments: z.array(z.string().min(1)) });
const savedSchema = z.object({
  notionLastEditedAt: z.string().datetime(),
  notionPageId: z.string().min(1),
  operation: z.union([z.literal("ARCHIVED"), z.literal("CREATED"), z.literal("UPDATED")])
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
  pageId: z.string().min(1),
  releaseGroupMbid: z.string(),
  sentiment: z.string()
});
const recordsSchema = z.object({ records: z.array(existingRecordSchema) });
const countSchema = z.object({ count: z.number().int().positive(), value: z.string().min(1) });
const tasteSchema = z.object({
  artists: z.array(countSchema),
  favouriteTracks: z.array(countSchema),
  recordCount: z.number().int().positive(),
  sentiments: z.array(countSchema)
});
const graphTastePayloadSchema = z.object({
  evidencePageIds: z.array(z.string().min(1)),
  personalRecordCount: z.number().int().positive(),
  relisten: z.array(z.object({
    artist: z.string().min(1),
    coverUrl: z.string().url().or(z.literal("")),
    evidenceMethod: z.literal("PERSONAL_RECORD_RELISTEN"),
    evidencePageId: z.string().min(1),
    favouriteTrack: z.string(),
    owned: z.boolean(),
    releaseGroupMbid: z.string(),
    title: z.string().min(1)
  })).default([]),
  recommendations: z.array(albumSchema.extend({
    evidenceMethod: z.literal("PERSONAL_EVIDENCE_GRAPH_TRAVERSAL"),
    evidencePaths: z.array(z.object({ recordPageId: z.string().min(1), relation: z.enum(["RECORDED_BY", "SHARES_MUSICBRAINZ_TAG"]), value: z.string().min(1) })),
    score: z.number().int().positive()
  })),
  retrievalMethod: z.literal("PERSONAL_EVIDENCE_GRAPH_TRAVERSAL"),
  seedArtist: z.string().min(1)
});
const graphTasteSchema = graphTastePayloadSchema.extend({
  generatedByLlm: z.literal(false),
  retrievalMethod: z.literal("PERSONAL_EVIDENCE_GRAPH_TRAVERSAL")
});
const personalInsightsSchema = z.object({ graphTaste: graphTastePayloadSchema, taste: tasteSchema });

type Album = z.infer<typeof albumSchema>;
type ExistingRecord = z.infer<typeof existingRecordSchema>;
type Taste = z.infer<typeof tasteSchema>;
type GraphTaste = z.infer<typeof graphTasteSchema>;
type Track = z.infer<typeof trackSchema>;
type Availability = "error" | "loading" | "ready";
type SearchState = "empty" | "error" | "idle" | "loading" | "results";
type SaveState = "idle" | "saving" | "success" | "error";
type TrackState = "empty" | "error" | "idle" | "loading" | "ready";
type AlbumArtInput = Pick<Album, "coverUrl" | "title"> | Pick<ExistingRecord, "albumTitle" | "coverUrl">;

function failureText(failure: Readonly<{ code?: string; message: string }>): string {
  switch (connectedMusicFailureKind(failure.code ?? failure.message)) {
    case "notion-not-shared": return "Notion에서 음악 감상 데이터베이스를 열고 이 서비스의 Internal Integration을 연결한 뒤 다시 시도해 주세요.";
    case "notion-unauthorized": return "Notion Integration 토큰 또는 데이터베이스 접근 권한을 확인해 주세요.";
    case "notion-rate-limited": return "Notion 요청이 잠시 많습니다. 잠시 뒤 다시 시도해 주세요.";
    case "catalog-rate-limited": return "MusicBrainz 요청이 잠시 제한되었습니다. 잠시 뒤 다시 검색해 주세요.";
    case "insufficient-history": return "아직 분석할 개인 기록이 없습니다. 첫 음반을 저장하면 취향과 추천 근거가 생깁니다.";
    case "configuration": return "서비스 연결 설정이 아직 완료되지 않았습니다. 서버의 Notion과 MusicBrainz 설정을 확인해 주세요.";
    case "unavailable": return "요청을 완료하지 못했습니다. 잠시 뒤 다시 시도해 주세요.";
  }
}

function AlbumArt({ album }: { readonly album: AlbumArtInput }): React.JSX.Element {
  const title = "title" in album ? album.title : album.albumTitle;
  const [unavailable, setUnavailable] = useState(album.coverUrl.length === 0);
  if (unavailable) {
    return <span className="album-art album-art-missing" aria-label={`${title} 표지 정보 없음`}>표지 없음</span>;
  }
  return <img className="album-art" src={album.coverUrl} alt={`${title} 앨범 커버`} onError={() => setUnavailable(true)} />;
}

export function ConnectedMusicDesk(): React.JSX.Element {
  const [availability, setAvailability] = useState<Availability>("loading");
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [albums, setAlbums] = useState<readonly Album[]>([]);
  const [selected, setSelected] = useState<Album | null>(null);
  const [tracks, setTracks] = useState<readonly Track[]>([]);
  const [trackState, setTrackState] = useState<TrackState>("idle");
  const [trackMessage, setTrackMessage] = useState("");
  const [records, setRecords] = useState<readonly ExistingRecord[]>([]);
  const [sentiments, setSentiments] = useState<readonly string[]>([]);
  const [sentiment, setSentiment] = useState("");
  const [favouriteTrack, setFavouriteTrack] = useState("");
  const [owned, setOwned] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [taste, setTaste] = useState<Taste | null>(null);
  const [graphTaste, setGraphTaste] = useState<GraphTaste | null>(null);
  const [insightMessage, setInsightMessage] = useState("개인 기록을 불러오는 중입니다.");
  const requestGeneration = useRef(0);
  const insightGeneration = useRef(0);
  const recordGeneration = useRef(0);
  const trackGeneration = useRef(0);

  async function loadInsights(): Promise<void> {
    const generation = insightGeneration.current + 1;
    insightGeneration.current = generation;
    const outcome = await requestBff(
      ky.get("/api/music/insights", { throwHttpErrors: false }),
      personalInsightsSchema
    );
    if (generation !== insightGeneration.current) return;
    if (outcome.kind === "failure") {
      setInsightMessage(failureText(outcome));
      return;
    }
    setTaste(outcome.value.taste);
    setGraphTaste({
      ...outcome.value.graphTaste,
      generatedByLlm: false,
      relisten: outcome.value.graphTaste.relisten ?? [],
      retrievalMethod: "PERSONAL_EVIDENCE_GRAPH_TRAVERSAL"
    });
  }

  async function loadRecords(): Promise<void> {
    const generation = recordGeneration.current + 1;
    recordGeneration.current = generation;
    const outcome = await requestBff(ky.get("/api/music/records", { throwHttpErrors: false }), recordsSchema);
    if (generation !== recordGeneration.current || outcome.kind === "failure") return;
    setRecords(outcome.value.records);
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
    void Promise.all([
      requestBff(ky.get("/api/music/health", { throwHttpErrors: false }), healthSchema),
      requestBff(ky.get("/api/music/form-options", { throwHttpErrors: false }), formOptionsSchema)
    ]).then(async ([healthOutcome, optionsOutcome]) => {
      if (healthOutcome.kind === "failure") {
        setAvailability("error");
        setInsightMessage(failureText(healthOutcome));
        return;
      }
      if (optionsOutcome.kind === "failure") {
        setAvailability("error");
        setInsightMessage(failureText(optionsOutcome));
        return;
      }
      setSentiments(optionsOutcome.value.sentiments);
      setAvailability("ready");
      await Promise.all([loadInsights(), loadRecords()]);
    });
  }, []);

  async function search(): Promise<void> {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length === 0) return;
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;
    setSearchState("loading");
    setAlbums([]);
    setSelected(null);
    trackGeneration.current += 1;
    setTracks([]);
    setTrackState("idle");
    setFavouriteTrack("");
    setSaveState("idle");
    const outcome = await requestBff(
      ky.get("/api/music/albums", { searchParams: { q: normalizedQuery }, throwHttpErrors: false }),
      albumsSchema
    );
    if (generation !== requestGeneration.current) return;
    if (outcome.kind === "failure") {
      setSearchState("error");
      setSaveMessage(failureText(outcome));
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
    await Promise.all([loadInsights(), loadRecords()]);
  }

  async function archiveRecord(pageId: string): Promise<void> {
    const outcome = await requestBff(ky.delete(`/api/music/records/${encodeURIComponent(pageId)}`, { throwHttpErrors: false }), savedSchema);
    if (outcome.kind === "failure") {
      setSaveState("error");
      setSaveMessage(failureText(outcome));
      return;
    }
    setSaveState("success");
    setSaveMessage("Notion 기록을 보관 처리했습니다.");
    await Promise.all([loadInsights(), loadRecords()]);
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
    setSelected(album);
    setSentiment(record.sentiment);
    setOwned(record.owned);
    setSaveState("idle");
    setSaveMessage("");
    void loadTracks(album, record.favouriteTrack);
  }

  const saveEnabled = availability === "ready" && selected !== null && trackState === "ready" && sentiment.length > 0 && favouriteTrack.length > 0 && saveState !== "saving";

  return <main className="music-journal">
    <header className="journal-header">
      <h1>나의 음악 기록</h1>
      <p className="journal-intro">앨범이나 가수를 찾아 고르고, 최애곡과 감상을 남기세요. 기록은 Notion에 저장됩니다. <span className="keep-together">다음 추천의 근거가 됩니다.</span></p>
      <div className="journal-context"><p>연결 상태: <strong>{availability === "loading" ? "확인 중" : availability === "ready" ? "실제 데이터 연결됨" : "설정 필요"}</strong></p></div>
    </header>
    <nav className="task-navigation" aria-label="음악 기록 순서"><a href="#candidate-search">음반 찾기</a><a href="#listening-record">내 기록 남기기</a><a href="#personal-insights">취향과 추천 보기</a></nav>
    <section className="journal-workspace" aria-label="음악 기록 작업공간">
      <section className="journal-page" aria-labelledby="search-heading">
        <section className="search-section" id="candidate-search">
          <p className="section-kicker">음반 찾기</p><h2 id="search-heading">무슨 앨범을 찾고 있나요?</h2>
          <p className="instruction">앨범명 또는 가수명을 입력하면 MusicBrainz의 실제 release group 결과를 보여줍니다.</p>
          <form className="search-row" onSubmit={(event) => { event.preventDefault(); void search(); }}>
            <label htmlFor="album-search">앨범명 또는 가수</label>
            <input id="album-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="예: Kind of Blue 또는 김사월" />
            <button type="submit" disabled={availability !== "ready" || searchState === "loading"}><MagnifyingGlass size={18} weight="bold" aria-hidden="true" />{searchState === "loading" ? "찾는 중" : "음반 찾기"}</button>
          </form>
          <div className="result-region" aria-live="polite" aria-busy={searchState === "loading"}>
            <p className="result-caption">{searchState === "results" ? `찾은 음반 ${albums.length}개` : "검색 결과"}</p>
            {searchState === "idle" && <p className="result-message">검색하면 실제 앨범 목록이 여기에 나타납니다.</p>}
            {searchState === "loading" && <div className="loading-record"><span />MusicBrainz를 조회하고 있습니다.</div>}
            {searchState === "empty" && <p className="result-message">일치하는 앨범을 찾지 못했습니다. 표기나 가수명을 바꿔 다시 검색해 보세요.</p>}
            {searchState === "error" && <p className="result-message">{saveMessage}</p>}
            {albums.map((album) => <button className={`candidate-row${selected?.releaseGroupMbid === album.releaseGroupMbid ? " selected" : ""}`} type="button" key={album.releaseGroupMbid} onClick={() => { setSelected(album); setSaveState("idle"); setSaveMessage(""); void loadTracks(album); }} aria-pressed={selected?.releaseGroupMbid === album.releaseGroupMbid}>
              <span className="candidate-main"><AlbumArt album={album} /><span><strong>{album.title}</strong><small>{album.artist}{album.firstReleaseDate.length > 0 ? ` · ${album.firstReleaseDate}` : ""}</small></span></span><span className="selection-label"><ArrowRight size={16} weight="bold" aria-hidden="true" />기록하기</span>
            </button>)}
          </div>
        </section>
        <section className="listening-note" id="listening-record" aria-labelledby="record-heading">
          <p className="section-kicker">내 기록</p><h2 id="record-heading">이 앨범을 어떻게 들었나요?</h2>
          <div className="selected-record" aria-live="polite">{selected === null ? <p>먼저 실제 검색 결과에서 앨범 하나를 골라 주세요.</p> : <><div className="selected-album"><AlbumArt album={selected} /><div><strong>{selected.title}</strong><span>{selected.artist}</span></div></div></>}</div>
          <div className="field-grid">
            <label htmlFor="sentiment">개인 감상평<select id="sentiment" value={sentiment} onChange={(event) => setSentiment(event.target.value)} disabled={availability !== "ready" || sentiments.length === 0}><option value="">선택해 주세요</option>{sentiments.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
            <label htmlFor="favourite-track-select">개인 최애곡<select id="favourite-track-select" value={favouriteTrack} onChange={(event) => setFavouriteTrack(event.target.value)} disabled={trackState !== "ready"}><option value="">{trackState === "loading" ? "수록곡을 불러오는 중" : "수록곡을 선택해 주세요"}</option>{tracks.map((track) => <option key={track.recordingMbid} value={track.title}>{track.position}. {track.title}</option>)}</select></label>
          </div>
          {trackState === "error" || trackState === "empty" ? <p className="notice error" role="status"><WarningCircle size={18} weight="fill" aria-hidden="true" /><span>{trackMessage}</span></p> : null}
          <label className="owned-field" htmlFor="owned"><input id="owned" type="checkbox" checked={owned} onChange={(event) => setOwned(event.target.checked)} />앨범을 보유하고 있어요</label>
          <button type="button" className="save-button" disabled={!saveEnabled} onClick={() => void save()}><FloppyDisk size={18} weight="fill" aria-hidden="true" />{saveState === "saving" ? "Notion에 저장 중" : "Notion에 기록 저장"}</button>
          {saveState === "success" && <p className="notice success" role="status"><CheckCircle size={18} weight="fill" aria-hidden="true" /><span>{saveMessage}</span></p>}
          {saveState === "error" && <p className="notice error" role="status"><WarningCircle size={18} weight="fill" aria-hidden="true" /><span>{saveMessage}</span></p>}
          <section className="record-list" aria-labelledby="record-list-heading">
            <p className="section-kicker">내 기록 관리</p>
            <h3 id="record-list-heading">Notion에 저장된 음반</h3>
            {records.length === 0 ? <p className="result-message">아직 저장된 기록이 없습니다.</p> : <div className="recommendation-list">{records.map((record) => <article key={record.pageId} className="recommendation-row"><AlbumArt album={record} /><div><strong>{record.albumTitle}</strong><span>{record.artistCredits.join(", ")} · 최애곡 {record.favouriteTrack}</span><span>마지막 기록 수정 {new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(record.lastEditedAt))}</span></div><div className="record-actions"><button type="button" className="archive-record" onClick={() => editRecord(record)}>기록 수정</button><button type="button" className="archive-record" onClick={() => void archiveRecord(record.pageId)}>Notion에서 보관</button></div></article>)}</div>}
          </section>
        </section>
      </section>
      <aside className="insight-region" id="personal-insights" aria-label="개인 취향과 추천">
        <section className="insight-note" aria-live="polite"><header className="insight-heading"><div><p className="section-kicker">내 취향의 흐름</p><h2>추천과 근거</h2></div></header>
          {taste === null ? <div className="insight-state"><WarningCircle size={20} weight="fill" aria-hidden="true" /><div><strong>아직 개인화 추천을 만들 수 없습니다.</strong><p>{insightMessage}</p></div></div> : <>
            <section className="evidence-answer"><p className="section-kicker">실제 기록에서 읽은 취향</p><h3>{taste.recordCount}개의 Notion 기록을 기준으로 <span className="keep-together">취향의 흐름을 정리했습니다.</span></h3><dl className="technical-record"><div><dt>많이 기록한 가수</dt><dd>{taste.artists.slice(0, 3).map((item) => `${item.value} ${item.count}회`).join(", ")}</dd></div><div><dt>자주 남긴 감상</dt><dd>{taste.sentiments.slice(0, 3).map((item) => `${item.value} ${item.count}회`).join(", ")}</dd></div></dl></section>
            {graphTaste !== null && <section className="recommendation-note"><p className="section-kicker">다음에 들을 것</p><h3>{graphTaste.seedArtist}의 기록에서 출발했습니다.</h3>{graphTaste.relisten.length > 0 && <><p className="recommendation-group-heading">다시 듣기</p><p>마지막으로 기록을 수정한 순서로, 당신이 남긴 실제 앨범 기록을 다시 보여드립니다.</p><div className="recommendation-list">{graphTaste.relisten.map((album) => <article key={album.evidencePageId} className="recommendation-row"><AlbumArt album={album} /><div><strong>{album.title}</strong><span>{album.artist}{album.favouriteTrack.length > 0 ? ` · 최애곡 ${album.favouriteTrack}` : ""}{album.owned && <> · <span className="keep-together">보유 기록</span></>}</span></div></article>)}</div></>}<p className="recommendation-group-heading">새 발견</p><p>개인 기록의 MusicBrainz 태그 또는 가수 연결을 따라가고, 이미 기록한 앨범은 제외합니다.</p>{graphTaste.recommendations.length === 0 ? <p>아직 새 추천을 만들 수 있는 결과가 없습니다.</p> : <div className="recommendation-list">{graphTaste.recommendations.map((album) => <article key={album.releaseGroupMbid} className="recommendation-row"><AlbumArt album={album} /><div><strong>{album.title}</strong><span>{album.artist} · 근거 점수 {album.score}</span><span>{album.evidencePaths.map((path) => path.relation === "SHARES_MUSICBRAINZ_TAG" ? `내 기록의 MusicBrainz 태그: ${path.value}` : `내 기록의 가수 연결: ${path.value}`).join(" · ")}</span></div></article>)}</div>}<details className="technical-disclosure"><summary>개인 기록 그래프 검색 근거</summary><p>다시 들을 앨범: 같은 가수의 실제 Notion 기록을 마지막 수정 시각으로 정렬</p><p>새 발견: 개인 기록의 MusicBrainz 태그 또는 가수 연결을 따라간 실제 release group</p><p>생성형 문장 모델은 사용하지 않았습니다. 실제 Notion 기록과 MusicBrainz 결과만 표시합니다.</p><p className="mono">Notion evidence: {graphTaste.evidencePageIds.join(", ")}</p></details></section>}
          </>}
        </section>
      </aside>
    </section>
  </main>;
}
