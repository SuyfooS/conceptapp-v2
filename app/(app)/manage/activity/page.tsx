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
import { getTranslations } from "next-intl/server";
import { manageAccess, modulesToManage } from "../manage";
import { ActivityView } from "./activity-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.manage.activity");
  return { title: t("title") };
}

// What changed in the business, who changed it and when, for its owner and
// managers (and the team viewing as one). `?before=` reads an older page.
export default async function ManageActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string }>;
}) {
  const access = await manageAccess();
  if (!access) notFound();
  const before = parseActivityCursor((await searchParams).before);
  const page = await getBusinessActivity(access.businessId, before);
  const entries = buildActivity(page.rows, page.lookups);
  return (
    <ActivityView
      days={activityByDay(entries, access.timeZone, new Date())}
      timeZone={access.timeZone}
      older={page.older}
      earlier={before !== null}
      manageable={modulesToManage(access.rows)}
      clockOn={enabledModules(manifests, access.rows).includes("time_clock")}
      paths={{
        manage: "/manage",
        self: "/manage/activity",
        business: "/manage/business",
        clockTeam: "/clock/team",
      }}
    />
  );
}
