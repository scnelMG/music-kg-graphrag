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
const relistenSchema = z.object({
  artist: z.string().min(1),
  coverUrl: z.string().url().or(z.literal("")),
  evidenceMethod: z.literal("PERSONAL_RECORD_RELISTEN"),
  evidencePageId: z.string().min(1),
  favouriteTrack: z.string(),
  owned: z.boolean(),
  releaseGroupMbid: z.string(),
  title: z.string().min(1)
});
const countSchema = z.object({ count: z.number().int().positive(), value: z.string().min(1) });
const personalInsightsSchema = z.object({
  graphTaste: z.object({
    evidencePageIds: z.array(z.string().min(1)),
    personalRecordCount: z.number().int().positive(),
    retrievalMethod: personalGraphRetrievalMethodSchema,
    relisten: z.array(relistenSchema).default([]),
    recommendations: z.array(albumSchema),
    seedArtist: z.string().min(1)
  }),
  taste: z.object({
    artists: z.array(countSchema),
    favouriteTracks: z.array(countSchema),
    recordCount: z.number().int().positive(),
    sentiments: z.array(countSchema)
  })
});

export async function GET(): Promise<NextResponse> {
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
  return insights.success ? NextResponse.json(insights.data) : backendContractError();
}
