import { DemoScreen } from "../../demo-store";
import { KitchenStation } from "./kitchen-station";

// The kitchen's tablet, locked as its screen: it opens on "פתיחת המטבח".
// `?state=open` as if tapped, `?state=offline` with the connection gone,
// `?state=nothingOpen` with every ticket out.
export default function KitchenStationPage() {
  return (
    <DemoScreen>
      <KitchenStation />
    </DemoScreen>
  );
}
