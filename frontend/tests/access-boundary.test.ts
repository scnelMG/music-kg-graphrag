import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
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

  it("rejects a personal record request without an owner session when the owner boundary is enabled", async () => {
    vi.stubEnv("MUSIC_KG_OWNER_SESSION_REQUIRED", "true");
    vi.stubEnv("MUSIC_KG_OWNER_SESSION_SECRET", "a-session-secret-that-is-long-enough");
    const { GET } = await import("../app/api/music/records/route");

    const response = await GET(new NextRequest("https://music.example.test/api/music/records"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ code: "OWNER_SESSION_REQUIRED", retryable: false });
  });
});
