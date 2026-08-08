import { describe, expect, it } from "vitest";

import { getFixtureAdapterState } from "../lib/fixture-adapter";

describe("fixture preview availability state", () => {
  it("reports a typed recoverable unavailable state when fixture mode is disabled", () => {
    expect(getFixtureAdapterState("disabled")).toEqual({
      code: "EXTERNAL_BACKEND_UNAVAILABLE",
      message: "외부 백엔드를 사용할 수 없습니다. fixture 어댑터를 다시 활성화한 뒤 시도해 주세요.",
      recovery: "FIXTURE_ADAPTER_MODE를 enabled로 설정한 뒤 다시 시도해 주세요.",
      status: "unavailable"
    });
  });
});
