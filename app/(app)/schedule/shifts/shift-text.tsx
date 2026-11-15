import { weekdayOf } from "@domain/availability";
import { dayMonth, WEEKDAY_KEYS } from "@domain/availability-form";
import { firstNameOf } from "@domain/people";
import { formArg } from "@domain/profile";
import { type ScheduledShift, shiftStarted, shiftsOf } from "@domain/schedule";
import type { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { PublishedSchedule } from "../week";

/** What the shift screens read to show one shift and who is on it. */
export type ShiftData = Pick<
  PublishedSchedule,
  "userId" | "today" | "now" | "timeZone" | "people" | "positions" | "swaps"
>;

export type AppT = ReturnType<typeof useTranslations<"app">>;

export const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

export const weekdayName = (t: AppT, date: string) =>
  t(`availability.weekdays.${WEEKDAY_KEYS[weekdayOf(date)] ?? "sun"}`);

/** "יום שלישי, 3.11" */
export const dayLabel = (t: AppT, date: string) =>
  t("shifts.day", { day: weekdayName(t, date), date: dayMonth(date) });

/** "משמרת ערב, יום שלישי 3.11", for screen readers. */
export const shiftLabel = (
  t: AppT,
  shift: Pick<ScheduledShift, "name" | "day">,
) =>
  t("shifts.shift", {
    name: shift.name,
    day: weekdayName(t, shift.day),
    date: dayMonth(shift.day),
  });

/** "16:00–23:30", reading left to right inside the Hebrew. */
export const timeRange = (
  t: AppT,
  shift: Pick<ScheduledShift, "start" | "end">,
) => t.rich("shifts.time", { start: shift.start, end: shift.end, ltr });

/**
 * Their name, the words for none, or, for someone no longer on the team (a
 * past shift keeps them, and nobody reads their name now), "no longer on
 * the team".
 */
export const nameOf = (
  t: AppT,
  data: Pick<ShiftData, "people">,
  userId: string | null,
) => {
  const person = data.people.find((p) => p.userId === userId);
  if (person) return person.name ?? t("shifts.noName");
  return userId ? t("shifts.former") : t("shifts.noName");
};

export const photoOf = (
  data: Pick<ShiftData, "people">,
  userId: string | null,
) => data.people.find((p) => p.userId === userId)?.photo ?? null;

/**
 * How the app writes about someone, for an ICU `select` ("x", the neutral
 * words, until they choose).
 */
export const formOf = (
  data: Pick<ShiftData, "people">,
  userId: string | null,
) => formArg(data.people.find((p) => p.userId === userId)?.addressForm);

export const positionName = (
  data: Pick<ShiftData, "positions">,
  key: string | null | undefined,
) => data.positions.find((p) => p.key === key)?.name ?? null;

/** Everyone on a shift as their avatars show them, in the shift's order. */
export const assigneePeople = (
  t: AppT,
  data: Pick<ShiftData, "people">,
  shift: Pick<ScheduledShift, "assignees">,
) =>
  shift.assignees.map((a) => ({
    name: nameOf(t, data, a.user),
    photo: photoOf(data, a.user),
  }));

/**
 * Whether a shift has begun at the moment the screen was read, as the
 * database decides it: from its start on, it is no longer given away or
 * taken.
 */
export const hasStarted = (
  data: Pick<ShiftData, "now" | "timeZone">,
  shift: Pick<ScheduledShift, "day" | "start">,
) => shiftStarted(shift, new Date(data.now), data.timeZone);

export const firstNames = (names: readonly string[]) =>
  names.map(firstNameOf).join(", ");

/** The person's shifts from today on, in both weeks. */
export function upcomingShifts(data: PublishedSchedule) {
  return shiftsOf(
    [...data.thisWeek.shifts, ...data.nextWeek.shifts],
    data.userId,
    data.today,
  );
}
