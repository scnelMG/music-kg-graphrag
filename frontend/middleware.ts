import { NextResponse, type NextRequest } from "next/server";

import { hasValidAppAccessSession, isProductionAccessRequired, APP_ACCESS_COOKIE } from "./lib/app-access";

function accessRequiredResponse(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ code: "APP_ACCESS_REQUIRED" }, { status: 401 });
  }
  const accessUrl = new URL("/access", request.url);
  accessUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(accessUrl);
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  if (request.nextUrl.pathname === "/api/access") return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/fixture/")
      && process.env.MUSIC_KG_ENABLE_FIXTURE_ROUTES !== "true") {
    return new NextResponse(null, { status: 404 });
  }
  if (!isProductionAccessRequired()) return NextResponse.next();
  const sessionToken = request.cookies.get(APP_ACCESS_COOKIE)?.value;
  return await hasValidAppAccessSession(sessionToken) ? NextResponse.next() : accessRequiredResponse(request);
}

export const config = { matcher: ["/", "/api/:path*"] };
