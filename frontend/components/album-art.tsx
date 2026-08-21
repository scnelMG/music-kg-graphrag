"use client";

import { useState } from "react";

type AlbumArtInput = Readonly<{ readonly coverUrl: string; readonly title: string }> | Readonly<{ readonly albumTitle: string; readonly coverUrl: string }>;
type AlbumArtSize = "cover-rail" | "hero" | "row";

export function AlbumArt({ album, size = "row" }: { readonly album: AlbumArtInput; readonly size?: AlbumArtSize }): React.JSX.Element {
  const title = "title" in album ? album.title : album.albumTitle;
  const [failedCoverUrl, setFailedCoverUrl] = useState<string | null>(null);
  const unavailable = album.coverUrl.length === 0 || failedCoverUrl === album.coverUrl;
  const className = `album-art album-art-${size}`;
  if (unavailable) {
    return <span className={`${className} album-art-missing`} aria-label={`${title} 표지 정보 없음`}>표지 없음</span>;
  }
  const dimension = size === "hero" ? 176 : size === "cover-rail" ? 144 : 64;
  return <img className={className} src={album.coverUrl} alt={`${title} 앨범 커버`} width={dimension} height={dimension} loading="lazy" decoding="async" onError={() => setFailedCoverUrl(album.coverUrl)} />;
}
