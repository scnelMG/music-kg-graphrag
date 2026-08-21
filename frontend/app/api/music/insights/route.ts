import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { backendContractError, callBackend } from "../../../../lib/backend-bff";
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
const relistenSchema = z.object({
  artist: z.string().min(1),
  coverUrl: z.string().url().or(z.literal("")),
  evidenceMethod: z.literal("PERSONAL_RECORD_RELISTEN"),
  evidencePageId: z.string().min(1).optional(),
  favouriteTrack: z.string(),
  owned: z.boolean(),
  releaseGroupMbid: z.string(),
  title: z.string().min(1)
});
const countSchema = z.object({ count: z.number().int().positive(), value: z.string().min(1) });
const syncStateSchema = z.object({
  changedRecordCount: z.number().int().nonnegative(),
  lastSuccessfulAt: z.string().datetime().nullable(),
  stale: z.boolean(),
  status: z.enum(["CURRENT", "STALE", "UNINITIALIZED"])
});
const personalInsightsSchema = z.object({
  graphTaste: z.object({
    evidencePageIds: z.array(z.string().min(1)).optional(),
    personalRecordCount: z.number().int().positive(),
    retrievalMethod: personalGraphRetrievalMethodSchema,
    relisten: z.array(relistenSchema).default([]),
    recommendations: z.array(albumSchema),
    seedArtist: z.string()
  }),
  taste: z.object({
    artists: z.array(countSchema),
    favouriteTracks: z.array(countSchema),
    recordCount: z.number().int().positive(),
    sentiments: z.array(countSchema)
  }),
  syncState: syncStateSchema.optional().default({
    changedRecordCount: 0,
    lastSuccessfulAt: null,
    stale: false,
    status: "UNINITIALIZED"
  })
});

function publicGraphTaste(graphTaste: z.infer<typeof personalInsightsSchema>["graphTaste"]) {
  return {
    relisten: [],
    recommendations: graphTaste.recommendations.map(({ artist, coverUrl, firstReleaseDate, releaseGroupMbid, title }) => ({
      artist,
      coverUrl,
      firstReleaseDate,
      releaseGroupMbid,
      title
    }))
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ownerScope = request.nextUrl.searchParams.get("scope") === "owner";
  if (ownerScope) {
    const ownerSession = requireOwnerSession(request);
    if (ownerSession !== null) return ownerSession;
  }
  const result = await callBackend("api/v1/personal-insights");
  if (result.kind === "handled") return result.response;
  let payload: unknown;
  try {
    payload = await result.response.json();
  } catch (error) {
    if (error instanceof SyntaxError) return backendContractError();
    throw error;
  }
  const insights = personalInsightsSchema.safeParse(payload);
  if (!insights.success) return backendContractError();
  return ownerScope
    ? NextResponse.json(insights.data)
    : NextResponse.json({ graphTaste: publicGraphTaste(insights.data.graphTaste) });
}
