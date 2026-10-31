import { dateIn, weekdayOf } from "@domain/availability";
import { WEEKDAY_KEYS } from "@domain/availability-form";
import { scheduleGaps } from "@domain/schedule";
import { timeIn } from "@domain/shabbat";
import { Badge } from "@ui/badge";
import { Card, CardText } from "@ui/card";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { CalendarCheck, CalendarDays, Users } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { moduleMetadata } from "../module-screen";
import {
  currentAvailabilityWeek,
  currentScheduleBuild,
  currentTeamAvailability,
  type ScheduleBuildWeek,
} from "./week";

export const generateMetadata = () => moduleMetadata("scheduling");

// The schedule's entry: next week's availability, with its state shown
// up front; for managers and owners, the team's answers and next week's
// schedule with its gaps.
export default async function SchedulePage() {
  const [week, team, build] = await Promise.all([
    currentAvailabilityWeek(),
    currentTeamAvailability(),
    currentScheduleBuild(),
  ]);
  if (!week) notFound();
  const [t, tm, tb] = await Promise.all([
    getTranslations("app.availability"),
    getTranslations("modules.scheduling"),
    getTranslations("app.build"),
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
          {team ? <TeamRow t={t} counts={team.team.counts} /> : null}
          {build ? <BuildRow t={tb} build={build} /> : null}
        </ListGroup>
      </PageSection>
      {build ? null : (
        <Card tone="flat" padding="lg" className="md:max-w-xl">
          <CardText>{t("scheduleSoon")}</CardText>
        </Card>
      )}
    </PageBody>
  );
}

/** Owners and managers: how many answers are in, and how many missing. */
function TeamRow({
  t,
  counts,
}: {
  t: Awaited<ReturnType<typeof getTranslations<"app.availability">>>;
  counts: { sent: number; missing: number };
}) {
  return (
    <ListRow
      href="/schedule/availability/team"
      leading={<Users />}
      title={t("team.title")}
      subtitle={t("team.entry.subtitle", {
        sent: counts.sent,
        total: counts.sent + counts.missing,
      })}
      trailing={
        counts.missing > 0 ? (
          <Badge tone="warning">
            {t("team.missing.count", { count: counts.missing })}
          </Badge>
        ) : (
          <Badge tone="success">{t("team.entry.allSent")}</Badge>
        )
      }
    />
  );
}

/** Owners and managers: next week's schedule, and the shifts still short. */
function BuildRow({
  t,
  build,
}: {
  t: Awaited<ReturnType<typeof getTranslations<"app.build">>>;
  build: ScheduleBuildWeek;
}) {
  const short = scheduleGaps(build.shifts).shifts.length;
  return (
    <ListRow
      href="/schedule/build"
      leading={<CalendarDays />}
      title={t("title")}
      subtitle={
        build.savedAt ? t("entry.subtitleSaved") : t("entry.subtitleDraft")
      }
      trailing={
        build.shifts.length === 0 ? null : short > 0 ? (
          <Badge tone="warning">{t("gaps", { count: short })}</Badge>
        ) : (
          <Badge tone="success">{t("entry.full")}</Badge>
        )
      }
    />
  );
}
