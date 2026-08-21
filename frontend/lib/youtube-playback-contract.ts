import { z } from "zod";

export const youtubeVideoIdSchema = z.string().regex(/^[A-Za-z0-9_-]{11}$/);

export const youtubeSearchCandidateSchema = z.object({
  channelTitle: z.string().trim().min(1).max(200),
  thumbnailUrl: z.string().url().or(z.literal("")),
  title: z.string().trim().min(1).max(300),
  videoId: youtubeVideoIdSchema
});

export const userConfirmedYouTubeVideoSchema = youtubeSearchCandidateSchema.extend({
  recordingMbid: z.string().trim().min(1).max(128)
});

export const youtubeCandidatesSchema = z.object({ candidates: z.array(youtubeSearchCandidateSchema).max(5) });

export type UserConfirmedYouTubeVideo = z.infer<typeof userConfirmedYouTubeVideoSchema>;
export type YouTubeSearchCandidate = z.infer<typeof youtubeSearchCandidateSchema>;
