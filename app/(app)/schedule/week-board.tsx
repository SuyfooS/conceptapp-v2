"use client";

import type { WeekScheduleShift } from "@db/schedule";
import { addDays, weekdayOf } from "@domain/availability";
import {
  dayMonth,
  type ShabbatLimits,
  WEEKDAY_KEYS,
} from "@domain/availability-form";
import { firstNameOf } from "@domain/people";
import { coverageOf, scheduleGaps, shiftsByDay } from "@domain/schedule";
import { myRequestFor, offersFor } from "@domain/swaps";
import { AvatarStack } from "@ui/avatar";
import { Badge } from "@ui/badge";
import { Card, CardText } from "@ui/card";
import { cn } from "@ui/cn";
import { PageHeader } from "@ui/page";
import { Segmented } from "@ui/segmented";
import { WeekStrip } from "@ui/week-strip";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import {
  type BoardShift,
  CardTarget,
  CoverageBadge,
  MyShiftHero,
  ShiftCard,
} from "./shifts/shift-card";
import {
  ShiftSheet,
  type SwapAction,
  useShiftSheet,
} from "./shifts/shift-sheet";
import {
  type AppT,
  assigneePeople,
  dayLabel,
  firstNames,
  formOf,
  ltr,
  nameOf,
  positionName,
  type ShiftData,
  shiftLabel,
  timeRange,
} from "./shifts/shift-text";

export type WeekKey = "this" | "next";

export type BoardWeek = {
  key: WeekKey;
  /** The week's dates in words, formatted on the server: "1–7 בנובמבר". */
  range: string;
  dates: string[];
  /**
   * `published`: the team reads it. `draft`: only the manager, while building
   * it. `none`: nothing to show yet.
   */
  state: "published" | "draft" | "none";
  shifts: BoardShift[];
  shabbat: ShabbatLimits | null;
  /** When it went out, in the business's zone, formatted on the server. */
  published: { date: string; time: string } | null;
};

const dayShort = (
  tDays: ReturnType<typeof useTranslations<"days">>,
  date: string,
) => tDays(`${WEEKDAY_KEYS[weekdayOf(date)] ?? "sun"}.short`);

const dayNumber = (date: string) => String(Number(date.slice(8)));

/** Candle lighting on Friday, havdalah on Saturday; nothing on other days. */
function shabbatNote(week: BoardWeek, date: string) {
  if (date === week.shabbat?.friday) {
    return {
      kind: "candleLighting",
      time: week.shabbat.candleLighting,
    } as const;
  }
  if (date === week.shabbat?.saturday) {
    return { kind: "havdalah", time: week.shabbat.havdalah } as const;
  }
  return null;
}

/**
 * The schedule tab: the week in a strip and one day at a time, so a person's
 * shifts are the first thing they see. Phone: one column. Tablet: the strip
 * across, the day beside the rows that lead elsewhere. Desktop: the whole
 * week at once. `opening` is where it starts (`scheduleOpening`); the slots
 * are the server's rows: `prompt` the one thing waiting for this person,
 * `manage` and `own` the screens around the schedule.
 */
