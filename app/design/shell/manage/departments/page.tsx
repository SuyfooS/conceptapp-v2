import { DepartmentsView } from "../../../../(app)/manage/departments-view";
import { baseWording } from "../../../../(app)/wording";
import {
  demoSaveDepartmentMembers,
  demoSaveDepartments,
} from "../../lists/actions";
import { demoDepartmentPeople, demoDepartments } from "../../lists/data";

// The real departments screen with the demo restaurant's departments and
// stand-ins for saving: what changes stays on screen until a reload.
export default function ShellDepartments() {
  return (
    <DepartmentsView
      departments={demoDepartments}
      people={demoDepartmentPeople}
      save={demoSaveDepartments}
      saveMembers={demoSaveDepartmentMembers}
      viewOnly={false}
      backHref="/design/shell/manage"
      wording={baseWording}
    />
  );
}
