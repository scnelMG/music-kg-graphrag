"use client";

import type { CatalogAlbum, CatalogEdition, CatalogTrack } from "../lib/music-catalog-contract";

import { AlbumArt } from "./album-art";

export type CatalogEditionState = "empty" | "error" | "idle" | "loading" | "ready";
export type CatalogTrackState = "empty" | "error" | "idle" | "loading" | "ready";

type CatalogAlbumPickerProps = Readonly<{
  readonly editionMessage: string;
  readonly editionState: CatalogEditionState;
  readonly editions: readonly CatalogEdition[];
  readonly hasMoreEditions: boolean;
  readonly loadingMoreEditions: boolean;
  readonly onLoadMoreEditions: () => void;
  readonly onSelectEdition: (edition: CatalogEdition) => void;
  readonly selectedAlbum: CatalogAlbum | null;
  readonly selectedEdition: CatalogEdition | null;
  readonly trackMessage: string;
  readonly trackState: CatalogTrackState;
  readonly tracks: readonly CatalogTrack[];
}>;

function editionLabel(edition: CatalogEdition): string {
  const facts = [edition.releaseDate, edition.country, edition.status, edition.disambiguation]
    .filter((fact) => fact.length > 0);
  return facts.length === 0 ? edition.title : `${edition.title} · ${facts.join(" · ")}`;
}

export function CatalogAlbumPicker({
  editionMessage,
  editionState,
  editions,
  hasMoreEditions,
  loadingMoreEditions,
  onLoadMoreEditions,
  onSelectEdition,
  selectedAlbum,
  selectedEdition,
  trackMessage,
  trackState,
  tracks
}: CatalogAlbumPickerProps): React.JSX.Element {
  return <section className="catalog-album-detail" aria-live="polite">
    <p className="section-kicker">선택한 음반</p>
    {selectedAlbum === null
      ? <p>앨범이나 EP를 고르면 실제 발매판과 수록곡을 확인할 수 있습니다.</p>
      : <>
        <header className="catalog-selection-heading">
          <AlbumArt album={selectedAlbum} />
          <div><h3>{selectedAlbum.title}</h3><p>{selectedAlbum.artist} · {selectedAlbum.primaryType}</p></div>
        </header>
        <fieldset className="edition-picker" disabled={editionState === "loading"}>
          <legend>발매판 선택</legend>
          <p className="edition-picker-description"><span>추천 판본을 먼저 보여드려요.</span><span>다른 판본도 직접 고를 수 있어요.</span></p>
          {editionState === "loading" && <p>발매판을 불러오는 중입니다.</p>}
          {editionState === "error" && <p className="notice error" role="status">{editionMessage}</p>}
          {editionState === "empty" && <p>선택할 수 있는 실제 발매판을 찾지 못했습니다.</p>}
          {editionState === "ready" && <div className="edition-list">
            {editions.map((edition) => <button
              aria-pressed={selectedEdition?.releaseMbid === edition.releaseMbid}
              className={`edition-option${selectedEdition?.releaseMbid === edition.releaseMbid ? " selected" : ""}`}
              key={edition.releaseMbid}
              onClick={() => onSelectEdition(edition)}
              type="button"
            >
              <span>{editionLabel(edition)}</span>{edition.recommended && <small>추천</small>}
            </button>)}
          </div>}
          {editionState === "ready" && editionMessage.length > 0 && <p className="notice error" role="status">{editionMessage}</p>}
          {editionState === "ready" && hasMoreEditions && <button className="edition-more" type="button" disabled={loadingMoreEditions} onClick={onLoadMoreEditions}>
            {loadingMoreEditions ? "더 불러오는 중" : editionMessage.length > 0 ? "발매판 다시 불러오기" : "발매판 더 보기"}
          </button>}
        </fieldset>
        <section className="catalog-tracks" aria-labelledby="catalog-tracks-heading">
          <p className="section-kicker">수록곡</p><h4 id="catalog-tracks-heading">{selectedEdition === null ? "발매판을 고르면 수록곡을 확인합니다." : selectedEdition.title}</h4>
          {trackState === "idle" && selectedEdition !== null && <p>선택한 발매판의 실제 수록곡을 준비합니다.</p>}
          {trackState === "loading" && <p>수록곡을 불러오는 중입니다.</p>}
          {trackState === "error" && <p className="notice error" role="status">{trackMessage}</p>}
          {trackState === "empty" && <p>{trackMessage}</p>}
          {trackState === "ready" && <ol className="catalog-track-list">{tracks.map((track) => <li key={track.recordingMbid}>{track.title}</li>)}</ol>}
        </section>
      </>}
  </section>;
}
