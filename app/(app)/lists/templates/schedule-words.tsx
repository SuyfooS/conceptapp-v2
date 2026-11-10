"use client";

import { WEEKDAY_KEYS } from "@domain/availability-form";
import { dayRuns, type ScheduleAnchor } from "@domain/lists";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

export const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

const DAY_MINUTES = 24 * 60;

/** "HH:MM" of minutes after midnight, within a day. */
export const clockOf = (minutes: number) => {
  const within = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return `${String(Math.floor(within / 60)).padStart(2, "0")}:${String(within % 60).padStart(2, "0")}`;
};

/** What a time's "when" is said from. */
export type TimeShape = {
  days: readonly number[];
  anchor: ScheduleAnchor;
  shift: string | null;
  opensOffset: number;
};

/**
 * A time's days and when it opens, in words, the same in the template's
 * editor and on the screen of templates: its days and its hour, or how long
 * before or after a shift's start or end. `shifts` are the scheduling
 * settings' shifts, by key and name.
 */
export function useTimeWords(shifts: readonly { key: string; name: string }[]) {
  const t = useTranslations("app.lists.schedules");
  const tDays = useTranslations("days");
  const short = (day: number) => tDays(`${WEEKDAY_KEYS[day] ?? "sun"}.short`);
  const shiftName = (key: string | null) =>
    shifts.find((s) => s.key === key)?.name ?? t("shiftGone");

  const days = (list: readonly number[]) =>
    list.length === 7
      ? t("everyDay")
      : dayRuns(list)
          .map(([from, to]) =>
            from === to
              ? short(from)
              : to === from + 1
                ? `${short(from)} ${short(to)}`
                : t("dayRun", { from: short(from), to: short(to) }),
          )
          .join(", ");

  const when = (schedule: TimeShape): ReactNode => {
    if (schedule.anchor === "day") {
      return t.rich("at", {
        ltr,
        days: days(schedule.days),
        time: clockOf(schedule.opensOffset),
      });
    }
    const shift = shiftName(schedule.shift);
    const offset = schedule.opensOffset;
    const start = schedule.anchor === "shift_start";
    return t("byShift", {
      days: days(schedule.days),
      when:
        offset <= 0
          ? t(start ? "start" : "end", { minutes: -offset, shift })
          : t(start ? "startAfter" : "endAfter", { minutes: offset, shift }),
    });
  };

  return { days, when, shiftName };
}
