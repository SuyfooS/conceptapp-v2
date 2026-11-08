import { ModuleSoonView } from "../../../(app)/module-screen";
import { baseWording } from "../../../(app)/wording";

// A module's entry screen, before its real screens are built.
export default function ShellModule() {
  return (
    <ModuleSoonView
      moduleKey="time_clock"
      homeHref="/design/shell"
      wording={baseWording}
    />
  );
}
