import { type Attendance, formatHours } from "@domain/time-clock";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { cn } from "@ui/cn";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { PersonAvatar } from "@ui/person-row";
import Link from "next/link";
import { useFormatter } from "next-intl";
import type { ReactNode } from "react";
import { RefreshOnReturn } from "../../home/refresh-on-return";
import { type AppWording, type Translator, translator } from "../../wording";
import { MonthHero } from "../month-hero";
import { proofInline } from "../shift-list";
import { ConfirmCard } from "./confirm-card";
import type { TeamActions, TeamHoursData, TeamPaths } from "./team-types";

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

const th = "px-4 py-3 text-start font-medium text-ink-2 text-sm";
const td = "border-line border-t px-4 py-3";

/**
 * How someone at work came in, to follow their start time: nothing when there
 * is nothing to say. In the line, not a badge, so it wraps on a phone.
 */
function attendanceLine(
  attendance: Attendance | null,
  required: boolean,
  t: Translator<"app.clock.history">,
): string | null {
  if (!attendance || (!required && attendance.how === "scan")) return null;
  const label = proofInline(attendance, t);
  return label ? t("withProof", { proof: label }) : null;
}

/**
 * The team on the clock: hours waiting for approval, what needs fixing, who
 * is at work now and how they came in, and each person's hours in a month,
 * leading to their shifts. When the business asks for a code, showing it is
 * the screen's main action.
 */
export function TeamHoursView({
  data,
  actions,
  paths,
  wording,
}: {
  data: TeamHoursData;
  actions: TeamActions;
  paths: TeamPaths;
  /** The business's words. */
  wording: AppWording;
}) {
  const t = translator(wording, "app.clock.team");
  const tClock = translator(wording, "app.clock");
  const tHistory = translator(wording, "app.clock.history");
  const format = useFormatter();
  const personHref = (userId: string, month = data.month) =>
    `${paths.team}/${userId}?month=${month}`;
  const name = (value: string | null) => value ?? t("noName");
  const day = (date: string) =>
    format.dateTime(new Date(`${date}T12:00:00Z`), {
      weekday: "long",
      day: "numeric",
      month: "numeric",
      timeZone: "UTC",
    });

  return (
    <PageBody className={pageGlowClass}>
      <RefreshOnReturn />
      <PageHeader
        back={{ href: paths.clock, label: t("back") }}
        title={t("title")}
        actions={
          data.showCode ? (
            <Button asChild size="lg">
              <Link href={paths.code}>{tClock("showCode.title")}</Link>
            </Button>
          ) : undefined
        }
      />

      <ConfirmCard
        rows={data.toConfirm}
        confirm={actions.confirm}
        teamPath={paths.team}
        viewOnly={data.viewOnly}
      />

      {data.overdue.length > 0 ? (
        <Card tone="accent" padding="none" className="overflow-hidden">
          <div className="flex flex-col gap-0.5 px-4 pt-4 pb-2">
            <h2 className="font-semibold text-ink text-md">
              {t("overdue.title", { count: data.overdue.length })}
            </h2>
            <p className="text-ink text-sm">{t("overdue.body")}</p>
          </div>
          {data.overdue.map((entry) => (
            <ListRow
              key={entry.entryId}
              href={personHref(entry.userId, entry.date.slice(0, 7))}
              leading={<PersonAvatar name={entry.name} />}
              title={name(entry.name)}
              subtitle={t.rich("overdue.row", {
                day: day(entry.date),
                time: entry.in,
                ltr,
              })}
            />
          ))}
        </Card>
      ) : null}

      <div className="flex flex-col gap-6 md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-start md:gap-8">
        <PageSection title={t("atWork.title")}>
          {data.atWork.length > 0 ? (
            <ListGroup>
              {data.atWork.map((person) => (
                <ListRow
                  key={person.userId}
                  href={personHref(person.userId, person.month)}
                  leading={<PersonAvatar name={person.name} />}
                  title={name(person.name)}
                  subtitle={
                    <>
                      {t.rich("atWork.since", { time: person.since, ltr })}
                      {attendanceLine(
                        person.attendance,
                        data.required,
                        tHistory,
                      )}
                    </>
                  }
                  trailing={
                    person.onBreak ? (
                      <Badge tone="warning">{t("atWork.onBreak")}</Badge>
                    ) : null
                  }
                />
              ))}
            </ListGroup>
          ) : (
            <Card>
              <p className="text-ink-2">{t("atWork.empty")}</p>
            </Card>
          )}
        </PageSection>

        <div className="flex min-w-0 flex-col">
          <MonthHero
            month={data.month}
            currentMonth={data.currentMonth}
            hrefFor={(month) => `${paths.team}?month=${month}`}
            minutes={data.minutes}
            countId="team"
            caption={t("caption", { count: data.shifts })}
            t={tHistory}
            overlap={data.people.length > 0}
          />
          {data.people.length > 0 ? (
            <>
              <ListGroup className="relative z-10 mx-3 -mt-[56px] shadow-float xl:hidden">
                {data.people.map((person) => (
                  <ListRow
                    key={person.userId}
                    href={personHref(person.userId)}
                    leading={<PersonAvatar name={person.name} />}
                    title={name(person.name)}
                    subtitle={
                      person.former
                        ? t("former")
                        : t("shifts", { count: person.shifts })
                    }
                    trailing={
                      <span
                        dir="ltr"
                        className="font-semibold text-ink tabular-nums"
                      >
                        {formatHours(person.minutes)}
                      </span>
                    }
                  />
                ))}
              </ListGroup>
              <div className="relative z-10 mx-5 -mt-[56px] hidden overflow-hidden rounded-card bg-surface shadow-float xl:block">
                <table className="w-full border-collapse">
                  <caption className="sr-only">{t("title")}</caption>
                  <thead>
                    <tr>
                      <th scope="col" className={th}>
                        {t("columns.name")}
                      </th>
                      <th scope="col" className={th}>
                        {t("columns.shifts")}
                      </th>
                      <th scope="col" className={th}>
                        {t("columns.breaks")}
                      </th>
                      <th scope="col" className={th}>
                        {t("columns.hours")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.people.map((person) => (
                      <tr key={person.userId}>
                        <th
                          scope="row"
                          className={cn(td, "text-start font-medium")}
                        >
                          <Link
                            href={personHref(person.userId)}
                            className="flex min-h-11 items-center gap-3 rounded-control text-ink hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                          >
                            <PersonAvatar name={person.name} />
                            <span className="flex flex-col">
                              <span>{name(person.name)}</span>
                              {person.former ? (
                                <span className="font-normal text-ink-2 text-sm">
                                  {t("former")}
                                </span>
                              ) : null}
                            </span>
                          </Link>
                        </th>
                        <td className={cn(td, "tabular-nums")}>
                          {person.shifts}
                        </td>
                        <td className={cn(td, "text-ink-2")}>
                          {person.breakMinutes > 0
                            ? t("breakMinutes", {
                                minutes: person.breakMinutes,
                              })
                            : t("noBreak")}
                        </td>
                        <td className={cn(td, "font-semibold tabular-nums")}>
                          <span dir="ltr">{formatHours(person.minutes)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <Card className="mt-4">
              <p className="text-ink-2">{t("noPeople")}</p>
            </Card>
          )}
        </div>
      </div>
    </PageBody>
  );
}
