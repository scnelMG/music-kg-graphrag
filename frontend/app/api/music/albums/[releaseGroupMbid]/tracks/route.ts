import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { backendContractError, callBackend } from "../../../../../../lib/backend-bff";

const paramsSchema = z.object({ releaseGroupMbid: z.string().min(1) });
const tracksSchema = z.array(z.object({
  position: z.number().int().positive(),
  recordingMbid: z.string().min(1),
  title: z.string().min(1)
}));

export async function GET(
  _request: NextRequest,
  context: { readonly params: Promise<{ readonly releaseGroupMbid: string }> }
): Promise<NextResponse> {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ code: "MALFORMED_REQUEST", retryable: false }, { status: 400 });
  const result = await callBackend(`api/v1/catalog/albums/${encodeURIComponent(params.data.releaseGroupMbid)}/tracks`);
  if (result.kind === "handled") return result.response;
  let payload: unknown;
  try {
    payload = await result.response.json();
  } catch (error) {
    if (error instanceof SyntaxError) return backendContractError();
    throw error;
  }
  const tracks = tracksSchema.safeParse(payload);
  return tracks.success ? NextResponse.json({ tracks: tracks.data }) : backendContractError();
}
