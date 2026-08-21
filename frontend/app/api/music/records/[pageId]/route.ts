import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { backendContractError, callBackend } from "../../../../../lib/backend-bff";
import { requireOwnerWriteSession } from "../../../../../lib/owner-session";
import { productionWriteConfirmationRequired } from "../../../../../lib/personal-write-intent";
import { resolveRecordHandle } from "../../../../../lib/record-handle";

const paramsSchema = z.object({ pageId: z.string().min(1).max(512) });
const archivedSchema = z.object({
  notionLastEditedAt: z.string().datetime(),
  notionPageId: z.string().min(1),
  operation: z.literal("ARCHIVED")
});

export async function DELETE(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly pageId: string }> }
): Promise<NextResponse> {
  const ownerSession = requireOwnerWriteSession(request);
  if (ownerSession !== null) return ownerSession;
  const confirmation = productionWriteConfirmationRequired(request);
  if (confirmation !== null) return confirmation;
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ code: "MALFORMED_REQUEST", retryable: false }, { status: 400 });
  const secret = process.env.BACKEND_BFF_SHARED_SECRET;
  const pageId = secret === undefined ? null : resolveRecordHandle(params.data.pageId, secret);
  if (pageId === null) return NextResponse.json({ code: "RECORD_HANDLE_INVALID", retryable: false }, { status: 400 });
  const result = await callBackend(`api/v1/listening-records/${encodeURIComponent(pageId)}`, { method: "DELETE" });
  if (result.kind === "handled") return result.response;
  let payload: unknown;
  try {
    payload = await result.response.json();
  } catch (error) {
    if (error instanceof SyntaxError) return backendContractError();
    throw error;
  }
  const archived = archivedSchema.safeParse(payload);
  return archived.success
    ? NextResponse.json({ notionLastEditedAt: archived.data.notionLastEditedAt, operation: archived.data.operation })
    : backendContractError();
}
