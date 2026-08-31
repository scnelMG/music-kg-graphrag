import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import { GET as getExplore } from "../app/api/music/catalog/explore/route";
import { GET as getInsights } from "../app/api/music/insights/route";

const originalBackendBaseUrl = process.env.BACKEND_BASE_URL;
const originalBackendSecret = process.env.BACKEND_BFF_SHARED_SECRET;

afterEach(() => {
  process.env.BACKEND_BASE_URL = originalBackendBaseUrl;
  process.env.BACKEND_BFF_SHARED_SECRET = originalBackendSecret;
});

async function withBackend(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
  scenario: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new TypeError("Expected TCP backend address");
  try {
    await scenario(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
  }
}

describe("public music discovery BFF", () => {
  it("exposes only a safe aggregate tag from the public graph projection", async () => {
    await withBackend((request, response) => {
      expect(request.url).toBe("/api/v1/recommendations/discover");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        albums: [{
          artist: "Dream Artist",
          artistCredits: ["Dream Artist"],
          coverUrl: "",
          evidenceMethod: "PERSONAL_EVIDENCE_GRAPH_TRAVERSAL",
          evidencePaths: [{ relation: "SHARES_MUSICBRAINZ_TAG", value: "dream pop" }],
          firstReleaseDate: "2024-01-01",
          primaryType: "EP",
          releaseGroupMbid: "release-group-id",
          score: 8,
          title: "Dream Album"
        }, {
          artist: "Ungrounded Artist",
          coverUrl: "",
          evidenceMethod: "PERSONAL_EVIDENCE_GRAPH_TRAVERSAL",
          evidencePaths: [],
          firstReleaseDate: "2024-01-01",
          releaseGroupMbid: "ungrounded-release-group-id",
          score: 1,
          title: "Ungrounded Album"
        }],
        retrievalMethod: "PERSONAL_EVIDENCE_GRAPH_TRAVERSAL",
        seedArtist: "Private Artist"
      }));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "server-only-secret";

      const response = await getInsights(new NextRequest("https://archive.example/api/music/insights"));

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("public, s-maxage=600, stale-while-revalidate=86400");
      const body = await response.json();
      expect(body).toEqual({ graphTaste: {
        relisten: [],
        recommendations: [expect.objectContaining({ artistCredits: ["Dream Artist"], primaryType: "EP", publicCurationReason: "shared-tag", sharedMusicBrainzTag: "dream pop", title: "Dream Album" })]
      } });
      expect(JSON.stringify(body)).not.toContain("Private Artist");
      expect(JSON.stringify(body)).not.toContain("score");
      expect(JSON.stringify(body)).not.toContain("Ungrounded Album");
    });
  });

  it("forwards only a declared public genre to the catalog", async () => {
    await withBackend((request, response) => {
      expect(request.url).toBe("/api/v1/catalog/explore?genre=dream-pop");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify([{
        artist: "Dream Artist", artistCredits: ["Dream Artist"], coverUrl: "", firstReleaseDate: "2024-01-01",
        primaryType: "Album", releaseGroupMbid: "release-group-id", searchScore: 100, title: "Dream Album"
      }]));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "server-only-secret";

      const response = await getExplore(new NextRequest("https://archive.example/api/music/catalog/explore?genre=dream-pop"));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ albums: [expect.objectContaining({ title: "Dream Album" })] });
    });
  });

  it("rejects a genre outside the public allow-list before calling the backend", async () => {
    const response = await getExplore(new NextRequest("https://archive.example/api/music/catalog/explore?genre=made-up-genre"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ code: "MALFORMED_REQUEST", retryable: false });
  });
});
