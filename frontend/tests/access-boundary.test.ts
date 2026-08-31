import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resetRateLimitsForTest } from "../lib/request-rate-limit";

afterEach(() => {
  vi.unstubAllEnvs();
  resetRateLimitsForTest();
});

describe("connected application routing boundary", () => {
  it("does not require a second in-app token after Vercel protects the deployment", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { middleware } = await import("../middleware");
    const response = await middleware(new NextRequest("https://music.example.test/"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows Vercel-authorized BFF routes to reach the server-side secret boundary", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { middleware } = await import("../middleware");
    const response = await middleware(new NextRequest("https://music.example.test/api/music/records"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("applies the production access boundary to every API namespace, including retired fixture routes", async () => {
    const { config } = await import("../middleware");

    expect(config.matcher).toContain("/api/:path*");
  });

  it("does not expose retired fixture BFF routes from the connected application", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(new NextRequest("https://music.example.test/api/fixture/health"));

    expect(response.status).toBe(404);
  });

  it("bounds repeated public readiness probes before they reach connected dependencies", async () => {
    const { middleware } = await import("../middleware");
    const headers = { "x-forwarded-for": "198.51.100.9" };

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await middleware(new NextRequest("https://music.example.test/api/music/readiness", { headers }));
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }

    const blocked = await middleware(new NextRequest("https://music.example.test/api/music/readiness", { headers }));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).not.toBeNull();
  });

  it("rejects a personal record request without an owner session when production is misconfigured fail-open", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MUSIC_KG_OWNER_SESSION_REQUIRED", "false");
    vi.stubEnv("MUSIC_KG_OWNER_SESSION_SECRET", "a-session-secret-that-is-long-enough");
    const { GET } = await import("../app/api/music/records/route");

    const response = await GET(new NextRequest("https://music.example.test/api/music/records"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ code: "OWNER_SESSION_REQUIRED", retryable: false });
  });

  it("rejects an exact Notion record lookup without an owner session", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MUSIC_KG_OWNER_SESSION_REQUIRED", "false");
    vi.stubEnv("MUSIC_KG_OWNER_SESSION_SECRET", "a-session-secret-that-is-long-enough");
    const { GET } = await import("../app/api/music/records/by-release-group/[releaseGroupMbid]/route");

    const response = await GET(
      new NextRequest("https://music.example.test/api/music/records/by-release-group/release-group-id"),
      { params: Promise.resolve({ releaseGroupMbid: "release-group-id" }) }
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ code: "OWNER_SESSION_REQUIRED", retryable: false });
  });

  it("rejects a public visitor's Notion write while leaving public archive reads configurable", async () => {
    vi.stubEnv("MUSIC_KG_OWNER_SESSION_REQUIRED", "false");
    vi.stubEnv("MUSIC_KG_OWNER_WRITE_SESSION_REQUIRED", "true");
    vi.stubEnv("MUSIC_KG_OWNER_SESSION_SECRET", "a-session-secret-that-is-long-enough");
    const { POST } = await import("../app/api/music/records/route");

    const response = await POST(new NextRequest("https://music.example.test/api/music/records", {
      body: JSON.stringify({}),
      method: "POST"
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ code: "OWNER_SESSION_REQUIRED", retryable: false });
  });
});
