"use client";

import type { KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";

import type { CatalogAlbum } from "../lib/music-catalog-contract";
import { AlbumArt } from "./album-art";
import { useBrowserAlbumLikes } from "./use-browser-album-likes";

export type PublicDiscoveryAlbum = CatalogAlbum & Readonly<{
  publicCurationReason?: "same-artist" | "shared-tag";
  sharedMusicBrainzTag?: string;
}>;

type PublicDiscoveryDeckProps = Readonly<{
  readonly albums: readonly PublicDiscoveryAlbum[];
  readonly label: string;
  readonly onOpenAlbum: (album: CatalogAlbum) => void;
}>;

type TransitionState = "entering" | "exiting" | "idle";

const transitionDurationMs = 90;

type DiscoveryAlbumCardProps = Readonly<{
  readonly album: PublicDiscoveryAlbum;
  readonly layer: "current" | "outgoing";
  readonly onOpenAlbum: (album: CatalogAlbum) => void;
  readonly transitionState: TransitionState;
}>;

function DiscoveryAlbumCard({ album, layer, onOpenAlbum, transitionState }: DiscoveryAlbumCardProps): React.JSX.Element {
  return <article className={`discovery-card discovery-card-${layer}`} data-transition-state={transitionState} aria-label={`${album.title}, ${album.artist}`}>
    <AlbumArt album={album} size="hero" priority />
    <div className="discovery-card-copy"><p className="entry-eyebrow">{album.primaryType === "EP" ? "EP" : "앨범"}</p><h3>{album.title}</h3><p>{album.artist}</p>{album.publicCurationReason !== undefined && <p className="public-reason">{album.publicCurationReason === "shared-tag"
      ? <>아카이브에 쌓인 <span className="keep-together">“{album.sharedMusicBrainzTag}”</span> 흐름과 이어집니다.</>
      : "아카이브가 다뤄 온 아티스트의 다른 앨범입니다."}</p>}
      <button className="discovery-open" type="button" disabled={transitionState !== "idle"} onClick={() => onOpenAlbum(album)}>수록곡 보기</button></div>
  </article>;
}

export function PublicDiscoveryDeck({ albums, label, onOpenAlbum }: PublicDiscoveryDeckProps): React.JSX.Element {
  const { like, likes } = useBrowserAlbumLikes();
  const [index, setIndex] = useState(0);
  const [message, setMessage] = useState("");
  const [outgoingAlbum, setOutgoingAlbum] = useState<PublicDiscoveryAlbum | null>(null);
  const [transitionState, setTransitionState] = useState<TransitionState>("idle");
  const transitionTimer = useRef<number | null>(null);
  const albumSetKey = albums.map((album) => album.releaseGroupMbid).join("|");
  const current = albums[index] ?? null;
  const nextAlbum = albums[index + 1] ?? null;

  useEffect(() => { setIndex(0); }, [albumSetKey]);
  useEffect(() => () => {
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
  }, []);

  function commitAdvance(): void {
    setIndex((currentIndex) => Math.min(currentIndex + 1, albums.length));
  }

  function advance(): void {
    if (transitionState !== "idle") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      commitAdvance();
      return;
    }
    setTransitionState("exiting");
    transitionTimer.current = window.setTimeout(() => {
      setOutgoingAlbum(current);
      commitAdvance();
      setTransitionState("entering");
      transitionTimer.current = window.setTimeout(() => {
        setTransitionState("idle");
        setOutgoingAlbum(null);
      }, transitionDurationMs);
    }, transitionDurationMs);
  }

  function skip(): void {
    if (current === null || transitionState !== "idle") return;
    setMessage("다음 앨범을 보여드립니다.");
    advance();
  }

  function saveLike(): void {
    if (current === null || transitionState !== "idle") return;
    if (!like(current)) {
      setMessage("이 브라우저에는 좋아요를 저장할 수 없습니다. 다시 시도하거나 넘기기를 선택해 주세요.");
      return;
    }
    setMessage("좋아요한 앨범에 담았습니다. 이 목록은 지금 브라우저에만 저장됩니다.");
    advance();
  }

  function restart(): void {
    setIndex(0);
    setOutgoingAlbum(null);
    setTransitionState("idle");
    setMessage("첫 번째 앨범부터 다시 보여드립니다.");
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.currentTarget !== event.target) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      skip();
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      saveLike();
    }
  }

  return <><section className="public-discovery-deck" data-testid="public-discovery-deck" tabIndex={0} onKeyDown={onKeyDown} aria-label={`${label} 카드 탐색`}>
    <header className="public-discovery-heading"><div><p className="section-kicker">{label}</p><h2>한 장씩 골라 보세요.</h2></div><p className="deck-count" aria-live="polite">{current === null ? albums.length : index + 1} / {albums.length}</p></header>
    <div className="discovery-stage-frame">{nextAlbum !== null && nextAlbum.coverUrl.trim().length > 0 && <div className="discovery-next-preview" aria-hidden="true">
      <AlbumArt album={nextAlbum} size="hero" />
    </div>}{current === null
      ? <div className="deck-finish" role="status"><strong>살펴볼 앨범을 모두 봤습니다.</strong><p>좋아요한 앨범은 아래에서 다시 열 수 있습니다.</p><button type="button" className="discovery-open" onClick={restart}>처음부터 보기</button></div>
      : <DiscoveryAlbumCard album={current} layer="current" onOpenAlbum={onOpenAlbum} transitionState={transitionState} />}
      {outgoingAlbum !== null && <DiscoveryAlbumCard album={outgoingAlbum} layer="outgoing" onOpenAlbum={onOpenAlbum} transitionState="exiting" />}
    </div>
    <div className="deck-actions"><button className="deck-skip" type="button" disabled={current === null || transitionState !== "idle"} onClick={skip}>넘기기</button><button className="deck-like" type="button" disabled={current === null || transitionState !== "idle"} onClick={saveLike}>좋아요</button></div>
    <p className="deck-keyboard-hint">← 넘기기 · → 좋아요</p>
    <p className="visually-hidden" aria-live="polite">{message}</p>
  </section>{likes.length > 0 && <section className="public-liked-list" data-testid="public-liked-list" aria-label="좋아요한 앨범">
      <header><h3>좋아요한 앨범 다시 열기</h3></header>
      <div>{likes.map((album) => <article key={album.releaseGroupMbid} className="liked-album-item"><AlbumArt album={album} size="cover-rail" /><div><strong>{album.title}</strong><span>{album.artist}</span></div><button type="button" onClick={() => onOpenAlbum(album)}>열기</button></article>)}</div>
    </section>}</>;
}
