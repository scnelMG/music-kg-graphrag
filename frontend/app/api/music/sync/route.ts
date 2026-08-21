import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { backendContractError, callBackend } from "../../../../lib/backend-bff";
import { requireOwnerSession, requireOwnerWriteSession } from "../../../../lib/owner-session";

const personalSyncSchema = z.object({
  changedRecordCount: z.number().int().nonnegative(),
  lastSuccessfulAt: z.string().datetime().nullable(),
  stale: z.boolean(),
  status: z.enum(["CURRENT", "STALE", "UNINITIALIZED"])
});

async function proxy(request: NextRequest, method: "GET" | "POST"): Promise<NextResponse> {
  const ownerSession = method === "POST" ? requireOwnerWriteSession(request) : requireOwnerSession(request);
  if (ownerSession !== null) return ownerSession;
  const mode = request.nextUrl.searchParams.get("mode");
  if (mode !== null && mode !== "reconcile") {
    return NextResponse.json({ code: "MALFORMED_REQUEST", retryable: false }, { status: 400 });
  }
  const path = method === "POST" && mode === "reconcile"
    ? "api/v1/personal-sync/reconcile"
    : "api/v1/personal-sync";
  const result = await callBackend(path, { method });
  if (result.kind === "handled") return result.response;
  let payload: unknown;
  try {
    payload = await result.response.json();
  } catch (error) {
    if (error instanceof SyntaxError) return backendContractError();
    throw error;
  }
  const syncState = personalSyncSchema.safeParse(payload);
  return syncState.success ? NextResponse.json(syncState.data) : backendContractError();
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return proxy(request, "GET");
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return proxy(request, "POST");
}
