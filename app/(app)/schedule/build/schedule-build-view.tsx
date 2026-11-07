import { dayMonth } from "@domain/availability-form";
import { PageBody, PageHeader } from "@ui/page";
import { getTranslations } from "next-intl/server";
import type { ScheduleBuildWeek } from "../week";
import type { ScheduleState } from "./actions";
import { ScheduleBuilder } from "./schedule-builder";

/**
 * The page around the builder. Also rendered with mock data on
 * /design/shell/schedule/build.
 */
export async function ScheduleBuildView({
  data,
  save,
  backHref = "/schedule",
  manageHref = "/manage/scheduling",
}: {
  data: ScheduleBuildWeek;
  save: (prev: ScheduleState, form: FormData) => Promise<ScheduleState>;
  /** Where "back" goes: the schedule's entry, or the demo's. */
  backHref?: string;
  /** Where the regular shifts are set. */
  manageHref?: string;
}) {
  const [t, tm] = await Promise.all([
    getTranslations("app.build"),
    getTranslations("modules.scheduling"),
  ]);
  const { week } = data;
  return (
    <PageBody>
      <PageHeader
        title={t("title")}
        eyebrow={t("subtitle", {
          from: dayMonth(week.start),
          to: dayMonth(week.dates.at(-1) ?? week.start),
        })}
        back={{ href: backHref, label: tm("name") }}
      />
      <ScheduleBuilder
        week={week}
        savedAt={data.savedAt}
        publishedAt={data.publishedAt}
        shifts={data.shifts}
        team={data.team}
        answers={data.answers}
        positions={data.positions}
        manageHref={manageHref}
        save={save}
      />
    </PageBody>
  );
}
