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
}: {
  data: ScheduleBuildWeek;
  save: (prev: ScheduleState, form: FormData) => Promise<ScheduleState>;
}) {
  const t = await getTranslations("app.build");
  const { week } = data;
  return (
    <PageBody>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle", {
          from: dayMonth(week.start),
          to: dayMonth(week.dates.at(-1) ?? week.start),
        })}
      />
      <p className="max-w-2xl text-ink-2">{t("intro")}</p>
      <ScheduleBuilder
        week={week}
        savedAt={data.savedAt}
        shifts={data.shifts}
        team={data.team}
        answers={data.answers}
        positions={data.positions}
        save={save}
      />
    </PageBody>
  );
}
