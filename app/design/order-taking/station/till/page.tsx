import { DemoScreen } from "../../demo-store";
import { TillStation } from "./till-station";

// The counter's tablet, locked as the till: tonight's open places and those
// closed today, each with its list for the register.
export default function TillStationPage() {
  return (
    <DemoScreen>
      <TillStation />
    </DemoScreen>
  );
}
