import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import { GET as getTracks } from "../app/api/music/albums/[releaseGroupMbid]/tracks/route";
import { POST as restoreRecord } from "../app/api/music/records/[pageId]/restore/route";
import { GET as getRecords, POST as saveRecord } from "../app/api/music/records/route";
import { createOwnerSession } from "../lib/owner-session";
import { issueRecordHandle } from "../lib/record-handle";

const originalBackendBaseUrl = process.env.BACKEND_BASE_URL;
const originalBackendSecret = process.env.BACKEND_BFF_SHARED_SECRET;
const originalOwnerSetupToken = process.env.MUSIC_KG_OWNER_SETUP_TOKEN;
const originalOwnerSessionSecret = process.env.MUSIC_KG_OWNER_SESSION_SECRET;
const originalVercelEnvironment = process.env.VERCEL_ENV;

function ownerHeaders(headers: Readonly<Record<string, string>> = {}): Record<string, string> {
  process.env.MUSIC_KG_OWNER_SETUP_TOKEN = "test-owner-setup-token-that-is-long-enough";
  process.env.MUSIC_KG_OWNER_SESSION_SECRET = "test-owner-session-secret-that-is-long-enough";
  const session = createOwnerSession("test-owner-setup-token-that-is-long-enough");
  if (session === null) throw new TypeError("Expected a signed owner session for the test request");
  return { ...headers, cookie: `music_kg_owner_session=${session}` };
}

afterEach(() => {
  process.env.BACKEND_BASE_URL = originalBackendBaseUrl;
  process.env.BACKEND_BFF_SHARED_SECRET = originalBackendSecret;
  process.env.MUSIC_KG_OWNER_SETUP_TOKEN = originalOwnerSetupToken;
  process.env.MUSIC_KG_OWNER_SESSION_SECRET = originalOwnerSessionSecret;
  process.env.VERCEL_ENV = originalVercelEnvironment;
});

