import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { backendContractError, callBackend } from "../../../../lib/backend-bff";
import { sameOriginCoverUrl } from "../../../../lib/cover-art";
import { catalogAlbumSchema } from "../../../../lib/music-catalog-contract";

const publicCatalogCacheControl = "public, s-maxage=600, stale-while-revalidate=86400";
const catalogQuerySchema = z.string().trim().min(1).max(200);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const query = catalogQuerySchema.safeParse(request.nextUrl.searchParams.get("q"));
  if (!query.success) return NextResponse.json({ code: "MALFORMED_REQUEST", retryable: false }, { status: 400 });
  const result = await callBackend("api/v1/catalog/albums", { searchParams: new URLSearchParams({ q: query.data }) });
  if (result.kind === "handled") return result.response;
  let payload: unknown;
  try {
    payload = await result.response.json();
  } catch (error) {
    if (error instanceof SyntaxError) return backendContractError();
    throw error;
  }
  const albums = z.array(catalogAlbumSchema).safeParse(payload);
  return albums.success
    ? NextResponse.json({
      albums: albums.data.map((album) => ({
        ...album,
        coverUrl: sameOriginCoverUrl(album.coverUrl, album.releaseGroupMbid, request.url)
      }))
    }, { headers: { "cache-control": publicCatalogCacheControl } })
    : backendContractError();
}
