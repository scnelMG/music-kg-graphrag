import { NextResponse } from "next/server";
import { z } from "zod";

import { backendContractError, callBackend } from "../../../../lib/backend-bff";

const readinessSchema = z.object({
  components: z.array(z.object({
    code: z.string().min(1),
    name: z.enum(["graphdb", "musicbrainz", "notion"]),
    ready: z.literal(true)
  })).length(3),
  ready: z.literal(true)
});

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const result = await callBackend("api/v1/ready");
  if (result.kind === "handled") return result.response;
  let payload: unknown;
  try {
    payload = await result.response.json();
  } catch (error) {
    if (error instanceof SyntaxError) return backendContractError();
    throw error;
  }
  const readiness = readinessSchema.safeParse(payload);
  return readiness.success
    ? NextResponse.json({ mode: "connected", status: "ok" })
    : backendContractError();
}
