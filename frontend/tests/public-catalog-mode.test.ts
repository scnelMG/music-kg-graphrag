import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as albums } from "../app/api/music/albums/route";
import { GET as editions } from "../app/api/music/albums/[releaseGroupMbid]/editions/route";
import { GET as tracks } from "../app/api/music/albums/[releaseGroupMbid]/tracks/route";
import { GET as itunesTracks } from "../app/api/music/itunes/albums/[collectionId]/tracks/route";
import { GET as insights } from "../app/api/music/insights/route";
import { GET as explore } from "../app/api/music/catalog/explore/route";
import { publicAlbumsSchema, publicInsightsSchema, publicTracksSchema } from "../lib/public-discovery-contract";

const groupId = "8e7f5f00-1234-4a00-8abc-000000000001";
const releaseId = "8e7f5f00-1234-4a00-8abc-000000000002";
const otherGroup = "8e7f5f00-1234-4a00-8abc-000000000003";
const recordingId = "8e7f5f00-1234-4a00-8abc-000000000004";
const group = { id: groupId, title: "Kind of Blue", "primary-type": "Album", score: 100, "first-release-date": "1959", "artist-credit": [{ name: "Miles Davis", artist: { name: "Miles Davis" } }] };
const release = { id: releaseId, title: "Kind of Blue", date: "1959", status: "Official", "release-group": { id: groupId } };
const request = (path: string) => new NextRequest(`https://music.example${path}`);
const context = { params: Promise.resolve({ releaseGroupMbid: groupId }) };
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("MUSIC_KG_PUBLIC_CATALOG_ONLY", "true");
  vi.stubEnv("BACKEND_BASE_URL", "https://disabled-backend.invalid");
  vi.stubEnv("BACKEND_BFF_SHARED_SECRET", "private-bff-secret");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("free public catalog without Cloud Run", () => {
  it("searches real provider-shaped data without sending backend secrets", async () => {
    const { "primary-type": _type, ...untypedGroup } = group;
    fetchMock.mockResolvedValue(Response.json({ "release-groups": [untypedGroup, group] }));
    const response = await albums(request("/api/music/albums?q=Kind%20of%20Blue"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=600");
    const payload = publicAlbumsSchema.parse(await response.json());
    expect(payload.albums).toHaveLength(1);
    expect(payload.albums[0]).toMatchObject({ title: "Kind of Blue", artist: "Miles Davis", catalogId: groupId, catalogSource: "MUSICBRAINZ" });
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("https://musicbrainz.org/ws/2/release-group?");
    expect(JSON.stringify(options)).not.toContain("private-bff-secret");
    expect(options).toMatchObject({ redirect: "error", next: { revalidate: 600 } });
  });

  it("uses the supplementary store during a primary provider outage", async () => {
    fetchMock.mockResolvedValueOnce(new Response("unavailable", { status: 503 })).mockResolvedValueOnce(new Response("unavailable", { status: 503 })).mockResolvedValueOnce(Response.json({ results: [{ collectionId: 123, collectionName: "Store Album", artistName: "Store Artist", collectionViewUrl: "https://music.apple.com/kr/album/123" }] }));
    const response = await albums(request("/api/music/albums?q=Store"));
    expect(response.status).toBe(200);
    expect(publicAlbumsSchema.parse(await response.json()).albums[0]).toMatchObject({ catalogSource: "ITUNES", catalogId: "123", releaseGroupMbid: "" });
  });

  it("does not disguise an outage as an empty search", async () => {
    fetchMock.mockResolvedValueOnce(new Response("limited", { status: 503 })).mockResolvedValueOnce(new Response("limited", { status: 503 })).mockResolvedValueOnce(Response.json({ results: [] }));
    const response = await albums(request("/api/music/albums?q=Missing"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: "MUSICBRAINZ_RATE_LIMITED", retryable: true });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("recovers a temporary provider throttle before showing a track error", async () => {
    fetchMock.mockResolvedValueOnce(new Response("limited", { status: 503 })).mockResolvedValueOnce(Response.json({ ...release, media: [{ tracks: [{ position: 1, recording: { id: recordingId, title: "So What" } }] }] }));
    const response = await tracks(request(`/api/music/albums/x/tracks?edition=${releaseId}`), context);
    expect(response.status).toBe(200);
    expect(publicTracksSchema.parse(await response.json()).tracks[0].title).toBe("So What");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("labels public tag discovery without fabricated personal evidence", async () => {
    fetchMock.mockResolvedValue(Response.json({ "release-groups": [group] }));
    const response = await insights(request("/api/music/insights"));
    expect(response.status).toBe(200);
    const payload = publicInsightsSchema.parse(await response.json());
    expect(payload.graphTaste.recommendations[0]).toMatchObject({ publicCurationReason: "catalog-tag", sharedMusicBrainzTag: "dream pop" });
    expect(payload.graphTaste.relisten).toEqual([]);
    expect(JSON.stringify(payload)).not.toMatch(/evidencePaths|recordPageId|seedArtist/);
  });

  it("keeps owner-only insights behind authentication", async () => {
    const response = await insights(request("/api/music/insights?scope=owner"));
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("paginates editions and validates the selected release membership", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ "release-count": 2, releases: [release] }));
    const response = await editions(request("/api/music/albums/x/editions"), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ hasMore: true, nextCursor: "1", editions: [{ releaseGroupMbid: groupId, releaseMbid: releaseId, recommended: true }] });
    fetchMock.mockResolvedValueOnce(Response.json({ "release-count": 0, releases: [] })).mockResolvedValueOnce(Response.json({ ...release, "release-group": { id: otherGroup } }));
    const mismatch = await editions(request(`/api/music/albums/x/editions?selected=${releaseId}`), context);
    expect(mismatch.status).toBe(400);
  });

  it("loads tracks only from the requested release group", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ...release, media: [{ tracks: [{ position: 1, recording: { id: recordingId, title: "So What" } }] }] }));
    const response = await tracks(request(`/api/music/albums/x/tracks?edition=${releaseId}`), context);
    expect(response.status).toBe(200);
    expect(publicTracksSchema.parse(await response.json()).tracks).toEqual([{ position: 1, recordingMbid: recordingId, title: "So What" }]);
    fetchMock.mockResolvedValueOnce(Response.json({ ...release, "release-group": { id: otherGroup }, media: [] }));
    expect((await tracks(request(`/api/music/albums/x/tracks?edition=${releaseId}`), context)).status).toBe(400);
  });

  it("falls back to US store tracks and rejects another collection", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ results: [] })).mockResolvedValueOnce(Response.json({ results: [
      { wrapperType: "track", collectionId: 999, trackId: 100, trackName: "Wrong Album", trackNumber: 1 },
      { wrapperType: "track", collectionId: 123, trackId: 101, trackName: "Correct Album", trackNumber: 1 }
    ] }));
    const response = await itunesTracks(request("/api/music/itunes/albums/123/tracks"), { params: Promise.resolve({ collectionId: "123" }) });
    expect(response.status).toBe(200);
    expect(publicTracksSchema.parse(await response.json()).tracks).toEqual([{ position: 1, recordingMbid: "itunes:101", title: "Correct Album" }]);
  });

  it("rejects malformed upstream data and invalid public input", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ "release-groups": [{ id: "invalid" }] }));
    expect((await albums(request("/api/music/albums?q=Album"))).status).toBe(502);
    fetchMock.mockReset();
    expect((await explore(request("/api/music/catalog/explore?genre=unknown"))).status).toBe(400);
    expect((await tracks(request("/api/music/albums/x/tracks?edition=not-an-id"), context)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