export function WeekBoard({
  title,
  weeks,
  opening,
  data,
  manager,
  swap,
  draftHref,
  prompt,
  manage,
  own,
}: {
  title: string;
  weeks: [BoardWeek, BoardWeek];
  opening: { week: WeekKey; day: string };
  data: ShiftData;
  manager: boolean;
  swap: SwapAction;
  draftHref: string;
  prompt?: ReactNode;
  manage?: ReactNode;
  own: ReactNode;
}) {
  const t = useTranslations("app");
  const tb = useTranslations("app.shifts.board");
  const tDays = useTranslations("days");
  const [weekKey, setWeekKey] = useState(opening.week);
  const [days, setDays] = useState<Partial<Record<WeekKey, string>>>({
    [opening.week]: opening.day,
  });
  const sheet = useShiftSheet();

  const week = weeks.find((w) => w.key === weekKey) ?? weeks[0];
  const published = weeks.flatMap((w) =>
    w.state === "published"
      ? w.shifts.flatMap((s) => (s.id ? [{ ...s, id: s.id }] : []))
      : [],
  ) satisfies WeekScheduleShift[];
  const offers = offersFor(data.swaps, published, data.userId, data.today);

  const firstDay =
    week.dates.find((d) => d === data.today) ??
    week.shifts.find((s) => s.assignees.some((a) => a.user === data.userId))
      ?.day ??
    week.shifts[0]?.day ??
    week.dates[0] ??
    data.today;
  const day = days[week.key] ?? firstDay;
  const byDay = shiftsByDay(week.dates, week.shifts);
  const shifts = byDay.find((d) => d.day === day)?.shifts ?? [];
  const gaps = scheduleGaps(week.shifts).people;
  const hasShifts = week.state !== "none";
  const publishedLine = week.published ? (
    <p className="px-1 text-ink-2 text-sm">
      {t.rich("shifts.board.publishedAt", { ...week.published, ltr })}
    </p>
  ) : null;

  return (
    <>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <PageHeader
            eyebrow={week.range}
            title={title}
            subtitle={
              manager && week.shifts.length > 0 ? (
                <span className="mt-2 flex">
                  {gaps > 0 ? (
                    <Badge tone="warning">
                      {tb("places", { count: gaps })}
                    </Badge>
                  ) : (
                    <Badge tone="success">{tb("allFilled")}</Badge>
                  )}
                </span>
              ) : undefined
            }
          />
        </div>
        <Segmented
          label={tb("pickWeek")}
          value={week.key}
          onChange={setWeekKey}
          options={weeks.map((w) => ({
            value: w.key,
            label: t(`shifts.week.${w.key}`),
          }))}
          className="shrink-0"
        />
      </div>
      {prompt}
      {week.state === "draft" ? (
        <p className="-my-2 px-1 text-base text-ink-2">{tb("draft")}</p>
      ) : null}
      <div className="grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,4fr)] md:grid-rows-[auto_auto_1fr] md:gap-x-6 xl:block xl:space-y-8">
        {hasShifts ? (
          <div className="-mb-2 md:col-span-2 xl:hidden">
            <WeekStrip
              label={tb("pickDay")}
              value={day}
              onChange={(next) => setDays((d) => ({ ...d, [week.key]: next }))}
              days={byDay.map(({ day: date, shifts: onDay }) => {
                const note = shabbatNote(week, date);
                const { have, need } = coverageOf(onDay);
                const ownDay = onDay.some((s) =>
                  s.assignees.some((a) => a.user === data.userId),
                );
                return {
                  key: date,
                  label: dayShort(tDays, date),
                  date: dayNumber(date),
                  muted: date < data.today,
                  note: note?.time,
                  coverage: manager && need > 0 ? have / need : undefined,
                  marked: manager ? need > 0 : ownDay,
                  markTone: "accent" as const,
                  markLabel: manager
                    ? tb("filledLabel", { have, need })
                    : tb("yourDay"),
                };
              })}
            />
          </div>
        ) : null}

        {hasShifts ? (
          <div className="flex min-w-0 flex-col gap-3 md:col-start-1 md:row-span-2 md:row-start-2 xl:hidden">
            <DayHeading
              t={t}
              week={week}
              date={day}
              count={
                manager
                  ? tb("filled", coverageOf(shifts))
                  : tb("count", { count: shifts.length })
              }
            />
            {shifts.length === 0 ? (
              <Card padding="lg">
                <CardText>{tb("noShifts")}</CardText>
              </Card>
            ) : (
              <DayShifts
                shifts={shifts}
                data={data}
                offers={offers}
                manager={manager}
                swap={swap}
                onOpen={sheet.show}
                draftHref={draftHref}
              />
            )}
            {publishedLine}
          </div>
        ) : (
          <Card
            padding="lg"
            className="self-start md:col-start-1 md:row-span-2 md:row-start-1 xl:max-w-xl"
          >
            <CardText>
              {manager
                ? t.rich("shifts.week.notPublished", {
                    from: dayMonth(week.dates[0] ?? data.today),
                    to: dayMonth(week.dates.at(-1) ?? data.today),
                    ltr,
                  })
                : t("shifts.mine.notPublished")}
            </CardText>
          </Card>
        )}

        {hasShifts ? (
          <div className="hidden flex-col gap-3 xl:flex">
            <FullWeek
              week={week}
              byDay={byDay}
              data={data}
              offers={offers}
              manager={manager}
              onOpen={sheet.show}
              draftHref={draftHref}
            />
            {publishedLine}
          </div>
        ) : null}

        {manage ? (
          <div
            className={cn(
              "min-w-0 md:col-start-2",
              hasShifts ? "md:row-start-2" : "md:row-start-1",
            )}
          >
            {manage}
          </div>
        ) : null}
        <div
          className={cn(
            "min-w-0 md:col-start-2",
            hasShifts === Boolean(manage)
              ? hasShifts
                ? "md:row-start-3"
                : "md:row-start-1"
              : "md:row-start-2",
          )}
        >
          {own}
        </div>
      </div>
      <ShiftSheet
        id={sheet.id}
        open={sheet.open}
        onOpenChange={sheet.onOpenChange}
        shifts={published}
        offers={offers}
        data={data}
        swap={swap}
      />
    </>
  );
}

