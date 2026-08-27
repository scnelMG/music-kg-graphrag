import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createOwnerSession } from "../lib/owner-session";
import { GET as getCandidates } from "../app/api/fixture/candidates/route";
import { GET as getHealth } from "../app/api/fixture/health/route";
import { GET as getConnectedHealth } from "../app/api/music/health/route";
import { GET as getAlbums } from "../app/api/music/albums/route";
import { GET as getEditions } from "../app/api/music/albums/[releaseGroupMbid]/editions/route";
import { GET as getTracks } from "../app/api/music/albums/[releaseGroupMbid]/tracks/route";
import { GET as getTasteGraph } from "../app/api/music/graphrag/route";
import { GET as getPersonalInsights } from "../app/api/music/insights/route";
import { POST as postGroundedExplanation } from "../app/api/music/insights/explanation/route";
import { GET as getRecordByReleaseGroup } from "../app/api/music/records/by-release-group/[releaseGroupMbid]/route";
import { GET as getPersonalSync, POST as postPersonalSync } from "../app/api/music/sync/route";

const originalBackendBaseUrl = process.env.BACKEND_BASE_URL;
const originalBackendSecret = process.env.BACKEND_BFF_SHARED_SECRET;
const originalOwnerSetupToken = process.env.MUSIC_KG_OWNER_SETUP_TOKEN;
const originalOwnerSessionSecret = process.env.MUSIC_KG_OWNER_SESSION_SECRET;

function personalRequest(path: string, method = "GET"): NextRequest {
  process.env.MUSIC_KG_OWNER_SETUP_TOKEN = "test-owner-setup-token-that-is-long-enough";
  process.env.MUSIC_KG_OWNER_SESSION_SECRET = "test-owner-session-secret-that-is-long-enough";
  const session = createOwnerSession("test-owner-setup-token-that-is-long-enough");
  if (session === null) throw new TypeError("Expected a signed owner session for the test request");
  return new NextRequest(`http://localhost${path}`, {
    headers: { cookie: `music_kg_owner_session=${session}` },
    method
  });
}

afterEach(() => {
  process.env.BACKEND_BASE_URL = originalBackendBaseUrl;
  process.env.BACKEND_BFF_SHARED_SECRET = originalBackendSecret;
  process.env.MUSIC_KG_OWNER_SETUP_TOKEN = originalOwnerSetupToken;
  process.env.MUSIC_KG_OWNER_SESSION_SECRET = originalOwnerSessionSecret;
  vi.unstubAllEnvs();
});

async function withBackend(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
  scenario: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new TypeError("Expected the backend test server to listen on a TCP port");
  }
  try {
    await scenario(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
  }
}

