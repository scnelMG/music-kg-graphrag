import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith("/api/fixture/")
      && process.env.MUSIC_KG_ENABLE_FIXTURE_ROUTES !== "true") {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/", "/api/:path*"] };
