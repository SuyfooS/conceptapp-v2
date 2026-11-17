import { DemoScreen } from "../../demo-store";
import { MineScreen } from "./mine-screen";

// What Shiran sent tonight, ready to serve first. `?state=nothingSent` is
// an evening when she hasn't sent anything yet.
export default function OrderMinePage() {
  return (
    <DemoScreen>
      <MineScreen />
    </DemoScreen>
  );
}
