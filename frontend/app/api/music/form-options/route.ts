import { NextResponse } from "next/server";
import { z } from "zod";

import { backendContractError, callBackend } from "../../../../lib/backend-bff";

const optionsSchema = z.object({ sentiments: z.array(z.string().min(1)) });

export async function GET(): Promise<NextResponse> {
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
