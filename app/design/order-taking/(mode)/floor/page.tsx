import { DemoScreen } from "../../demo-store";
import { FloorScreen } from "./floor-screen";

// The floor, as Shiran finds it at 20:42: two tables ready to serve, one
// waiting past the late mark, the rest open or free. `?state=quiet` is the
// evening before anyone sat down.
export default function OrderFloorPage() {
  return (
    <DemoScreen>
      <FloorScreen />
    </DemoScreen>
  );
}
