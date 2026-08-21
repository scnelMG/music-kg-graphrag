import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { backendContractError, callBackend } from "../../../../lib/backend-bff";
import { sameOriginCoverUrl } from "../../../../lib/cover-art";
import { requireOwnerSession, requireOwnerWriteSession } from "../../../../lib/owner-session";
import { productionWriteConfirmationRequired } from "../../../../lib/personal-write-intent";
import { issueRecordHandle } from "../../../../lib/record-handle";

const recordRequestSchema = z.object({
  albumTitle: z.string().min(1),
  artist: z.string().min(1),
  artistCredits: z.array(z.string().min(1)).min(1),
  coverUrl: z.string().url().or(z.literal("")),
  favouriteTrack: z.string().min(1),
  owned: z.boolean(),
  releaseGroupMbid: z.string().min(1),
  releaseMbid: z.string().min(1),
  sentiment: z.string().min(1),
  youtubeChannelTitle: z.string().trim().max(200).optional().default(""),
  youtubeRecordingMbid: z.string().trim().max(128).optional().default(""),
  youtubeVideoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/).or(z.literal("")).optional().default(""),
  youtubeVideoTitle: z.string().trim().max(300).optional().default("")
}).superRefine((value, context) => {
  const fields = [value.youtubeRecordingMbid, value.youtubeVideoId, value.youtubeVideoTitle, value.youtubeChannelTitle];
  const complete = fields.every((field) => field.length > 0);
  const empty = fields.every((field) => field.length === 0);
  if (!complete && !empty) context.addIssue({ code: z.ZodIssueCode.custom, message: "YouTube mapping must be complete." });
});

const savedSchema = z.object({
  notionLastEditedAt: z.string().datetime(),
  notionPageId: z.string().min(1),
  operation: z.union([z.literal("ARCHIVED"), z.literal("CREATED"), z.literal("UPDATED")])
});
const existingRecordSchema = z.object({
  albumTitle: z.string().min(1),
  artist: z.string().min(1),
  artistCredits: z.array(z.string().min(1)).min(1),
  coverUrl: z.string().url().or(z.literal("")),
  favouriteTrack: z.string(),
  lastEditedAt: z.string().datetime(),
  owned: z.boolean(),
  pageId: z.string().min(1),
  releaseGroupMbid: z.string(),
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
const recordsPageSchema = z.object({
  nextCursor: z.string().min(1).nullable(),
  records: z.array(existingRecordSchema)
});
const recordPageQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(24).default(12)
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ownerSession = requireOwnerSession(request);
  if (ownerSession !== null) return ownerSession;
  const query = recordPageQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) return NextResponse.json({ code: "MALFORMED_REQUEST", retryable: false }, { status: 400 });
  const searchParams = new URLSearchParams({ limit: String(query.data.limit) });
  if (query.data.cursor !== undefined) searchParams.set("cursor", query.data.cursor);
  const result = await callBackend("api/v1/listening-records/page", { searchParams });
  if (result.kind === "handled") return result.response;
  let payload: unknown;
  try {
    payload = await result.response.json();
  } catch (error) {
    if (error instanceof SyntaxError) return backendContractError();
    throw error;
  }
  const records = recordsPageSchema.safeParse(payload);
  const secret = process.env.BACKEND_BFF_SHARED_SECRET;
  if (!records.success || secret === undefined || secret.length === 0) return backendContractError();
  return NextResponse.json({
    nextCursor: records.data.nextCursor,
    records: records.data.records.map(({ pageId, ...record }) => ({
      ...record,
      coverUrl: sameOriginCoverUrl(record.coverUrl, record.releaseGroupMbid, request.url),
      recordHandle: issueRecordHandle(pageId, secret)
    }))
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ownerSession = requireOwnerWriteSession(request);
  if (ownerSession !== null) return ownerSession;
  const confirmation = productionWriteConfirmationRequired(request);
  if (confirmation !== null) return confirmation;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ code: "MALFORMED_REQUEST", retryable: false }, { status: 400 });
    throw error;
  }
  const data = recordRequestSchema.safeParse(raw);
  if (!data.success) return NextResponse.json({ code: "MALFORMED_REQUEST", retryable: false }, { status: 400 });
  const result = await callBackend("api/v1/listening-records", { body: JSON.stringify(data.data), method: "POST" });
  if (result.kind === "handled") return result.response;
  let payload: unknown;
  try {
    payload = await result.response.json();
  } catch (error) {
    if (error instanceof SyntaxError) return backendContractError();
    throw error;
  }
  const saved = savedSchema.safeParse(payload);
  return saved.success
    ? NextResponse.json({ notionLastEditedAt: saved.data.notionLastEditedAt, operation: saved.data.operation }, { status: 201 })
    : backendContractError();
}
