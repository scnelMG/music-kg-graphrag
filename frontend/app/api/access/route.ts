import { NextResponse, type NextRequest } from "next/server";

import { APP_ACCESS_COOKIE, APP_ACCESS_SESSION_SECONDS, createAppAccessSession, hasValidAppAccessToken, parseAppAccessPayload } from "../../../lib/app-access";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ code: "MALFORMED_REQUEST" }, { status: 400 });
    throw error;
  }
  const token = parseAppAccessPayload(rawPayload);
  if (token === null || !hasValidAppAccessToken(token)) {
    return NextResponse.json({ code: "APP_ACCESS_DENIED" }, { status: 401 });
  }
  const session = await createAppAccessSession();
  if (session === null) return NextResponse.json({ code: "APP_ACCESS_CONFIGURATION_ERROR" }, { status: 503 });
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set({
    httpOnly: true,
    maxAge: APP_ACCESS_SESSION_SECONDS,
    name: APP_ACCESS_COOKIE,
    path: "/",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    value: session
  });
  return response;
}

export async function DELETE(): Promise<NextResponse> {
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set({ httpOnly: true, maxAge: 0, name: APP_ACCESS_COOKIE, path: "/", sameSite: "strict", secure: process.env.NODE_ENV === "production", value: "" });
  return response;
}
