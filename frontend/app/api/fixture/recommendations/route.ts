import { NextResponse } from "next/server";
import { z } from "zod";

import { backendContractError, callFixtureBackend } from "../../../../lib/backend-bff";

const scoreSchema = z.object({
  diversity: z.number(),
  metadataRelevance: z.number(),
  novelty: z.number(),
  pathStrength: z.number(),
  personalEvidence: z.number()
});
const candidateSchema = z.object({
  candidateId: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)).min(1),
  score: scoreSchema,
  title: z.string().min(1),
  totalScore: z.number()
});
const recommendationSchema = z.object({
  policyVersion: z.string().min(1),
  recommendations: z.array(candidateSchema).min(1),
  status: z.literal("RECOMMENDATIONS_AVAILABLE")
});
const requestSchema = z.object({ selectedCandidateId: z.string().min(1) });

export async function POST(request: Request): Promise<NextResponse> {
  let requestPayload: unknown;
  try {
    requestPayload = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) return backendContractError();
    throw error;
  }
  const requestData = requestSchema.safeParse(requestPayload);
  if (!requestData.success) return backendContractError();
  const result = await callFixtureBackend("api/v1/recommendations", {
    body: JSON.stringify({ excludedIdentityIds: [], questionClass: "PERSONAL_DISCOVERY" }),
    method: "POST"
  });
  if (result.kind === "handled") return result.response;
  let payload: unknown;
  try {
    payload = await result.response.json();
  } catch (error) {
    if (error instanceof SyntaxError) return backendContractError();
    throw error;
  }
  const parsed = recommendationSchema.safeParse(payload);
  if (!parsed.success) return backendContractError();
  const candidate = parsed.data.recommendations[0];
  if (candidate === undefined) return backendContractError();
  return NextResponse.json({
    policyVersion: parsed.data.policyVersion,
    recommendation: candidate,
    reviewCandidateId: requestData.data.selectedCandidateId
  });
}
