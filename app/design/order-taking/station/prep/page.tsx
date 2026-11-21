import { DemoScreen } from "../../demo-store";
import { KitchenStationTwin } from "../station-twins";

// The kitchen's tablet, locked as its screen (waiter mode P8a): the real
// screen over the demo's store, opening on "פתיחת המטבח". Its states are
// KitchenStationTwin's.
export default function KitchenStationPage() {
  return (
    <DemoScreen>
      <KitchenStationTwin />
    </DemoScreen>
  );
}