function DayHeading({
  t,
  week,
  date,
  count,
}: {
  t: AppT;
  week: BoardWeek;
  date: string;
  count: ReactNode;
}) {
  const note = shabbatNote(week, date);
  return (
    <div className="px-1 pt-1">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-bold text-xl">{dayLabel(t, date)}</h2>
        <span className="shrink-0 text-base text-ink-2">{count}</span>
      </div>
      {note ? (
        <p className="text-base text-ink-2">
          {t.rich(`shifts.board.${note.kind}`, { time: note.time, ltr })}
        </p>
      ) : null}
    </div>
  );
}

function DayShifts({
  shifts,
  data,
  offers,
  manager,
  swap,
  onOpen,
  draftHref,
}: {
  shifts: BoardShift[];
  data: ShiftData;
  offers: ReturnType<typeof offersFor<WeekScheduleShift>>;
  manager: boolean;
  swap: SwapAction;
  onOpen: (id: string) => void;
  draftHref: string;
}) {
  const t = useTranslations("app");
  // A worker's first shift of the day leads, as the screen's one strong
  // moment. Managers came for the coverage, so theirs stays a card with bars.
  const hero = manager
    ? undefined
    : shifts.find(
        (s) =>
          s.id &&
          s.day >= data.today &&
          s.assignees.some((a) => a.user === data.userId),
      );
  return (
    <div className="flex flex-col gap-3">
      {hero?.id ? (
        <div className="mb-2">
          <MyShiftHero
            shift={{ ...hero, id: hero.id }}
            label={t("shifts.yours")}
            chip={
              hero.day === data.today
                ? t("shifts.hero.today")
                : hero.day === addDays(data.today, 1)
                  ? t("shifts.hero.tomorrow")
                  : undefined
            }
            data={data}
            swap={swap}
            onOpen={onOpen}
          />
        </div>
      ) : null}
      {shifts
        .filter((shift) => shift !== hero)
        .map((shift) => (
          <ShiftCard
            key={shift.id ?? `${shift.pattern}/${shift.start}/${shift.name}`}
            shift={shift}
            data={data}
            offers={offers.filter((o) => o.shift.id === shift.id)}
            manager={manager}
            swap={swap}
            onOpen={onOpen}
            draftHref={draftHref}
          />
        ))}
    </div>
  );
}

