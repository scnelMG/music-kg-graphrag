import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { backendContractError, callBackend } from "../../../../../lib/backend-bff";

const paramsSchema = z.object({ pageId: z.string().min(1) });
const archivedSchema = z.object({
  notionLastEditedAt: z.string().datetime(),
  notionPageId: z.string().min(1),
  operation: z.literal("ARCHIVED")
});

export async function DELETE(
  _request: NextRequest,
  context: { readonly params: Promise<{ readonly pageId: string }> }
): Promise<NextResponse> {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ code: "MALFORMED_REQUEST", retryable: false }, { status: 400 });
  const result = await callBackend(`api/v1/listening-records/${encodeURIComponent(params.data.pageId)}`, { method: "DELETE" });
  if (result.kind === "handled") return result.response;
  let payload: unknown;
  try {
    payload = await result.response.json();
  } catch (error) {
    if (error instanceof SyntaxError) return backendContractError();
    throw error;
  }
  const archived = archivedSchema.safeParse(payload);
  return archived.success ? NextResponse.json(archived.data) : backendContractError();
}
