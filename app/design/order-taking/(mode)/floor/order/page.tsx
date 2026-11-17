import { DemoScreen } from "../../../demo-store";
import { OrderScreen } from "./order-screen";

// A place's order: `?place=table-6` a free table, `?place=table-4` one with
// a round sent and its mains held. `&state=draft` opens with a draft that
// has a note, an allergy and a main held for later; `&state=choice` with
// the burger's choices open; `&state=sent` just after a send, its lines
// still taken back from the send for two minutes.
export default function OrderPlacePage() {
  return (
    <DemoScreen>
      <OrderScreen />
    </DemoScreen>
  );
}
