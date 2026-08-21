import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import { GET } from "../app/api/music/youtube/candidates/route";
import { createOwnerSession } from "../lib/owner-session";

const originalApiKey = process.env.YOUTUBE_DATA_API_KEY;
const originalBaseUrl = process.env.YOUTUBE_DATA_API_BASE_URL;
const originalOwnerSetupToken = process.env.MUSIC_KG_OWNER_SETUP_TOKEN;
const originalOwnerSessionSecret = process.env.MUSIC_KG_OWNER_SESSION_SECRET;

function ownerHeaders(): Record<string, string> {
  process.env.MUSIC_KG_OWNER_SETUP_TOKEN = "test-owner-setup-token-that-is-long-enough";
  process.env.MUSIC_KG_OWNER_SESSION_SECRET = "test-owner-session-secret-that-is-long-enough";
  const session = createOwnerSession("test-owner-setup-token-that-is-long-enough");
  if (session === null) throw new TypeError("Expected a signed owner session");
  return { cookie: `music_kg_owner_session=${session}` };
}

afterEach(() => {
  process.env.YOUTUBE_DATA_API_KEY = originalApiKey;
  process.env.YOUTUBE_DATA_API_BASE_URL = originalBaseUrl;
  process.env.MUSIC_KG_OWNER_SETUP_TOKEN = originalOwnerSetupToken;
  process.env.MUSIC_KG_OWNER_SESSION_SECRET = originalOwnerSessionSecret;
});

async function withYouTubeApi(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
  scenario: () => Promise<void>
): Promise<void> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new TypeError("Expected a TCP server address");
  process.env.YOUTUBE_DATA_API_BASE_URL = `http://127.0.0.1:${address.port}/youtube/v3/search`;
  try {
    await scenario();
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
  }
}

describe("verified YouTube candidate BFF", () => {
  it("returns only validated video candidates when an owner searches for a MusicBrainz recording", async () => {
    await withYouTubeApi((request, response) => {
      expect(request.url).toContain("part=snippet");
      expect(request.url).toContain("type=video");
      expect(request.url).toContain("q=Artist+Track");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        items: [{
          id: { videoId: "dQw4w9WgXcQ" },
          snippet: {
            channelTitle: "Artist Official",
            title: "Artist - Track (Official Audio)",
            thumbnails: { medium: { url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg" } }
          }
        }]
      }));
    }, async () => {
      process.env.YOUTUBE_DATA_API_KEY = "test-server-only-key";

      const response = await GET(new NextRequest(
        "http://localhost/api/music/youtube/candidates?recordingMbid=recording-id&title=Track&artist=Artist",
        { headers: ownerHeaders() }
      ));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        candidates: [{
          channelTitle: "Artist Official",
          thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
          title: "Artist - Track (Official Audio)",
          videoId: "dQw4w9WgXcQ"
        }]
      });
    });
  });

  it("excludes a same-title video when its metadata does not name the requested artist", async () => {
    await withYouTubeApi((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        items: [{
          id: { videoId: "dQw4w9WgXcQ" },
          snippet: {
            channelTitle: "Different Artist Official",
            title: "Different Artist - Track (Official Audio)",
            thumbnails: { medium: { url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg" } }
          }
        }]
      }));
    }, async () => {
      process.env.YOUTUBE_DATA_API_KEY = "test-server-only-key";

      const response = await GET(new NextRequest(
        "http://localhost/api/music/youtube/candidates?recordingMbid=recording-id&title=Track&artist=Requested%20Artist",
        { headers: ownerHeaders() }
      ));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ candidates: [] });
    });
  });

  it("does not call YouTube for a visitor", async () => {
    process.env.YOUTUBE_DATA_API_KEY = "test-server-only-key";
    let requestCount = 0;
    await withYouTubeApi((_request, response) => {
      requestCount += 1;
      response.end("{}");
    }, async () => {
      const response = await GET(new NextRequest(
        "http://localhost/api/music/youtube/candidates?recordingMbid=recording-id&title=Track&artist=Artist"
      ));

      expect(response.status).toBe(401);
      expect(requestCount).toBe(0);
    });
  });

  it("fails closed when the server-only YouTube key is absent", async () => {
    delete process.env.YOUTUBE_DATA_API_KEY;

    const response = await GET(new NextRequest(
      "http://localhost/api/music/youtube/candidates?recordingMbid=recording-id&title=Track&artist=Artist",
      { headers: ownerHeaders() }
    ));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ code: "YOUTUBE_CONFIGURATION_ERROR", retryable: false });
  });
});
