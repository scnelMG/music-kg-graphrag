"use client";

import { ArrowRight, MagnifyingGlass } from "@phosphor-icons/react/ssr";

import type { Album, OwnerAccess, SearchState, Track, TrackState } from "../lib/connected-music-contract";
import type { CatalogEdition } from "../lib/music-catalog-contract";
import { AlbumArt } from "./album-art";
import { CatalogAlbumPicker, type CatalogEditionState } from "./catalog-album-picker";

type MusicCatalogSectionProps = {
  readonly albums: readonly Album[];
  readonly editionMessage: string;
  readonly editionState: CatalogEditionState;
  readonly editions: readonly CatalogEdition[];
  readonly hasMoreEditions: boolean;
  readonly loadingMoreEditions: boolean;
  readonly onLoadMoreEditions: () => void;
  readonly onQueryChange: (value: string) => void;
  readonly onSelectAlbum: (album: Album) => void;
  readonly onSelectEdition: (edition: CatalogEdition) => void;
  readonly onSubmitSearch: () => void;
  readonly ownerAccess: OwnerAccess;
  readonly pathname: string;
  readonly query: string;
  readonly recordedReleaseGroupMbids: ReadonlySet<string>;
  readonly searchMessage: string;
  readonly searchState: SearchState;
  readonly selected: Album | null;
  readonly selectedEdition: CatalogEdition | null;
  readonly selectionReady: boolean;
  readonly trackMessage: string;
  readonly trackState: TrackState;
  readonly tracks: readonly Track[];
  readonly writeAccess: boolean;
};

export function MusicCatalogSection(props: MusicCatalogSectionProps): React.JSX.Element {
  return <>
    <section className="search-section" id="candidate-search">
      <p className="section-kicker">음반 찾기</p><h2 id="search-heading">듣고 싶은 앨범을 찾아보세요.</h2>
      <p className="instruction">앨범명이나 가수명으로 실제 앨범과 수록곡을 찾습니다.</p>
      <form className="search-row" method="get" action={props.pathname} onSubmit={(event) => { event.preventDefault(); props.onSubmitSearch(); }}>
        <label htmlFor="album-search">앨범명 또는 가수</label>
        <input id="album-search" name="q" value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} placeholder="예: Kind of Blue 또는 김사월" autoComplete="off" inputMode="search" enterKeyHint="search" />
        <button type="submit" disabled={props.searchState === "loading"}><MagnifyingGlass size={18} weight="bold" aria-hidden="true" />{props.searchState === "loading" ? "찾는 중" : "음반 찾기"}</button>
      </form>
      <div className="result-region" aria-live="polite" aria-busy={props.searchState === "loading"}>
        <p className="result-caption">{props.searchState === "results" ? `찾은 음반 ${props.albums.length}개` : "검색 결과"}</p>
        {props.searchState === "idle" && <p className="result-message">검색하면 실제 앨범 목록이 여기에 나타납니다.</p>}
        {props.searchState === "loading" && <div className="loading-record"><span />MusicBrainz를 조회하고 있습니다.</div>}
        {props.searchState === "empty" && <p className="result-message">일치하는 앨범을 찾지 못했습니다. 표기나 가수명을 바꿔 다시 검색해 보세요.</p>}
        {props.searchState === "error" && <p className="result-message">{props.searchMessage}</p>}
        {props.albums.map((album) => {
          const action = props.ownerAccess === "owner" && !props.selectionReady
            ? "기록 확인 중"
            : props.writeAccess ? "기록 열기" : "수록곡 보기";
          const recorded = props.ownerAccess === "owner" && props.recordedReleaseGroupMbids.has(album.releaseGroupMbid);
          return <button className={`candidate-row${props.selected?.releaseGroupMbid === album.releaseGroupMbid ? " selected" : ""}`} type="button" disabled={!props.selectionReady} key={album.releaseGroupMbid} onClick={() => props.onSelectAlbum(album)} aria-pressed={props.selected?.releaseGroupMbid === album.releaseGroupMbid}>
            <span className="candidate-main"><AlbumArt album={album} /><span><strong>{album.title}</strong><small>{album.artist}{album.firstReleaseDate.length > 0 && <> · <time className="release-date" dateTime={album.firstReleaseDate}>{album.firstReleaseDate}</time></>}</small></span></span>
            <span className="candidate-actions"><small className="catalog-type">{album.primaryType}</small>{recorded && <small className="recorded-label">기록 있음</small>}<span className="selection-label"><ArrowRight size={16} weight="bold" aria-hidden="true" />{action}</span></span>
          </button>;
        })}
      </div>
    </section>
    <CatalogAlbumPicker editionMessage={props.editionMessage} editionState={props.editionState} editions={props.editions}
      hasMoreEditions={props.hasMoreEditions} loadingMoreEditions={props.loadingMoreEditions} onLoadMoreEditions={props.onLoadMoreEditions}
      onSelectEdition={props.onSelectEdition} selectedAlbum={props.selected} selectedEdition={props.selectedEdition}
      trackMessage={props.trackMessage} trackState={props.trackState} tracks={props.tracks} />
  </>;
}
