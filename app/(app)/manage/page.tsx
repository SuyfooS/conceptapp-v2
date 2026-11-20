import { getDepartments } from "@db/departments";
import { getMenu } from "@db/order-taking";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentWording } from "../current-wording";
import { baseWording, translator } from "../wording";
import {
  departmentsOn,
  manageAccess,
  menuOn,
  modulesToManage,
  shabbatCityState,
} from "./manage";
import { ManageView } from "./manage-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(baseWording, "app.manage");
  return { title: t("title") };
}

export default async function ManagePage() {
  const access = await manageAccess();
  if (!access) notFound();
  // Departments show while lists or taking orders are on, which read them;
  // the menu while taking orders is (waiter mode P2: its way in until the
  // mode has its own).
  const [departments, menu] = await Promise.all([
    departmentsOn(access.rows) ? getDepartments(access.businessId) : null,
    menuOn(access.rows) ? getMenu(access.businessId) : null,
  ]);
  return (
    <ManageView
      modules={modulesToManage(access.rows, access.level)}
      home="/home"
      team={access.seesTeam ? "/team" : null}
      shabbatCity={shabbatCityState(access.rows, access.details)}
      payAccess={access.grantsPay}
      roles={access.changesRoles}
      readOnly={access.readOnly === "manage"}
      departments={
        departments === null
          ? null
          : departments === "notYet"
            ? []
            : departments
                .filter((d) => d.archivedAt === null)
                .map((d) => d.name)
      }
      menu={
        menu === null
          ? null
          : {
              href: "/orders/menu",
              // A menu not read (not ready, or not theirs) says there is none yet.
              items: typeof menu === "object" ? menu.items.length : 0,
              places: typeof menu === "object" ? menu.places.length : 0,
            }
      }
      wording={await currentWording()}
    />
  );
}
