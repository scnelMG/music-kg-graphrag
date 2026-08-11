import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalAccessToken = process.env.MUSIC_KG_APP_ACCESS_TOKEN;

afterEach(() => {
  if (originalAccessToken === undefined) delete process.env.MUSIC_KG_APP_ACCESS_TOKEN;
  else process.env.MUSIC_KG_APP_ACCESS_TOKEN = originalAccessToken;
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("private music service access boundary", () => {
  it("redirects an unauthenticated production page request to the access gate", async () => {
    // Given a production deployment with a configured operator access token
    vi.stubEnv("NODE_ENV", "production");
    process.env.MUSIC_KG_APP_ACCESS_TOKEN = "test-access-token-with-adequate-length";

    // When an unauthenticated visitor opens the personal music page
    const { middleware } = await import("../middleware");
    const response = await middleware(new NextRequest("https://music.example.test/"));

    // Then personal music data is not served before the visitor passes the access gate
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://music.example.test/access?next=%2F");
  });

  it("rejects an unauthenticated production BFF request instead of proxying it to Notion", async () => {
    // Given a protected production BFF
    vi.stubEnv("NODE_ENV", "production");
    process.env.MUSIC_KG_APP_ACCESS_TOKEN = "test-access-token-with-adequate-length";

    // When a caller directly requests a personal-data route without a session
    const { middleware } = await import("../middleware");
    const response = await middleware(new NextRequest("https://music.example.test/api/music/records"));

    // Then the request is denied before the server-side BFF credential can be used
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ code: "APP_ACCESS_REQUIRED" });
  });

  it("applies the production access boundary to every API namespace, including retired fixture routes", async () => {
    const { config } = await import("../middleware");

    expect(config.matcher).toContain("/api/:path*");
  });

  it("does not expose retired fixture BFF routes from the connected application", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.MUSIC_KG_APP_ACCESS_TOKEN = "test-access-token-with-adequate-length";
    const { middleware } = await import("../middleware");

    const response = await middleware(new NextRequest("https://music.example.test/api/fixture/health"));

    expect(response.status).toBe(404);
  });

  it("leaves only the access-token exchange route reachable before a session exists", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.MUSIC_KG_APP_ACCESS_TOKEN = "test-access-token-with-adequate-length";
    const { middleware } = await import("../middleware");

    const response = await middleware(new NextRequest("https://music.example.test/api/access"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("creates a strict HttpOnly signed session without placing the configured token in the browser cookie", async () => {
    // Given a configured production access token
    vi.stubEnv("NODE_ENV", "production");
    process.env.MUSIC_KG_APP_ACCESS_TOKEN = "test-access-token-with-adequate-length";

    // When the owner submits the matching token to the access route
    const { POST } = await import("../app/api/access/route");
    const response = await POST(new NextRequest("https://music.example.test/api/access", {
      body: JSON.stringify({ token: "test-access-token-with-adequate-length" }),
      headers: { "content-type": "application/json" },
      method: "POST"
    }));

    // Then the browser receives only an HttpOnly same-site signed session, never the configured bearer value
    expect(response.status).toBe(204);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("music_kg_access=");
    expect(cookie).not.toContain("test-access-token-with-adequate-length");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=strict");
    expect(cookie).toContain("Secure");
  });
});
