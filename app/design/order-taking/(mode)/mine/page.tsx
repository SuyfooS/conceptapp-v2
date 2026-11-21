import { DemoScreen } from "../../demo-store";
import { MineTwin } from "../twins";

// What Shiran sent this evening, ready first, on the app's own screen (P4).
// `?state=nothingSent` is the evening before she sent anything.
export default function OrderMinePage() {
  return (
    <DemoScreen>
      <MineTwin />
    </DemoScreen>
  );
}
