import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { backendContractError, callBackend } from "../../../../lib/backend-bff";
import { requireOwnerSession, requireOwnerWriteSession } from "../../../../lib/owner-session";
import { productionWriteConfirmationRequired } from "../../../../lib/personal-write-intent";
import { backendExistingRecordSchema, publicExistingRecord } from "../../../../lib/personal-record-contract";

const recordFields = {
  albumTitle: z.string().min(1),
  artist: z.string().min(1),
  artistCredits: z.array(z.string().min(1)).min(1),
  coverUrl: z.string().url().or(z.literal("")),
  favouriteTrack: z.string().min(1),
  favouriteRecordingMbid: z.string().trim().max(128).optional().default(""),
  owned: z.boolean(),
  sentiment: z.string().min(1),
  youtubeChannelTitle: z.string().trim().max(200).optional().default(""),
  youtubeRecordingMbid: z.string().trim().max(128).optional().default(""),
  youtubeVideoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/).or(z.literal("")).optional().default(""),
  youtubeVideoTitle: z.string().trim().max(300).optional().default("")
};

const musicBrainzRecordSchema = z.object({
  ...recordFields,
  catalogId: z.string().optional(),
  catalogSource: z.literal("MUSICBRAINZ"),
  releaseGroupMbid: z.string().min(1),
  releaseMbid: z.string().min(1)
});

const iTunesRecordSchema = z.object({
  ...recordFields,
  catalogId: z.string().regex(/^[0-9]+$/),
  catalogSource: z.literal("ITUNES"),
  releaseGroupMbid: z.literal(""),
  releaseMbid: z.literal("")
});

const recordIdentitySchema = z.discriminatedUnion("catalogSource", [musicBrainzRecordSchema, iTunesRecordSchema])
  .superRefine((value, context) => {
  const fields = [value.youtubeRecordingMbid, value.youtubeVideoId, value.youtubeVideoTitle, value.youtubeChannelTitle];
  const complete = fields.every((field) => field.length > 0);
  const empty = fields.every((field) => field.length === 0);
  if (!complete && !empty) context.addIssue({ code: z.ZodIssueCode.custom, message: "YouTube mapping must be complete." });
  switch (value.catalogSource) {
    case "MUSICBRAINZ":
      if (value.catalogId !== undefined && value.catalogId !== value.releaseGroupMbid) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "MusicBrainz catalog identity must equal the release group." });
      }
      return;
    case "ITUNES":
      if (!empty) context.addIssue({ code: z.ZodIssueCode.custom, message: "iTunes records cannot attach a YouTube mapping." });
      return;
  }
});

function defaultMusicBrainzSource(value: unknown): unknown {
  const raw = z.record(z.string(), z.unknown()).safeParse(value);
  if (!raw.success) return value;
  const catalogSource = raw.data.catalogSource;
  return { ...raw.data, catalogSource: catalogSource === undefined || catalogSource === "" ? "MUSICBRAINZ" : catalogSource };
}

const recordRequestSchema = z.preprocess(defaultMusicBrainzSource,
  recordIdentitySchema);

const savedSchema = z.object({
  notionLastEditedAt: z.string().datetime(),
  notionPageId: z.string().min(1),
  operation: z.union([z.literal("ARCHIVED"), z.literal("CREATED"), z.literal("UPDATED")])
});
const recordsPageSchema = z.object({
  nextCursor: z.string().min(1).nullable(),
  records: z.array(backendExistingRecordSchema)
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
    records: records.data.records.map((record) => publicExistingRecord(record, secret))
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
