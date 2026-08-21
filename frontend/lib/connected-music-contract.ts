import { z } from "zod";

import { connectedMusicFailureKind } from "./connected-music-failure";
import { catalogAlbumSchema, catalogEditionPageSchema, catalogTrackSchema } from "./music-catalog-contract";

export const albumsSchema = z.object({ albums: z.array(catalogAlbumSchema) });
export const editionsPageSchema = catalogEditionPageSchema;
export const tracksSchema = z.object({ tracks: z.array(catalogTrackSchema) });
export const ownerSessionSchema = z.object({ owner: z.boolean(), writeOwner: z.boolean().optional() }).transform((value) => ({
  owner: value.owner,
  writeOwner: value.writeOwner ?? value.owner
}));
export const formOptionsSchema = z.object({ sentiments: z.array(z.string().min(1)) });
export const savedSchema = z.object({
  notionLastEditedAt: z.string().datetime(),
  operation: z.enum(["ARCHIVED", "CREATED", "RESTORED", "UPDATED"])
});
export const existingRecordSchema = z.object({
  albumTitle: z.string().min(1),
  artist: z.string().min(1),
  artistCredits: z.array(z.string().min(1)).min(1),
  coverUrl: z.string().url().or(z.literal("")),
  favouriteTrack: z.string(),
  lastEditedAt: z.string().datetime(),
  owned: z.boolean(),
  recordHandle: z.string().min(1),
  releaseGroupMbid: z.string(),
  releaseMbid: z.string(),
  sentiment: z.string(),
  youtubeChannelTitle: z.string().optional(),
  youtubeRecordingMbid: z.string().optional(),
  youtubeVideoId: z.string().optional(),
  youtubeVideoTitle: z.string().optional()
}).transform((record) => ({
  ...record,
  youtubeChannelTitle: record.youtubeChannelTitle ?? "",
  youtubeRecordingMbid: record.youtubeRecordingMbid ?? "",
  youtubeVideoId: record.youtubeVideoId ?? "",
  youtubeVideoTitle: record.youtubeVideoTitle ?? ""
}));
export const recordLookupSchema = z.object({ record: existingRecordSchema.nullable() });
export const recordsSchema = z.object({
  nextCursor: z.string().min(1).nullable().default(null),
  records: z.array(existingRecordSchema)
});
const recommendationAlbumSchema = z.object({
  artist: z.string().min(1),
  coverUrl: z.string().url().or(z.literal("")),
  evidenceMethod: z.enum(["PERSONAL_EVIDENCE_GRAPH_TRAVERSAL", "PERSISTENT_GRAPHDB_PERSONAL_EVIDENCE_RETRIEVAL"]).optional(),
  evidencePaths: z.array(z.object({
    relation: z.enum(["RECORDED_BY", "SHARES_MUSICBRAINZ_TAG"]),
    value: z.string().min(1)
  })).optional(),
  firstReleaseDate: z.string(),
  releaseGroupMbid: z.string(),
  title: z.string().min(1)
});
const graphTastePayloadSchema = z.object({
  relisten: z.array(z.object({
    artist: z.string().min(1),
    coverUrl: z.string().url().or(z.literal("")),
    evidenceMethod: z.literal("PERSONAL_RECORD_RELISTEN").optional(),
    favouriteTrack: z.string().optional(),
    owned: z.boolean().optional(),
    releaseGroupMbid: z.string(),
    title: z.string().min(1)
  })).default([]),
  recommendations: z.array(recommendationAlbumSchema)
});
export const graphTasteSchema = graphTastePayloadSchema.extend({ generatedByLlm: z.literal(false) });
export const syncStateSchema = z.object({
  changedRecordCount: z.number().int().nonnegative(),
  lastSuccessfulAt: z.string().datetime().nullable(),
  stale: z.boolean(),
  status: z.enum(["CURRENT", "STALE", "UNINITIALIZED"])
});
export const personalInsightsSchema = z.object({
  graphTaste: graphTastePayloadSchema,
  syncState: syncStateSchema.optional()
});
export const groundedExplanationSchema = z.object({
  answer: z.string().max(600),
  citations: z.array(z.object({
    artist: z.string().min(1),
    label: z.string().regex(/^E[1-9][0-9]*$/),
    recordTitle: z.string().min(1),
    relation: z.enum(["GRAPH_RETRIEVED", "RECORDED_BY", "SHARES_MUSICBRAINZ_TAG"])
  })),
  status: z.enum(["GENERATED", "DISABLED", "NO_EVIDENCE", "UNAVAILABLE"])
}).superRefine((value, context) => {
  const generated = value.status === "GENERATED";
  if (generated && (value.answer.trim().length === 0 || value.citations.length === 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Generated explanation requires citations." });
  }
  if (!generated && (value.answer.length > 0 || value.citations.length > 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Unavailable explanations must not include content." });
  }
});

export type Album = z.infer<typeof catalogAlbumSchema>;
export type Availability = "error" | "loading" | "ready";
export type ExistingRecord = z.infer<typeof existingRecordSchema>;
export type ExplanationState = "disabled" | "generated" | "idle" | "loading" | "no-evidence" | "unavailable";
export type GraphTaste = z.infer<typeof graphTasteSchema>;
export type GroundedExplanation = z.infer<typeof groundedExplanationSchema>;
export type InsightState = "error" | "loading" | "ready";
export type OwnerAccess = "checking" | "owner" | "visitor";
export type RecordState = "error" | "loading" | "ready";
export type RecordLookupState = "error" | "idle" | "loading" | "ready";
export type SaveState = "error" | "idle" | "saving" | "success";
export type SearchState = "empty" | "error" | "idle" | "loading" | "results";
export type SyncState = z.infer<typeof syncStateSchema>;
export type Track = z.infer<typeof catalogTrackSchema>;
export type TrackState = "empty" | "error" | "idle" | "loading" | "ready";

type ExistingRecordWithOptionalYouTube = Omit<ExistingRecord,
  "youtubeChannelTitle" | "youtubeRecordingMbid" | "youtubeVideoId" | "youtubeVideoTitle"> & Partial<Pick<ExistingRecord,
  "youtubeChannelTitle" | "youtubeRecordingMbid" | "youtubeVideoId" | "youtubeVideoTitle">>;

export function normalizeExistingRecord(record: ExistingRecordWithOptionalYouTube): ExistingRecord {
  return {
    ...record,
    youtubeChannelTitle: record.youtubeChannelTitle ?? "",
    youtubeRecordingMbid: record.youtubeRecordingMbid ?? "",
    youtubeVideoId: record.youtubeVideoId ?? "",
    youtubeVideoTitle: record.youtubeVideoTitle ?? ""
  };
}

export function failureText(failure: Readonly<{ code?: string; message: string }>): string {
  switch (connectedMusicFailureKind(failure.code ?? failure.message)) {
    case "notion-not-shared": return "Notion에서 음악 감상 데이터베이스를 열고 이 서비스의 Internal Integration을 연결한 뒤 다시 시도해 주세요.";
    case "notion-unauthorized": return "Notion Integration 토큰 또는 데이터베이스 접근 권한을 확인해 주세요.";
    case "notion-rate-limited": return "Notion 요청이 잠시 많습니다. 잠시 뒤 다시 시도해 주세요.";
    case "catalog-rate-limited": return "MusicBrainz 요청이 잠시 제한되었습니다. 잠시 뒤 다시 검색해 주세요.";
    case "personal-graph-unavailable": return "개인 추천 근거 그래프에 잠시 연결할 수 없습니다. 기록은 변경하지 않았으니 잠시 뒤 다시 시도해 주세요.";
    case "insufficient-history": return "아직 분석할 개인 기록이 없습니다. 첫 음반을 저장하면 취향과 추천 근거가 생깁니다.";
    case "configuration": return "서비스 연결 설정이 아직 완료되지 않았습니다. 서버의 Notion과 MusicBrainz 설정을 확인해 주세요.";
    case "owner-session-required": return "개인 Notion 기록은 소유자 세션에서만 열립니다. /owner에서 소유자 확인을 완료해 주세요.";
    case "unavailable": return "요청을 완료하지 못했습니다. 잠시 뒤 다시 시도해 주세요.";
  }
}

export function existingRecordFor(album: Album, records: readonly ExistingRecord[]): ExistingRecord | undefined {
  return records.find((record) => record.releaseGroupMbid === album.releaseGroupMbid
    || (record.releaseGroupMbid.length === 0
      && record.albumTitle.trim().toLowerCase() === album.title.trim().toLowerCase()
      && record.artist.trim().toLowerCase() === album.artist.trim().toLowerCase()));
}
