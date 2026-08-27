"use client";

import { useCallback, useEffect, useState } from "react";

import type { Album } from "../lib/connected-music-contract";
import { catalogAlbumSchema } from "../lib/music-catalog-contract";

const storageKey = "music-kg-public-album-likes-v1";

function readLikes(): readonly Album[] {
  try {
    const parsed = catalogAlbumSchema.array().safeParse(JSON.parse(window.localStorage.getItem(storageKey) ?? "[]"));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function writeLikes(likes: readonly Album[]): boolean {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(likes));
    return true;
  } catch {
    return false;
  }
}

export function useBrowserAlbumLikes() {
  const [likes, setLikes] = useState<readonly Album[]>([]);

  useEffect(() => {
    setLikes(readLikes());
  }, []);

  const like = useCallback((album: Album): boolean => {
    const next = [...likes.filter((item) => item.releaseGroupMbid !== album.releaseGroupMbid), album];
    if (!writeLikes(next)) return false;
    setLikes(next);
    return true;
  }, [likes]);

  return { like, likes };
}
