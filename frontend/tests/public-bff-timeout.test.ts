import { beforeEach, expect, it, vi } from "vitest";

const kyGet = vi.hoisted(() => vi.fn(() => Promise.resolve(new Response("{}"))));

vi.mock("ky", () => ({
  default: { get: kyGet },
  TimeoutError: class TimeoutError extends Error {}
}));

import { backendRequestTimeoutMilliseconds } from "../lib/backend-bff";
import { publicBffGet, publicBffRequestTimeoutMilliseconds } from "../lib/review-bff-contract";

beforeEach(() => {
  kyGet.mockClear();
});

it("waits for the server-side BFF result when a connected backend starts cold", async () => {
  // Given the browser request must outlive the server-side backend boundary
  expect(publicBffRequestTimeoutMilliseconds).toBeGreaterThan(backendRequestTimeoutMilliseconds);

  // When a public discovery GET request is created
  const request = publicBffGet("/api/music/insights");

  // Then ky receives the shared browser timeout instead of its shorter default
  expect(kyGet).toHaveBeenCalledWith("/api/music/insights", {
    throwHttpErrors: false,
    timeout: publicBffRequestTimeoutMilliseconds
  });
  await request;
});
