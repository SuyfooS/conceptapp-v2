"use client";

import { Badge } from "@ui/badge";
import { cn } from "@ui/cn";
import { WeekStrip } from "@ui/week-strip";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { CardDensity } from "./shift-card";

/** One day of the week being built, as the three shapes show it. */
export type DayInfo = {
  date: string;
  /** Short name for the strip: א׳, ב׳… */
  short: string;
  /** "ראשון" */
  weekday: string;
  /** "1.11" */
  dayMonth: string;
  /** "יום ראשון, 1.11" */
  heading: string;
  /**
   * Places filled and needed on the day's shifts, of those still to start in
   * a published week (what has begun lacks nothing any more): none on a day
   * that is over there, which then shows no count.
   */
  filled: number;
  needed: number;
  hasShifts: boolean;
  /** Nothing to show for the day, not even a shift just removed. */
  empty: boolean;
  /** Before today, in the week running now. */
  over: boolean;
  /**
   * Over, in a published week: it keeps what it had, muted. A week never
   * published mutes only the strip's days.
   */
  muted: boolean;
  /** It takes a new shift: any day but one over in a published week. */
  addable: boolean;
  /** Today, in the week running now. */
  today: boolean;
  /** Candle lighting or havdalah, on a business closed on Shabbat. */
  shabbatTime: string | null;
  shabbatNote: ReactNode;
  /** "לא בעבודה: נועה, יואב": who is away that day (known issue 19), or null. */
  awayNote: string | null;
};

type RenderDay = (date: string, density: CardDensity) => ReactNode;

/** Today's mark beside a day's name. */
function TodayBadge() {
  const t = useTranslations("app.build");
  return <Badge tone="accent">{t("today")}</Badge>;
}

/** Phone: the week strip, and one day under it. */
export function PhoneWeek({
  days,
  day,
  onDay,
  renderCards,
  renderAdd,
}: {
  days: DayInfo[];
  day: string;
  onDay: (date: string) => void;
  renderCards: RenderDay;
  renderAdd: RenderDay;
}) {
  const t = useTranslations("app.build");
  const current = days.find((d) => d.date === day) ?? days[0];
  if (!current) return null;
  return (
    <div className="flex flex-col gap-5 md:hidden">
      <WeekStrip
        label={t("days")}
        value={day}
        onChange={onDay}
        days={days.map((d) => ({
          key: d.date,
          label: d.short,
          date: d.date.slice(8).replace(/^0/, ""),
          muted: !d.hasShifts || d.over,
          // What has begun in a published week lacks nothing any more: a day
          // that is over shows neither mark nor bar, and today only what is
          // still to start.
          marked: !d.muted && d.filled < d.needed,
          markLabel: t("dayMissing"),
          note: d.shabbatTime ?? undefined,
          coverage: !d.muted && d.needed > 0 ? d.filled / d.needed : undefined,
        }))}
      />
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3 px-1">
          <h2
            className={cn(
              "flex flex-wrap items-center gap-x-2 gap-y-1 font-bold text-xl",
              current.muted && "text-ink-2",
            )}
          >
            {current.heading}
            {current.today ? <TodayBadge /> : null}
          </h2>
          {!current.muted && current.needed > 0 ? (
            <span className="shrink-0 text-base text-ink-2">
              {t("dayCount", {
                assigned: current.filled,
                needed: current.needed,
              })}
            </span>
          ) : null}
        </div>
        {current.shabbatNote ? (
          <p className="-mt-2 px-1 text-base text-ink-2">
            {current.shabbatNote}
          </p>
        ) : null}
        {current.awayNote ? (
          <p className="-mt-2 px-1 text-ink-2 text-sm">{current.awayNote}</p>
        ) : null}
        <div className="grid gap-3">
          {renderCards(current.date, "full")}
          {renderAdd(current.date, "full")}
        </div>
      </section>
    </div>
  );
}

/** Tablet: the whole week, a row per day and a cell per shift. */
export function TabletWeek({
  days,
  renderCards,
  renderAdd,
}: {
  days: DayInfo[];
  renderCards: RenderDay;
  renderAdd: RenderDay;
}) {
  const t = useTranslations("app.build");
  return (
    <div className="hidden flex-col gap-4 md:flex xl:hidden">
      {days.map((day) => (
        <section
          key={day.date}
          className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3"
        >
          <div
            className={cn(
              "flex flex-col items-start pt-2",
              day.muted && "text-ink-2",
            )}
          >
            {/* Today's mark is part of the day's name, as on the phone and
                the desktop. */}
            <h2 className="flex flex-col items-start gap-1 font-bold text-md">
              {day.weekday}
              {day.today ? (
                <span className="mb-1 flex">
                  <TodayBadge />
                </span>
              ) : null}
            </h2>
            <p className="text-ink-2 text-sm">{day.dayMonth}</p>
            {!day.muted && day.needed > 0 ? (
              <p className="text-ink-2 text-sm">
                {t("dayCount", { assigned: day.filled, needed: day.needed })}
              </p>
            ) : null}
            {day.shabbatNote ? (
              <p className="text-ink-2 text-sm">{day.shabbatNote}</p>
            ) : null}
            {day.awayNote ? (
              <p className="text-ink-2 text-sm">{day.awayNote}</p>
            ) : null}
            {day.empty || !day.addable ? null : (
              <div className="mt-2">{renderAdd(day.date, "tile")}</div>
            )}
          </div>
          {day.empty ? (
            renderAdd(day.date, "tile")
          ) : (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {renderCards(day.date, "tile")}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

/** Desktop: the whole week, a column per day. */
export function DesktopWeek({
  days,
  renderCards,
  renderAdd,
}: {
  days: DayInfo[];
  renderCards: RenderDay;
  renderAdd: RenderDay;
}) {
  const t = useTranslations("app.build");
  // A column's name doesn't fit beside today's mark, which takes a line of
  // its own there: every day keeps room for it, so the shifts stay in line.
  const marksToday = days.some((day) => day.today);
  return (
    <div className="hidden xl:grid xl:grid-cols-7 xl:items-start xl:gap-3">
      {days.map((day) => (
        // Each day's header and shifts sit on the week's two rows (a
        // subgrid), so the headers share the tallest one's height: a note on
        // Friday, or who is away on a day, wrapping to more lines, never
        // pushes that day's shifts out of line with the rest of the week.
        <section
          key={day.date}
          className="row-span-2 grid min-w-0 grid-rows-subgrid gap-3"
        >
          {/* Every day keeps room for today's mark (above). */}
          <div
            className={cn(
              "px-1",
              marksToday ? "min-h-[5.625rem]" : "min-h-[3.75rem]",
              day.muted && "text-ink-2",
            )}
          >
            <h2 className="flex flex-wrap items-center gap-x-1.5 gap-y-1 font-bold text-md">
              <span>
                {day.weekday}{" "}
                <span className="font-normal text-base text-ink-2">
                  {day.dayMonth}
                </span>
              </span>
              {day.today ? <TodayBadge /> : null}
            </h2>
            {!day.muted && day.needed > 0 ? (
              <p className="text-ink-2 text-sm">
                {t("dayCount", { assigned: day.filled, needed: day.needed })}
              </p>
            ) : null}
            {day.shabbatNote ? (
              <p className="text-ink-2 text-sm">{day.shabbatNote}</p>
            ) : null}
            {day.awayNote ? (
              <p className="text-ink-2 text-sm">{day.awayNote}</p>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            {renderCards(day.date, "column")}
            {renderAdd(day.date, "column")}
          </div>
        </section>
      ))}
    </div>
  );
}
