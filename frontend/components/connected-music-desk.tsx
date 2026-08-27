"use client";

import Link from "next/link";
import type { Album, ExistingRecord } from "../lib/connected-music-contract";
import { catalogIdentity } from "../lib/music-catalog-contract";
import { ArchiveMasthead } from "./archive-masthead";
import { ArchiveNavigation } from "./archive-navigation";
import { ListeningRecordSection } from "./listening-record-section";
import { MusicCatalogSection } from "./music-catalog-section";
import { MusicInsightsPanel } from "./music-insights-panel";
import { PersonalCoverRail } from "./personal-cover-rail";
import { useCatalogWorkflow } from "./use-catalog-workflow";
import { usePersonalWorkspace } from "./use-personal-workspace";
import { useRecordActions } from "./use-record-actions";
import { useYouTubeCandidates } from "./use-youtube-candidates";

export function ConnectedMusicDesk(): React.JSX.Element {
  const workspace = usePersonalWorkspace("owner");
  const recordedCatalogIdentities = new Set(workspace.records.flatMap((record) => {
    switch (record.catalogSource) {
      case "LEGACY": return [];
      case "MUSICBRAINZ":
      case "ITUNES": return [catalogIdentity({
        artist: record.artist, artistCredits: record.artistCredits, catalogId: record.catalogId, catalogSource: record.catalogSource,
        catalogUrl: "", coverUrl: record.coverUrl, firstReleaseDate: "", primaryType: "Album",
        releaseGroupMbid: record.releaseGroupMbid, searchScore: 0, title: record.albumTitle
      })];
    }
  }));
  const catalog = useCatalogWorkflow({ ownerAccess: workspace.ownerAccess, recordState: workspace.recordState });
  const youtube = useYouTubeCandidates({ artist: catalog.selected?.artist ?? "", existingRecord: catalog.selectedExistingRecord,
    ownerAccess: workspace.ownerAccess, selectedTrack: catalog.selected?.catalogSource === "MUSICBRAINZ" ? catalog.selectedTrack : undefined });
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
    selectedTrack: catalog.selectedTrack,
    sentiment: catalog.sentiment,
    trackState: catalog.trackState,
    verifiedYouTubeVideo: youtube.selectedVideo,
    writeAccess: workspace.writeAccess
  });
  const connectionLabel = workspace.ownerAccess === "checking" ? "개인 공간 확인 중"
    : workspace.availability === "loading" ? "개인 기록 연결 확인 중"
    : workspace.availability === "ready" ? "개인 기록 연결됨" : "개인 기록 연결 오류";

  function openPersonalRecord(record: ExistingRecord): void {
    if (record.catalogSource === "LEGACY") {
      document.getElementById("candidate-search")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const album: Album = {
      artist: record.artist, artistCredits: record.artistCredits, coverUrl: record.coverUrl, firstReleaseDate: "",
      catalogId: record.catalogId, catalogSource: record.catalogSource, catalogUrl: "", primaryType: "Album",
      releaseGroupMbid: record.releaseGroupMbid, searchScore: 0, title: record.albumTitle
    };
    catalog.selectAlbum(album);
    window.requestAnimationFrame(() => document.getElementById("listening-record")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  if (workspace.ownerAccess === "visitor") {
    return <><a className="skip-link" href="#main-content">본문으로 건너뛰기</a><main className="music-journal access-page" id="main-content" tabIndex={-1}>
      <ArchiveNavigation mode="service" />
      <section className="access-sheet access-denied" aria-live="polite"><div className="access-copy"><p className="section-kicker">개인 기록 관리</p><h1>개인 기록에 접근할 수 없습니다</h1><p className="instruction">소유자 확인을 다시 마치면 개인 기록을 열 수 있습니다.</p></div><Link className="owner-access-link" href="/owner">소유자 확인</Link></section>
    </main></>;
  }

  return <><a className="skip-link" href="#main-content">본문으로 건너뛰기</a><main className="music-journal" id="main-content" tabIndex={-1}>
    <ArchiveMasthead mode="owner" meta={workspace.availability === "ready" ? "Notion 기록 연결됨" : "기록 연결 확인 중"} />
    <div className="connection-status" role="status">연결 상태: <strong>{connectionLabel}</strong></div>
    {workspace.ownerAccess === "owner" && <nav className="task-navigation" aria-label="음악 기록 탐색"><a href="#candidate-search">음반 찾기</a><a href="#listening-record">{workspace.writeAccess ? "기록 관리" : "기록 보관함"}</a></nav>}
    {workspace.ownerAccess === "owner" && <PersonalCoverRail records={workspace.records} onSelectRecord={openPersonalRecord} />}
    <section className={`journal-workspace owner-workspace${catalog.selected === null ? "" : " owner-workspace-task"}`} aria-label="음악 기록 작업공간">
      {workspace.ownerAccess === "owner" && catalog.selected === null && <MusicInsightsPanel explanationState={workspace.explanationState} graphTaste={workspace.graphTaste}
        groundedExplanation={workspace.groundedExplanation} insightMessage={workspace.insightMessage} insightState={workspace.insightState}
        onGenerateExplanation={() => void workspace.generateGroundedExplanation()} onOpenRecord={openPersonalRecord}
        onRefresh={() => void workspace.refreshPersonalWorkspace()} ownerAccess={workspace.ownerAccess} records={workspace.records}
        syncState={workspace.syncState} writeAccess={workspace.writeAccess} />}
      <section className="journal-page" aria-labelledby="search-heading">
        <MusicCatalogSection albums={catalog.albums} editionMessage={catalog.editionMessage} editionState={catalog.editionState}
          editions={catalog.editions} hasMoreEditions={catalog.hasMoreEditions} loadingMoreEditions={catalog.loadingMoreEditions} onClearSearch={catalog.clearSearch}
          onLoadMoreEditions={() => void catalog.loadMoreEditions()} onQueryChange={catalog.setQuery} onSelectAlbum={catalog.selectAlbum}
          onSearchExample={catalog.searchExample} onSelectEdition={catalog.selectEdition} onSubmitSearch={catalog.submitSearch} ownerAccess={workspace.ownerAccess}
          pathname={catalog.pathname} query={catalog.query} searchMessage={catalog.searchMessage}
          recordedCatalogIdentities={recordedCatalogIdentities}
          searchState={catalog.searchState} selected={catalog.selected} selectedEdition={catalog.selectedEdition}
          selectionReady={catalog.selectionReady} trackMessage={catalog.trackMessage} trackState={catalog.trackState}
          tracks={catalog.tracks} writeAccess={workspace.writeAccess} />
      </section>
    </section>
    {workspace.ownerAccess === "owner" && <ListeningRecordSection
      archive={{
        archiveCandidate: actions.archiveCandidate, archivedRecord: actions.archivedRecord, canWrite: workspace.writeAccess,
        loadingMoreRecords: workspace.loadingMoreRecords, nextRecordCursor: workspace.nextRecordCursor,
        onArchive: actions.archiveRecord, onCancelArchive: () => actions.setArchiveCandidate(null),
        onLoadMoreRecords: workspace.loadMoreRecords, onReloadRecords: workspace.loadPersonalWorkspace,
        onRequestArchive: actions.setArchiveCandidate, onRestore: actions.restoreRecord, onSelectRecord: openPersonalRecord,
        recordMessage: workspace.recordMessage, records: workspace.records, recordState: workspace.recordState,
        saveMessage: actions.saveMessage, saveState: actions.saveState, selectedRecordVisible: catalog.selected !== null
      }}
      editor={{
        archivedRecord: actions.archivedRecord, availability: workspace.availability, canWrite: workspace.writeAccess,
        onConfirmYoutubeCandidate: youtube.confirmCandidate, onFavouriteTrackChange: catalog.selectTrack,
        onLoadYoutubeCandidates: youtube.loadCandidates, onOwnedChange: catalog.setOwned, onSave: actions.save,
        onSentimentChange: catalog.setSentiment, owned: catalog.owned, recordLookupState: catalog.recordLookupState,
        saveEnabled: actions.saveEnabled, saveMessage: actions.saveMessage, saveState: actions.saveState,
        selected: catalog.selected, selectedExistingRecord: catalog.selectedExistingRecord, selectedTrack: catalog.selectedTrack,
        selectedYoutubeVideo: youtube.selectedVideo, sentiment: catalog.sentiment, sentiments: workspace.sentiments,
        trackMessage: catalog.trackMessage, trackState: catalog.trackState, tracks: catalog.tracks,
        youtubeCandidateMessage: youtube.candidateMessage, youtubeCandidateState: youtube.candidateState,
        youtubeCandidates: youtube.candidates
      }}
      recordLookupMessage={catalog.recordLookupMessage} />}
  </main></>;
}
