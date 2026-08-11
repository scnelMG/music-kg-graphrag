import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import { GET as getTracks } from "../app/api/music/albums/[releaseGroupMbid]/tracks/route";
import { GET as getRecords, POST as saveRecord } from "../app/api/music/records/route";

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
  if (address === null || typeof address === "string") throw new TypeError("Expected TCP test server address");
  try {
    await scenario(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
  }
}

describe("connected personal record BFF", () => {
  it("returns only recording titles supplied by the selected real release group", async () => {
    await withBackend((request, response) => {
      expect(request.url).toBe("/api/v1/catalog/albums/release-group-id/tracks");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify([{ recordingMbid: "recording-id", title: "Actual track", position: 1 }]));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "test-only-secret";

      const response = await getTracks(new NextRequest("http://localhost/api/music/albums/release-group-id/tracks"), {
        params: Promise.resolve({ releaseGroupMbid: "release-group-id" })
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ tracks: [{ recordingMbid: "recording-id", title: "Actual track", position: 1 }] });
    });
  });

  it("returns the current Notion-backed record list without synthesizing rows", async () => {
    await withBackend((request, response) => {
      expect(request.url).toBe("/api/v1/listening-records");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify([{
        albumTitle: "Recorded album",
        artist: "Recorded artist",
        artistCredits: ["Recorded artist", "Collaborator"],
        coverUrl: "",
        favouriteTrack: "Recorded track",
        lastEditedAt: "2026-08-11T00:00:00.000Z",
        owned: true,
        pageId: "notion-page-id",
        releaseGroupMbid: "release-group-id",
        sentiment: "Loved"
      }]));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "test-only-secret";

      const response = await getRecords();

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ records: [{ pageId: "notion-page-id", artistCredits: ["Recorded artist", "Collaborator"] }] });
    });
  });

  it("forwards every selected artist credit when it saves a collaborative album", async () => {
    await withBackend((request, response) => {
      expect(request.url).toBe("/api/v1/listening-records");
      let body = "";
      request.on("data", (chunk: Buffer) => { body += chunk.toString("utf8"); });
      request.on("end", () => {
        expect(JSON.parse(body).artistCredits).toEqual(["Primary artist", "Collaborator"]);
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ notionLastEditedAt: "2026-08-11T00:00:00.000Z", notionPageId: "notion-page-id", operation: "CREATED" }));
      });
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "test-only-secret";

      const response = await saveRecord(new NextRequest("http://localhost/api/music/records", {
        body: JSON.stringify({ albumTitle: "Collaborative album", artist: "Primary artist", artistCredits: ["Primary artist", "Collaborator"], coverUrl: "", favouriteTrack: "Actual track", owned: false, releaseGroupMbid: "release-group-id", sentiment: "Loved" }),
        headers: { "content-type": "application/json" },
        method: "POST"
      }));

      expect(response.status).toBe(201);
    });
  });
});
