import { ModuleSoonView } from "../../../(app)/module-screen";

// A module's entry screen, before its real screens are built.
export default function ShellModule() {
  return <ModuleSoonView moduleKey="time_clock" homeHref="/design/shell" />;
}
