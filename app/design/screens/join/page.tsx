import { JoinView } from "../../../(auth)/join/[token]/join-view";
import { business, staff } from "../../shell/data";
import { demoJoin } from "../actions";

// The real join screen for a mock invite, with a stand-in action.
export default function JoinDemo() {
  return (
    <JoinView
      invite={{
        phone: "+972531234567",
        role: "worker",
        name: staff[6]?.name ?? null,
        business: { name: business.name, accent: "#8b2635" },
      }}
      join={demoJoin}
    />
  );
}
