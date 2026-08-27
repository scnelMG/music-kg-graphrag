import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createOwnerSession, isOwnerSession, isOwnerWriteSession } from "../lib/owner-session";
import { resetRateLimitsForTest } from "../lib/request-rate-limit";

afterEach(() => {
  vi.unstubAllEnvs();
  resetRateLimitsForTest();
});

describe("owner session", () => {
  it("accepts a signed owner session when the personal boundary is enabled", () => {
    vi.stubEnv("MUSIC_KG_OWNER_SESSION_REQUIRED", "true");
    vi.stubEnv("MUSIC_KG_OWNER_SETUP_TOKEN", "a-setup-token-that-is-long-enough");
    vi.stubEnv("MUSIC_KG_OWNER_SESSION_SECRET", "a-session-secret-that-is-long-enough");

    const session = createOwnerSession("a-setup-token-that-is-long-enough");
    const request = new NextRequest("https://music.example.test/api/music/records", {
      headers: { cookie: `music_kg_owner_session=${session}` }
    });

    expect(session).not.toBeNull();
    expect(isOwnerSession(request)).toBe(true);
  });

  it("rejects a request without a valid owner session when the boundary is enabled", () => {
    vi.stubEnv("MUSIC_KG_OWNER_SESSION_REQUIRED", "true");
    vi.stubEnv("MUSIC_KG_OWNER_SESSION_SECRET", "a-session-secret-that-is-long-enough");

    const request = new NextRequest("https://music.example.test/api/music/records");

    expect(isOwnerSession(request)).toBe(false);
  });

  it("fails closed for personal reads even when the legacy read flag is false", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MUSIC_KG_OWNER_SESSION_REQUIRED", "false");
    vi.stubEnv("MUSIC_KG_OWNER_WRITE_SESSION_REQUIRED", "true");
    vi.stubEnv("MUSIC_KG_OWNER_SESSION_SECRET", "a-session-secret-that-is-long-enough");

    const visitor = new NextRequest("https://music.example.test/api/music/records");

    expect(isOwnerSession(visitor)).toBe(false);
    expect(isOwnerWriteSession(visitor)).toBe(false);
  });

  it("fails closed for personal reads when the legacy read flag is unset", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MUSIC_KG_OWNER_SESSION_REQUIRED", undefined);
    vi.stubEnv("MUSIC_KG_OWNER_SESSION_SECRET", "a-session-secret-that-is-long-enough");

    const visitor = new NextRequest("https://music.example.test/api/music/records");

    expect(isOwnerSession(visitor)).toBe(false);
  });

  it("sets an http-only owner cookie only after the setup token is accepted", async () => {
    vi.stubEnv("MUSIC_KG_OWNER_SETUP_TOKEN", "a-setup-token-that-is-long-enough");
    vi.stubEnv("MUSIC_KG_OWNER_SESSION_SECRET", "a-session-secret-that-is-long-enough");
    const { POST } = await import("../app/api/owner/session/route");

    const response = await POST(new NextRequest("https://music.example.test/api/owner/session", {
      body: JSON.stringify({ token: "a-setup-token-that-is-long-enough" }),
      method: "POST"
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("music_kg_owner_session=");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("slows repeated owner-token guesses from the same client", async () => {
    vi.stubEnv("MUSIC_KG_OWNER_SETUP_TOKEN", "a-setup-token-that-is-long-enough");
    vi.stubEnv("MUSIC_KG_OWNER_SESSION_SECRET", "a-session-secret-that-is-long-enough");
    const { POST } = await import("../app/api/owner/session/route");
    const headers = { "content-type": "application/json", "x-forwarded-for": "198.51.100.8" };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await POST(new NextRequest("https://music.example.test/api/owner/session", {
        body: JSON.stringify({ token: "wrong" }), headers, method: "POST"
      }));
      expect(response.status).toBe(401);
    }

    const blocked = await POST(new NextRequest("https://music.example.test/api/owner/session", {
      body: JSON.stringify({ token: "wrong" }), headers, method: "POST"
    }));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).not.toBeNull();
  });

  it("reports whether the current request can access the personal workspace without revealing a secret", async () => {
    vi.stubEnv("MUSIC_KG_OWNER_SESSION_REQUIRED", "true");
    vi.stubEnv("MUSIC_KG_OWNER_SESSION_SECRET", "a-session-secret-that-is-long-enough");
    const { GET } = await import("../app/api/owner/session/route");

    const response = await GET(new NextRequest("https://music.example.test/api/owner/session"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ owner: false, writeOwner: false });
  });
});
