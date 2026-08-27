import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { NextRequest } from "next/server";
import { afterEach, expect, it } from "vitest";

import { GET as getAlbums } from "../app/api/music/albums/route";
import { GET as getITunesTracks } from "../app/api/music/itunes/albums/[collectionId]/tracks/route";
import { GET as getRecordByCatalogIdentity } from "../app/api/music/records/by-catalog-identity/route";
import { createOwnerSession } from "../lib/owner-session";

const originalBackendBaseUrl = process.env.BACKEND_BASE_URL;
const originalBackendSecret = process.env.BACKEND_BFF_SHARED_SECRET;
const originalOwnerSetupToken = process.env.MUSIC_KG_OWNER_SETUP_TOKEN;
const originalOwnerSessionSecret = process.env.MUSIC_KG_OWNER_SESSION_SECRET;

afterEach(() => {
  process.env.BACKEND_BASE_URL = originalBackendBaseUrl;
  process.env.BACKEND_BFF_SHARED_SECRET = originalBackendSecret;
  process.env.MUSIC_KG_OWNER_SETUP_TOKEN = originalOwnerSetupToken;
  process.env.MUSIC_KG_OWNER_SESSION_SECRET = originalOwnerSessionSecret;
});

function ownerRequest(path: string): NextRequest {
  process.env.MUSIC_KG_OWNER_SETUP_TOKEN = "test-owner-setup-token-that-is-long-enough";
  process.env.MUSIC_KG_OWNER_SESSION_SECRET = "test-owner-session-secret-that-is-long-enough";
  const session = createOwnerSession("test-owner-setup-token-that-is-long-enough");
  if (session === null) throw new TypeError("Expected a signed owner session");
  return new NextRequest(`http://localhost${path}`, { headers: { cookie: `music_kg_owner_session=${session}` } });
}

it("returns only factual tracks from the selected iTunes collection", async () => {
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    expect(request.url).toBe("/api/v1/catalog/itunes/albums/123456789/tracks");
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify([{ recordingMbid: "itunes:987654321", position: 1, title: "첫 곡" }]));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new TypeError("Expected a TCP backend test server");
  try {
    process.env.BACKEND_BASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.BACKEND_BFF_SHARED_SECRET = "test-only-secret";

    const response = await getITunesTracks(
      new NextRequest("http://localhost/api/music/itunes/albums/123456789/tracks"),
      { params: Promise.resolve({ collectionId: "123456789" }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ tracks: [{ recordingMbid: "itunes:987654321", position: 1, title: "첫 곡" }] });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
  }
});

it("preserves an iTunes-only catalog identity without pretending it is an MBID", async () => {
  const server = createServer((_request: IncomingMessage, response: ServerResponse) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify([{
      artist: "극동아시아타이거즈",
      artistCredits: ["극동아시아타이거즈"],
      catalogId: "123456789",
      catalogSource: "ITUNES",
      catalogUrl: "https://music.apple.com/kr/album/new-album/123456789",
      coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music/v4/artwork/100x100bb.jpg",
      firstReleaseDate: "2025-04-11",
      primaryType: "Album",
      releaseGroupMbid: "",
      searchScore: 0,
      title: "새 음반"
    }]));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new TypeError("Expected a TCP backend test server");
  try {
    process.env.BACKEND_BASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.BACKEND_BFF_SHARED_SECRET = "test-only-secret";

    const response = await getAlbums(new NextRequest("http://localhost/api/music/albums?q=%EA%B7%B9%EB%8F%99"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ albums: [expect.objectContaining({
      catalogId: "123456789", catalogSource: "ITUNES", releaseGroupMbid: ""
    })] });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
  }
});

it("returns an iTunes record by source-qualified identity without exposing its Notion page id", async () => {
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const path = new URL(request.url ?? "", "http://localhost");
    expect(path.pathname).toBe("/api/v1/listening-records/by-catalog-identity");
    expect(path.searchParams.get("source")).toBe("ITUNES");
    expect(path.searchParams.get("catalogId")).toBe("123456789");
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      albumTitle: "새 음반", artist: "극동아시아타이거즈", artistCredits: ["극동아시아타이거즈"],
      catalogId: "123456789", catalogSource: "ITUNES", coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music/v4/artwork/100x100bb.jpg",
      favouriteTrack: "첫 곡", lastEditedAt: "2026-08-10T00:00:00.000Z", owned: false, pageId: "notion-page-id",
      releaseGroupMbid: "", releaseMbid: "", sentiment: "Loved"
    }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new TypeError("Expected a TCP backend test server");
  try {
    process.env.BACKEND_BASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.BACKEND_BFF_SHARED_SECRET = "test-only-secret";

    const response = await getRecordByCatalogIdentity(ownerRequest("/api/music/records/by-catalog-identity?source=ITUNES&catalogId=123456789"));

    expect(response.status).toBe(200);
    const payload = JSON.stringify(await response.json());
    expect(payload).toContain("ITUNES");
    expect(payload).toContain("123456789");
    expect(payload).not.toContain("notion-page-id");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
  }
});
