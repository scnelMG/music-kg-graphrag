import { NextResponse, type NextRequest } from "next/server";

import { rateLimit } from "./lib/request-rate-limit";

function publicCatalogRequest(pathname: string): boolean {
  return pathname === "/api/music/albums"
    || pathname.startsWith("/api/music/albums/")
    || pathname === "/api/music/catalog/explore"
    || pathname.startsWith("/api/music/itunes/albums/")
    || pathname === "/api/music/insights";
}

export function middleware(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith("/api/fixture/")
      && process.env.MUSIC_KG_ENABLE_FIXTURE_ROUTES !== "true") {
    return new NextResponse(null, { status: 404 });
  }
  const pathname = request.nextUrl.pathname;
  const retryAfter = pathname === "/api/music/readiness"
    ? rateLimit(request, "readiness", 10, 60_000)
    : request.method === "GET" && publicCatalogRequest(pathname)
      ? rateLimit(request, "public-catalog", 60, 60_000)
      : null;
  if (retryAfter !== null) {
    return NextResponse.json({ code: "RATE_LIMITED", retryable: true }, {
      headers: { "retry-after": String(retryAfter) }, status: 429
    });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/", "/api/:path*"] };
