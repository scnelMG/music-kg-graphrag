import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { backendContractError, callBackend } from "../../../../../lib/backend-bff";
import { directCoverArtArchiveUrl } from "../../../../../lib/cover-art";
import { catalogAlbumSchema } from "../../../../../lib/music-catalog-contract";

const publicCatalogCacheControl = "public, s-maxage=600, stale-while-revalidate=86400";
const publicGenreSchema = z.enum(["dream-pop", "indie-rock", "folk", "electronic"]);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const genre = publicGenreSchema.safeParse(request.nextUrl.searchParams.get("genre"));
  if (!genre.success) return NextResponse.json({ code: "MALFORMED_REQUEST", retryable: false }, { status: 400 });
  const result = await callBackend("api/v1/catalog/explore", { searchParams: new URLSearchParams({ genre: genre.data }) });
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
        coverUrl: directCoverArtArchiveUrl(album.coverUrl, album.releaseGroupMbid)
      }))
    }, { headers: { "cache-control": publicCatalogCacheControl } })
    : backendContractError();
}
