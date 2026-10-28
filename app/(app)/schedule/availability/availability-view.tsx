import { dateIn, weekdayOf } from "@domain/availability";
import { dayMonth, WEEKDAY_KEYS } from "@domain/availability-form";
import { timeIn } from "@domain/shabbat";
import { Card, CardText } from "@ui/card";
import { PageBody, PageHeader } from "@ui/page";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import type { AvailabilityWeek } from "../week";
import {
  AvailabilityForm,
  type AvailabilityFormProps,
} from "./availability-form";

export type AvailabilityViewProps = {
  week: AvailabilityWeek;
  /** The due moment has passed. */
  late: boolean;
  save: AvailabilityFormProps["save"];
};

/** Also rendered on /design/shell/schedule/availability. */
export async function AvailabilityView({
  week,
  late,
  save,
}: AvailabilityViewProps) {
  const t = await getTranslations("app.availability");
  const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;
  const moment = (iso: string) => {
    const date = dateIn(new Date(iso), week.timeZone);
    return {
      day: t(`weekdays.${WEEKDAY_KEYS[weekdayOf(date)] ?? "sun"}`),
      date: dayMonth(date),
      time: timeIn(new Date(iso), week.timeZone),
    };
  };
  const due = moment(week.dueAt);
  const last = week.dates.at(-1) ?? week.start;

  return (
    <PageBody>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle", {
          from: dayMonth(week.start),
          to: dayMonth(last),
        })}
      />
      <Card
        tone={week.mine ? "flat" : "accent"}
        padding="md"
        className="flex flex-col gap-1 md:max-w-2xl"
      >
        <CardText className="text-ink">{t("intro")}</CardText>
        <CardText className="text-ink">
          {late && !week.mine
            ? t.rich("late", { ...due, ltr })
            : t.rich("due", { ...due, ltr })}
        </CardText>
        {week.mine ? (
          <CardText>
            {t.rich("sent", { ...moment(week.mine.updatedAt), ltr })}
          </CardText>
        ) : null}
      </Card>
      <AvailabilityForm
        key={week.start}
        week={week}
        initial={week.mine}
        save={save}
      />
    </PageBody>
  );
}
