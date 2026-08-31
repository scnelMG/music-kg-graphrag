import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { backendContractError, callBackend } from "../../../../lib/backend-bff";
import { directCoverArtArchiveUrl } from "../../../../lib/cover-art";
import { requireOwnerSession } from "../../../../lib/owner-session";

const personalGraphRetrievalMethodSchema = z.enum([
  "PERSONAL_EVIDENCE_GRAPH_TRAVERSAL",
  "PERSISTENT_GRAPHDB_PERSONAL_EVIDENCE_RETRIEVAL"
]);
const albumSchema = z.object({
  artist: z.string().min(1),
  artistCredits: z.array(z.string().min(1)).min(1).optional(),
  coverUrl: z.string().url().or(z.literal("")),
  evidenceMethod: personalGraphRetrievalMethodSchema,
  evidencePaths: z.array(z.object({ recordPageId: z.string().min(1).optional(), relation: z.enum(["RECORDED_BY", "SHARES_MUSICBRAINZ_TAG"]), value: z.string().min(1) })),
  firstReleaseDate: z.string(),
  primaryType: z.enum(["Album", "EP"]).optional(),
  releaseGroupMbid: z.string().min(1),
  title: z.string().min(1),
  score: z.number().int().positive()
}).transform((album) => ({
  ...album,
  artistCredits: album.artistCredits ?? [album.artist],
  primaryType: album.primaryType ?? "Album"
}));
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

const publicDiscoverySchema = z.object({
  albums: z.array(albumSchema)
});
const publicDiscoveryCacheControl = "public, s-maxage=600, stale-while-revalidate=86400";

function publicRecommendation({ artist, artistCredits, coverUrl, evidencePaths, firstReleaseDate, primaryType, releaseGroupMbid, title }: z.infer<typeof albumSchema>) {
  const sharedMusicBrainzTag = evidencePaths.find((path) => path.relation === "SHARES_MUSICBRAINZ_TAG")?.value;
  if (sharedMusicBrainzTag !== undefined) return {
    artist,
    artistCredits,
    coverUrl: directCoverArtArchiveUrl(coverUrl, releaseGroupMbid),
    firstReleaseDate,
    primaryType,
    releaseGroupMbid,
    publicCurationReason: "shared-tag" as const,
    sharedMusicBrainzTag,
    title
  };
  if (!evidencePaths.some((path) => path.relation === "RECORDED_BY")) return null;
  return {
    artist,
    artistCredits,
    coverUrl: directCoverArtArchiveUrl(coverUrl, releaseGroupMbid),
    firstReleaseDate,
    primaryType,
    publicCurationReason: "same-artist" as const,
    releaseGroupMbid,
    title
  };
}

function publicGraphTaste(graphTaste: z.infer<typeof personalInsightsSchema>["graphTaste"]) {
  return { relisten: [], recommendations: graphTaste.recommendations.flatMap((album) => {
    const recommendation = publicRecommendation(album);
    return recommendation === null ? [] : [recommendation];
  }) };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ownerScope = request.nextUrl.searchParams.get("scope") === "owner";
  if (ownerScope) {
    const ownerSession = requireOwnerSession(request);
    if (ownerSession !== null) return ownerSession;
  }
  const result = await callBackend(ownerScope ? "api/v1/personal-insights" : "api/v1/recommendations/discover");
  if (result.kind === "handled") return result.response;
  let payload: unknown;
  try {
    payload = await result.response.json();
  } catch (error) {
    if (error instanceof SyntaxError) return backendContractError();
    throw error;
  }
  if (!ownerScope) {
    const discovery = publicDiscoverySchema.safeParse(payload);
    return discovery.success
      ? NextResponse.json({ graphTaste: { relisten: [], recommendations: discovery.data.albums.flatMap((album) => {
        const recommendation = publicRecommendation(album);
        return recommendation === null ? [] : [recommendation];
      }) } }, { headers: { "Cache-Control": publicDiscoveryCacheControl } })
      : backendContractError();
  }
  const insights = personalInsightsSchema.safeParse(payload);
  if (!insights.success) return backendContractError();
  return NextResponse.json({
      ...insights.data,
      graphTaste: {
        ...insights.data.graphTaste,
        relisten: insights.data.graphTaste.relisten.map((album) => ({
          ...album,
          coverUrl: directCoverArtArchiveUrl(album.coverUrl, album.releaseGroupMbid)
        })),
        recommendations: insights.data.graphTaste.recommendations.map((album) => ({
          ...album,
          coverUrl: directCoverArtArchiveUrl(album.coverUrl, album.releaseGroupMbid)
        }))
      }
    });
}
