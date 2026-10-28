import { dateIn, weekdayOf } from "@domain/availability";
import { WEEKDAY_KEYS } from "@domain/availability-form";
import { timeIn } from "@domain/shabbat";
import { Badge } from "@ui/badge";
import { Card, CardText } from "@ui/card";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { CalendarCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { moduleMetadata } from "../module-screen";
import { currentAvailabilityWeek } from "./week";

export const generateMetadata = () => moduleMetadata("scheduling");

// The schedule's entry: next week's availability, with its state shown
// up front, and the schedule itself when it arrives.
export default async function SchedulePage() {
  const week = await currentAvailabilityWeek();
  if (!week) notFound();
  const [t, tm] = await Promise.all([
    getTranslations("app.availability"),
    getTranslations("modules.scheduling"),
  ]);
  const due = new Date(week.dueAt);
  const dueDate = dateIn(due, week.timeZone);
  const when = {
    day: t(`weekdays.${WEEKDAY_KEYS[weekdayOf(dueDate)] ?? "sun"}`),
    time: timeIn(due, week.timeZone),
  };
  const late = due.getTime() < Date.now();

  return (
    <PageBody>
      <PageHeader title={tm("name")} subtitle={tm("description")} />
      <PageSection title={t("entry.title")} className="md:max-w-xl">
        <ListGroup>
          <ListRow
            href="/schedule/availability"
            leading={<CalendarCheck />}
            title={t("title")}
            subtitle={
              week.mine
                ? t("entry.sent", when)
                : late
                  ? t("entry.late")
                  : t("entry.notSent", when)
            }
            trailing={
              week.mine ? null : (
                <Badge tone={late ? "warning" : "accent"}>
                  {t("entry.badge")}
                </Badge>
              )
            }
          />
        </ListGroup>
      </PageSection>
      <Card tone="flat" padding="lg" className="md:max-w-xl">
        <CardText>{t("scheduleSoon")}</CardText>
      </Card>
    </PageBody>
  );
}
