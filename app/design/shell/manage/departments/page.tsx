import { Suspense } from "react";
import { DepartmentsView } from "../../../../(app)/manage/departments-view";
import { baseWording } from "../../../../(app)/wording";
import {
  demoSaveDepartmentMembers,
  demoSaveDepartments,
} from "../../lists/actions";
import { demoDepartmentPeople, demoDepartments } from "../../lists/data";
import { menuItemsByDepartment } from "./menu-counts";

type Props = { searchParams: Promise<{ state?: string }> };

// The real departments screen with the demo restaurant's departments and
// stand-ins for saving: what changes stays on screen until a reload.
// `?state=view` is someone at view on the management page (the roles plan's
// R7): read only, with the line that says why. `?state=menu` is the
// restaurant with taking orders on too (waiter mode P2): each department
// says how many of the menu's items it prepares, and its removal says how
// many go nowhere. `?state=menuEmpty` is a business that takes orders and
// has no lists, before its first department: the words say what a
// department is for there.
export default function ShellDepartments({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { state } = await searchParams;
  const menuOnly = state === "menuEmpty";
  return (
    <DepartmentsView
      departments={menuOnly ? [] : demoDepartments}
      people={demoDepartmentPeople}
      save={demoSaveDepartments}
      saveMembers={demoSaveDepartmentMembers}
      readOnly={state === "view" ? "manage" : null}
      backHref="/design/shell/manage"
      on={{ lists: !menuOnly, menu: menuOnly || state === "menu" }}
      itemsByDepartment={state === "menu" ? menuItemsByDepartment() : undefined}
      wording={baseWording}
    />
  );
}
