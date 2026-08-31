import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { backendContractError, callBackend } from "../../../../../lib/backend-bff";
import { requireOwnerSession } from "../../../../../lib/owner-session";
import { backendExistingRecordSchema, publicExistingRecord } from "../../../../../lib/personal-record-contract";

const identityQuerySchema = z.object({
  catalogId: z.string().regex(/^[0-9]+$/),
  source: z.literal("ITUNES")
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ownerSession = requireOwnerSession(request);
  if (ownerSession !== null) return ownerSession;
  const query = identityQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) return NextResponse.json({ code: "MALFORMED_REQUEST", retryable: false }, { status: 400 });
  const result = await callBackend("api/v1/listening-records/by-catalog-identity", {
    searchParams: new URLSearchParams({ catalogId: query.data.catalogId, source: query.data.source })
  });
  if (result.kind === "handled") return result.response;
  if (result.response.status === 204) return NextResponse.json({ record: null });
  let payload: unknown;
  try {
    payload = await result.response.json();
  } catch (error) {
    if (error instanceof SyntaxError) return backendContractError();
    throw error;
  }
  const record = backendExistingRecordSchema.safeParse(payload);
  const secret = process.env.BACKEND_BFF_SHARED_SECRET;
  if (!record.success || record.data.catalogSource !== query.data.source || record.data.catalogId !== query.data.catalogId
    || secret === undefined || secret.length === 0) return backendContractError();
  return NextResponse.json({ record: publicExistingRecord(record.data, secret) });
}
