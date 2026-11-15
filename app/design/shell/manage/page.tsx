import {
  modulesToManage,
  shabbatCityState,
} from "../../../(app)/manage/manage";
import { ManageView } from "../../../(app)/manage/manage-view";
import { baseWording } from "../../../(app)/wording";
import { demoBusinessDetails, demoModuleRows } from "../data";
import { demoDepartments } from "../lists/data";

// The real management page, with the demo's modules, and the row to the
// roles screen's twin (roles plan R0), which the app gets with R9.
export default function ShellManage() {
  return (
    <ManageView
      modules={modulesToManage(demoModuleRows)}
      base="/design/shell"
      home="/design/shell"
      team="/design/shell/team"
      shabbatCity={shabbatCityState(demoModuleRows, demoBusinessDetails)}
      departments={demoDepartments.map((d) => d.name)}
      payAccess
      roles
      wording={baseWording}
    />
  );
}
