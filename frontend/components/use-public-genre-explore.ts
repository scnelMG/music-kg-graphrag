"use client";

import { useState } from "react";

import { albumsSchema, failureText, type Album, type AlbumsPayload } from "../lib/connected-music-contract";
import { publicBffGet, requestBff } from "../lib/review-bff-contract";

export type PublicGenre = "dream-pop" | "electronic" | "folk" | "indie-rock";
export type PublicGenreState = "error" | "idle" | "loading" | "ready";

export function usePublicGenreExplore() {
  const [albums, setAlbums] = useState<readonly Album[]>([]);
  const [genre, setGenre] = useState<PublicGenre | null>(null);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<PublicGenreState>("idle");

  async function explore(nextGenre: PublicGenre): Promise<void> {
    setGenre(nextGenre);
    setState("loading");
    setMessage("");
    setAlbums([]);
    const outcome = await requestBff<AlbumsPayload>(publicBffGet("/api/music/catalog/explore", {
      searchParams: { genre: nextGenre }
    }), albumsSchema);
    if (outcome.kind === "failure") {
      setState("error");
      setMessage(failureText(outcome));
      return;
    }
    setAlbums(outcome.value.albums);
    setState("ready");
    setMessage(outcome.value.albums.length === 0 ? "이 흐름에서 찾을 수 있는 앨범이나 EP가 아직 없습니다." : "");
  }

  return { albums, explore, genre, message, state };
}
