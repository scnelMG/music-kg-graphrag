import { beforeEach, expect, it, vi } from "vitest";

const kyRequest = vi.hoisted(() => vi.fn(() => Promise.resolve(new Response("{}"))));

vi.mock("ky", () => ({
  default: kyRequest,
  TimeoutError: class TimeoutError extends Error {}
}));

import { backendRequestTimeoutMilliseconds } from "../lib/backend-bff";
import * as bffContract from "../lib/review-bff-contract";

beforeEach(() => {
  kyRequest.mockClear();
});

it("keeps a confirmed personal write alive until the server-side Notion request completes", async () => {
  // Given the browser write must outlive the server-side backend boundary
  const writeTimeout = "personalWriteRequestTimeoutMilliseconds" in bffContract
    ? bffContract.personalWriteRequestTimeoutMilliseconds
    : undefined;
  const personalWriteBff = "personalWriteBff" in bffContract ? bffContract.personalWriteBff : undefined;

  expect(writeTimeout).toEqual(expect.any(Number));
  expect(writeTimeout).toBeGreaterThan(backendRequestTimeoutMilliseconds);
  expect(personalWriteBff).toEqual(expect.any(Function));
  if (typeof personalWriteBff !== "function") throw new TypeError("Expected a personal write request helper");

  // When a confirmed personal write request is created
  const request = personalWriteBff("/api/music/records", { method: "POST" });

  // Then ky receives the explicit browser timeout instead of its ten-second default
  expect(kyRequest).toHaveBeenCalledWith("/api/music/records", {
    method: "POST",
    timeout: writeTimeout
  });
  await request;
});
