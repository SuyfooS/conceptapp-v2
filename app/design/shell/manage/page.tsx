import { Suspense } from "react";
import {
  modulesToManage,
  shabbatCityState,
} from "../../../(app)/manage/manage";
import { ManageView } from "../../../(app)/manage/manage-view";
import { baseWording } from "../../../(app)/wording";
import { orderDemoMenu, orderDemoTables } from "../../order-taking/data";
import { demoBusinessDetails, demoModuleRows } from "../data";
import { demoDepartments } from "../lists/data";

type Props = { searchParams: Promise<{ state?: string }> };

// The real management page, with the demo's modules, and the owner's row to
// the roles screen's twin (roles plan R0), beside who sees pay, as the app
// has it since R9, and the row to the menu (waiter mode P2), on its twin.
// `?state=view` is someone at view here (R7): a worker raised to see the
// management page without changing it, with the line that says so, and no
// rows to the team, the roles or pay, which aren't theirs. `?state=noTeam`
// is a manager lowered to team none (R6): no row to the team, and, as for
// every manager, none to the roles or pay, which are the owner's. The
// modules are those with settings at the level drawn, as the app lists them
// (`access.level`): the owner's include the hiring file's, whose settings
// are all an owner's (H5b).
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
  // The rows to the roles and to pay are the owner's alone, as the app has them.
  const owner = !readOnly && state !== "noTeam";
  return (
    <ManageView
      modules={modulesToManage(demoModuleRows, owner ? "owner" : "business")}
      base="/design/shell"
      home="/design/shell"
      team={readOnly || state === "noTeam" ? null : "/design/shell/team"}
      shabbatCity={shabbatCityState(demoModuleRows, demoBusinessDetails)}
      departments={demoDepartments.map((d) => d.name)}
      menu={{
        href: "/design/order-taking/menu?state=service",
        items: orderDemoMenu.items.length,
        places: orderDemoTables.length,
      }}
      payAccess={owner}
      roles={owner}
      readOnly={readOnly}
      wording={baseWording}
    />
  );
}
