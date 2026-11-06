import { dateIn, weekdayOf } from "@domain/availability";
import { dayMonth, WEEKDAY_KEYS } from "@domain/availability-form";
import {
  type ScheduledShift,
  shiftMinutes,
  shiftsByDay,
  shiftsOf,
} from "@domain/schedule";
import { timeIn } from "@domain/shabbat";
import { myRequestFor, offersFor } from "@domain/swaps";
import { Badge } from "@ui/badge";
import { Card, CardText } from "@ui/card";
import { cn } from "@ui/cn";
import { ListGroup } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import type { PublishedSchedule, PublishedWeek } from "../week";
import type { SwapState } from "./actions";
import { SwapButton } from "./swap-button";

type T = Awaited<ReturnType<typeof getTranslations<"app">>>;
type SwapAction = (state: SwapState, form: FormData) => Promise<SwapState>;
type ViewProps = { t: T; data: PublishedSchedule; swap: SwapAction };
type WeekKey = "this" | "next";

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;
const weekday = (t: T, date: string) =>
  t(`availability.weekdays.${WEEKDAY_KEYS[weekdayOf(date)] ?? "sun"}`);

/**
 * The published schedule as the team reads it: the signed-in person's
 * next shifts, then this week's and next week's schedule for everyone.
 * Phone: one under the other, day by day; tablet: the person's shifts
 * beside the team's days; desktop: the person's shifts, then each week
 * with a column a day. Each of the person's shifts can be given away, and
 * the shifts colleagues give away can be taken (`swap` is `swapAction`, or
 * the demo's stand-in). Also rendered with mock data on
 * /design/shell/schedule/shifts.
 */
export async function MyShiftsView({
  data,
  swap,
}: {
  data: PublishedSchedule;
  swap: SwapAction;
}) {
  const t = await getTranslations("app");
  const view = { t, data, swap };
  const weeks = published(data).length > 0 ? allWeeks(data) : [];
  return (
    <PageBody>
      <PageHeader title={t("shifts.title")} subtitle={t("shifts.subtitle")} />
      <div className="grid gap-6 md:grid-cols-2 md:items-start md:gap-8 xl:hidden">
        <div className="flex min-w-0 flex-col gap-6">
          <Mine {...view} />
          <Offers {...view} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          {weeks.map(([key, week]) => (
            <TeamWeek key={key} {...view} weekKey={key} week={week} />
          ))}
        </div>
      </div>
      <div className="hidden flex-col gap-8 xl:flex">
        <div className="grid grid-cols-2 items-start gap-8">
          <Mine {...view} />
          <Offers {...view} />
        </div>
        {weeks.map(([key, week]) => (
          <TeamWeek key={key} {...view} weekKey={key} week={week} wide />
        ))}
      </div>
    </PageBody>
  );
}

const allWeeks = (data: PublishedSchedule): [WeekKey, PublishedWeek][] => [
  ["this", data.thisWeek],
  ["next", data.nextWeek],
];

const published = (data: PublishedSchedule) =>
  allWeeks(data).filter(([, week]) => week.publishedAt !== null);

/** The person's shifts from today on, in both weeks. */
export function upcomingShifts(data: PublishedSchedule) {
  return shiftsOf(
    [...data.thisWeek.shifts, ...data.nextWeek.shifts],
    data.userId,
    data.today,
  );
}

const range = (t: T, shift: Pick<ScheduledShift, "start" | "end">) =>
  t.rich("shifts.time", { start: shift.start, end: shift.end, ltr });

const nameOf = (t: T, data: PublishedSchedule, userId: string | null) =>
  data.people.find((p) => p.userId === userId)?.name ?? t("shifts.noName");

const shiftLabel = (t: T, shift: Pick<ScheduledShift, "name" | "day">) =>
  t("shifts.shift", {
    name: shift.name,
    day: weekday(t, shift.day),
    date: dayMonth(shift.day),
  });

