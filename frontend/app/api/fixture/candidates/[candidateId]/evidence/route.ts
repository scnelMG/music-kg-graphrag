import { NextResponse } from "next/server";
import { z } from "zod";

import { backendContractError, callFixtureBackend } from "../../../../../../lib/backend-bff";

const selectionSchema = z.object({
  candidateId: z.string().min(1),
  status: z.literal("FIXTURE_SELECTED")
});
const graphRagSchema = z.object({
  answer: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)).min(1),
  questionClass: z.literal("EVIDENCE_SUMMARY")
});
const evidenceRecordSchema = z.object({
  id: z.string().min(1),
  subjectId: z.string().min(1),
  summary: z.string().min(1)
});

type RouteContext = {
  readonly params: Promise<{ readonly candidateId: string }>;
};

async function parseReceived<T>(response: Response, schema: z.ZodType<T>): Promise<T | null> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
  const parsed = schema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

export async function POST(_request: Request, context: RouteContext): Promise<NextResponse> {
  const { candidateId } = await context.params;
  if (candidateId.trim().length === 0) return backendContractError();
  const encodedCandidateId = encodeURIComponent(candidateId);

  const selectionResult = await callFixtureBackend(`api/v1/candidates/${encodedCandidateId}/select`, {
    body: "{}",
    method: "POST"
  });
  if (selectionResult.kind === "handled") return selectionResult.response;
  const selection = await parseReceived(selectionResult.response, selectionSchema);
  if (selection === null || selection.candidateId !== candidateId) return backendContractError();

  const graphRagResult = await callFixtureBackend("api/v1/graphrag", {
    body: JSON.stringify({ question: candidateId, questionClass: "EVIDENCE_SUMMARY" }),
    method: "POST"
  });
  if (graphRagResult.kind === "handled") return graphRagResult.response;
  const graphRag = await parseReceived(graphRagResult.response, graphRagSchema);
  if (graphRag === null) return backendContractError();

  const records: z.infer<typeof evidenceRecordSchema>[] = [];
  for (const evidenceId of graphRag.evidenceIds) {
    const evidenceResult = await callFixtureBackend(`api/v1/evidence/${encodeURIComponent(evidenceId)}`);
    if (evidenceResult.kind === "handled") return evidenceResult.response;
    const record = await parseReceived(evidenceResult.response, evidenceRecordSchema);
    if (record === null || record.subjectId !== candidateId) return backendContractError();
    records.push(record);
  }

  return NextResponse.json({
    answer: graphRag.answer,
    claims: records.map((record) => ({ evidenceIds: [record.id], text: record.summary })),
    records,
    selectionStatus: selection.status,
    state: "ready"
  });
}