async function withBackend(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
  scenario: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new TypeError("Expected TCP test server address");
  try {
    await scenario(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
  }
}

describe("connected personal record BFF", () => {
  it("returns only recording titles supplied by the selected real edition", async () => {
    await withBackend((request, response) => {
      expect(request.url).toBe("/api/v1/catalog/albums/release-group-id/tracks?edition=release-id");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify([{ recordingMbid: "recording-id", title: "Actual track", position: 1 }]));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "test-only-secret";

      const response = await getTracks(new NextRequest("http://localhost/api/music/albums/release-group-id/tracks?edition=release-id"), {
        params: Promise.resolve({ releaseGroupMbid: "release-group-id" })
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ tracks: [{ recordingMbid: "recording-id", title: "Actual track", position: 1 }] });
    });
  });

  it("loads one bounded Notion record page without exposing its Notion page id", async () => {
    await withBackend((request, response) => {
      expect(request.url).toBe("/api/v1/listening-records/page?limit=12");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        nextCursor: "next-notion-cursor",
        records: [{
          albumTitle: "Recorded album",
          artist: "Recorded artist",
          artistCredits: ["Recorded artist", "Collaborator"],
          coverUrl: "",
          favouriteTrack: "Recorded track",
          lastEditedAt: "2026-08-11T00:00:00.000Z",
          owned: true,
          pageId: "notion-page-id",
          releaseGroupMbid: "release-group-id",
          releaseMbid: "release-id",
          favouriteRecordingMbid: "recording-id",
          sentiment: "Loved"
        }]
      }));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "test-only-secret";

      const response = await getRecords(new NextRequest("http://localhost/api/music/records", { headers: ownerHeaders() }));

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({
        nextCursor: "next-notion-cursor",
        records: [{ artistCredits: ["Recorded artist", "Collaborator"] }]
      });
      expect(JSON.stringify(body)).not.toContain("notion-page-id");
      expect(body.records[0].recordHandle).toEqual(expect.any(String));
    });
  });

  it("keeps an unnormalized historical record visible without fabricating a catalog identity", async () => {
    await withBackend((request, response) => {
      expect(request.url).toBe("/api/v1/listening-records/page?limit=12");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        nextCursor: null,
        records: [{
          albumTitle: "Legacy album",
          artist: "Legacy artist",
          artistCredits: ["Legacy artist"],
          catalogId: "",
          catalogSource: "",
          coverUrl: "",
          favouriteTrack: "",
          lastEditedAt: "2026-08-11T00:00:00.000Z",
          owned: false,
          pageId: "legacy-notion-page-id",
          releaseGroupMbid: "",
          releaseMbid: "",
          sentiment: "Reflective"
        }]
      }));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "test-only-secret";

      const response = await getRecords(new NextRequest("http://localhost/api/music/records", { headers: ownerHeaders() }));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        nextCursor: null,
        records: [{ albumTitle: "Legacy album", catalogId: "", catalogSource: "LEGACY" }]
      });
    });
  });

  it("rejects an unconfirmed production write before it can reach Notion", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.BACKEND_BASE_URL = "http://127.0.0.1:1";
    process.env.BACKEND_BFF_SHARED_SECRET = "test-only-secret";

    const response = await saveRecord(new NextRequest("http://localhost/api/music/records", {
      body: JSON.stringify({ albumTitle: "Collaborative album", artist: "Primary artist", artistCredits: ["Primary artist", "Collaborator"], coverUrl: "", favouriteTrack: "Actual track", owned: false, releaseGroupMbid: "release-group-id", sentiment: "Loved" }),
      headers: ownerHeaders({ "content-type": "application/json" }),
      method: "POST"
    }));

    expect(response.status).toBe(428);
    await expect(response.json()).resolves.toEqual({ code: "WRITE_CONFIRMATION_REQUIRED", retryable: false });
  });

  it("retries one transient idempotent record save outage", async () => {
    let requestCount = 0;
    await withBackend((request, response) => {
      requestCount += 1;
      expect(request.url).toBe("/api/v1/listening-records");
      request.resume();
      response.setHeader("content-type", "application/json");
      if (requestCount === 1) {
        response.statusCode = 503;
        response.end(JSON.stringify({ code: "NOTION_UNAVAILABLE", requestId: "backend-request" }));
        return;
      }
      response.end(JSON.stringify({
        notionLastEditedAt: "2026-08-11T00:00:00.000Z",
        notionPageId: "notion-page-id",
        operation: "CREATED"
      }));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "test-only-secret";

      const response = await saveRecord(new NextRequest("http://localhost/api/music/records", {
        body: JSON.stringify({
          albumTitle: "Kind of Blue",
          artist: "Miles Davis",
          artistCredits: ["Miles Davis"],
          catalogId: "release-group-id",
          catalogSource: "MUSICBRAINZ",
          coverUrl: "",
          favouriteTrack: "So What",
          owned: false,
          releaseGroupMbid: "release-group-id",
          releaseMbid: "release-id",
          sentiment: "Loved"
        }),
        headers: ownerHeaders({ "content-type": "application/json" }),
        method: "POST"
      }));

      expect(requestCount).toBe(2);
      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toMatchObject({ operation: "CREATED" });
    });
  });

  it("forwards every selected artist credit and release edition when it saves a collaborative album", async () => {
    await withBackend((request, response) => {
      expect(request.url).toBe("/api/v1/listening-records");
      let body = "";
      request.on("data", (chunk: Buffer) => { body += chunk.toString("utf8"); });
      request.on("end", () => {
        const savedRecord: unknown = JSON.parse(body);
        expect(savedRecord).toMatchObject({
          artistCredits: ["Primary artist", "Collaborator"],
          releaseGroupMbid: "release-group-id",
          releaseMbid: "release-id",
          youtubeChannelTitle: "Primary artist official",
          youtubeRecordingMbid: "recording-id",
          youtubeVideoId: "dQw4w9WgXcQ",
          youtubeVideoTitle: "Primary artist - Actual track"
        });
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ notionLastEditedAt: "2026-08-11T00:00:00.000Z", notionPageId: "notion-page-id", operation: "CREATED" }));
      });
    }, async (baseUrl) => {
      process.env.VERCEL_ENV = "production";
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "test-only-secret";

      const response = await saveRecord(new NextRequest("http://localhost/api/music/records", {
        body: JSON.stringify({ albumTitle: "Collaborative album", artist: "Primary artist", artistCredits: ["Primary artist", "Collaborator"], coverUrl: "", favouriteTrack: "Actual track", favouriteRecordingMbid: "recording-id", owned: false, releaseGroupMbid: "release-group-id", releaseMbid: "release-id", sentiment: "Loved", youtubeChannelTitle: "Primary artist official", youtubeRecordingMbid: "recording-id", youtubeVideoId: "dQw4w9WgXcQ", youtubeVideoTitle: "Primary artist - Actual track" }),
        headers: ownerHeaders({ "content-type": "application/json", "x-music-kg-write-confirmed": "true" }),
        method: "POST"
      }));

      expect(response.status).toBe(201);
    });
  });

  it("forwards an iTunes collection identity without fabricating MusicBrainz IDs", async () => {
    await withBackend((request, response) => {
      expect(request.url).toBe("/api/v1/listening-records");
      let body = "";
      request.on("data", (chunk: Buffer) => { body += chunk.toString("utf8"); });
      request.on("end", () => {
        const savedRecord: unknown = JSON.parse(body);
        expect(savedRecord).toMatchObject({ catalogId: "123456789", catalogSource: "ITUNES", releaseGroupMbid: "", releaseMbid: "" });
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ notionLastEditedAt: "2026-08-11T00:00:00.000Z", notionPageId: "notion-page-id", operation: "CREATED" }));
      });
    }, async (baseUrl) => {
      process.env.VERCEL_ENV = "production";
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "test-only-secret";

      const response = await saveRecord(new NextRequest("http://localhost/api/music/records", {
        body: JSON.stringify({ albumTitle: "새 음반", artist: "극동아시아타이거즈", artistCredits: ["극동아시아타이거즈"], coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music/v4/artwork/100x100bb.jpg", favouriteTrack: "첫 곡", owned: false, releaseGroupMbid: "", releaseMbid: "", catalogSource: "ITUNES", catalogId: "123456789", sentiment: "Loved" }),
        headers: ownerHeaders({ "content-type": "application/json", "x-music-kg-write-confirmed": "true" }),
        method: "POST"
      }));

      expect(response.status).toBe(201);
    });
  });

  it("restores only the requested Notion record after an archive undo", async () => {
    await withBackend((request, response) => {
      expect(request.method).toBe("POST");
      expect(request.url).toBe("/api/v1/listening-records/notion-page-id/restore");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        notionLastEditedAt: "2026-08-12T00:00:00.000Z",
        notionPageId: "notion-page-id",
        operation: "RESTORED"
      }));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "test-only-secret";

      const recordHandle = issueRecordHandle("notion-page-id", "test-only-secret");
      const response = await restoreRecord(
        new NextRequest(`http://localhost/api/music/records/${recordHandle}/restore`, { headers: ownerHeaders(), method: "POST" }),
        { params: Promise.resolve({ pageId: recordHandle }) }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({ operation: "RESTORED" });
      expect(JSON.stringify(body)).not.toContain("notion-page-id");
    });
  });
});
