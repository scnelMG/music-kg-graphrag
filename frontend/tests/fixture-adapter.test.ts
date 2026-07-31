import { describe, expect, it } from "vitest";

import { getFixtureAdapterState, searchFixtureCandidates, validateFixtureReview } from "../lib/fixture-adapter";

describe("fixture BFF adapter", () => {
  it("returns exactly the fixture candidate for a fixture search", () => {
    expect(searchFixtureCandidates("Fixture Album")).toEqual([
      {
        artist: "Fixture Artist",
        id: "fixture-album-001",
        source: "PUBLIC_FIXTURE",
        title: "Fixture Album"
      }
    ]);
  });

  it("preserves a typed invalid rating failure", () => {
    expect(validateFixtureReview({ candidateId: "fixture-album-001", rating: 6, review: "기록" })).toEqual({
      code: "INVALID_RATING",
      field: "rating",
      message: "평점은 1에서 5 사이의 정수여야 합니다."
    });
  });

  it("reports a typed recoverable unavailable state when fixture mode is disabled", () => {
    expect(getFixtureAdapterState("disabled")).toEqual({
      code: "EXTERNAL_BACKEND_UNAVAILABLE",
      message: "외부 백엔드를 사용할 수 없습니다. fixture 어댑터를 다시 활성화한 뒤 시도해 주세요.",
      recovery: "FIXTURE_ADAPTER_MODE를 enabled로 설정한 뒤 다시 시도해 주세요.",
      status: "unavailable"
    });
  });
});
