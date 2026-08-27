"use client";

import ky from "ky";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { isKoreanConsonantOnly } from "../lib/catalog-display";
import type { CatalogAlbum, CatalogEdition, CatalogTrack } from "../lib/music-catalog-contract";
import { publicAlbumsSchema, publicEditionsPageSchema, publicTracksSchema } from "../lib/public-discovery-contract";
import { publicBffGet, requestBff } from "../lib/review-bff-contract";
import type { CatalogEditionState } from "./catalog-album-picker";

type PublicSearchState = "empty" | "error" | "guidance" | "idle" | "loading" | "results";
type PublicTrackState = "empty" | "error" | "idle" | "loading" | "ready";

function publicFailureText(failure: Readonly<{ code?: string }>): string {
  return failure.code === "MUSICBRAINZ_RATE_LIMITED" || failure.code === "ITUNES_RATE_LIMITED"
    ? "음악 카탈로그 요청이 잠시 제한되었습니다. 잠시 뒤 다시 검색해 주세요."
    : "음악 정보를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.";
}

export function usePublicCatalogWorkflow() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q")?.trim() ?? "");
  const [searchState, setSearchState] = useState<PublicSearchState>("idle");
  const [searchMessage, setSearchMessage] = useState("");
  const [albums, setAlbums] = useState<readonly CatalogAlbum[]>([]);
  const [selected, setSelected] = useState<CatalogAlbum | null>(null);
  const [editions, setEditions] = useState<readonly CatalogEdition[]>([]);
  const [selectedEdition, setSelectedEdition] = useState<CatalogEdition | null>(null);
  const [editionState, setEditionState] = useState<CatalogEditionState>("idle");
  const [editionMessage, setEditionMessage] = useState("");
  const [editionCursor, setEditionCursor] = useState<string | null>(null);
  const [hasMoreEditions, setHasMoreEditions] = useState(false);
  const [loadingMoreEditions, setLoadingMoreEditions] = useState(false);
  const [tracks, setTracks] = useState<readonly CatalogTrack[]>([]);
  const [trackState, setTrackState] = useState<PublicTrackState>("idle");
  const [trackMessage, setTrackMessage] = useState("");
  const requestGeneration = useRef(0);
  const editionGeneration = useRef(0);
  const trackGeneration = useRef(0);
  const executedSearchQuery = useRef<string | null>(null);
  const observedSearchQuery = useRef<string | null>(null);
  const pendingUrlQuery = useRef<string | null>(null);

  function resetSelection(): void {
    editionGeneration.current += 1;
    trackGeneration.current += 1;
    setSelected(null);
    setEditions([]);
    setSelectedEdition(null);
    setEditionState("idle");
    setEditionMessage("");
    setEditionCursor(null);
    setHasMoreEditions(false);
    setLoadingMoreEditions(false);
    setTracks([]);
    setTrackState("idle");
    setTrackMessage("");
  }

  async function loadTracks(album: CatalogAlbum, edition: CatalogEdition | null): Promise<void> {
    const generation = trackGeneration.current + 1;
    trackGeneration.current = generation;
    setTrackState("loading");
    setTracks([]);
    setTrackMessage("");
    const request = album.catalogSource === "ITUNES"
      ? ky.get(`/api/music/itunes/albums/${encodeURIComponent(album.catalogId)}/tracks`, { throwHttpErrors: false })
      : edition === null ? null : ky.get(`/api/music/albums/${encodeURIComponent(album.releaseGroupMbid)}/tracks`, {
        searchParams: { edition: edition.releaseMbid }, throwHttpErrors: false
      });
    if (request === null) return;
    const outcome = await requestBff(request, publicTracksSchema);
    if (generation !== trackGeneration.current) return;
    if (outcome.kind === "failure") {
      setTrackState("error");
      setTrackMessage(publicFailureText(outcome));
      return;
    }
    setTracks(outcome.value.tracks);
    setTrackState(outcome.value.tracks.length === 0 ? "empty" : "ready");
    setTrackMessage(outcome.value.tracks.length === 0 ? "선택할 수 있는 수록곡을 찾지 못했습니다." : "");
  }

  async function loadEditions(album: CatalogAlbum): Promise<void> {
    const generation = editionGeneration.current + 1;
    editionGeneration.current = generation;
    trackGeneration.current += 1;
    setEditions([]);
    setSelectedEdition(null);
    setEditionState("loading");
    setEditionMessage("");
    setEditionCursor(null);
    setHasMoreEditions(false);
    setTracks([]);
    setTrackState("idle");
    setTrackMessage("");
    if (album.catalogSource === "ITUNES") {
      setEditionState("idle");
      await loadTracks(album, null);
      return;
    }
    const outcome = await requestBff(ky.get(`/api/music/albums/${encodeURIComponent(album.releaseGroupMbid)}/editions`, {
      throwHttpErrors: false
    }), publicEditionsPageSchema);
    if (generation !== editionGeneration.current) return;
    if (outcome.kind === "failure") {
      setEditionState("error");
      setEditionMessage(publicFailureText(outcome));
      return;
    }
    setEditions(outcome.value.editions);
    setEditionCursor(outcome.value.nextCursor);
    setHasMoreEditions(outcome.value.hasMore);
    setEditionState(outcome.value.editions.length === 0 ? "empty" : "ready");
  }

  async function loadMoreEditions(): Promise<void> {
    if (selected === null || selected.catalogSource !== "MUSICBRAINZ" || editionCursor === null || loadingMoreEditions) return;
    const generation = editionGeneration.current;
    setLoadingMoreEditions(true);
    try {
      const outcome = await requestBff(ky.get(`/api/music/albums/${encodeURIComponent(selected.releaseGroupMbid)}/editions`, {
        searchParams: { cursor: editionCursor }, throwHttpErrors: false
      }), publicEditionsPageSchema);
      if (generation !== editionGeneration.current) return;
      if (outcome.kind === "failure") {
        setEditionMessage(publicFailureText(outcome));
        return;
      }
      setEditions((current) => [...current, ...outcome.value.editions.filter(
        (candidate) => current.every((edition) => edition.releaseMbid !== candidate.releaseMbid)
      )]);
      setEditionMessage("");
      setEditionCursor(outcome.value.nextCursor);
      setHasMoreEditions(outcome.value.hasMore);
    } finally {
      if (generation === editionGeneration.current) setLoadingMoreEditions(false);
    }
  }

  function selectAlbum(album: CatalogAlbum): void {
    editionGeneration.current += 1;
    trackGeneration.current += 1;
    setSelected(album);
    setEditions([]);
    setSelectedEdition(null);
    setEditionState("idle");
    setEditionMessage("");
    setEditionCursor(null);
    setHasMoreEditions(false);
    setLoadingMoreEditions(false);
    setTracks([]);
    setTrackState("idle");
    setTrackMessage("");
    void loadEditions(album);
  }

  function selectEdition(edition: CatalogEdition): void {
    if (selected === null || selected.catalogSource !== "MUSICBRAINZ") return;
    setSelectedEdition(edition);
    void loadTracks(selected, edition);
  }

  async function search(nextQuery = query.trim()): Promise<void> {
    const normalizedQuery = nextQuery.trim();
    if (normalizedQuery.length === 0) return;
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;
    executedSearchQuery.current = normalizedQuery;
    if (isKoreanConsonantOnly(normalizedQuery)) {
      setAlbums([]);
      resetSelection();
      setSearchMessage("초성 검색은 지원하지 않아요. 완성된 앨범명이나 가수명을 입력해 주세요.");
      setSearchState("guidance");
      return;
    }
    setSearchState("loading");
    setAlbums([]);
    resetSelection();
    const outcome = await requestBff(publicBffGet("/api/music/albums", {
      searchParams: { q: normalizedQuery }
    }), publicAlbumsSchema);
    if (generation !== requestGeneration.current) return;
    if (outcome.kind === "failure") {
      setSearchState("error");
      setSearchMessage(publicFailureText(outcome));
      return;
    }
    setAlbums(outcome.value.albums);
    setSearchState(outcome.value.albums.length === 0 ? "empty" : "results");
  }

  function submitSearch(): void {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length === 0) return;
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("q", normalizedQuery);
    pendingUrlQuery.current = normalizedQuery;
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
    void search(normalizedQuery);
  }

  function clearSearch(): void {
    requestGeneration.current += 1;
    executedSearchQuery.current = null;
    setQuery("");
    setAlbums([]);
    setSearchMessage("");
    setSearchState("idle");
    resetSelection();
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("q");
    pendingUrlQuery.current = "";
    router.replace(`${pathname}${nextParams.size === 0 ? "" : `?${nextParams.toString()}`}`, { scroll: false });
  }

  function searchExample(example: string): void {
    setQuery(example);
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("q", example);
    pendingUrlQuery.current = example;
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
    void search(example);
  }

  useEffect(() => {
    const sharedQuery = searchParams.get("q")?.trim() ?? "";
    if (pendingUrlQuery.current !== null) {
      if (sharedQuery !== pendingUrlQuery.current) return;
      pendingUrlQuery.current = null;
    }
    if (observedSearchQuery.current === sharedQuery) return;
    observedSearchQuery.current = sharedQuery;
    if (sharedQuery.length === 0 || executedSearchQuery.current === sharedQuery) return;
    setQuery(sharedQuery);
    void search(sharedQuery);
  }, [searchParams]);

  return { albums, editionMessage, editionState, editions, hasMoreEditions, loadingMoreEditions,
    pathname, query, searchMessage, searchState, selected, selectedEdition, selectionReady: true,
    trackMessage, trackState, tracks, clearSearch, loadMoreEditions, searchExample, selectAlbum,
    selectEdition, setQuery, submitSearch };
}
