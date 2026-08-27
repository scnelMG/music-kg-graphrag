"use client";

import ky from "ky";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  albumsSchema,
  editionsPageSchema,
  failureText,
  normalizeExistingRecord,
  recordLookupSchema,
  tracksSchema,
  type Album,
  type AlbumsPayload,
  type ExistingRecord,
  type OwnerAccess,
  type RecordLookupState,
  type RecordState,
  type SearchState,
  type Track,
  type TrackState
} from "../lib/connected-music-contract";
import type { CatalogEdition } from "../lib/music-catalog-contract";
import { isKoreanConsonantOnly } from "../lib/catalog-display";
import { requestBff } from "../lib/review-bff-contract";
import type { CatalogEditionState } from "./catalog-album-picker";

type CatalogWorkflowOptions = Readonly<{ ownerAccess: OwnerAccess; recordState: RecordState }>;

export function useCatalogWorkflow({ ownerAccess, recordState }: CatalogWorkflowOptions) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q")?.trim() ?? "");
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [searchMessage, setSearchMessage] = useState("");
  const [albums, setAlbums] = useState<readonly Album[]>([]);
  const [selected, setSelected] = useState<Album | null>(null);
  const [editions, setEditions] = useState<readonly CatalogEdition[]>([]);
  const [selectedEdition, setSelectedEdition] = useState<CatalogEdition | null>(null);
  const [editionState, setEditionState] = useState<CatalogEditionState>("idle");
  const [editionMessage, setEditionMessage] = useState("");
  const [editionCursor, setEditionCursor] = useState<string | null>(null);
  const [hasMoreEditions, setHasMoreEditions] = useState(false);
  const [loadingMoreEditions, setLoadingMoreEditions] = useState(false);
  const [tracks, setTracks] = useState<readonly Track[]>([]);
  const [trackState, setTrackState] = useState<TrackState>("idle");
  const [trackMessage, setTrackMessage] = useState("");
  const [sentiment, setSentiment] = useState("");
  const [favouriteTrack, setFavouriteTrack] = useState("");
  const [selectedTrack, setSelectedTrack] = useState<Track | undefined>();
  const [owned, setOwned] = useState(false);
  const [selectedExistingRecord, setSelectedExistingRecord] = useState<ExistingRecord | undefined>();
  const [recordLookupState, setRecordLookupState] = useState<RecordLookupState>("idle");
  const [recordLookupMessage, setRecordLookupMessage] = useState("");
  const requestGeneration = useRef(0);
  const recordLookupGeneration = useRef(0);
  const editionGeneration = useRef(0);
  const trackGeneration = useRef(0);
  const executedSearchQuery = useRef<string | null>(null);
  const observedSearchQuery = useRef<string | null>(null);
  const pendingUrlQuery = useRef<string | null>(null);
  const selectionReady = ownerAccess === "visitor" || (ownerAccess === "owner" && recordState === "ready");

  function resetSelection(): void {
    recordLookupGeneration.current += 1;
    editionGeneration.current += 1;
    trackGeneration.current += 1;
    setSelected(null);
    setEditions([]);
    setSelectedEdition(null);
    setEditionState("idle");
    setEditionMessage("");
    setEditionCursor(null); setHasMoreEditions(false); setLoadingMoreEditions(false);
    setTracks([]);
    setTrackState("idle");
    setTrackMessage("");
    setFavouriteTrack("");
    setSelectedTrack(undefined);
    setSentiment("");
    setOwned(false);
    setSelectedExistingRecord(undefined);
    setRecordLookupState("idle");
    setRecordLookupMessage("");
  }

  async function loadTracks(album: Album, edition: CatalogEdition | null, existing?: ExistingRecord): Promise<void> {
    const generation = trackGeneration.current + 1;
    trackGeneration.current = generation;
    setTrackState("loading");
    setTracks([]);
    setFavouriteTrack("");
    setSelectedTrack(undefined);
    const request = album.catalogSource === "ITUNES"
      ? ky.get(`/api/music/itunes/albums/${encodeURIComponent(album.catalogId)}/tracks`, { throwHttpErrors: false })
      : edition === null
        ? null
        : ky.get(`/api/music/albums/${encodeURIComponent(album.releaseGroupMbid)}/tracks`, {
          searchParams: { edition: edition.releaseMbid }, throwHttpErrors: false
        });
    if (request === null) return;
    const outcome = await requestBff(request, tracksSchema);
    if (generation !== trackGeneration.current) return;
    if (outcome.kind === "failure") {
      setTrackState("error");
      setTrackMessage(failureText(outcome));
      return;
    }
    const titleMatches = outcome.value.tracks.filter((track) => track.title === (existing?.favouriteTrack ?? ""));
    const savedTrack = album.catalogSource === "MUSICBRAINZ" && existing?.youtubeRecordingMbid.length
      ? outcome.value.tracks.find((track) => track.recordingMbid === existing.youtubeRecordingMbid)
      : titleMatches.length === 1 ? titleMatches[0] : undefined;
    setTracks(outcome.value.tracks);
    setFavouriteTrack(savedTrack?.title ?? "");
    setSelectedTrack(savedTrack);
    setTrackState(outcome.value.tracks.length === 0 ? "empty" : "ready");
    setTrackMessage(outcome.value.tracks.length === 0 ? "선택할 수 있는 수록곡을 찾지 못했습니다."
      : existing?.favouriteTrack.length && savedTrack === undefined ? "기존 최애곡을 이 발매판의 실제 수록곡에서 하나로 확인하지 못했습니다. 다시 선택해 주세요." : "");
  }

  async function loadEditions(album: Album, existing?: ExistingRecord): Promise<void> {
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
    setFavouriteTrack("");
    if (album.catalogSource === "ITUNES") {
      setEditionState("idle");
      await loadTracks(album, null, existing);
      return;
    }
    const searchParams = existing?.releaseMbid ? { selected: existing.releaseMbid } : undefined;
    const outcome = await requestBff(ky.get(`/api/music/albums/${encodeURIComponent(album.releaseGroupMbid)}/editions`, {
      searchParams, throwHttpErrors: false
    }), editionsPageSchema);
    if (generation !== editionGeneration.current) return;
    if (outcome.kind === "failure") {
      setEditionState("error");
      setEditionMessage(failureText(outcome));
      return;
    }
    setEditions(outcome.value.editions);
    setEditionCursor(outcome.value.nextCursor);
    setHasMoreEditions(outcome.value.hasMore);
    if (outcome.value.editions.length === 0) {
      setEditionState("empty");
      return;
    }
    setEditionState("ready");
    const stored = existing?.releaseMbid
      ? outcome.value.editions.find((edition) => edition.releaseMbid === existing.releaseMbid) ?? null
      : null;
    if (stored === null) return;
    setSelectedEdition(stored);
    await loadTracks(album, stored, existing);
  }

  async function loadMoreEditions(): Promise<void> {
    if (selected === null || selected.catalogSource !== "MUSICBRAINZ" || editionCursor === null || loadingMoreEditions) return;
    const generation = editionGeneration.current;
    setLoadingMoreEditions(true);
    const outcome = await requestBff(ky.get(`/api/music/albums/${encodeURIComponent(selected.releaseGroupMbid)}/editions`, {
      searchParams: { cursor: editionCursor }, throwHttpErrors: false
    }), editionsPageSchema);
    if (generation !== editionGeneration.current) return;
    setLoadingMoreEditions(false);
    if (outcome.kind === "failure") {
      setEditionMessage(failureText(outcome));
      return;
    }
    setEditions((current) => [...current, ...outcome.value.editions.filter(
      (candidate) => current.every((edition) => edition.releaseMbid !== candidate.releaseMbid)
    )]);
    setEditionMessage("");
    setEditionCursor(outcome.value.nextCursor);
    setHasMoreEditions(outcome.value.hasMore);
  }

  async function resolveExistingRecord(album: Album, generation: number): Promise<void> {
    const lookupUrl = album.catalogSource === "ITUNES"
      ? `/api/music/records/by-catalog-identity?${new URLSearchParams({ catalogId: album.catalogId, source: "ITUNES" }).toString()}`
      : `/api/music/records/by-release-group/${encodeURIComponent(album.releaseGroupMbid)}`;
    const outcome = await requestBff(ky.get(lookupUrl, { throwHttpErrors: false }), recordLookupSchema);
    if (generation !== recordLookupGeneration.current) return;
    if (outcome.kind === "failure") {
      setRecordLookupState("error");
      setRecordLookupMessage(failureText(outcome));
      return;
    }
    const existing = outcome.value.record === null ? undefined : normalizeExistingRecord(outcome.value.record);
    setSelectedExistingRecord(existing);
    setSentiment(existing?.sentiment ?? "");
    setOwned(existing?.owned ?? false);
    setRecordLookupState("ready");
    await loadEditions(album, existing);
  }

  function selectAlbum(album: Album): void {
    if (!selectionReady) return;
    const generation = recordLookupGeneration.current + 1;
    recordLookupGeneration.current = generation;
    editionGeneration.current += 1;
    trackGeneration.current += 1;
    setSelected(album);
    setSelectedExistingRecord(undefined);
    setSentiment("");
    setOwned(false);
    setEditions([]);
    setSelectedEdition(null);
    setEditionState("idle");
    setEditionMessage("");
    setEditionCursor(null); setHasMoreEditions(false); setLoadingMoreEditions(false);
    setTracks([]);
    setTrackState("idle");
    setTrackMessage("");
    setFavouriteTrack("");
    setSelectedTrack(undefined);
    setRecordLookupMessage("");
    if (ownerAccess === "visitor") {
      setRecordLookupState("ready");
      void loadEditions(album);
      return;
    }
    setRecordLookupState("loading");
    void resolveExistingRecord(album, generation);
  }

  function selectEdition(edition: CatalogEdition): void {
    if (selected === null || selected.catalogSource !== "MUSICBRAINZ") return;
    setSelectedEdition(edition);
    void loadTracks(selected, edition,
      selectedExistingRecord?.releaseMbid === edition.releaseMbid ? selectedExistingRecord : undefined);
  }

  function selectTrack(recordingMbid: string): void {
    const track = tracks.find((candidate) => candidate.recordingMbid === recordingMbid);
    if (track === undefined) return;
    setSelectedTrack(track);
    setFavouriteTrack(track.title);
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
    const outcome = await requestBff<AlbumsPayload>(ky.get("/api/music/albums", {
      searchParams: { q: normalizedQuery }, throwHttpErrors: false
    }), albumsSchema);
    if (generation !== requestGeneration.current) return;
    if (outcome.kind === "failure") {
      setSearchState("error");
      setSearchMessage(failureText(outcome));
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
    const suffix = nextParams.size === 0 ? "" : `?${nextParams.toString()}`;
    pendingUrlQuery.current = "";
    router.replace(`${pathname}${suffix}`, { scroll: false });
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
    if (ownerAccess === "checking") return;
    if (pendingUrlQuery.current !== null) {
      if (sharedQuery !== pendingUrlQuery.current) return;
      pendingUrlQuery.current = null;
    }
    if (observedSearchQuery.current === sharedQuery) return;
    observedSearchQuery.current = sharedQuery;
    if (sharedQuery.length === 0) return;
    if (executedSearchQuery.current !== sharedQuery) {
      setQuery(sharedQuery);
      void search(sharedQuery);
    }
  }, [ownerAccess, searchParams]);

  return { albums, editionMessage, editionState, editions, favouriteTrack, hasMoreEditions, loadingMoreEditions,
    owned, pathname, query, recordLookupMessage, recordLookupState, searchMessage, searchState, selected,
    selectedEdition, selectedExistingRecord, selectedTrack, selectionReady, sentiment,
    clearSearch, searchExample, selectTrack, setOwned, setQuery, setSentiment, submitSearch, selectAlbum, selectEdition, loadMoreEditions,
    trackMessage, trackState, tracks };
}
