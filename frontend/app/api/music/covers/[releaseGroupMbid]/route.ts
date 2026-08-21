import ky, { TimeoutError } from "ky";
import { NextRequest, NextResponse } from "next/server";

import { isMusicBrainzReleaseGroupMbid } from "../../../../../lib/cover-art";

const coverArtArchiveOrigin = "https://coverartarchive.org";
const cacheControl = "public, s-maxage=86400, stale-while-revalidate=604800";

export async function GET(_request: NextRequest, context: { readonly params: Promise<{ readonly releaseGroupMbid: string }> }): Promise<NextResponse> {
  const { releaseGroupMbid } = await context.params;
  if (!isMusicBrainzReleaseGroupMbid(releaseGroupMbid)) {
    return NextResponse.json({ code: "MALFORMED_REQUEST", retryable: false }, { status: 400 });
  }
  try {
    const response = await ky.get(`${coverArtArchiveOrigin}/release-group/${releaseGroupMbid}/front-250`, {
      retry: 0,
      throwHttpErrors: false,
      timeout: 10_000
    });
    if (response.status === 404) return new NextResponse(null, { status: 404 });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.startsWith("image/")) return new NextResponse(null, { status: 502 });
    return new NextResponse(await response.arrayBuffer(), {
      headers: { "cache-control": cacheControl, "content-type": contentType }
    });
  } catch (error) {
    if (error instanceof TimeoutError || error instanceof TypeError) return new NextResponse(null, { status: 503 });
    throw error;
  }
}
