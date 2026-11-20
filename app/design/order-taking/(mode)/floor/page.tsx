import { DemoScreen } from "../../demo-store";
import { FloorTwin } from "../twins";

// The floor, as Shiran finds it at 20:42: two tables ready to serve, one
// waiting past the late mark, the rest open or free, on the app's own screen
// (P4). `?state=quiet` is the evening before anyone sat down, `offClock` and
// `staleShift` Yoav off a shift, `readyNow` a ticket of Shiran's turning
// ready while she looks, `noPlaces` a business with no places yet, `viewing`
// the team viewing as a manager.
export default function OrderFloorPage() {
  return (
    <DemoScreen>
      <FloorTwin />
    </DemoScreen>
  );
}
