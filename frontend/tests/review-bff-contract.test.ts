import { describe, expect, it } from "vitest";
import { z } from "zod";

import { parseBffPayload } from "../lib/review-bff-contract";

const healthSchema = z.object({ mode: z.literal("fixture"), status: z.literal("ok") });

describe("review desk BFF response contract", () => {
  it.each([
    [{ code: "BACKEND_CONTRACT_ERROR", retryable: false }, "BACKEND_CONTRACT_ERROR"],
    [{ code: "BACKEND_UNAVAILABLE", message: "Service unavailable.", retryable: true }, "Service unavailable."],
    [{ code: "BFF_AUTH_REQUIRED", requestId: "request-1" }, "BFF_AUTH_REQUIRED"]
  ])("returns a display-safe failure for typed BFF error %j", (payload, expectedText) => {
    // Given a browser-facing typed BFF failure whose message may be absent
    // When the review desk parses the untrusted response payload
    const result = parseBffPayload(healthSchema, payload);

    // Then it produces a non-empty display-safe failure instead of undefined
    expect(result).toMatchObject({ kind: "failure" });
    if (result.kind === "failure") expect(result.message).toContain(expectedText);
  });

  it("returns a display-safe failure when the response violates every known contract", () => {
    // Given malformed JSON-compatible data from the BFF boundary
    // When the review desk parses it
    const result = parseBffPayload(healthSchema, { retryable: false });

    // Then it reports the browser-facing contract failure without asserting a type
    expect(result).toEqual({
      kind: "failure",
      message: "The fixture service returned an invalid response. Please retry."
    });
  });

  it("returns parsed success data for a valid response", () => {
    // Given a valid health response
    // When it crosses the browser boundary
    const result = parseBffPayload(healthSchema, { mode: "fixture", status: "ok" });

    // Then callers receive the schema-validated value
    expect(result).toEqual({ kind: "success", value: { mode: "fixture", status: "ok" } });
  });
});
