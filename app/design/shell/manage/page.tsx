import { Suspense } from "react";
import {
  modulesToManage,
  shabbatCityState,
} from "../../../(app)/manage/manage";
import { ManageView } from "../../../(app)/manage/manage-view";
import { baseWording } from "../../../(app)/wording";
import { demoBusinessDetails, demoModuleRows } from "../data";
import { demoDepartments } from "../lists/data";

type Props = { searchParams: Promise<{ state?: string }> };

// The real management page, with the demo's modules, and the row to the
// roles screen's twin (roles plan R0), which the app gets with R9.
// `?state=view` is someone at view here (R7): a worker raised to see the
// management page without changing it, with the line that says so, and no
// rows to the team, the roles or pay, which aren't theirs. `?state=noTeam`
// is a manager lowered to team none (R6), with no row to the team.
export default function ShellManage({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { state } = await searchParams;
  const readOnly = state === "view";
  return (
    <ManageView
      modules={modulesToManage(demoModuleRows)}
      base="/design/shell"
      home="/design/shell"
      team={readOnly || state === "noTeam" ? null : "/design/shell/team"}
      shabbatCity={shabbatCityState(demoModuleRows, demoBusinessDetails)}
      departments={demoDepartments.map((d) => d.name)}
      payAccess={!readOnly}
      roles={!readOnly}
      readOnly={readOnly}
      wording={baseWording}
    />
  );
}
