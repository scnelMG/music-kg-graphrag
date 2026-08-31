import { z } from "zod";

import { catalogAlbumSchema, catalogEditionPageSchema, catalogTrackSchema } from "./music-catalog-contract";

export const publicAlbumsSchema = z.object({ albums: z.array(catalogAlbumSchema) });
export const publicEditionsPageSchema = catalogEditionPageSchema;
export const publicTracksSchema = z.object({ tracks: z.array(catalogTrackSchema) });

const publicRecommendationSchema = z.object({
  artist: z.string().min(1),
  artistCredits: z.array(z.string().min(1)).min(1).optional(),
  coverUrl: z.string().url().or(z.literal("")),
  firstReleaseDate: z.string(),
  primaryType: z.enum(["Album", "EP"]).optional(),
  publicCurationReason: z.enum(["same-artist", "shared-tag"]).optional(),
  releaseGroupMbid: z.string().min(1),
  sharedMusicBrainzTag: z.string().min(1).optional(),
  title: z.string().min(1)
}).transform((album) => ({
  ...album,
  artistCredits: album.artistCredits ?? [album.artist],
  primaryType: album.primaryType ?? "Album" as const
}));

export const publicInsightsSchema = z.object({
  graphTaste: z.object({
    recommendations: z.array(publicRecommendationSchema),
    relisten: z.array(z.never()).default([])
  })
}).transform(({ graphTaste }) => ({
  graphTaste: { generatedByLlm: false as const, recommendations: graphTaste.recommendations, relisten: [] }
}));

export type PublicGraphTaste = z.infer<typeof publicInsightsSchema>["graphTaste"];
