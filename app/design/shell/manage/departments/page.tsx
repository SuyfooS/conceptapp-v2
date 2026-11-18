import { Suspense } from "react";
import { DepartmentsView } from "../../../../(app)/manage/departments-view";
import { baseWording } from "../../../../(app)/wording";
import {
  demoSaveDepartmentMembers,
  demoSaveDepartments,
} from "../../lists/actions";
import { demoDepartmentPeople, demoDepartments } from "../../lists/data";

type Props = { searchParams: Promise<{ state?: string }> };

// The real departments screen with the demo restaurant's departments and
// stand-ins for saving: what changes stays on screen until a reload.
// `?state=view` is someone at view on the management page (the roles plan's
// R7): read only, with the line that says why.
export default function ShellDepartments({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { state } = await searchParams;
  return (
    <DepartmentsView
      departments={demoDepartments}
      people={demoDepartmentPeople}
      save={demoSaveDepartments}
      saveMembers={demoSaveDepartmentMembers}
      readOnly={state === "view" ? "manage" : null}
      backHref="/design/shell/manage"
      wording={baseWording}
    />
  );
}
