import { NextResponse } from "next/server";
import { z } from "zod";

import { backendContractError, callBackend } from "../../../../lib/backend-bff";

const healthSchema = z.object({ mode: z.literal("connected"), status: z.literal("ok") });

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const result = await callBackend("api/v1/health");
  if (result.kind === "handled") return result.response;
  let payload: unknown;
  try {
    payload = await result.response.json();
  } catch (error) {
    if (error instanceof SyntaxError) return backendContractError();
    throw error;
  }
  const health = healthSchema.safeParse(payload);
  return health.success ? NextResponse.json(health.data) : backendContractError();
}
