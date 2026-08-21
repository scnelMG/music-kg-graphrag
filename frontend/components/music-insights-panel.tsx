"use client";

import { WarningCircle } from "@phosphor-icons/react/ssr";

import type { ExistingRecord, ExplanationState, GraphTaste, GroundedExplanation, InsightState, OwnerAccess, SyncState } from "../lib/connected-music-contract";
import { AlbumArt } from "./album-art";
import { YouTubePlayback } from "./youtube-track-player";

type MusicInsightsPanelProps = {
  readonly explanationState: ExplanationState;
  readonly graphTaste: GraphTaste | null;
  readonly groundedExplanation: GroundedExplanation | null;
  readonly insightMessage: string;
  readonly insightState: InsightState;
  readonly onGenerateExplanation: () => void;
  readonly onOpenRecord: (record: ExistingRecord) => void;
  readonly onRefresh: () => void;
  readonly ownerAccess: OwnerAccess;
  readonly records: readonly ExistingRecord[];
  readonly syncState: SyncState | null;
  readonly writeAccess: boolean;
};

function unavailableEvidenceReason(label: string, count: number): string {
  return `${label} ${count}개가 제공되었습니다. 이 응답에는 세부 추천 근거가 포함되지 않아 표시하지 않습니다.`;
}

function relistenReason(album: GraphTaste["relisten"][number], ownerAccess: OwnerAccess, count: number): string {
  if (ownerAccess === "owner" && album.favouriteTrack?.trim()) {
    return `내 기록에서 최애곡 “${album.favouriteTrack}”을 남긴 앨범입니다.`;
  }
  return unavailableEvidenceReason("재청취 후보", count);
}

function discoveryReason(album: GraphTaste["recommendations"][number], ownerAccess: OwnerAccess, count: number): string {
  const evidence = ownerAccess === "owner" ? album.evidencePaths?.[0] : undefined;
  if (evidence?.relation === "RECORDED_BY") return `내 기록의 아티스트 “${evidence.value}”와 연결됩니다.`;
  if (evidence?.relation === "SHARES_MUSICBRAINZ_TAG") return `내 기록과 MusicBrainz 태그 “${evidence.value}”가 연결됩니다.`;
  return unavailableEvidenceReason("새 발견 후보", count);
}

