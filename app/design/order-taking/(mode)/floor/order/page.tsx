import { DemoScreen } from "../../../demo-store";
import { OrderTwin } from "../../twins";

// A place's order on the app's own screen (P4): `?place=table-6` a free
// table, `?place=table-4` one with a round sent and its mains held,
// `?place=takeaway-new` a new order with no place. `&state=draft` opens with
// a draft that has an allergy and a main held; `&state=sent` just after a
// send, its lines still taken back for two minutes; `&state=pending` a send
// not through yet; `&state=soldOut` the fish sold out meanwhile;
// `&state=taken` the table opened by Yoav a moment before;
// `?place=table-4&state=fixed` after its hummus was cancelled and its beer
// given on the house (P5).
export default function OrderPlacePage() {
  return (
    <DemoScreen>
      <OrderTwin />
    </DemoScreen>
  );
}
