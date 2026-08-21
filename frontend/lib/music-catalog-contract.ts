import { z } from "zod";

export const catalogAlbumSchema = z.object({
  artist: z.string().min(1),
  artistCredits: z.array(z.string().min(1)).min(1),
  coverUrl: z.string().url().or(z.literal("")),
  firstReleaseDate: z.string(),
  primaryType: z.enum(["Album", "EP"]),
  releaseGroupMbid: z.string().min(1),
  searchScore: z.number().int().nonnegative(),
  title: z.string().min(1)
});

export const catalogEditionSchema = z.object({
  country: z.string(),
  disambiguation: z.string(),
  recommended: z.boolean(),
  releaseDate: z.string(),
  releaseGroupMbid: z.string().min(1),
  releaseMbid: z.string().min(1),
  status: z.string(),
  title: z.string().min(1)
});

export const catalogEditionPageSchema = z.object({
  editions: z.array(catalogEditionSchema).max(21),
  hasMore: z.boolean(),
  nextCursor: z.string().min(1).nullable()
}).superRefine((value, context) => {
  if (value.hasMore !== (value.nextCursor !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Edition pagination cursor does not match hasMore." });
  }
});

export const catalogTrackSchema = z.object({
  position: z.number().int().positive(),
  recordingMbid: z.string().min(1),
  title: z.string().min(1)
});

export type CatalogAlbum = z.infer<typeof catalogAlbumSchema>;
export type CatalogEdition = z.infer<typeof catalogEditionSchema>;
export type CatalogEditionPage = z.infer<typeof catalogEditionPageSchema>;
export type CatalogTrack = z.infer<typeof catalogTrackSchema>;
