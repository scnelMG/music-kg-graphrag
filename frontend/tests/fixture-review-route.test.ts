import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { POST } from "../app/api/fixture/reviews/route";

describe("fixture review route", () => {
  it("returns a typed malformed-request response when JSON cannot be parsed", async () => {
    // Given
    const request = new NextRequest("http://localhost/api/fixture/reviews", {
      body: "{",
      headers: { "content-type": "application/json" },
      method: "POST"
    });

    // When
    const response = await POST(request);

    // Then
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "MALFORMED_REQUEST" });
  });
});
