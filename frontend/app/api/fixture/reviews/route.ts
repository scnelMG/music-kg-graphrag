import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { saveFixtureReview } from "../../../../lib/fixture-adapter";

const reviewRequestSchema = z.object({ candidateId: z.string(), rating: z.number(), review: z.string() });

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
  const parsed = reviewRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ code: "MALFORMED_REQUEST", message: "요청 형식이 올바르지 않습니다." }, { status: 400 });

  const result = saveFixtureReview(parsed.data);
  if ("code" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result, { status: 201 });
}