export function MusicInsightsPanel(props: MusicInsightsPanelProps): React.JSX.Element {
  const todayRelisten = props.graphTaste?.relisten[0] ?? null;
  const publicDiscovery = props.ownerAccess === "visitor" ? props.graphTaste?.recommendations[0] ?? null : null;
  const featuredAlbum = todayRelisten ?? publicDiscovery;
  const remainingDiscoveries = props.ownerAccess === "owner"
    ? props.graphTaste?.recommendations ?? []
    : props.graphTaste?.recommendations.slice(1, 3) ?? [];
  const todayRecord = todayRelisten === null ? undefined : props.records.find(
    (record) => record.releaseGroupMbid === todayRelisten.releaseGroupMbid
  );
  return <aside className="insight-region" id="personal-insights" aria-label="오늘의 추천">
    <section className="insight-note" aria-live="polite">
      <header className="insight-heading"><div><p className="section-kicker">{props.ownerAccess === "owner" ? "오늘의 한 장" : "공개 추천"}</p><h2>{props.ownerAccess === "owner" ? "오늘 다시 들을 앨범" : "이 아카이브에서 발견한 앨범"}</h2></div>
        {props.writeAccess && <button className="insight-refresh" type="button" disabled={props.insightState === "loading"} onClick={props.onRefresh}>{props.insightState === "loading" ? "불러오는 중" : "새로 고침"}</button>}
      </header>
      {props.syncState?.stale && <p className="sync-notice" role="status">최신 기록을 가져오지 못했습니다.{props.writeAccess ? " 다시 불러오면 추천을 갱신합니다." : " 소유자 모드에서 다시 불러올 수 있습니다."}</p>}
      {props.graphTaste === null
        ? <div className="insight-state"><WarningCircle size={20} weight="fill" aria-hidden="true" /><div><strong>{props.insightState === "loading" ? "오늘의 추천을 준비하고 있습니다." : "추천을 불러오지 못했습니다."}</strong><p>{props.insightMessage}</p>{props.writeAccess && props.insightState === "error" && <button className="insight-refresh" type="button" onClick={props.onRefresh}>다시 불러오기</button>}</div></div>
        : <>
          {props.insightState === "error" && <div className="sync-notice" role="status"><p>새 추천을 불러오지 못했습니다. 마지막으로 확인된 추천을 보여드립니다.</p><p>{props.insightMessage}</p><button className="insight-refresh" type="button" onClick={props.onRefresh}>다시 불러오기</button></div>}
          {featuredAlbum === null
            ? <div className="insight-state"><WarningCircle size={20} weight="fill" aria-hidden="true" /><div><strong>{props.ownerAccess === "owner" ? "아직 다시 들을 앨범을 고르지 못했습니다." : "지금은 공개 추천을 준비하지 못했습니다."}</strong><p>{props.ownerAccess === "owner" ? "기록이 쌓이면 다음에 들을 한 장을 보여드릴게요." : "잠시 뒤 다시 찾아보세요."}</p></div></div>
            : <section className="today-recommendation"><AlbumArt album={featuredAlbum} size="hero" /><div className="today-recommendation-copy"><p className="entry-eyebrow">{props.ownerAccess === "owner" ? "오늘의 추천" : "아카이브 추천"}</p><strong>{featuredAlbum.title}</strong><span>{featuredAlbum.artist}</span>{props.ownerAccess === "owner" && todayRecord !== undefined && <button className="today-recommendation-action" type="button" onClick={() => props.onOpenRecord(todayRecord)}>기록 보기</button>}{props.ownerAccess === "owner" && todayRecord?.youtubeVideoId.length === 11 && todayRecord.youtubeRecordingMbid.length > 0 && todayRecord.youtubeVideoTitle.length > 0 && todayRecord.youtubeChannelTitle.length > 0 && <YouTubePlayback video={{ channelTitle: todayRecord.youtubeChannelTitle, recordingMbid: todayRecord.youtubeRecordingMbid, thumbnailUrl: "", title: todayRecord.youtubeVideoTitle, videoId: todayRecord.youtubeVideoId }} />}</div><details className="recommendation-reason"><summary>추천 이유</summary><p>{todayRelisten === null ? "이 아카이브의 공개 추천에서 고른 앨범입니다." : relistenReason(todayRelisten, props.ownerAccess, props.graphTaste.relisten.length)}</p></details></section>}
          <section className="recommendation-note"><p className="recommendation-group-heading">{props.ownerAccess === "owner" ? "새로운 발견" : "더 찾아보기"}</p>{remainingDiscoveries.length === 0
            ? <p>지금은 새 발견을 만들 근거가 부족합니다.</p>
            : <><div className="recommendation-list">{remainingDiscoveries.map((album, index) => <article key={album.releaseGroupMbid} className="discovery-entry"><AlbumArt album={album} /><div><p className="entry-eyebrow">{index === 0 ? "새 발견" : "취향 확장"}</p><strong>{album.title}</strong><span>{album.artist}</span></div></article>)}</div><details className="recommendation-reason"><summary>추천 이유</summary><p>{discoveryReason(remainingDiscoveries[0], props.ownerAccess, remainingDiscoveries.length)}</p></details></>}
          </section>
          {props.writeAccess && <details className="grounded-explanation" aria-live="polite"><summary>추천을 문장으로 보기</summary><p>원할 때만 근거를 문장으로 정리합니다.</p><button className="insight-refresh grounded-explanation-trigger" type="button" disabled={props.explanationState === "loading"} onClick={props.onGenerateExplanation}>{props.explanationState === "loading" ? "정리하는 중" : "설명 만들기"}</button>
            {props.explanationState === "generated" && props.groundedExplanation !== null && <div className="grounded-explanation-answer" data-testid="grounded-explanation"><p>{props.groundedExplanation.answer}</p><ul>{props.groundedExplanation.citations.map((citation) => <li key={citation.label}>{citation.recordTitle} · {citation.artist}</li>)}</ul></div>}
            {props.explanationState === "disabled" && <p className="grounded-explanation-state">설명 모델이 연결되지 않았습니다. 추천은 그대로 사용할 수 있습니다.</p>}
            {props.explanationState === "no-evidence" && <p className="grounded-explanation-state">지금은 설명할 만큼 확인된 추천 근거가 없습니다.</p>}
            {props.explanationState === "unavailable" && <p className="grounded-explanation-state">설명을 만들 수 없습니다. 잠시 뒤 다시 시도해 주세요.</p>}
          </details>}
        </>}
    </section>
  </aside>;
}
