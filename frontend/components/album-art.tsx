"use client";

import Image from "next/image";
import { useState } from "react";

type AlbumArtInput = Readonly<{ readonly coverUrl: string; readonly title: string }> | Readonly<{ readonly albumTitle: string; readonly coverUrl: string }>;
type AlbumArtSize = "cover-rail" | "hero" | "row";

export function AlbumArt({ album, priority = false, size = "row" }: { readonly album: AlbumArtInput; readonly priority?: boolean; readonly size?: AlbumArtSize }): React.JSX.Element {
  const title = "title" in album ? album.title : album.albumTitle;
  const [failedCoverUrl, setFailedCoverUrl] = useState<string | null>(null);
  const [loadedCoverUrl, setLoadedCoverUrl] = useState<string | null>(null);
  const unavailable = album.coverUrl.length === 0 || failedCoverUrl === album.coverUrl;
  const className = `album-art album-art-${size}`;
  if (unavailable) {
    return <span className={`${className} album-art-missing`} aria-label={`${title} 표지 정보 없음`}>표지 없음</span>;
  }
  const dimension = size === "hero" ? 176 : size === "cover-rail" ? 144 : 64;
  const prioritized = priority || size === "hero";
  const loading = loadedCoverUrl !== album.coverUrl;
  return <span className={className} aria-busy={loading}>
    {loading && <span className="album-art-status" role="status">표지 불러오는 중</span>}
    <Image className={`album-art-image${loading ? " is-loading" : ""}`} src={album.coverUrl} alt={`${title} 앨범 커버`} width={dimension} height={dimension} priority={prioritized} unoptimized onLoad={() => setLoadedCoverUrl(album.coverUrl)} onError={() => setFailedCoverUrl(album.coverUrl)} />
  </span>;
}
