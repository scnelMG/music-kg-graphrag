import { ReviewDesk } from "../components/review-desk";
import { FixtureAdapterUnavailableView } from "../components/fixture-adapter-unavailable";
import { getFixtureAdapterState } from "../lib/fixture-adapter";

export const dynamic = "force-dynamic";

export default function Page(): React.JSX.Element {
  const adapterState = getFixtureAdapterState(process.env.FIXTURE_ADAPTER_MODE);
  if (adapterState.status === "unavailable") return <FixtureAdapterUnavailableView state={adapterState} />;
  return <ReviewDesk />;
}
