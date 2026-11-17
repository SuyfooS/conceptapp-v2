import { DemoScreen } from "../../demo-store";
import { PrepScreen } from "./prep-screen";

// "הכנה" on Shiran's phone: the kitchen's tickets and the bar's, each marked
// ready with one tap. `?state=nothingOpen` is a kitchen with everything out.
export default function OrderPrepPage() {
  return (
    <DemoScreen>
      <PrepScreen />
    </DemoScreen>
  );
}
