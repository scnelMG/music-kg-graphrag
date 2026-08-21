import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { backendContractError, callBackend } from "../../../../../../lib/backend-bff";
import { sameOriginCoverUrl } from "../../../../../../lib/cover-art";
import { requireOwnerSession } from "../../../../../../lib/owner-session";
import { issueRecordHandle } from "../../../../../../lib/record-handle";

const paramsSchema = z.object({ releaseGroupMbid: z.string().trim().min(1) });
const existingRecordSchema = z.object({
  albumTitle: z.string().min(1),
  artist: z.string().min(1),
  artistCredits: z.array(z.string().min(1)).min(1),
  coverUrl: z.string().url().or(z.literal("")),
  favouriteTrack: z.string(),
  lastEditedAt: z.string().datetime(),
  owned: z.boolean(),
  pageId: z.string().min(1),
  releaseGroupMbid: z.string().min(1),
  releaseMbid: z.string(),
  sentiment: z.string(),
  youtubeChannelTitle: z.string().optional(),
  youtubeRecordingMbid: z.string().optional(),
  youtubeVideoId: z.string().optional(),
  youtubeVideoTitle: z.string().optional()
}).transform((record) => ({
  ...record,
  youtubeChannelTitle: record.youtubeChannelTitle ?? "",
  youtubeRecordingMbid: record.youtubeRecordingMbid ?? "",
  youtubeVideoId: record.youtubeVideoId ?? "",
  youtubeVideoTitle: record.youtubeVideoTitle ?? ""
}));

export async function GET(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly releaseGroupMbid: string }> }
): Promise<NextResponse> {
  const ownerSession = requireOwnerSession(request);
  if (ownerSession !== null) return ownerSession;
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ code: "MALFORMED_REQUEST", retryable: false }, { status: 400 });

  const result = await callBackend(
    `api/v1/listening-records/by-release-group/${encodeURIComponent(params.data.releaseGroupMbid)}`
  );
  if (result.kind === "handled") return result.response;
  if (result.response.status === 204) return NextResponse.json({ record: null });

  let payload: unknown;
  try {
    payload = await result.response.json();
  } catch (error) {
    if (error instanceof SyntaxError) return backendContractError();
    throw error;
  }
  const record = existingRecordSchema.safeParse(payload);
  const secret = process.env.BACKEND_BFF_SHARED_SECRET;
  if (!record.success || record.data.releaseGroupMbid !== params.data.releaseGroupMbid
    || secret === undefined || secret.length === 0) return backendContractError();
  const { pageId, ...publicRecord } = record.data;
  return NextResponse.json({ record: {
    ...publicRecord,
    coverUrl: sameOriginCoverUrl(publicRecord.coverUrl, publicRecord.releaseGroupMbid, request.url),
    recordHandle: issueRecordHandle(pageId, secret)
  } });
}
