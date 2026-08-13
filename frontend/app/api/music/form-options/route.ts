import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { backendContractError, callBackend } from "../../../../lib/backend-bff";
import { requireOwnerSession } from "../../../../lib/owner-session";

const optionsSchema = z.object({ sentiments: z.array(z.string().min(1)) });

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ownerSession = requireOwnerSession(request);
  if (ownerSession !== null) return ownerSession;
  const result = await callBackend("api/v1/listening-records/form-options");
  if (result.kind === "handled") return result.response;
  let payload: unknown;
  try {
    payload = await result.response.json();
  } catch (error) {
    if (error instanceof SyntaxError) return backendContractError();
    throw error;
  }
  const options = optionsSchema.safeParse(payload);
  return options.success ? NextResponse.json(options.data) : backendContractError();
}
