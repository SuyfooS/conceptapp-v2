"use server";

import { addDays, instantIn } from "@domain/availability";
import {
  parseBreakTimes,
  parseEntryTimes,
  parseReason,
} from "@domain/time-clock";
import type {
  BreakValues,
  EntryActionResult,
  EntryValues,
} from "../../../../(app)/clock/team/team-types";
import { DEMO_OVERLAPPING_COPY, demoShiftOf } from "./data";

const TIME_ZONE = "Asia/Jerusalem";

// Stand-ins for the demo: the same checks on what was typed, nothing stored.

function check(values: EntryValues, endRequired: boolean): EntryActionResult {
  const times = parseEntryTimes(values, TIME_ZONE, new Date(), {
    endRequired,
  });
  if (!times.ok) return { ok: false, failure: times.problem };
  return parseReason(values.reason) === null
    ? { ok: false, failure: "reasonNeeded" }
    : { ok: true };
}

export async function demoCorrectEntry(
  _entryId: string,
  values: EntryValues,
): Promise<EntryActionResult> {
  return check(values, false);
}

/** Approving stores nothing either: the demo's rows stay for the next visit. */
export async function demoConfirmEntry(
  _entryId: string,
): Promise<EntryActionResult> {
  return { ok: true };
}

export async function demoAddEntry(
  _personId: string,
  values: EntryValues,
): Promise<EntryActionResult> {
  return check(values, true);
}

/** A cancel needs why, as the app's; the shift stays as it is on the next visit. */
export async function demoCancelEntry(
  _entryId: string,
  reason: string,
): Promise<EntryActionResult> {
  return parseReason(reason) === null
    ? { ok: false, failure: "reasonNeeded" }
    : { ok: true };
}

/**
 * Bringing one back: Yoav's evening recorded twice can't come back over the
 * copy left (the database's 23P01, as the app says it); the rest come back.
 */
export async function demoRestoreEntry(
  entryId: string,
): Promise<EntryActionResult> {
  return entryId === DEMO_OVERLAPPING_COPY
    ? { ok: false, failure: "overlap" }
    : { ok: true };
}

/** A demo shift's times as instants, from its day and its HH:MM. */
function spanOf(date: string, start: string, end: string | null) {
  const clockIn = instantIn(date, start, TIME_ZONE);
  return {
    clockIn: clockIn.toISOString(),
    clockOut:
      end === null
        ? null
        : instantIn(
            end > start ? date : addDays(date, 1),
            end,
            TIME_ZONE,
          ).toISOString(),
  };
}

/**
 * A break's times checked as the app checks them, against the demo shift
 * they belong to, and its other breaks (the database's 23P01 there): nothing
 * stored.
 */
function checkBreak(
  entryId: string,
  breakId: string | null,
  values: BreakValues,
): EntryActionResult {
  const shift = demoShiftOf(entryId);
  if (!shift) return { ok: false, failure: "noAccess" };
  const entry = spanOf(shift.date, shift.in, shift.out);
  const now = new Date();
  const times = parseBreakTimes(entry, values, TIME_ZONE, now);
  if (!times.ok) return { ok: false, failure: times.problem };
  const others = shift.breaks
    .filter((one) => one.id !== breakId)
    .map((one) =>
      parseBreakTimes(
        entry,
        { start: one.start, end: one.end ?? one.start },
        TIME_ZONE,
        now,
      ),
    );
  const overlaps = others.some(
    (other) =>
      other.ok &&
      Date.parse(other.start) < Date.parse(times.end) &&
      Date.parse(times.start) < Date.parse(other.end),
  );
  if (overlaps) return { ok: false, failure: "breakOverlap" };
  return parseReason(values.reason) === null
    ? { ok: false, failure: "reasonNeeded" }
    : { ok: true };
}

export async function demoAddBreak(
  entryId: string,
  values: BreakValues,
): Promise<EntryActionResult> {
  return checkBreak(entryId, null, values);
}

export async function demoChangeBreak(
  entryId: string,
  breakId: string,
  values: BreakValues,
): Promise<EntryActionResult> {
  return checkBreak(entryId, breakId, values);
}

/** A removal needs why, as the app's; the break is there on the next visit. */
export async function demoRemoveBreak(
  _breakId: string,
  reason: string,
): Promise<EntryActionResult> {
  return parseReason(reason) === null
    ? { ok: false, failure: "reasonNeeded" }
    : { ok: true };
}

/** The toast's "ביטול": it comes back, as within the app's ten minutes. */
export async function demoRestoreBreak(
  _breakId: string,
): Promise<EntryActionResult> {
  return { ok: true };
}