/** Desktop: the whole week at once, a column a day. */
function FullWeek({
  week,
  byDay,
  data,
  offers,
  manager,
  onOpen,
  draftHref,
}: {
  week: BoardWeek;
  byDay: { day: string; shifts: BoardShift[] }[];
  data: ShiftData;
  offers: ReturnType<typeof offersFor<WeekScheduleShift>>;
  manager: boolean;
  onOpen: (id: string) => void;
  draftHref: string;
}) {
  const t = useTranslations("app");
  const tb = useTranslations("app.shifts.board");
  const tDays = useTranslations("days");
  return (
    <div className="grid grid-cols-7 overflow-hidden rounded-card bg-surface shadow-card">
      {byDay.map(({ day, shifts }) => {
        const today = day === data.today;
        const note = shabbatNote(week, day);
        const { have, need } = coverageOf(shifts);
        const heading = dayLabel(t, day);
        return (
          <section
            key={day}
            aria-label={heading}
            className="flex min-w-0 flex-col gap-2 border-line p-2 not-first:border-s"
          >
            <div className="flex flex-col items-center gap-0.5 pt-1.5 pb-1">
              <span className="text-ink-2 text-sm">{dayShort(tDays, day)}</span>
              <span
                className={cn(
                  "grid size-9 place-items-center rounded-full font-bold text-lg",
                  today && "bg-ink text-bg",
                  !today && day < data.today && "text-ink-2",
                )}
              >
                {dayNumber(day)}
              </span>
              <span className="min-h-[18px] text-center text-ink-2 text-sm">
                {note
                  ? t.rich(`shifts.board.${note.kind}`, {
                      time: note.time,
                      ltr,
                    })
                  : null}
              </span>
              {manager && need > 0 ? (
                <>
                  <span className="sr-only">
                    {tb("filledLabel", { have, need })}
                  </span>
                  <span
                    aria-hidden="true"
                    className="h-[3px] w-[22px] overflow-hidden rounded-full bg-surface-2"
                  >
                    <span
                      className={cn(
                        "block h-full rounded-full",
                        have >= need ? "bg-success" : "bg-warning",
                      )}
                      style={{
                        width: `${Math.round((have / need) * 100)}%`,
                      }}
                    />
                  </span>
                </>
              ) : null}
            </div>
            {shifts.length === 0 ? (
              <p className="px-1 py-2 text-center text-ink-2 text-sm">
                {tb("noShiftsShort")}
              </p>
            ) : (
              shifts.map((shift) => (
                <WeekShift
                  key={
                    shift.id ?? `${shift.pattern}/${shift.start}/${shift.name}`
                  }
                  shift={shift}
                  data={data}
                  offers={offers.filter((o) => o.shift.id === shift.id)}
                  manager={manager}
                  onOpen={onOpen}
                  draftHref={draftHref}
                />
              ))
            )}
          </section>
        );
      })}
    </div>
  );
}

function WeekShift({
  shift,
  data,
  offers,
  manager,
  onOpen,
  draftHref,
}: {
  shift: BoardShift;
  data: ShiftData;
  offers: ReturnType<typeof offersFor<WeekScheduleShift>>;
  manager: boolean;
  onOpen: (id: string) => void;
  draftHref: string;
}) {
  const t = useTranslations("app");
  const tb = useTranslations("app.shifts.board");
  const label = shiftLabel(t, shift);
  const people = assigneePeople(t, data, shift);
  const names = people.map((p) => p.name);
  const own = shift.assignees.find((a) => a.user === data.userId);
  const mine = own !== undefined;
  const role = positionName(data, own?.position);
  const { id } = shift;
  const canTake = offers.some((o) => o.state === "available");
  const tookIt = offers.some((o) => o.state === "takenByYou");
  const request = id ? myRequestFor(data.swaps, id, data.userId) : null;
  return (
    <section
      aria-label={label}
      className={cn(
        "pressable relative flex min-w-0 flex-col gap-1.5 rounded-2xl p-2.5 transition-colors duration-150",
        mine
          ? "bg-accent-soft"
          : canTake
            ? "bg-surface-2"
            : "bg-surface-2/50 hover:bg-surface-2",
      )}
    >
      {id ? (
        <CardTarget
          label={t("shifts.board.open", { shift: label })}
          onOpen={() => onOpen(id)}
        />
      ) : (
        <CardTarget label={label} href={draftHref} />
      )}
      <span className="font-semibold text-base">{shift.name}</span>
      <span className="text-ink-2 text-sm">{timeRange(t, shift)}</span>
      {names.length > 0 ? (
        <>
          <AvatarStack people={people} className="mt-0.5" />
          <span className="text-ink-2 text-sm">{firstNames(names)}</span>
        </>
      ) : (
        <span className="text-ink-2 text-sm">{t("shifts.nobody")}</span>
      )}
      {mine ? (
        <span className="font-semibold text-sm">{t("shifts.yours")}</span>
      ) : null}
      {role ? <span className="text-ink-2 text-sm">{role}</span> : null}
      {request ? (
        <span className="text-sm">
          {request.status === "taken"
            ? tb("givingTaken", {
                name: firstNameOf(nameOf(t, data, request.takenBy)),
                form: formOf(data, request.takenBy),
              })
            : tb("givingOpen")}
        </span>
      ) : null}
      {canTake ? (
        <span className="font-semibold text-sm">{tb("canTake")}</span>
      ) : null}
      {tookIt ? <span className="text-sm">{tb("tookIt")}</span> : null}
      {manager ? (
        <div>
          <CoverageBadge shift={shift} />
        </div>
      ) : null}
    </section>
  );
}
