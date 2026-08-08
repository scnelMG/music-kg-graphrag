import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import { GET as getCandidates } from "../app/api/fixture/candidates/route";
import { GET as getHealth } from "../app/api/fixture/health/route";

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
  if (address === null || typeof address === "string") {
    throw new TypeError("Expected the backend test server to listen on a TCP port");
  }
  try {
    await scenario(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
  }
}

describe("fixture BFF backend integration", () => {
  it("carries the server-only shared secret to the backend", async () => {
    // Given a wire-level backend that accepts only the configured shared secret
    let receivedSecret: string | undefined;
    await withBackend((request, response) => {
      const header = request.headers["x-music-kg-bff-secret"];
      receivedSecret = Array.isArray(header) ? undefined : header;
      response.setHeader("content-type", "application/json");
      if (request.headers["x-music-kg-bff-secret"] !== "server-only-secret") {
        response.statusCode = 401;
        response.end(JSON.stringify({ code: "BFF_AUTH_REQUIRED", requestId: "backend-request" }));
        return;
      }
      response.end(JSON.stringify([{ artist: "Fixture Artist", id: "fixture-album-001", source: "PUBLIC_FIXTURE", title: "Fixture Album" }]));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "server-only-secret";

      // When the browser-facing candidates route is requested
      const response = await getCandidates(new NextRequest("http://localhost/api/fixture/candidates?q=fixture"));

      // Then the BFF reaches the backend without exposing the credential in its response
      expect(response.status).toBe(200);
      expect(receivedSecret).toBe("server-only-secret");
      const body = JSON.stringify(await response.json());
      expect(body).toContain("fixture-album-001");
      expect(body).not.toContain("server-only-secret");
    });
  });

  it("passes through a typed backend 401 for a stale secret", async () => {
    // Given a backend that rejects the BFF credential
    await withBackend((_request, response) => {
      response.statusCode = 401;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ code: "BFF_AUTH_REQUIRED", requestId: "backend-request" }));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "stale-secret";

      // When the BFF calls the backend
      const response = await getHealth();

      // Then the typed authentication status survives without leaking the stale value
      expect(response.status).toBe(401);
      const body = JSON.stringify(await response.json());
      expect(body).toContain("BFF_AUTH_REQUIRED");
      expect(body).not.toContain("stale-secret");
    });
  });

  it("does not forward the shared secret through a backend redirect", async () => {
    // Given a backend redirecting to a different origin that records received credentials
    let redirectedSecret: string | undefined;
    await withBackend((request, response) => {
      const header = request.headers["x-music-kg-bff-secret"];
      redirectedSecret = Array.isArray(header) ? undefined : header;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ mode: "fixture", status: "ok" }));
    }, async (redirectTarget) => {
      await withBackend((_request, response) => {
        response.statusCode = 302;
        response.setHeader("location", `${redirectTarget}/api/v1/health`);
        response.end();
      }, async (baseUrl) => {
        process.env.BACKEND_BASE_URL = baseUrl;
        process.env.BACKEND_BFF_SHARED_SECRET = "redirect-sensitive-secret";

        // When the BFF calls the redirecting backend
        const response = await getHealth();

        // Then it rejects the redirect without contacting the target with the secret
        expect(response.status).toBe(502);
        expect(redirectedSecret).toBeUndefined();
      });
    });
  });

  it("preserves a displayable invalid-rating failure", async () => {
    // Given a backend validation response containing only its typed machine contract
    await withBackend((_request, response) => {
      response.statusCode = 400;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ code: "INVALID_RATING", requestId: "backend-request" }));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "server-only-secret";

      // When the browser-facing review route submits an invalid rating
      const { POST: saveReview } = await import("../app/api/fixture/reviews/route");
      const response = await saveReview(new NextRequest("http://localhost/api/fixture/reviews", {
        body: JSON.stringify({ candidateId: "fixture-album-001", rating: 6, review: "note" }),
        headers: { "content-type": "application/json" },
        method: "POST"
      }));

      // Then the UI receives both the machine code and a safe human-readable message
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        code: "INVALID_RATING",
        message: "평점은 1에서 5 사이의 정수여야 합니다."
      });
    });
  });

  it("returns a redacted typed 503 when the backend is unavailable", async () => {
    // Given an unreachable backend and a configured server-only credential
    process.env.BACKEND_BASE_URL = "http://127.0.0.1:1";
    process.env.BACKEND_BFF_SHARED_SECRET = "must-not-leak";

    // When the BFF health route attempts the connection
    const response = await getHealth();

    // Then callers receive a recoverable typed outage with no connection or secret details
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: "BACKEND_UNAVAILABLE",
      message: "The fixture backend is temporarily unavailable.",
      retryable: true
    });
  });

  it("returns a typed 502 when a successful backend response violates its contract", async () => {
    // Given an authenticated backend that returns malformed success JSON
    await withBackend((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end("not-json");
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "server-only-secret";

      // When the BFF parses the backend health response
      const response = await getHealth();

      // Then the browser receives a typed contract error rather than upstream details
      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toEqual({ code: "BACKEND_CONTRACT_ERROR", retryable: false });
    });
  });

  it("accepts the authenticated production service health contract", async () => {
    // Given a production-mode fixture API returning only aggregate health
    await withBackend((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ mode: "production", status: "ok" }));
    }, async (baseUrl) => {
      process.env.BACKEND_BASE_URL = baseUrl;
      process.env.BACKEND_BFF_SHARED_SECRET = "server-only-secret";

      // When the BFF requests service health
      const response = await getHealth();

      // Then the production safety mode remains a valid redacted health state
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ mode: "production", status: "ok" });
    });
  });
});
