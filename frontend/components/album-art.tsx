"use client";

import { useState } from "react";

type AlbumArtInput = Readonly<{ readonly coverUrl: string; readonly title: string }> | Readonly<{ readonly albumTitle: string; readonly coverUrl: string }>;

export function AlbumArt({ album }: { readonly album: AlbumArtInput }): React.JSX.Element {
  const title = "title" in album ? album.title : album.albumTitle;
  const [failedCoverUrl, setFailedCoverUrl] = useState<string | null>(null);
  const unavailable = album.coverUrl.length === 0 || failedCoverUrl === album.coverUrl;
  if (unavailable) {
    return <span className="album-art album-art-missing" aria-label={`${title} 표지 정보 없음`}>표지 없음</span>;
  }
  return <img className="album-art" src={album.coverUrl} alt={`${title} 앨범 커버`} width={52} height={52} loading="lazy" decoding="async" onError={() => setFailedCoverUrl(album.coverUrl)} />;
}
