import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { backendContractError, callFixtureBackend } from "../../../../lib/backend-bff";

const savedReviewSchema = z.object({
  reviewId: z.string().min(1),
  status: z.literal("SAVED_IN_FIXTURE_MODE")
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ code: "MALFORMED_REQUEST", message: "요청 형식이 올바르지 않습니다." }, { status: 400 });
    }
    throw error;
  }
  const result = await callFixtureBackend("api/v1/reviews", { body: JSON.stringify(body), method: "POST" });
  if (result.kind === "handled") return result.response;
  let upstream: unknown;
  try {
    upstream = await result.response.json();
  } catch (error) {
    if (error instanceof SyntaxError) return backendContractError();
    throw error;
  }
  const savedReview = savedReviewSchema.safeParse(upstream);
  if (!savedReview.success) return backendContractError();
  return NextResponse.json(savedReview.data, { status: 201 });
}
