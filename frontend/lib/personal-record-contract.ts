import { z } from "zod";

import { directCoverArtArchiveUrl } from "./cover-art";
import { issueRecordHandle } from "./record-handle";

export const backendExistingRecordSchema = z.object({
  albumTitle: z.string().min(1),
  artist: z.string().min(1),
  artistCredits: z.array(z.string().min(1)).min(1),
  catalogId: z.string().optional(),
  catalogSource: z.enum(["MUSICBRAINZ", "ITUNES"]).or(z.literal("")).optional(),
  coverUrl: z.string().url().or(z.literal("")),
  favouriteTrack: z.string(),
  lastEditedAt: z.string().datetime(),
  owned: z.boolean(),
  pageId: z.string().min(1),
  releaseGroupMbid: z.string(),
  releaseMbid: z.string(),
  sentiment: z.string(),
  youtubeChannelTitle: z.string().optional(),
  youtubeRecordingMbid: z.string().optional(),
  youtubeVideoId: z.string().optional(),
  youtubeVideoTitle: z.string().optional()
}).superRefine((record, context) => {
  const source = record.catalogSource && record.catalogSource.length > 0
    ? record.catalogSource
    : record.releaseGroupMbid.length > 0 ? "MUSICBRAINZ" : "LEGACY";
  switch (source) {
    case "MUSICBRAINZ":
      if (record.releaseGroupMbid.length === 0 || (record.catalogId !== undefined && record.catalogId !== record.releaseGroupMbid)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "MusicBrainz records require their release-group identity." });
      }
      return;
    case "ITUNES":
      if (record.releaseGroupMbid.length > 0 || record.releaseMbid.length > 0 || record.catalogId === undefined || !/^[0-9]+$/.test(record.catalogId)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "iTunes records require a collection identity without MusicBrainz IDs." });
      }
      return;
    case "LEGACY":
      if (record.releaseGroupMbid.length > 0 || record.releaseMbid.length > 0 || (record.catalogId !== undefined && record.catalogId.length > 0)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Legacy records cannot claim a partial catalog identity." });
      }
      return;
    default:
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Records require a supported catalog identity." });
  }
}).transform((record) => ({
  ...record,
  catalogId: record.catalogSource === "ITUNES" ? record.catalogId ?? "" : record.releaseGroupMbid,
  catalogSource: record.catalogSource && record.catalogSource.length > 0
    ? record.catalogSource
    : record.releaseGroupMbid.length > 0 ? "MUSICBRAINZ" : "LEGACY",
  youtubeChannelTitle: record.youtubeChannelTitle ?? "",
  youtubeRecordingMbid: record.youtubeRecordingMbid ?? "",
  youtubeVideoId: record.youtubeVideoId ?? "",
  youtubeVideoTitle: record.youtubeVideoTitle ?? ""
}));

export type BackendExistingRecord = z.infer<typeof backendExistingRecordSchema>;

export function publicExistingRecord(record: BackendExistingRecord, sharedSecret: string) {
  const { pageId, ...publicRecord } = record;
  const coverUrl = directRecordCoverUrl(record);
  return { ...publicRecord, coverUrl, recordHandle: issueRecordHandle(pageId, sharedSecret) };
}

function directRecordCoverUrl(record: BackendExistingRecord): string {
  switch (record.catalogSource) {
    case "MUSICBRAINZ": return directCoverArtArchiveUrl(record.coverUrl, record.releaseGroupMbid);
    case "ITUNES": return record.coverUrl;
    case "LEGACY": return record.coverUrl;
    default: return record.coverUrl;
  }
}
