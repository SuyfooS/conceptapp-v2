"use client";

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
  filled: number;
  needed: number;
  hasShifts: boolean;
  /** Nothing to show for the day, not even a shift just removed. */
  empty: boolean;
  /** Candle lighting or havdalah, on a business closed on Shabbat. */
  shabbatTime: string | null;
  shabbatNote: ReactNode;
};

type RenderDay = (date: string, density: CardDensity) => ReactNode;

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
          muted: !d.hasShifts,
          marked: d.filled < d.needed,
          markLabel: t("dayMissing"),
          note: d.shabbatTime ?? undefined,
          coverage: d.hasShifts ? d.filled / d.needed : undefined,
        }))}
      />
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3 px-1">
          <h2 className="font-bold text-xl">{current.heading}</h2>
          {current.hasShifts ? (
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
          <div className="flex flex-col items-start pt-2">
            <h2 className="font-bold text-md">{day.weekday}</h2>
            <p className="text-ink-2 text-sm">{day.dayMonth}</p>
            {day.hasShifts ? (
              <p className="text-ink-2 text-sm">
                {t("dayCount", { assigned: day.filled, needed: day.needed })}
              </p>
            ) : null}
            {day.shabbatNote ? (
              <p className="text-ink-2 text-sm">{day.shabbatNote}</p>
            ) : null}
            {day.empty ? null : (
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
  return (
    <div className="hidden xl:grid xl:grid-cols-7 xl:items-start xl:gap-3">
      {days.map((day) => (
        <section key={day.date} className="flex min-w-0 flex-col gap-3">
          {/* The same height on every day, so a note on Friday does not push
              its shifts out of line with the rest of the week. */}
          <div className="min-h-[3.75rem] px-1">
            <h2 className="font-bold text-md">
              {day.weekday}{" "}
              <span className="font-normal text-base text-ink-2">
                {day.dayMonth}
              </span>
            </h2>
            {day.hasShifts ? (
              <p className="text-ink-2 text-sm">
                {t("dayCount", { assigned: day.filled, needed: day.needed })}
              </p>
            ) : null}
            {day.shabbatNote ? (
              <p className="text-ink-2 text-sm">{day.shabbatNote}</p>
            ) : null}
          </div>
          {renderCards(day.date, "column")}
          {renderAdd(day.date, "column")}
        </section>
      ))}
    </div>
  );
}
