import { NextResponse } from "next/server";

import { z } from "zod";

import { backendContractError, callFixtureBackend } from "../../../../lib/backend-bff";

export const dynamic = "force-dynamic";

const healthSchema = z.object({
  mode: z.union([z.literal("fixture"), z.literal("production")]),
  status: z.literal("ok")
});

export async function GET(): Promise<NextResponse> {
  const result = await callFixtureBackend("api/v1/health");
  if (result.kind === "handled") return result.response;
  let payload: unknown;
  try {
    payload = await result.response.json();
  } catch (error) {
    if (error instanceof SyntaxError) return backendContractError();
    throw error;
  }
  const health = healthSchema.safeParse(payload);
  if (!health.success) return backendContractError();
  return NextResponse.json(health.data);
}
