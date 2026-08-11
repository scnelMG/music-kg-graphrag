import { NextResponse } from "next/server";
import { z } from "zod";

import { backendContractError, callBackend } from "../../../../lib/backend-bff";

const personalGraphRetrievalMethodSchema = z.enum([
  "PERSONAL_EVIDENCE_GRAPH_TRAVERSAL",
  "PERSISTENT_GRAPHDB_PERSONAL_EVIDENCE_RETRIEVAL"
]);
const albumSchema = z.object({
  artist: z.string().min(1),
  artistCredits: z.array(z.string().min(1)).min(1),
  coverUrl: z.string().url().or(z.literal("")),
  evidenceMethod: personalGraphRetrievalMethodSchema,
  evidencePaths: z.array(z.object({ recordPageId: z.string().min(1), relation: z.enum(["RECORDED_BY", "SHARES_MUSICBRAINZ_TAG"]), value: z.string().min(1) })),
  firstReleaseDate: z.string(),
  releaseGroupMbid: z.string().min(1),
  title: z.string().min(1),
  score: z.number().int().positive()
});

const graphTasteSchema = z.object({
  evidencePageIds: z.array(z.string().min(1)),
  generatedByLlm: z.literal(false),
  personalRecordCount: z.number().int().positive(),
  recommendations: z.array(albumSchema),
  retrievalMethod: personalGraphRetrievalMethodSchema,
  seedArtist: z.string().min(1)
});

export async function GET(): Promise<NextResponse> {
  const result = await callBackend("api/v1/graphrag/taste");
  if (result.kind === "handled") return result.response;
  let payload: unknown;
  try {
    payload = await result.response.json();
  } catch (error) {
    if (error instanceof SyntaxError) return backendContractError();
    throw error;
  }
  const graphTaste = graphTasteSchema.safeParse(payload);
  return graphTaste.success ? NextResponse.json(graphTaste.data) : backendContractError();
}
