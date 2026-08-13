import { NextRequest, NextResponse } from "next/server";

export const personalWriteConfirmationHeader = "x-music-kg-write-confirmed";

export function productionWriteConfirmationRequired(request: NextRequest): NextResponse | null {
  if (process.env.VERCEL_ENV !== "production") return null;
  if (request.headers.get(personalWriteConfirmationHeader) === "true") return null;
  return NextResponse.json({ code: "WRITE_CONFIRMATION_REQUIRED", retryable: false }, { status: 428 });
}
