"use client";

import type { Album, ExistingRecord } from "../lib/connected-music-contract";
import { ListeningRecordSection } from "./listening-record-section";
import { MusicCatalogSection } from "./music-catalog-section";
import { MusicInsightsPanel } from "./music-insights-panel";
import { PersonalCoverRail } from "./personal-cover-rail";
import { useCatalogWorkflow } from "./use-catalog-workflow";
import { usePersonalWorkspace } from "./use-personal-workspace";
import { useRecordActions } from "./use-record-actions";
import { useYouTubeCandidates } from "./use-youtube-candidates";

export function ConnectedMusicDesk(): React.JSX.Element {
  const workspace = usePersonalWorkspace();
  const catalog = useCatalogWorkflow({ ownerAccess: workspace.ownerAccess, recordState: workspace.recordState });
  const youtube = useYouTubeCandidates({ artist: catalog.selected?.artist ?? "", existingRecord: catalog.selectedExistingRecord,
    ownerAccess: workspace.ownerAccess, selectedTrack: catalog.selectedTrack });
  const actions = useRecordActions({
    availability: workspace.availability,
    favouriteTrack: catalog.favouriteTrack,
    owned: catalog.owned,
    recordLookupState: catalog.recordLookupState,
    recordState: workspace.recordState,
    records: workspace.records,
    reloadPersonalWorkspace: workspace.reloadPersonalWorkspace,
    selected: catalog.selected,
    selectedEdition: catalog.selectedEdition,
    sentiment: catalog.sentiment,
    trackState: catalog.trackState,
    verifiedYouTubeVideo: youtube.selectedVideo,
    writeAccess: workspace.writeAccess
  });
  const connectionLabel = workspace.ownerAccess === "checking" ? "개인 공간 확인 중"
    : workspace.ownerAccess === "visitor" ? "공개 앨범 검색"
    : workspace.availability === "loading" ? "개인 기록 연결 확인 중"
    : workspace.availability === "ready" ? "개인 기록 연결됨" : "개인 기록 연결 오류";

  function openPersonalRecord(record: ExistingRecord): void {
    const album: Album = {
      artist: record.artist, artistCredits: record.artistCredits, coverUrl: record.coverUrl, firstReleaseDate: "",
      primaryType: "Album", releaseGroupMbid: record.releaseGroupMbid, searchScore: 0, title: record.albumTitle
    };
    catalog.selectAlbum(album);
    window.requestAnimationFrame(() => document.getElementById("listening-record")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return <><a className="skip-link" href="#main-content">본문으로 건너뛰기</a><main className="music-journal" id="main-content" tabIndex={-1}>
    <header className="journal-header" data-owner-access={workspace.ownerAccess}>
      <div><p className="section-kicker">음악 아카이브</p><h1>나의 음악 기록</h1><p className="journal-intro">{workspace.ownerAccess === "owner" ? "오늘 다시 듣고 싶은 한 장과 내가 남긴 기록을 한곳에서 봅니다." : workspace.ownerAccess === "visitor" ? "이 아카이브의 공개 추천과 실제 앨범을 함께 찾아봅니다." : "앨범과 수록곡을 준비하고 있습니다."}</p></div>
      {workspace.ownerAccess === "owner" ? <p className="masthead-meta">{workspace.availability === "ready" ? "Notion 기록 연결됨" : "기록 연결 확인 중"}</p> : workspace.ownerAccess === "visitor" ? <a className="owner-access-link" href="/owner">내 기록 열기</a> : null}
    </header>
    <div className="connection-status" role="status">연결 상태: <strong>{connectionLabel}</strong></div>
    {workspace.ownerAccess === "owner" && <nav className="task-navigation" aria-label="음악 기록 탐색"><a href="#candidate-search">음반 찾기</a><a href="#listening-record">{workspace.writeAccess ? "기록 관리" : "기록 보관함"}</a></nav>}
    {workspace.ownerAccess === "owner" && <PersonalCoverRail records={workspace.records} onSelectRecord={openPersonalRecord} />}
    <section className={`journal-workspace${workspace.ownerAccess === "owner" ? " owner-workspace" : " public-workspace"}`} aria-label="음악 기록 작업공간">
      {workspace.ownerAccess !== "checking" && <MusicInsightsPanel explanationState={workspace.explanationState} graphTaste={workspace.graphTaste}
        groundedExplanation={workspace.groundedExplanation} insightMessage={workspace.insightMessage} insightState={workspace.insightState}
        onGenerateExplanation={() => void workspace.generateGroundedExplanation()} onOpenRecord={openPersonalRecord}
        onRefresh={() => void workspace.refreshPersonalWorkspace()} ownerAccess={workspace.ownerAccess} records={workspace.records}
        syncState={workspace.syncState} writeAccess={workspace.writeAccess} />}
      <section className="journal-page" aria-labelledby="search-heading">
        <MusicCatalogSection albums={catalog.albums} editionMessage={catalog.editionMessage} editionState={catalog.editionState}
          editions={catalog.editions} hasMoreEditions={catalog.hasMoreEditions} loadingMoreEditions={catalog.loadingMoreEditions}
          onLoadMoreEditions={() => void catalog.loadMoreEditions()} onQueryChange={catalog.setQuery} onSelectAlbum={catalog.selectAlbum}
          onSelectEdition={catalog.selectEdition} onSubmitSearch={catalog.submitSearch} ownerAccess={workspace.ownerAccess}
          pathname={catalog.pathname} query={catalog.query} searchMessage={catalog.searchMessage}
          recordedReleaseGroupMbids={new Set(workspace.records.map((record) => record.releaseGroupMbid))}
          searchState={catalog.searchState} selected={catalog.selected} selectedEdition={catalog.selectedEdition}
          selectionReady={catalog.selectionReady} trackMessage={catalog.trackMessage} trackState={catalog.trackState}
          tracks={catalog.tracks} writeAccess={workspace.writeAccess} />
        {workspace.ownerAccess === "owner" && <ListeningRecordSection archiveCandidate={actions.archiveCandidate} archivedRecord={actions.archivedRecord}
          availability={workspace.availability} canWrite={workspace.writeAccess} favouriteTrack={catalog.favouriteTrack}
          loadingMoreRecords={workspace.loadingMoreRecords} nextRecordCursor={workspace.nextRecordCursor} onArchive={actions.archiveRecord}
          onCancelArchive={() => actions.setArchiveCandidate(null)} onFavouriteTrackChange={catalog.selectTrack}
          onLoadMoreRecords={workspace.loadMoreRecords} onOwnedChange={catalog.setOwned} onReloadRecords={workspace.loadPersonalWorkspace}
          onRequestArchive={actions.setArchiveCandidate} onRestore={actions.restoreRecord} onSave={actions.save}
          onSentimentChange={catalog.setSentiment} onSelectRecord={openPersonalRecord} owned={catalog.owned}
          recordLookupMessage={catalog.recordLookupMessage} recordLookupState={catalog.recordLookupState}
          recordMessage={workspace.recordMessage} records={workspace.records} recordState={workspace.recordState}
          saveEnabled={actions.saveEnabled} saveMessage={actions.saveMessage} saveState={actions.saveState} selected={catalog.selected}
          selectedExistingRecord={catalog.selectedExistingRecord} sentiment={catalog.sentiment} sentiments={workspace.sentiments}
          trackMessage={catalog.trackMessage} trackState={catalog.trackState} tracks={catalog.tracks}
          youtubeCandidateMessage={youtube.candidateMessage} youtubeCandidateState={youtube.candidateState}
          youtubeCandidates={youtube.candidates} onLoadYoutubeCandidates={youtube.loadCandidates}
          onConfirmYoutubeCandidate={youtube.confirmCandidate} selectedYoutubeVideo={youtube.selectedVideo} selectedTrack={youtube.track} />}
      </section>
    </section>
  </main></>;
}
