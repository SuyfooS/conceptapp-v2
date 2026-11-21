import { DemoScreen } from "../../../demo-store";
import { TillTwin } from "../../twins";

// "לקופה" for an order, the app's own screen since P5: `?order=order-4` table
// 4 by item, `&state=byRound` by round, `&state=fixed` after a cancel and a
// beer on the house; `?order=order-3` table 3, closed today, to open again,
// `&state=reopenTaken` while its table is taken; `?order=order-takeaway-2`
// a takeaway cancelled whole.
export default function OrderTillPage() {
  return (
    <DemoScreen>
      <TillTwin />
    </DemoScreen>
  );
}