describe("fixture BFF backend integration", () => {
  it("rejects an oversized public catalog query before it reaches the backend", async () => {
    const response = await getAlbums(new NextRequest(`http://localhost/api/music/albums?q=${"a".repeat(201)}`));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ code: "MALFORMED_REQUEST", retryable: false });
  });

  it("returns one server-authoritative record even when it is outside the loaded client page", async () => {
    await withBackend((request, response) => {
      expect(request.url).toBe("/api/v1/listening-records/by-release-group/release-group-later");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        albumTitle: "Later record",
        artist: "Artist",
        artistCredits: ["Artist"],
        catalogId: "release-group-id",
        catalogSource: "MUSICBRAINZ",
        catalogUrl: "",
        coverUrl: "",
        favouriteTrack: "Saved favourite",
        lastEditedAt: "2026-08-10T00:00:00.000Z",
        owned: true,
        pageId: "page-13",
        releaseGroupMbid: "release-group-later",
        releaseMbid: "release-later",
        sentiment: "Loved",
        youtubeChannelTitle: "Artist Official",
        youtubeRecordingMbid: "recording-later",
        youtubeVideoId: "dQw4w9WgXcQ",
        youtubeVideoTitle: "Artist - Saved favourite (Official Audio)"
      }));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "server-only-secret";

      const response = await getRecordByReleaseGroup(
        personalRequest("/api/music/records/by-release-group/release-group-later"),
        { params: Promise.resolve({ releaseGroupMbid: "release-group-later" }) }
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        record: {
          favouriteTrack: "Saved favourite",
          recordHandle: expect.any(String),
          releaseMbid: "release-later",
          sentiment: "Loved",
          youtubeChannelTitle: "Artist Official",
          youtubeRecordingMbid: "recording-later",
          youtubeVideoId: "dQw4w9WgXcQ",
          youtubeVideoTitle: "Artist - Saved favourite (Official Audio)"
        }
      });
    });
  });

  it("rejects catalog albums without an Album or EP primary type", async () => {
    // Given a backend catalog response that omits the required scope marker
    await withBackend((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify([{
        artist: "Artist",
        artistCredits: ["Artist"],
        coverUrl: "",
        firstReleaseDate: "",
        releaseGroupMbid: "release-group-id",
        title: "Unscoped release"
      }]));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "server-only-secret";

      // When the public catalog boundary receives the unscoped item
      const response = await getAlbums(new NextRequest("http://localhost/api/music/albums?q=Unscoped"));

      // Then it rejects the backend contract rather than exposing the item.
      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toEqual({ code: "BACKEND_CONTRACT_ERROR", retryable: false });
    });
  });

  it("rejects catalog singles at the public album boundary", async () => {
    await withBackend((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify([{
        artist: "Artist",
        artistCredits: ["Artist"],
        coverUrl: "",
        firstReleaseDate: "2020-01-01",
        primaryType: "Single",
        releaseGroupMbid: "release-group-id",
        searchScore: 100,
        title: "Single only"
      }]));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "server-only-secret";

      const response = await getAlbums(new NextRequest("http://localhost/api/music/albums?q=Single"));

      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toEqual({ code: "BACKEND_CONTRACT_ERROR", retryable: false });
    });
  });

  it("preserves a Cover Art Archive catalog URL for direct browser delivery", async () => {
    const releaseGroupMbid = "f9b61a7e-0c86-4cc7-b94e-48d3b643c554";
    await withBackend((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify([{
        artist: "Artist",
        artistCredits: ["Artist"],
        coverUrl: `https://archive.example/api/music/covers/${releaseGroupMbid}`,
        firstReleaseDate: "2020-01-01",
        primaryType: "Album",
        releaseGroupMbid,
        searchScore: 100,
        title: "Covered album"
      }]));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "server-only-secret";

      const response = await getAlbums(new NextRequest("https://archive.example/api/music/albums?q=Covered"));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ albums: [expect.objectContaining({
        coverUrl: `https://coverartarchive.org/release-group/${releaseGroupMbid}/front-250`
      })] });
    });
  });

  it("rejects an edition that belongs to a different release group", async () => {
    // Given a backend catalog response containing a cross-group edition
    await withBackend((request, response) => {
      expect(request.url).toBe("/api/v1/catalog/albums/release-group-id/editions");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        editions: [{
          country: "KR",
          disambiguation: "Original release",
          recommended: true,
          releaseDate: "2020-01-01",
          releaseGroupMbid: "another-release-group",
          releaseMbid: "release-id",
          status: "Official",
          title: "Different album"
        }],
        hasMore: false,
        nextCursor: null
      }));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "server-only-secret";

      // When the path group and payload group disagree
      const response = await getEditions(new NextRequest("http://localhost/api/music/albums/release-group-id/editions"), {
        params: Promise.resolve({ releaseGroupMbid: "release-group-id" })
      });

      // Then the public boundary rejects the invalid association.
      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toEqual({ code: "BACKEND_CONTRACT_ERROR", retryable: false });
    });
  });

  it("caches a validated bounded public edition page", async () => {
    await withBackend((request, response) => {
      expect(request.url).toBe("/api/v1/catalog/albums/release-group-id/editions");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        editions: [{
          country: "KR",
          disambiguation: "Original release",
          recommended: true,
          releaseDate: "2020-01-01",
          releaseGroupMbid: "release-group-id",
          releaseMbid: "release-id",
          status: "Official",
          title: "Album title"
        }],
        hasMore: true,
        nextCursor: "20"
      }));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "server-only-secret";

      const response = await getEditions(new NextRequest("http://localhost/api/music/albums/release-group-id/editions"), {
        params: Promise.resolve({ releaseGroupMbid: "release-group-id" })
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("public, s-maxage=600, stale-while-revalidate=86400");
      await expect(response.json()).resolves.toEqual({
        editions: [expect.objectContaining({ recommended: true, releaseMbid: "release-id" })],
        hasMore: true,
        nextCursor: "20"
      });
    });
  });

  it("forwards one opaque edition cursor and keeps a high-count next page bounded", async () => {
    await withBackend((request, response) => {
      expect(request.url).toBe("/api/v1/catalog/albums/release-group-id/editions?cursor=20");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        editions: [{
          country: "JP",
          disambiguation: "",
          recommended: false,
          releaseDate: "2024-01-01",
          releaseGroupMbid: "release-group-id",
          releaseMbid: "release-20",
          status: "Official",
          title: "Album title"
        }],
        hasMore: true,
        nextCursor: "40"
      }));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "server-only-secret";

      const response = await getEditions(new NextRequest("http://localhost/api/music/albums/release-group-id/editions?cursor=20"), {
        params: Promise.resolve({ releaseGroupMbid: "release-group-id" })
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ hasMore: true, nextCursor: "40" });
    });
  });

  it("rejects an edition cursor outside the Java integer domain before contacting the backend", async () => {
    let requestCount = 0;
    await withBackend((_request, response) => {
      requestCount += 1;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ editions: [], hasMore: false, nextCursor: null }));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "server-only-secret";

      const response = await getEditions(
        new NextRequest("http://localhost/api/music/albums/release-group-id/editions?cursor=999999999999999999999"),
        { params: Promise.resolve({ releaseGroupMbid: "release-group-id" }) }
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ code: "MALFORMED_REQUEST", retryable: false });
      expect(requestCount).toBe(0);
    });
  });

  it("requires exactly one nonblank edition before loading tracks", async () => {
    let requestCount = 0;
    // Given a configured backend that would otherwise return tracks
    await withBackend((_request, response) => {
      requestCount += 1;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify([{ position: 1, recordingMbid: "recording-id", title: "Actual track" }]));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "server-only-secret";

      // When the browser omits the selected edition
      const response = await getTracks(new NextRequest("http://localhost/api/music/albums/release-group-id/tracks"), {
        params: Promise.resolve({ releaseGroupMbid: "release-group-id" })
      });

      // Then it fails before making an ambiguous catalog request.
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ code: "MALFORMED_REQUEST", retryable: false });
      expect(requestCount).toBe(0);
    });
  });

  it("forwards only the selected edition to the catalog tracks endpoint", async () => {
    // Given a valid selected edition
    await withBackend((request, response) => {
      expect(request.url).toBe("/api/v1/catalog/albums/release-group-id/tracks?edition=release-id");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify([{ position: 1, recordingMbid: "recording-id", title: "Actual track" }]));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "server-only-secret";

      // When the browser requests tracks for one selected edition
      const response = await getTracks(new NextRequest("http://localhost/api/music/albums/release-group-id/tracks?edition=release-id"), {
        params: Promise.resolve({ releaseGroupMbid: "release-group-id" })
      });

      // Then the BFF forwards only that catalog parameter.
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ tracks: [{ position: 1, recordingMbid: "recording-id", title: "Actual track" }] });
    });
  });

  it("rejects unknown track query parameters", async () => {
    let requestCount = 0;
    await withBackend((_request, response) => {
      requestCount += 1;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify([]));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "server-only-secret";

      const response = await getTracks(new NextRequest("http://localhost/api/music/albums/release-group-id/tracks?edition=release-id&extra=value"), {
        params: Promise.resolve({ releaseGroupMbid: "release-group-id" })
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ code: "MALFORMED_REQUEST", retryable: false });
      expect(requestCount).toBe(0);
    });
  });

  it("forwards an explicit grounded explanation request without exposing the BFF secret", async () => {
    await withBackend((request, response) => {
      expect(request.url).toBe("/api/v1/personal-insights/explanation");
      expect(request.headers["x-music-kg-bff-secret"]).toBe("server-only-secret");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        answer: "기록의 최애곡과 감상을 근거로 다음 앨범을 골랐습니다.",
        citations: [{ artist: "Artist", label: "E1", recordTitle: "Recorded Album", relation: "RECORDED_BY" }],
        status: "GENERATED"
      }));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "server-only-secret";

      const response = await postGroundedExplanation(personalRequest("/api/music/insights/explanation", "POST"));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        answer: "기록의 최애곡과 감상을 근거로 다음 앨범을 골랐습니다.",
        citations: [{ artist: "Artist", label: "E1", recordTitle: "Recorded Album", relation: "RECORDED_BY" }],
        status: "GENERATED"
      });
    });
  });

  it("preserves an honest no-evidence explanation state instead of turning it into a backend failure", async () => {
    await withBackend((request, response) => {
      expect(request.url).toBe("/api/v1/personal-insights/explanation");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ answer: "", citations: [], status: "NO_EVIDENCE" }));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "server-only-secret";

      const response = await postGroundedExplanation(personalRequest("/api/music/insights/explanation", "POST"));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ answer: "", citations: [], status: "NO_EVIDENCE" });
    });
  });

  it("preserves a real MusicBrainz result without confirmed front artwork", async () => {
    await withBackend((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify([{
        artist: "Artist",
        artistCredits: ["Artist"],
        coverUrl: "",
        firstReleaseDate: "",
        primaryType: "Album",
        releaseGroupMbid: "release-group-id",
        searchScore: 100,
        title: "No Front Art"
      }]));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "server-only-secret";

      const response = await getAlbums(new NextRequest("http://localhost/api/music/albums?q=No+Front+Art"));

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("public, s-maxage=600, stale-while-revalidate=86400");
      await expect(response.json()).resolves.toEqual({ albums: [{
        artist: "Artist",
        artistCredits: ["Artist"],
        catalogId: "release-group-id",
        catalogSource: "MUSICBRAINZ",
        catalogUrl: "",
        coverUrl: "",
        firstReleaseDate: "",
        primaryType: "Album",
        releaseGroupMbid: "release-group-id",
        searchScore: 100,
        title: "No Front Art"
      }] });
    });
  });

  it("caches validated public track metadata without placing personal routes in a shared cache", async () => {
    await withBackend((request, response) => {
      expect(request.url).toBe("/api/v1/catalog/albums/release-group-id/tracks?edition=release-id");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify([{ position: 1, recordingMbid: "recording-id", title: "Actual track" }]));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "server-only-secret";

      const response = await getTracks(new NextRequest("http://localhost/api/music/albums/release-group-id/tracks?edition=release-id"), {
        params: Promise.resolve({ releaseGroupMbid: "release-group-id" })
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("public, s-maxage=600, stale-while-revalidate=86400");
      await expect(response.json()).resolves.toEqual({ tracks: [{ position: 1, recordingMbid: "recording-id", title: "Actual track" }] });
    });
  });

  it("projects the personal graph retrieval contract without creating browser-side data", async () => {
    // Given an authenticated connected backend that returns a traceable retrieval result
    await withBackend((request, response) => {
      expect(request.url).toBe("/api/v1/graphrag/taste");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        evidencePageIds: ["notion-page-1"],
        generatedByLlm: false,
        personalRecordCount: 1,
        recommendations: [{
          artist: "Miles Davis",
          coverUrl: "https://cover.example/kind-of-blue.jpg",
          evidenceMethod: "PERSISTENT_GRAPHDB_PERSONAL_EVIDENCE_RETRIEVAL",
          evidencePaths: [{ recordPageId: "notion-page-1", relation: "SHARES_MUSICBRAINZ_TAG", value: "cool jazz" }],
          firstReleaseDate: "1959-08-17",
          releaseGroupMbid: "release-group-id",
          title: "Kind of Blue",
          score: 1
        }],
        retrievalMethod: "PERSISTENT_GRAPHDB_PERSONAL_EVIDENCE_RETRIEVAL",
        seedArtist: "Miles Davis"
      }));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "server-only-secret";

      // When the browser requests the personal graph evidence
      const response = await getTasteGraph(personalRequest("/api/music/graphrag"));

      // Then it receives only the schema-validated public result, never the private Notion page ID.
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({
        generatedByLlm: false,
        retrievalMethod: "PERSISTENT_GRAPHDB_PERSONAL_EVIDENCE_RETRIEVAL"
      });
      expect(JSON.stringify(body)).not.toContain("notion-page-1");
    });
  });

  it("loads taste and graph evidence through one connected backend request", async () => {
    await withBackend((request, response) => {
      expect(request.url).toBe("/api/v1/personal-insights");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        syncState: {
          changedRecordCount: 0,
          lastSuccessfulAt: "2026-08-13T00:00:00Z",
          stale: false,
          status: "CURRENT"
        },
        graphTaste: {
          personalRecordCount: 1,
          retrievalMethod: "PERSONAL_EVIDENCE_GRAPH_TRAVERSAL",
          relisten: [{
            artist: "Miles Davis",
            coverUrl: "",
            evidenceMethod: "PERSONAL_RECORD_RELISTEN",
            favouriteTrack: "So What",
            owned: true,
            releaseGroupMbid: "release-group-id",
            title: "Kind of Blue"
          }],
          recommendations: [],
          seedArtist: "Miles Davis"
        },
        taste: {
          artists: [{ count: 1, value: "Miles Davis" }],
          favouriteTracks: [{ count: 1, value: "So What" }],
          recordCount: 1,
          sentiments: [{ count: 1, value: "Loved" }]
        }
      }));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "server-only-secret";

      const response = await getPersonalInsights(personalRequest("/api/music/insights?scope=owner"));

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({
        syncState: { stale: false, status: "CURRENT" },
        graphTaste: {
          relisten: [{
            evidenceMethod: "PERSONAL_RECORD_RELISTEN",
            title: "Kind of Blue"
          }],
          seedArtist: "Miles Davis"
        },
        taste: { recordCount: 1 }
      });
      expect(JSON.stringify(body)).not.toContain("notion-page-1");
    });
  });

  it("shows only curated discovery to a visitor and never exposes a recorded album", async () => {
    vi.stubEnv("MUSIC_KG_OWNER_SESSION_REQUIRED", "true");
    vi.stubEnv("MUSIC_KG_OWNER_SESSION_SECRET", "a-session-secret-that-is-long-enough");
    await withBackend((request, response) => {
      expect(request.url).toBe("/api/v1/recommendations/discover");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        albums: [{
          artist: "Artist Two",
          artistCredits: ["Artist Two"],
          coverUrl: "https://coverartarchive.org/release-group/f9b61a7e-0c86-4cc7-b94e-48d3b643c554/front-250",
          evidenceMethod: "PERSONAL_EVIDENCE_GRAPH_TRAVERSAL",
          evidencePaths: [{ relation: "SHARES_MUSICBRAINZ_TAG", value: "dream pop" }],
          firstReleaseDate: "2025-01-01",
          releaseGroupMbid: "f9b61a7e-0c86-4cc7-b94e-48d3b643c554",
          score: 1,
          title: "New Album"
        }],
        retrievalMethod: "PERSONAL_EVIDENCE_GRAPH_TRAVERSAL",
        seedArtist: "Artist One"
      }));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "server-only-secret";

      const response = await getPersonalInsights(new NextRequest("http://localhost/api/music/insights"));

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.graphTaste.recommendations[0].title).toBe("New Album");
      expect(body.graphTaste.relisten).toEqual([]);
      expect(body.graphTaste.personalRecordCount).toBeUndefined();
      expect(body.graphTaste.retrievalMethod).toBeUndefined();
      expect(body.graphTaste.seedArtist).toBeUndefined();
      expect(body.graphTaste.recommendations[0].score).toBeUndefined();
      expect(body.graphTaste.recommendations[0].evidenceMethod).toBeUndefined();
      expect(body.graphTaste.recommendations[0].evidencePaths).toBeUndefined();
      expect(body.graphTaste.recommendations[0].coverUrl).toBe("https://coverartarchive.org/release-group/f9b61a7e-0c86-4cc7-b94e-48d3b643c554/front-250");
      expect(body.taste).toBeUndefined();
      expect(body.syncState).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain("Artist One");
    });
  });

  it("uses incremental synchronization by default and reserves reconciliation for an explicit request", async () => {
    let requestCount = 0;
    await withBackend((request, response) => {
      requestCount += 1;
      expect(request.method).toBe(requestCount === 1 ? "GET" : "POST");
      expect(request.url).toBe(requestCount === 3 ? "/api/v1/personal-sync/reconcile" : "/api/v1/personal-sync");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        changedRecordCount: 2,
        lastSuccessfulAt: "2026-08-13T00:00:00Z",
        stale: false,
        status: "CURRENT"
      }));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "server-only-secret";

      const status = await getPersonalSync(personalRequest("/api/music/sync"));
      const refreshed = await postPersonalSync(personalRequest("/api/music/sync", "POST"));
      const reconciled = await postPersonalSync(personalRequest("/api/music/sync?mode=reconcile", "POST"));

      expect(status.status).toBe(200);
      expect(refreshed.status).toBe(200);
      expect(reconciled.status).toBe(200);
      await expect(refreshed.json()).resolves.toMatchObject({
        changedRecordCount: 2,
        stale: false,
        status: "CURRENT"
      });
    });
  });

  it("accepts the deployed connected health contract before the browser enables the workspace", async () => {
    await withBackend((request, response) => {
      expect(request.url).toBe("/api/v1/health");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ mode: "connected", status: "ok" }));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "server-only-secret";

      const response = await getConnectedHealth();

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ mode: "connected", status: "ok" });
    });
  });

  it("does not abandon a real personal-insights response at the former two-second BFF cutoff", async () => {
    await withBackend((_request, response) => {
      setTimeout(() => {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({
          graphTaste: {
            evidencePageIds: ["notion-page-1"],
          personalRecordCount: 1,
          retrievalMethod: "PERSONAL_EVIDENCE_GRAPH_TRAVERSAL",
            recommendations: [],
            seedArtist: "Miles Davis"
          },
          taste: {
            artists: [{ count: 1, value: "Miles Davis" }],
            favouriteTracks: [{ count: 1, value: "So What" }],
            recordCount: 1,
            sentiments: [{ count: 1, value: "Loved" }]
          }
        }));
      }, 2_100);
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "server-only-secret";

      const response = await getPersonalInsights(personalRequest("/api/music/insights?scope=owner"));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ taste: { recordCount: 1 } });
    });
  });

  it("carries the server-only shared secret to the backend", async () => {
    // Given a wire-level backend that accepts only the configured shared secret
    let receivedSecret: string | undefined;
    await withBackend((request, response) => {
      const header = request.headers["x-music-kg-bff-secret"];
      receivedSecret = Array.isArray(header) ? undefined : header;
      response.setHeader("content-type", "application/json");
      if (request.headers["x-music-kg-bff-secret"] !== "server-only-secret") {
        response.statusCode = 401;
        response.end(JSON.stringify({ code: "BFF_AUTH_REQUIRED", requestId: "backend-request" }));
        return;
      }
      response.end(JSON.stringify([{ artist: "윤슬", id: "fixture-album-001", source: "PUBLIC_FIXTURE", title: "밤의 기록" }]));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "server-only-secret";

      // When the browser-facing candidates route is requested
      const response = await getCandidates(new NextRequest("http://localhost/api/fixture/candidates?q=fixture"));

      // Then the BFF reaches the backend without exposing the credential in its response
      expect(response.status).toBe(200);
      expect(receivedSecret).toBe("server-only-secret");
      const body = JSON.stringify(await response.json());
      expect(body).toContain("fixture-album-001");
      expect(body).not.toContain("server-only-secret");
    });
  });

  it("passes through a typed backend 401 for a stale secret", async () => {
    // Given a backend that rejects the BFF credential
    await withBackend((_request, response) => {
      response.statusCode = 401;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ code: "BFF_AUTH_REQUIRED", requestId: "backend-request" }));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "stale-secret";

      // When the BFF calls the backend
      const response = await getHealth();

      // Then the typed authentication status survives without leaking the stale value
      expect(response.status).toBe(401);
      const body = JSON.stringify(await response.json());
      expect(body).toContain("BFF_AUTH_REQUIRED");
      expect(body).not.toContain("stale-secret");
    });
  });

  it("does not forward the shared secret through a backend redirect", async () => {
    // Given a backend redirecting to a different origin that records received credentials
    let redirectedSecret: string | undefined;
    await withBackend((request, response) => {
      const header = request.headers["x-music-kg-bff-secret"];
      redirectedSecret = Array.isArray(header) ? undefined : header;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ mode: "fixture", status: "ok" }));
    }, async (redirectTarget) => {
      await withBackend((_request, response) => {
        response.statusCode = 302;
        response.setHeader("location", `${redirectTarget}/api/v1/health`);
        response.end();
      }, async (baseUrl) => {
        process.env.BACKEND_BASE_URL = baseUrl;
        process.env.BACKEND_BFF_SHARED_SECRET = "redirect-sensitive-secret";

        // When the BFF calls the redirecting backend
        const response = await getHealth();

        // Then it rejects the redirect without contacting the target with the secret
        expect(response.status).toBe(502);
        expect(redirectedSecret).toBeUndefined();
      });
    });
  });

  it("preserves a displayable invalid-rating failure", async () => {
    // Given a backend validation response containing only its typed machine contract
    await withBackend((_request, response) => {
      response.statusCode = 400;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ code: "INVALID_RATING", requestId: "backend-request" }));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "server-only-secret";

      // When the browser-facing review route submits an invalid rating
      const { POST: saveReview } = await import("../app/api/fixture/reviews/route");
      const response = await saveReview(new NextRequest("http://localhost/api/fixture/reviews", {
        body: JSON.stringify({ candidateId: "fixture-album-001", rating: 6, review: "note" }),
        headers: { "content-type": "application/json" },
        method: "POST"
      }));

      // Then the UI receives both the machine code and a safe human-readable message
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        code: "INVALID_RATING",
        message: "평점은 1에서 5 사이의 정수여야 합니다."
      });
    });
  });

  it("returns a redacted typed 503 when the backend is unavailable", async () => {
    // Given an unreachable backend and a configured server-only credential
    process.env.BACKEND_BASE_URL = "http://127.0.0.1:1";
    process.env.BACKEND_BFF_SHARED_SECRET = "must-not-leak";

    // When the BFF health route attempts the connection
    const response = await getHealth();

    // Then callers receive a recoverable typed outage with no connection or secret details
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: "BACKEND_UNAVAILABLE",
      message: "The music backend is temporarily unavailable.",
      retryable: true
    });
  });

  it("preserves a typed GraphDB outage code without forwarding upstream details", async () => {
    await withBackend((_request, response) => {
      response.statusCode = 503;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ code: "GRAPHDB_UNAVAILABLE", requestId: "backend-request" }));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "server-only-secret";

      const response = await getPersonalInsights(personalRequest("/api/music/insights"));

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        code: "GRAPHDB_UNAVAILABLE",
        message: "The music backend is temporarily unavailable.",
        retryable: true
      });
    });
  });

  it("preserves an iTunes rate limit as a recoverable catalog failure", async () => {
    await withBackend((_request, response) => {
      response.statusCode = 503;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ code: "ITUNES_RATE_LIMITED", requestId: "backend-request" }));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "server-only-secret";

      const response = await getAlbums(new NextRequest("http://localhost/api/music/albums?q=%EA%B7%B9%EB%8F%99"));

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        code: "ITUNES_RATE_LIMITED",
        message: "The music backend is temporarily unavailable.",
        retryable: true
      });
    });
  });

  it("returns a typed 502 when a successful backend response violates its contract", async () => {
    // Given an authenticated backend that returns malformed success JSON
    await withBackend((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end("not-json");
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "server-only-secret";

      // When the BFF parses the backend health response
      const response = await getHealth();

      // Then the browser receives a typed contract error rather than upstream details
      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toEqual({ code: "BACKEND_CONTRACT_ERROR", retryable: false });
    });
  });

  it("accepts the authenticated production service health contract", async () => {
    // Given a production-mode fixture API returning only aggregate health
    await withBackend((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ mode: "production", status: "ok" }));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "server-only-secret";

      // When the BFF requests service health
      const response = await getHealth();

      // Then the production safety mode remains a valid redacted health state
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ mode: "production", status: "ok" });
    });
  });
});
