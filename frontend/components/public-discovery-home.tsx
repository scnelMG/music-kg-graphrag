"use client";

import type { CatalogAlbum } from "../lib/music-catalog-contract";
import type { PublicGraphTaste } from "../lib/public-discovery-contract";
import { PublicDiscoveryDeck, type PublicDiscoveryAlbum } from "./public-discovery-deck";
import { type PublicGenre, usePublicGenreExplore } from "./use-public-genre-explore";
import type { PublicInsightState } from "./use-public-insights";

type PublicDiscoveryHomeProps = Readonly<{
  readonly graphTaste: PublicGraphTaste | null;
  readonly insightMessage: string;
  readonly insightState: PublicInsightState;
  readonly onOpenAlbum: (album: CatalogAlbum) => void;
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

export function PublicDiscoveryHome({ graphTaste, insightMessage, insightState, onOpenAlbum }: PublicDiscoveryHomeProps): React.JSX.Element {
  const genreExplore = usePublicGenreExplore();
  const curatedAlbums = publicAlbums(graphTaste);
  const hasGenreResults = genreExplore.state === "ready" && genreExplore.albums.length > 0;
  const deckAlbums = hasGenreResults ? genreExplore.albums : curatedAlbums;
  const deckLabel = hasGenreResults
    ? `${genres.find((genre) => genre.key === genreExplore.genre)?.label ?? "장르"} 탐색`
    : "오늘의 공개 큐레이션";

  return <section className="public-discovery-home" aria-label="공개 음악 탐색">
    {deckAlbums.length > 0
      ? <PublicDiscoveryDeck albums={deckAlbums} label={deckLabel} onOpenAlbum={onOpenAlbum} />
      : null}
    <section className="public-explore-fallback" aria-live="polite"><h2>{deckAlbums.length > 0 ? "다른 흐름도 찾아보세요." : insightState === "loading" ? "오늘의 음악을 고르는 중입니다." : "원하는 흐름부터 찾아보세요."}</h2><p>{insightState === "error" ? insightMessage : "장르를 고르거나 아래에서 앨범과 수록곡을 찾아볼 수 있습니다."}</p><div className="genre-actions">{genres.map((genre) => <button type="button" key={genre.key} disabled={genreExplore.state === "loading"} onClick={() => void genreExplore.explore(genre.key)}>{genre.label}</button>)}</div>{genreExplore.message.length > 0 && <p className="genre-message" role="status">{genreExplore.message}</p>}</section>
  </section>;
}
