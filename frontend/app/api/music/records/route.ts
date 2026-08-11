import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { backendContractError, callBackend } from "../../../../lib/backend-bff";

const recordRequestSchema = z.object({
  albumTitle: z.string().min(1),
  artist: z.string().min(1),
  artistCredits: z.array(z.string().min(1)).min(1),
  coverUrl: z.string().url().or(z.literal("")),
  favouriteTrack: z.string().min(1),
  owned: z.boolean(),
  releaseGroupMbid: z.string().min(1),
  sentiment: z.string().min(1)
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
  sentiment: z.string()
});

export async function GET(): Promise<NextResponse> {
  const result = await callBackend("api/v1/listening-records");
  if (result.kind === "handled") return result.response;
  let payload: unknown;
  try {
    payload = await result.response.json();
  } catch (error) {
    if (error instanceof SyntaxError) return backendContractError();
    throw error;
  }
  const records = z.array(existingRecordSchema).safeParse(payload);
  return records.success ? NextResponse.json({ records: records.data }) : backendContractError();
}

export async function POST(request: NextRequest): Promise<NextResponse> {
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
  return saved.success ? NextResponse.json(saved.data, { status: 201 }) : backendContractError();
}
