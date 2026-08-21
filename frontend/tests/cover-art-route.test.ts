import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "../app/api/music/covers/[releaseGroupMbid]/route";

const releaseGroupMbid = "f9b61a7e-0c86-4cc7-b94e-48d3b643c554";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("public cover-art route", () => {
  it("streams a validated release group's Cover Art Archive image through the same origin", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-type": "image/jpeg" },
      status: 200
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new NextRequest(`http://localhost/api/music/covers/${releaseGroupMbid}`), {
      params: Promise.resolve({ releaseGroupMbid })
    });

    const firstInput = fetchMock.mock.calls[0]?.[0];
    const requestedUrl = firstInput instanceof Request ? firstInput.url : typeof firstInput === "string" ? firstInput : "";
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toBe("public, s-maxage=86400, stale-while-revalidate=604800");
    expect(requestedUrl).toBe(`https://coverartarchive.org/release-group/${releaseGroupMbid}/front-250`);
    await expect(response.arrayBuffer()).resolves.toEqual(new Uint8Array([1, 2, 3]).buffer);
  });

  it("rejects a non-MusicBrainz identifier before making an external request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new NextRequest("http://localhost/api/music/covers/not-an-mbid"), {
      params: Promise.resolve({ releaseGroupMbid: "not-an-mbid" })
    });

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps a missing Cover Art Archive image as an image failure for the client fallback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    const response = await GET(new NextRequest(`http://localhost/api/music/covers/${releaseGroupMbid}`), {
      params: Promise.resolve({ releaseGroupMbid })
    });

    expect(response.status).toBe(404);
  });
});
