import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { backendContractError, callBackend } from "../../../../../lib/backend-bff";
import { requireOwnerWriteSession } from "../../../../../lib/owner-session";

const explanationSchema = z.object({
  answer: z.string().max(600),
  citations: z.array(z.object({
    artist: z.string().min(1),
    label: z.string().regex(/^E[1-9][0-9]*$/),
    recordTitle: z.string().min(1),
    relation: z.enum(["GRAPH_RETRIEVED", "RECORDED_BY", "SHARES_MUSICBRAINZ_TAG"])
  })),
  status: z.enum(["DISABLED", "GENERATED", "NO_EVIDENCE", "UNAVAILABLE"])
}).superRefine((value, context) => {
  if (value.status === "GENERATED" && (value.answer.length === 0 || value.citations.length === 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "GENERATED_EXPLANATION_EVIDENCE_REQUIRED" });
  }
  if (value.status !== "GENERATED" && (value.answer.length > 0 || value.citations.length > 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "NON_GENERATED_EXPLANATION_MUST_BE_EMPTY" });
  }
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ownerSession = requireOwnerWriteSession(request);
  if (ownerSession !== null) return ownerSession;
  const result = await callBackend("api/v1/personal-insights/explanation", { method: "POST" });
  if (result.kind === "handled") return result.response;
  let payload: unknown;
  try {
    payload = await result.response.json();
  } catch (error) {
    if (error instanceof SyntaxError) return backendContractError();
    throw error;
  }
  const explanation = explanationSchema.safeParse(payload);
  return explanation.success ? NextResponse.json(explanation.data) : backendContractError();
}
