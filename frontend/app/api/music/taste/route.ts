import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { backendContractError, callBackend } from "../../../../lib/backend-bff";
import { requireOwnerSession } from "../../../../lib/owner-session";

const countSchema = z.object({ count: z.number().int().positive(), value: z.string().min(1) });
const profileSchema = z.object({
  artists: z.array(countSchema),
  favouriteTracks: z.array(countSchema),
  recordCount: z.number().int().positive(),
  sentiments: z.array(countSchema)
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ownerSession = requireOwnerSession(request);
  if (ownerSession !== null) return ownerSession;
  const result = await callBackend("api/v1/taste-profile");
  if (result.kind === "handled") return result.response;
  let payload: unknown;
  try {
    payload = await result.response.json();
  } catch (error) {
    if (error instanceof SyntaxError) return backendContractError();
    throw error;
  }
  const profile = profileSchema.safeParse(payload);
  return profile.success ? NextResponse.json(profile.data) : backendContractError();
}
