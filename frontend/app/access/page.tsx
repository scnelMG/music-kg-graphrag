import { PrivateAccessGate } from "../../components/private-access-gate";

export const dynamic = "force-dynamic";

export default function AccessPage(): React.JSX.Element {
  return <PrivateAccessGate />;
}
