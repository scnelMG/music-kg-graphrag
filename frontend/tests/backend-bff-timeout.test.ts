import { expect, it } from "vitest";

import { backendRequestTimeoutMilliseconds } from "../lib/backend-bff";

it("keeps enough server-side time for a scale-to-zero connected backend to start", () => {
  expect(backendRequestTimeoutMilliseconds).toBe(60_000);
});
