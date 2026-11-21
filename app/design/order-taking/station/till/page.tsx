import { DemoScreen } from "../../demo-store";
import { TillStationTwin } from "../station-twins";

// The counter's tablet, locked as the till (waiter mode P8a): the real
// screen over the demo's store, tonight's open orders and those closed
// today, each with what to ring up. Its states are TillStationTwin's.
export default function TillStationPage() {
  return (
    <DemoScreen>
      <TillStationTwin />
    </DemoScreen>
  );
}
