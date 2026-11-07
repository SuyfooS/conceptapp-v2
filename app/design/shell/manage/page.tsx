import { modulesToManage } from "../../../(app)/manage/manage";
import { ManageView } from "../../../(app)/manage/manage-view";
import { demoModuleRows } from "../data";

// The real management page, with the demo's modules.
export default function ShellManage() {
  return (
    <ManageView
      modules={modulesToManage(demoModuleRows)}
      base="/design/shell"
      home="/design/shell"
      team="/design/shell/team"
    />
  );
}
