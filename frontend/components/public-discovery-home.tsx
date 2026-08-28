"use client";

import type { CatalogAlbum } from "../lib/music-catalog-contract";
import type { PublicGraphTaste } from "../lib/public-discovery-contract";
import { PublicDiscoveryDeck, type PublicDiscoveryAlbum } from "./public-discovery-deck";
import { type PublicGenre, usePublicGenreExplore } from "./use-public-genre-explore";
import type { PublicInsightState } from "./use-public-insights";
import { PublicGenreCollection } from "./public-genre-collection";

type PublicDiscoveryHomeProps = Readonly<{
  readonly graphTaste: PublicGraphTaste | null;
  readonly insightMessage: string;
  readonly insightState: PublicInsightState;
  readonly onOpenAlbum: (album: CatalogAlbum) => void;
  readonly onRetryInsight: () => void;
}>;

const genres: readonly Readonly<{ key: PublicGenre; label: string }>[] = [
  { key: "dream-pop", label: "드림 팝" },
  { key: "indie-rock", label: "인디 록" },
  { key: "folk", label: "포크" },
  { key: "electronic", label: "전자음악" }
];

function publicAlbums(graphTaste: PublicGraphTaste | null): readonly PublicDiscoveryAlbum[] {
  const seen = new Set<string>();
  return (graphTaste?.recommendations ?? []).flatMap((recommendation) => {
    if (recommendation.publicCurationReason === undefined) return [];
    if (seen.has(recommendation.releaseGroupMbid)) return [];
    seen.add(recommendation.releaseGroupMbid);
    return [{
      artist: recommendation.artist,
      artistCredits: recommendation.artistCredits,
      catalogId: recommendation.releaseGroupMbid,
      catalogSource: "MUSICBRAINZ",
      catalogUrl: "",
      coverUrl: recommendation.coverUrl,
      firstReleaseDate: recommendation.firstReleaseDate,
      primaryType: recommendation.primaryType,
      publicCurationReason: recommendation.publicCurationReason,
      releaseGroupMbid: recommendation.releaseGroupMbid,
      searchScore: 0,
      sharedMusicBrainzTag: recommendation.sharedMusicBrainzTag,
      title: recommendation.title
    }];
  });
}

export function PublicDiscoveryHome({ graphTaste, insightMessage, insightState, onOpenAlbum, onRetryInsight }: PublicDiscoveryHomeProps): React.JSX.Element {
  const genreExplore = usePublicGenreExplore();
  const curatedAlbums = publicAlbums(graphTaste);
  const hasGenreResults = genreExplore.state === "ready" && genreExplore.albums.length > 0;
  const deckAlbums = hasGenreResults ? genreExplore.albums : curatedAlbums;
  const deckLabel = hasGenreResults
    ? `${genres.find((genre) => genre.key === genreExplore.genre)?.label ?? "장르"} 탐색`
    : "오늘의 공개 큐레이션";

  return <section className="public-discovery-home" aria-label="공개 음악 탐색">
    {insightState === "loading" && deckAlbums.length === 0 && <section className="public-discovery-skeleton" aria-busy="true" aria-label="오늘의 음악을 고르는 중">
      <div className="discovery-skeleton-cover" aria-hidden="true" />
      <div className="discovery-skeleton-copy"><span /><span /><span /></div>
      <p role="status">오늘의 음악을 고르는 중입니다.</p>
    </section>}
    {insightState === "error" && deckAlbums.length === 0 && <section className="public-discovery-unavailable" role="status">
      <h2>오늘의 큐레이션을 잠시 열 수 없습니다.</h2><p>{insightMessage}</p><p>장르나 앨범 검색으로 계속 탐색하거나 다시 불러올 수 있습니다.</p>
      <button type="button" className="discovery-open" onClick={onRetryInsight}>다시 불러오기</button>
    </section>}
    {insightState === "ready" && deckAlbums.length === 0 && <section className="public-discovery-unavailable" role="status">
      <h2>오늘의 큐레이션을 고르지 못했습니다.</h2><p>아래 장르 흐름을 골라 실제 앨범을 찾아보세요.</p>
    </section>}
    {deckAlbums.length > 0
      ? <PublicDiscoveryDeck albums={deckAlbums} key={deckAlbums.map((album) => album.releaseGroupMbid).join("|")}
        label={deckLabel} onOpenAlbum={onOpenAlbum} />
      : null}
    <PublicGenreCollection activeGenre={genreExplore.genre} hasDiscovery={deckAlbums.length > 0}
      message={genreExplore.message} onSelect={(genre) => void genreExplore.explore(genre)} state={genreExplore.state} />
  </section>;
}
