import { z } from "zod";

const catalogSourceSchema = z.enum(["MUSICBRAINZ", "ITUNES"]);

function defaultMusicBrainzCatalogIdentity(value: unknown): unknown {
  const raw = z.record(z.string(), z.unknown()).safeParse(value);
  if (!raw.success) return value;
  const releaseGroupMbid = raw.data.releaseGroupMbid;
  const catalogSource = raw.data.catalogSource;
  const catalogId = raw.data.catalogId;
  const catalogUrl = raw.data.catalogUrl;
  return {
    ...raw.data,
    catalogId: catalogId === undefined ? releaseGroupMbid : catalogId,
    catalogSource: catalogSource === undefined || catalogSource === "" ? "MUSICBRAINZ" : catalogSource,
    catalogUrl: catalogUrl === undefined ? "" : catalogUrl
  };
}

const catalogAlbumIdentitySchema = z.object({
  artist: z.string().min(1),
  artistCredits: z.array(z.string().min(1)).min(1),
  catalogId: z.string().min(1),
  catalogSource: catalogSourceSchema,
  catalogUrl: z.string().url().or(z.literal("")),
  coverUrl: z.string().url().or(z.literal("")),
  firstReleaseDate: z.string(),
  primaryType: z.enum(["Album", "EP"]),
  releaseGroupMbid: z.string(),
  searchScore: z.number().int().nonnegative(),
  title: z.string().min(1)
}).superRefine((album, context) => {
  switch (album.catalogSource) {
    case "MUSICBRAINZ":
      if (album.releaseGroupMbid.length === 0 || album.catalogId !== album.releaseGroupMbid || album.catalogUrl.length !== 0) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "MusicBrainz albums require their release-group identity." });
      }
      return;
    case "ITUNES":
      if (album.releaseGroupMbid.length !== 0 || !/^[0-9]+$/.test(album.catalogId) || album.catalogUrl.length === 0) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "iTunes albums require a collection identity and store URL." });
      }
      return;
  }
});

export type CatalogAlbum = z.output<typeof catalogAlbumIdentitySchema>;

export const catalogAlbumSchema: z.ZodType<CatalogAlbum, z.ZodTypeDef, unknown> = z.preprocess(
  defaultMusicBrainzCatalogIdentity,
  catalogAlbumIdentitySchema
);

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

export type CatalogEdition = z.infer<typeof catalogEditionSchema>;
export type CatalogEditionPage = z.infer<typeof catalogEditionPageSchema>;
export type CatalogTrack = z.infer<typeof catalogTrackSchema>;

export function catalogIdentity(album: CatalogAlbum): string {
  return `${album.catalogSource}:${album.catalogId}`;
}
