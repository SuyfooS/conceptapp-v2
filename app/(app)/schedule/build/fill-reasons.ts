/**
 * What the fill's sheet says of the shifts that had an open place: the days
 * in the fill's order, and for a place left open its one reason. Without
 * React, so the tests stand in for the sheet, which puts these into words
 * (`app.build.fill.why.*`).
 */

import type { ShabbatConflict } from "@domain/availability-form";
import type { FillShift, WeekFill } from "@domain/fill-week";

/** Candle lighting or havdalah, on the side of Shabbat the shift reaches. */
type ShabbatSide = { side: ShabbatConflict; time: string };

/**
 * Why a place stays open, as the sheet says it:
 * - `shabbat`: the shift reaches into Shabbat and no answer covers it, with
 *   the time and what to do (`why.friday`, `why.saturday`);
 * - `nobody`: nobody covers it whole; `others` once anyone is on it after
 *   the fill, whoever put them there, so it says nobody else does
 *   (`why.nobodyElse`), with how many cover only a part (`why.partial`);
 * - `blocked`: everyone who covers it, each with the first rule that
 *   stopped them (`why.blocked`).
 * Beside the last two, a shift that reaches into Shabbat says its time
 * (`why.fridayToo`, `why.saturdayToo`): an answer covers it, so it never
 * says it has none.
 */
export type FillReason =
  | ({ why: "shabbat" } & ShabbatSide)
  | {
      why: "nobody";
      others: boolean;
      partial: number;
      shabbat: ShabbatSide | null;
    }
  | {
      why: "blocked";
      blocked: FillShift["blocked"];
      shabbat: ShabbatSide | null;
    };

/**
 * The reason a shift keeps an open place after the fill, with `assigned`
 * the people on it after the fill (`WeekFill.week[index].assignees`); null
 * once nothing is left open on it.
 */
export function fillReason(
  shift: FillShift,
  assigned: number,
): FillReason | null {
  if (shift.open === 0 || shift.why === null) return null;
  if (shift.why === "shabbat" && shift.shabbat) {
    return { why: "shabbat", ...shift.shabbat };
  }
  if (shift.why === "blocked") {
    return { why: "blocked", blocked: shift.blocked, shabbat: shift.shabbat };
  }
  return {
    why: "nobody",
    others: assigned > 0,
    partial: shift.partial,
    shabbat: shift.shabbat,
  };
}

/** A day of the sheet: its date, and its shifts that had an open place. */
export type FillDay = { date: string; shifts: FillShift[] };

/**
 * The shifts that had an open place, a group for each day that has one, in
 * the fill's order (by day, then start): each shift's day as the week after
 * the fill has it.
 */
export function fillDays(fill: Pick<WeekFill, "week" | "shifts">): FillDay[] {
  const days: FillDay[] = [];
  for (const shift of fill.shifts) {
    const date = fill.week[shift.index]?.day;
    if (date === undefined) continue;
    const last = days.at(-1);
    if (last?.date === date) last.shifts.push(shift);
    else days.push({ date, shifts: [shift] });
  }
  return days;
}
