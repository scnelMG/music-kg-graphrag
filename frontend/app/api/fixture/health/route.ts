import { NextResponse } from "next/server";

import { getFixtureAdapterState } from "../../../../lib/fixture-adapter";

export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  const adapterState = getFixtureAdapterState(process.env.FIXTURE_ADAPTER_MODE);
  if (adapterState.status === "unavailable") {
    return NextResponse.json({ externalBackend: { state: "unavailable", ...adapterState }, mode: "fixture", status: "unavailable" });
  }

  return NextResponse.json({
    externalBackend: { state: "unavailable", summary: "외부 백엔드 연결은 이 미리보기에서 사용하지 않습니다." },
    mode: "fixture",
    status: "ok"
  });
}
