import { JoinGoneView } from "../../../(auth)/join/[token]/join-view";

export default function JoinExpiredDemo() {
  return <JoinGoneView reason="expired" />;
}
