import { awayOn } from "@domain/absences";
import { weekdayOf } from "@domain/availability";
import { dayMonth, WEEKDAY_KEYS } from "@domain/availability-form";
import { firstNameOf } from "@domain/people";
import { formArg } from "@domain/profile";
import { shiftEnded } from "@domain/running-week";
import { type ScheduledShift, shiftStarted, shiftsOf } from "@domain/schedule";
import {
  type EndedSwap,
  type OutcomeOnShift,
  outcomeOnShift,
  type PastRequest,
} from "@domain/swaps";
import type { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { PublishedSchedule } from "../week";

/**
 * What the shift screens read to show one shift and who is on it; of the
 * requests that no longer wait, the person's own (`ownEndedSwaps`).
 */
export type ShiftData = Pick<
  PublishedSchedule,
  | "userId"
  | "today"
  | "now"
  | "timeZone"
  | "people"
  | "positions"
  | "swaps"
  | "endedSwaps"
> &
  Partial<Pick<PublishedSchedule, "away">>;

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
/**
 * Who on a shift is recorded as away that day (known issue 19), by name,
 * for whoever builds the schedule: never why. Empty for everyone else, who
 * gets no days away to read.
 */
export const awayOnShift = (
  t: AppT,
  data: Pick<ShiftData, "people" | "away">,
  shift: Pick<ScheduledShift, "assignees" | "day">,
): string[] =>
  data.away
    ? shift.assignees
        .filter((a) => awayOn(data.away ?? [], a.user, shift.day))
        .map((a) => nameOf(t, data, a.user))
    : [];

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

/**
 * Whether a shift is over at the moment the screen was read: it takes nobody
 * any more, so a manager's card no longer says how many it lacks, as the
 * builder's muted past cards do not.
 */
export const hasEnded = (
  data: Pick<ShiftData, "now" | "timeZone">,
  shift: Pick<ScheduledShift, "day" | "start" | "end">,
) => shiftEnded(shift, new Date(data.now), data.timeZone);

export const firstNames = (names: readonly string[]) =>
  names.map(firstNameOf).join(", ");

/**
 * The requests that no longer wait that the person asked for or took: all
 * the shift screens say of them, so colleagues' stay on the server.
 */
export const ownEndedSwaps = (
  data: Pick<PublishedSchedule, "endedSwaps" | "userId">,
) =>
  data.endedSwaps.filter(
    (s) => s.requestedBy === data.userId || s.takenBy === data.userId,
  );

/**
 * What the person's own shift says about their last request to give it away
 * once it no longer waits (`outcomeOnShift`): not approved, or cancelled by
 * a change to the schedule. Callers ask only while the shift has not begun.
 */
export const shiftOutcome = (
  data: Pick<ShiftData, "endedSwaps" | "swaps" | "userId">,
  shiftId: string,
) => outcomeOnShift(data.endedSwaps, data.swaps, shiftId, data.userId);

/** The line on the shift for `shiftOutcome`: it stays theirs. */
export const outcomeLine = (t: AppT, outcome: OutcomeOnShift) =>
  outcome === "declined" ? t("shifts.swap.declined") : t("shifts.swap.removed");

/**
 * What became of a request the person asked for or took, as "מה קרה
 * לבקשות שלך" says it: whoever asked hears who took it, whoever took it
 * hears who asked, and a change to the schedule or the team names nobody.
 * Who decided is the business's, so it isn't said here. Always what
 * happened, in the past, and never who has the shift now: a request that
 * was decided stays as it was while its shift is deleted, changed or given
 * away again (`private.write_week_schedule` ends only waiting ones), so
 * "the shift stays yours" would turn false without the row changing.
 */
export function pastRequestLine(
  t: AppT,
  data: Pick<ShiftData, "people">,
  { swap, side }: PastRequest,
): string {
  const other = side === "from" ? swap.takenBy : swap.requestedBy;
  const name = nameOf(t, data, other);
  switch (swap.outcome) {
    case "approved":
      return side === "from"
        ? t("shifts.past.approvedFrom", { name })
        : t("shifts.past.approvedTo", { name });
    case "declined":
      return t("shifts.past.declined", { name });
    case "withdrawn":
      return side === "from"
        ? t("shifts.past.withdrawnFrom")
        : t("shifts.past.withdrawnTo", { name, form: formOf(data, other) });
    case "schedule":
      return t("shifts.past.schedule");
    case "team":
      return t("shifts.past.team");
  }
}

/**
 * What a row of "מה קרה לבקשות שלך" adds about its shift: that it was
 * taken off the schedule since (`shiftId` null; the row keeps the shift the
 * request asked for), so the row isn't read as about a shift still there.
 * Nothing while the shift is in the schedule.
 */
export const pastRequestNote = (t: AppT, { swap }: PastRequest) =>
  swap.shiftId === null ? t("shifts.past.gone") : null;

/**
 * What became of a request that no longer waits, for whoever decides them:
 * who approved or declined it ("you" for the reader), or why it was
 * cancelled. Someone who left the team reads as such (`nameOf`).
 */
export function endedRequestLine(
  t: AppT,
  names: Pick<ShiftData, "people">,
  swap: EndedSwap,
  viewer: string,
): string {
  const by = (userId: string) => ({
    name: nameOf(t, names, userId),
    form: formOf(names, userId),
  });
  const decider = swap.decidedBy;
  switch (swap.outcome) {
    case "approved":
      return decider === null
        ? t("swaps.ended.approvedPlain")
        : decider === viewer
          ? t("swaps.ended.approvedYou")
          : t("swaps.ended.approved", by(decider));
    case "declined":
      return decider === null
        ? t("swaps.ended.declinedPlain")
        : decider === viewer
          ? t("swaps.ended.declinedYou")
          : t("swaps.ended.declined", by(decider));
    case "withdrawn":
      return t("swaps.ended.withdrawn", by(swap.requestedBy));
    case "schedule":
      return t("swaps.ended.schedule");
    case "team":
      return t("swaps.ended.team");
  }
}

/** The person's shifts from today on, in both weeks. */
export function upcomingShifts(data: PublishedSchedule) {
  return shiftsOf(
    [...data.thisWeek.shifts, ...data.nextWeek.shifts],
    data.userId,
    data.today,
  );
}
