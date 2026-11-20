import { DemoScreen } from "../../demo-store";
import { MenuTwin } from "./menu-twin";

// The demo restaurant's menu on the real screen, with the fish sold out.
// `?state=noMenu` is a business whose menu is still to be added,
// `?state=worker` Yoav in the bar, `?state=noRoute` the desserts with their
// department removed, `?state=viewing` a view as a manager.
export default function OrderMenuPage() {
  return (
    <DemoScreen>
      <MenuTwin />
    </DemoScreen>
  );
}
