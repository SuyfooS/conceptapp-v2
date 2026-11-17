import { DemoScreen } from "../../../demo-store";
import { TillScreen } from "./till-screen";

// "לקופה" for an order: `?order=order-4` table 4 by item, `&state=byRound`
// by round; `?order=order-3` table 3, closed today, to open again.
export default function OrderTillPage() {
  return (
    <DemoScreen>
      <TillScreen />
    </DemoScreen>
  );
}
