"use client";

import { MusicCatalogSection } from "./music-catalog-section";
import { PublicDiscoveryHome } from "./public-discovery-home";
import { usePublicCatalogWorkflow } from "./use-public-catalog-workflow";
import { usePublicInsights } from "./use-public-insights";

import type { CatalogAlbum } from "../lib/music-catalog-contract";

export function PublicMusicDesk(): React.JSX.Element {
  const insights = usePublicInsights();
  const catalog = usePublicCatalogWorkflow();

  function openAlbum(album: CatalogAlbum): void {
    catalog.selectAlbum(album);
    window.requestAnimationFrame(() => document.getElementById("candidate-search")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return <>
    <div className="connection-status" role="status">연결 상태: <strong>공개 앨범 검색</strong></div>
    <PublicDiscoveryHome graphTaste={insights.graphTaste} insightMessage={insights.insightMessage}
      insightState={insights.insightState} onOpenAlbum={openAlbum} />
    <section className="journal-workspace public-workspace" aria-label="공개 음악 탐색 작업공간">
      <section className="journal-page" aria-labelledby="search-heading">
        <MusicCatalogSection albums={catalog.albums} editionMessage={catalog.editionMessage} editionState={catalog.editionState}
          editions={catalog.editions} hasMoreEditions={catalog.hasMoreEditions} loadingMoreEditions={catalog.loadingMoreEditions}
          onClearSearch={catalog.clearSearch} onLoadMoreEditions={() => void catalog.loadMoreEditions()} onQueryChange={catalog.setQuery}
          onSearchExample={catalog.searchExample} onSelectAlbum={catalog.selectAlbum} onSelectEdition={catalog.selectEdition}
          onSubmitSearch={catalog.submitSearch} ownerAccess="visitor" pathname={catalog.pathname} query={catalog.query}
          recordedCatalogIdentities={new Set()} searchMessage={catalog.searchMessage} searchState={catalog.searchState}
          selected={catalog.selected} selectedEdition={catalog.selectedEdition} selectionReady={catalog.selectionReady}
          trackMessage={catalog.trackMessage} trackState={catalog.trackState} tracks={catalog.tracks} writeAccess={false} />
      </section>
    </section>
  </>;
}
