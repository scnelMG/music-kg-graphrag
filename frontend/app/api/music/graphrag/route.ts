import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { backendContractError, callBackend } from "../../../../lib/backend-bff";
import { sameOriginCoverUrl } from "../../../../lib/cover-art";
import { requireOwnerSession } from "../../../../lib/owner-session";

const personalGraphRetrievalMethodSchema = z.enum([
  "PERSONAL_EVIDENCE_GRAPH_TRAVERSAL",
  "PERSISTENT_GRAPHDB_PERSONAL_EVIDENCE_RETRIEVAL"
]);
const albumSchema = z.object({
  artist: z.string().min(1),
  coverUrl: z.string().url().or(z.literal("")),
  evidenceMethod: personalGraphRetrievalMethodSchema,
  evidencePaths: z.array(z.object({ recordPageId: z.string().min(1).optional(), relation: z.enum(["RECORDED_BY", "SHARES_MUSICBRAINZ_TAG"]), value: z.string().min(1) })),
  firstReleaseDate: z.string(),
  releaseGroupMbid: z.string().min(1),
  title: z.string().min(1),
  score: z.number().int().positive()
});

const graphTasteSchema = z.object({
  evidencePageIds: z.array(z.string().min(1)).optional(),
  generatedByLlm: z.literal(false),
  personalRecordCount: z.number().int().positive(),
  recommendations: z.array(albumSchema),
  retrievalMethod: personalGraphRetrievalMethodSchema,
  seedArtist: z.string()
});

function publicGraphTaste(graphTaste: z.infer<typeof graphTasteSchema>, requestUrl: string) {
  const { evidencePageIds: _evidencePageIds, recommendations, ...publicTaste } = graphTaste;
  return {
    ...publicTaste,
    recommendations: recommendations.map(({ evidencePaths, ...recommendation }) => ({
      ...recommendation,
      coverUrl: sameOriginCoverUrl(recommendation.coverUrl, recommendation.releaseGroupMbid, requestUrl),
      evidencePaths: evidencePaths.map(({ recordPageId: _recordPageId, ...path }) => path)
    }))
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ownerSession = requireOwnerSession(request);
  if (ownerSession !== null) return ownerSession;
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
  return graphTaste.success ? NextResponse.json(publicGraphTaste(graphTaste.data, request.url)) : backendContractError();
}