function Mine({
  t,
  data,
  swap,
  className,
}: ViewProps & { className?: string }) {
  const mine = upcomingShifts(data);
  const anyPublished = published(data).length > 0;
  const hours = shiftMinutes(mine.map(({ shift }) => shift)) / 60;
  const title = t("shifts.mine.title");
  const positionName = (key: string | null) =>
    data.positions.find((p) => p.key === key)?.name ?? null;
  return (
    <PageSection
      title={title}
      className={className}
      action={
        mine.length > 0 ? (
          <Badge tone="accent">
            {t("shifts.mine.count", { count: mine.length })}
          </Badge>
        ) : null
      }
    >
      {mine.length === 0 ? (
        <Card tone="flat" padding="lg">
          <CardText>
            {anyPublished
              ? t("shifts.mine.empty")
              : t("shifts.mine.notPublished")}
          </CardText>
        </Card>
      ) : (
        <>
          <ListGroup>
            <ul aria-label={title} className="divide-y divide-line">
              {mine.map(({ shift, position }) => {
                const line = t.rich("shifts.mine.line", {
                  name: shift.name,
                  start: shift.start,
                  end: shift.end,
                  ltr,
                });
                const role = positionName(position);
                const request = myRequestFor(data.swaps, shift.id, data.userId);
                return (
                  <li
                    key={shift.id}
                    className="flex min-h-14 flex-col justify-center gap-1 px-4 py-3"
                  >
                    <span className="font-medium">
                      {t("shifts.day", {
                        day: weekday(t, shift.day),
                        date: dayMonth(shift.day),
                      })}
                    </span>
                    <span className="text-ink-2 text-sm">
                      {line}
                      {role ? ` · ${role}` : null}
                    </span>
                    {request ? (
                      <p className="text-sm">
                        {request.status === "taken"
                          ? t("shifts.swap.taken", {
                              name: nameOf(t, data, request.takenBy),
                            })
                          : t("shifts.swap.open")}
                      </p>
                    ) : null}
                    <div className="pt-1">
                      {request ? (
                        <SwapButton
                          action={swap}
                          intent="cancel"
                          id={request.id}
                          subject={shiftLabel(t, shift)}
                          variant="ghost"
                        />
                      ) : (
                        <SwapButton
                          action={swap}
                          intent="give"
                          id={shift.id}
                          subject={shiftLabel(t, shift)}
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </ListGroup>
          <p className="text-ink-2 text-sm">
            {t("shifts.mine.hours", { hours: Math.round(hours * 10) / 10 })}
          </p>
        </>
      )}
    </PageSection>
  );
}

/** The shifts colleagues give away, for the person to take. */
function Offers({ t, data, swap }: ViewProps) {
  const offers = offersFor(
    data.swaps,
    [...data.thisWeek.shifts, ...data.nextWeek.shifts],
    data.userId,
    data.today,
  );
  const available = offers.filter((o) => o.state === "available").length;
  const title = t("shifts.swap.offers.title");
  return (
    <PageSection
      title={title}
      action={
        available > 0 ? (
          <Badge tone="accent">
            {t("shifts.swap.offers.count", { count: available })}
          </Badge>
        ) : null
      }
    >
      {offers.length === 0 ? (
        <Card tone="flat" padding="lg">
          <CardText>{t("shifts.swap.offers.empty")}</CardText>
        </Card>
      ) : (
        <ListGroup>
          <ul aria-label={title} className="divide-y divide-line">
            {offers.map(({ swap: request, shift, state }) => {
              const role = shift.assignees.find(
                (a) => a.user === request.requestedBy,
              )?.position;
              const roleName =
                data.positions.find((p) => p.key === role)?.name ?? null;
              return (
                <li
                  key={request.id}
                  className="flex min-h-14 flex-col justify-center gap-1 px-4 py-3"
                >
                  <span className="font-medium">
                    {t("shifts.day", {
                      day: weekday(t, shift.day),
                      date: dayMonth(shift.day),
                    })}
                  </span>
                  <span className="text-ink-2 text-sm">
                    {t.rich("shifts.mine.line", {
                      name: shift.name,
                      start: shift.start,
                      end: shift.end,
                      ltr,
                    })}
                    {roleName ? ` · ${roleName}` : null}
                  </span>
                  <p className="text-sm">
                    {state === "takenByYou"
                      ? t("shifts.swap.offers.takenByYou")
                      : t("shifts.swap.offers.from", {
                          name: nameOf(t, data, request.requestedBy),
                        })}
                  </p>
                  {state === "busy" ? (
                    <p className="text-sm text-warning">
                      {t("shifts.swap.offers.busy")}
                    </p>
                  ) : null}
                  {state === "available" ? (
                    <div className="pt-1">
                      <SwapButton
                        action={swap}
                        intent="take"
                        id={request.id}
                        subject={shiftLabel(t, shift)}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </ListGroup>
      )}
    </PageSection>
  );
}

/** One published week for the whole team. */
function TeamWeek({
  t,
  data,
  weekKey,
  week,
  wide = false,
}: ViewProps & { weekKey: WeekKey; week: PublishedWeek; wide?: boolean }) {
  const title = t("shifts.week.title", {
    week: t(`shifts.week.${weekKey}`),
  });
  const from = dayMonth(week.start);
  const to = dayMonth(week.dates.at(-1) ?? week.start);
  if (week.publishedAt === null) {
    return (
      <PageSection title={title}>
        <Card
          tone="flat"
          padding="lg"
          className={wide ? "max-w-xl" : undefined}
        >
          <CardText>
            {t.rich("shifts.week.notPublished", { from, to, ltr })}
          </CardText>
        </Card>
      </PageSection>
    );
  }
  const days = shiftsByDay(week.dates, week.shifts);
  const at = new Date(week.publishedAt);
  const names = new Map(data.people.map((p) => [p.userId, p.name]));
  return (
    <PageSection title={title}>
      <p className="text-ink-2 text-sm">
        {t.rich("shifts.week.publishedAt", {
          from,
          to,
          date: dayMonth(dateIn(at, data.timeZone)),
          time: timeIn(at, data.timeZone),
          ltr,
        })}
      </p>
      <div
        className={cn(
          "grid gap-4",
          wide ? "grid-cols-7 items-start gap-3" : "grid-cols-1",
        )}
      >
        {days.map(({ day, shifts }) => {
          const heading = t("shifts.day", {
            day: weekday(t, day),
            date: dayMonth(day),
          });
          return (
            <section
              key={day}
              aria-label={heading}
              className={cn(
                "flex min-w-0 flex-col gap-2",
                day === data.today && "rounded-card bg-accent-soft p-2",
              )}
            >
              <h3 className="font-medium text-ink">{heading}</h3>
              {shifts.length === 0 ? (
                <p className="text-ink-2 text-sm">{t("shifts.noShifts")}</p>
              ) : (
                shifts.map((shift) => (
                  <TeamShift
                    key={`${shift.start}/${shift.name}`}
                    t={t}
                    data={data}
                    shift={shift}
                    names={names}
                  />
                ))
              )}
            </section>
          );
        })}
      </div>
    </PageSection>
  );
}

function TeamShift({
  t,
  data,
  shift,
  names,
}: Pick<ViewProps, "t" | "data"> & {
  shift: ScheduledShift;
  names: Map<string, string | null>;
}) {
  const label = shiftLabel(t, shift);
  const mine = shift.assignees.some((a) => a.user === data.userId);
  const positionName = (key: string | null) =>
    data.positions.find((p) => p.key === key)?.name ?? null;
  return (
    <section
      aria-label={label}
      className="flex min-w-0 flex-col gap-1.5 rounded-card border border-line bg-surface p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="font-medium">{shift.name}</span>
        <span className="text-ink-2 text-sm">{range(t, shift)}</span>
      </div>
      {mine ? (
        <Badge tone="accent" className="self-start">
          {t("shifts.yours")}
        </Badge>
      ) : null}
      {shift.assignees.length === 0 ? (
        <p className="text-ink-2 text-sm">{t("shifts.nobody")}</p>
      ) : (
        <ul className="flex flex-col gap-0.5 text-sm">
          {shift.assignees.map((a) => {
            const role = positionName(a.position);
            return (
              <li
                key={a.user}
                className={cn(
                  "break-words",
                  a.user === data.userId && "font-bold",
                )}
              >
                {names.get(a.user) ?? t("shifts.noName")}
                {role ? <span className="text-ink-2"> · {role}</span> : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
