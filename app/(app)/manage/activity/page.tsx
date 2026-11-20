import { getBusinessActivity } from "@db/activity";
import {
  activityByDay,
  buildActivity,
  parseActivityCursor,
} from "@domain/activity";
import { enabledModules } from "@domain/modules";
import { manifests } from "@modules/registry";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentWording } from "../../current-wording";
import { baseWording, translator } from "../../wording";
import {
  departmentsOn,
  manageAccess,
  menuOn,
  modulesToManage,
  settingDefaults,
} from "../manage";
import { ActivityView } from "./activity-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(baseWording, "app.manage.activity");
  return { title: t("title") };
}

// What changed in the business, who changed it and when, for whoever sees the
// management page (and the team viewing as a role that does), each row only
// for those who hold its own area too (the database's policies; the roles
// plan's R7). `?before=` reads an older page.
export default async function ManageActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string }>;
}) {
  const access = await manageAccess();
  if (!access) notFound();
  const before = parseActivityCursor((await searchParams).before);
  const defaults = settingDefaults();
  let page = await getBusinessActivity(access.businessId, before);
  let entries = buildActivity(page.rows, page.lookups, defaults);
  // A page can fold away to nothing (a switch flipped on and off forty
  // times): read on a little, rather than show an empty page.
  for (
    let more = 0;
    entries.length === 0 && page.older !== null && more < 3;
    more++
  ) {
    page = await getBusinessActivity(access.businessId, page.older);
    entries = buildActivity(page.rows, page.lookups, defaults);
  }
  // The clock's lines lead to the team's hours only for whoever opens them
  // (clock.edit, with the clock on): a pay holder lowered on the clock reads
  // those lines without a way that ends on the not-found screen.
  const clockOn =
    access.readsClock &&
    enabledModules(manifests, access.rows).includes("time_clock");
  return (
    <ActivityView
      days={activityByDay(entries, access.timeZone, new Date())}
      timeZone={access.timeZone}
      older={page.older}
      earlier={before !== null}
      manageable={modulesToManage(access.rows, access.level)}
      clockOn={clockOn}
      departmentsOn={departmentsOn(access.rows)}
      everyArea={access.readsEveryArea}
      paths={{
        manage: "/manage",
        self: "/manage/activity",
        business: "/manage/business",
        clockTeam: clockOn ? "/clock/team" : undefined,
        departments: "/manage/departments",
        menu: menuOn(access.rows)
          ? {
              items: "/orders/menu",
              categories: "/orders/menu/categories",
              places: "/orders/menu/places",
            }
          : undefined,
        access: access.grantsPay ? "/manage/access" : undefined,
        roles: access.changesRoles ? "/manage/roles" : undefined,
        pay: "/clock/pay",
      }}
      wording={await currentWording()}
    />
  );
}
