import { NextRequest, NextResponse } from "next/server";

import { getFixtureAdapterState, searchFixtureCandidates } from "../../../../lib/fixture-adapter";

export function GET(request: NextRequest): NextResponse {
  const adapterState = getFixtureAdapterState(process.env.FIXTURE_ADAPTER_MODE);
  if (adapterState.status === "unavailable") return NextResponse.json(adapterState, { status: 503 });
  return NextResponse.json({ candidates: searchFixtureCandidates(request.nextUrl.searchParams.get("q") ?? ""), mode: "fixture" });
}
