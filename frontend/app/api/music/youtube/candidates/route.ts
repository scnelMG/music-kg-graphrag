import ky, { HTTPError, TimeoutError } from "ky";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireOwnerSession } from "../../../../../lib/owner-session";
import { youtubeCandidatesSchema } from "../../../../../lib/youtube-playback-contract";

const requestSchema = z.object({
  artist: z.string().trim().min(1).max(200),
  recordingMbid: z.string().trim().min(1).max(128),
  title: z.string().trim().min(1).max(200)
}).strict();

const providerResponseSchema = z.object({
  items: z.array(z.object({
    id: z.object({ videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/) }),
    snippet: z.object({
      channelTitle: z.string().trim().min(1).max(200),
      thumbnails: z.object({
        default: z.object({ url: z.string().url() }).optional(),
        medium: z.object({ url: z.string().url() }).optional()
      }).optional(),
      title: z.string().trim().min(1).max(300)
    })
  })).max(5)
});

const apiBaseUrlSchema = z.string().url().default("https://www.googleapis.com/youtube/v3/search");
const productionYouTubeSearchUrl = "https://www.googleapis.com/youtube/v3/search";

function configuredYouTubeSearchUrl(): string | null {
  const configured = apiBaseUrlSchema.safeParse(process.env.YOUTUBE_DATA_API_BASE_URL);
  if (!configured.success) return null;
  if (process.env.NODE_ENV === "production" && configured.data !== productionYouTubeSearchUrl) return null;
  return configured.data;
}

function comparable(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[^\p{L}\p{N}]+/gu, "");
}

function matchesRequestedRecording(
  query: z.infer<typeof requestSchema>,
  item: z.infer<typeof providerResponseSchema>["items"][number]
): boolean {
  const candidateText = comparable(`${item.snippet.title} ${item.snippet.channelTitle}`);
  return candidateText.includes(comparable(query.artist)) && candidateText.includes(comparable(query.title));
}

function queryInput(request: NextRequest): z.infer<typeof requestSchema> | null {
  const entries = [...request.nextUrl.searchParams.entries()];
  const uniqueKeys = new Set(entries.map(([key]) => key));
  if (entries.length !== uniqueKeys.size) return null;
  return requestSchema.safeParse(Object.fromEntries(entries)).data ?? null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ownerSession = requireOwnerSession(request);
  if (ownerSession !== null) return ownerSession;
  const query = queryInput(request);
  if (query === null) return NextResponse.json({ code: "MALFORMED_REQUEST", retryable: false }, { status: 400 });
  const apiKey = process.env.YOUTUBE_DATA_API_KEY;
  if (apiKey === undefined || apiKey.trim().length === 0) {
    return NextResponse.json({ code: "YOUTUBE_CONFIGURATION_ERROR", retryable: false }, { status: 503 });
  }
  const apiBaseUrl = configuredYouTubeSearchUrl();
  if (apiBaseUrl === null) return NextResponse.json({ code: "YOUTUBE_CONFIGURATION_ERROR", retryable: false }, { status: 503 });
  try {
    const payload: unknown = await ky.get(apiBaseUrl, {
      retry: 0,
      searchParams: {
        key: apiKey.trim(),
        maxResults: "5",
        part: "snippet",
        q: `${query.artist} ${query.title}`,
        type: "video",
        videoCategoryId: "10"
      },
      timeout: 5_000
    }).json();
    const parsed = providerResponseSchema.safeParse(payload);
    if (!parsed.success) return NextResponse.json({ code: "YOUTUBE_RESPONSE_INVALID", retryable: false }, { status: 502 });
    const candidates = parsed.data.items.filter((item) => matchesRequestedRecording(query, item)).map((item) => ({
      channelTitle: item.snippet.channelTitle,
      thumbnailUrl: item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url ?? "",
      title: item.snippet.title,
      videoId: item.id.videoId
    }));
    const response = youtubeCandidatesSchema.safeParse({ candidates });
    return response.success
      ? NextResponse.json(response.data, { headers: { "cache-control": "private, no-store" } })
      : NextResponse.json({ code: "YOUTUBE_RESPONSE_INVALID", retryable: false }, { status: 502 });
  } catch (error) {
    if (error instanceof HTTPError || error instanceof TimeoutError || error instanceof TypeError) {
      return NextResponse.json({ code: "YOUTUBE_UNAVAILABLE", retryable: true }, { status: 503 });
    }
    throw error;
  }
}
