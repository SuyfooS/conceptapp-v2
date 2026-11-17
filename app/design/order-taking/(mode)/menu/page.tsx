import { DemoScreen } from "../../demo-store";
import { MenuScreen } from "./menu-screen";

// The demo restaurant's menu, with the fish sold out. `?state=noMenu` is a
// business whose menu is still to be added.
export default function OrderMenuPage() {
  return (
    <DemoScreen>
      <MenuScreen />
    </DemoScreen>
  );
}
