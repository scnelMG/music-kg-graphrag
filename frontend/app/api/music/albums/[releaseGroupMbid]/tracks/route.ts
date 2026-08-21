import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { backendContractError, callBackend } from "../../../../../../lib/backend-bff";
import { catalogTrackSchema } from "../../../../../../lib/music-catalog-contract";

const paramsSchema = z.object({ releaseGroupMbid: z.string().trim().min(1) });
const tracksSchema = z.array(catalogTrackSchema);

const publicCatalogCacheControl = "public, s-maxage=600, stale-while-revalidate=86400";

export async function GET(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly releaseGroupMbid: string }> }
): Promise<NextResponse> {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ code: "MALFORMED_REQUEST", retryable: false }, { status: 400 });
  const queryKeys = [...request.nextUrl.searchParams.keys()];
  const editions = request.nextUrl.searchParams.getAll("edition");
  const edition = editions[0]?.trim() ?? "";
  if (queryKeys.length !== 1 || queryKeys[0] !== "edition" || editions.length !== 1 || edition.length === 0) {
    return NextResponse.json({ code: "MALFORMED_REQUEST", retryable: false }, { status: 400 });
  }
  const result = await callBackend(
    `api/v1/catalog/albums/${encodeURIComponent(params.data.releaseGroupMbid)}/tracks`,
    { searchParams: new URLSearchParams({ edition }) }
  );
  if (result.kind === "handled") return result.response;
  let payload: unknown;
  try {
    payload = await result.response.json();
  } catch (error) {
    if (error instanceof SyntaxError) return backendContractError();
    throw error;
  }
  const tracks = tracksSchema.safeParse(payload);
  return tracks.success
    ? NextResponse.json({ tracks: tracks.data }, { headers: { "cache-control": publicCatalogCacheControl } })
    : backendContractError();
}
