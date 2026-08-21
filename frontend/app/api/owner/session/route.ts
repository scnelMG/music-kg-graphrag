import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { clearOwnerSession, createOwnerSession, isOwnerSession, isOwnerWriteSession, setOwnerSession } from "../../../../lib/owner-session";

const requestSchema = z.object({ token: z.string().min(1).max(512) });

export function GET(request: NextRequest): NextResponse {
  const owner = isOwnerSession(request);
  return NextResponse.json({ owner, writeOwner: owner && isOwnerWriteSession(request) });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ code: "MALFORMED_REQUEST", retryable: false }, { status: 400 });
    throw error;
  }
  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ code: "MALFORMED_REQUEST", retryable: false }, { status: 400 });
  const session = createOwnerSession(parsed.data.token);
  if (session === null) return NextResponse.json({ code: "OWNER_AUTHENTICATION_FAILED", retryable: false }, { status: 401 });
  return setOwnerSession(NextResponse.json({ status: "ok" }), session);
}

export function DELETE(): NextResponse {
  return clearOwnerSession(NextResponse.json({ status: "ok" }));
}
