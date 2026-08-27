import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { backendContractError, callBackend } from "../../../../lib/backend-bff";
import { directCoverArtArchiveUrl } from "../../../../lib/cover-art";
import { requireOwnerSession } from "../../../../lib/owner-session";

const recommendationSchema = z.object({
  albums: z.array(z.object({
    artist: z.string().min(1),
    artistCredits: z.array(z.string().min(1)).min(1),
    coverUrl: z.string().url().or(z.literal("")),
    evidenceMethod: z.literal("PERSONAL_EVIDENCE_GRAPH_TRAVERSAL"),
    evidencePaths: z.array(z.object({ recordPageId: z.string().min(1).optional(), relation: z.enum(["RECORDED_BY", "SHARES_MUSICBRAINZ_TAG"]), value: z.string().min(1) })),
    firstReleaseDate: z.string(),
    releaseGroupMbid: z.string().min(1),
    title: z.string().min(1),
    score: z.number().int().positive()
  })),
  evidencePageIds: z.array(z.string().min(1)).optional(),
  retrievalMethod: z.literal("PERSONAL_EVIDENCE_GRAPH_TRAVERSAL"),
  seedArtist: z.string()
});

function publicRecommendation(recommendation: z.infer<typeof recommendationSchema>) {
  const { evidencePageIds: _evidencePageIds, albums, ...publicResult } = recommendation;
  return {
    ...publicResult,
    albums: albums.map(({ evidencePaths, ...album }) => ({
      ...album,
      coverUrl: directCoverArtArchiveUrl(album.coverUrl, album.releaseGroupMbid),
      evidencePaths: evidencePaths.map(({ recordPageId: _recordPageId, ...path }) => path)
    }))
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ownerSession = requireOwnerSession(request);
  if (ownerSession !== null) return ownerSession;
  const result = await callBackend("api/v1/recommendations/discover");
  if (result.kind === "handled") return result.response;
  let payload: unknown;
  try {
    payload = await result.response.json();
  } catch (error) {
    if (error instanceof SyntaxError) return backendContractError();
    throw error;
  }
  const recommendation = recommendationSchema.safeParse(payload);
  return recommendation.success ? NextResponse.json(publicRecommendation(recommendation.data)) : backendContractError();
}
