import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createOwnerSession, isOwnerSession } from "../lib/owner-session";

afterEach(() => {
  vi.unstubAllEnvs();
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

  it("reports whether the current request can access the personal workspace without revealing a secret", async () => {
    vi.stubEnv("MUSIC_KG_OWNER_SESSION_REQUIRED", "true");
    vi.stubEnv("MUSIC_KG_OWNER_SESSION_SECRET", "a-session-secret-that-is-long-enough");
    const { GET } = await import("../app/api/owner/session/route");

    const response = await GET(new NextRequest("https://music.example.test/api/owner/session"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ owner: false });
  });
});
