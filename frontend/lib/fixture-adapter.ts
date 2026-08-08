export type FixtureAdapterAvailable = {
  readonly status: "available";
};

export type FixtureAdapterUnavailable = {
  readonly code: "EXTERNAL_BACKEND_UNAVAILABLE";
  readonly message: string;
  readonly recovery: string;
  readonly status: "unavailable";
};

export type FixtureAdapterState = FixtureAdapterAvailable | FixtureAdapterUnavailable;

const fixtureAdapterUnavailable: FixtureAdapterUnavailable = {
  code: "EXTERNAL_BACKEND_UNAVAILABLE",
  message: "외부 백엔드를 사용할 수 없습니다. fixture 어댑터를 다시 활성화한 뒤 시도해 주세요.",
  recovery: "FIXTURE_ADAPTER_MODE를 enabled로 설정한 뒤 다시 시도해 주세요.",
  status: "unavailable"
};

export function getFixtureAdapterState(mode: string | undefined): FixtureAdapterState {
  if (mode === "disabled") return fixtureAdapterUnavailable;
  return { status: "available" };
}
