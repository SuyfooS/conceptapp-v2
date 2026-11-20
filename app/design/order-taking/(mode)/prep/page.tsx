import { DemoScreen } from "../../demo-store";
import { PrepTwin } from "../twins";

// Preparing on a phone, on the app's own screen (P4): the kitchen's and the
// bar's for Shiran, a manager. `?state=kitchen` is Noa, who only prepares in
// the kitchen; `?state=nothingOpen` a kitchen with every ticket out.
export default function OrderPrepPage() {
  return (
    <DemoScreen>
      <PrepTwin />
    </DemoScreen>
  );
}
