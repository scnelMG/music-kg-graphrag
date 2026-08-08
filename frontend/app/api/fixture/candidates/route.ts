import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { backendContractError, callFixtureBackend } from "../../../../lib/backend-bff";

const candidatesSchema = z.array(z.object({
  artist: z.string(),
  id: z.string(),
  source: z.literal("PUBLIC_FIXTURE"),
  title: z.string()
}));

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = new URLSearchParams({ q: request.nextUrl.searchParams.get("q") ?? "" });
  const result = await callFixtureBackend("api/v1/candidates", { searchParams });
  if (result.kind === "handled") return result.response;
  let payload: unknown;
  try {
    payload = await result.response.json();
  } catch (error) {
    if (error instanceof SyntaxError) return backendContractError();
    throw error;
  }
  const candidates = candidatesSchema.safeParse(payload);
  if (!candidates.success) return backendContractError();
  return NextResponse.json({ candidates: candidates.data, mode: "fixture" });
}
