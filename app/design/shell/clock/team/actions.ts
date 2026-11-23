"use server";

import { type AbsenceValues, parseAbsence } from "@domain/absences";
import { addDays, instantIn } from "@domain/availability";
import type { StationStopResult } from "@domain/clock-station";
import {
  parseBreakTimes,
  parseEntryTimes,
  parseReason,
} from "@domain/time-clock";
import type {
  AbsenceActionResult,
  BreakValues,
  EntryActionResult,
  EntryValues,
} from "../../../../(app)/clock/team/team-types";
import { DEMO_OVERLAPPING_COPY, demoNoaAbsences, demoShiftOf } from "./data";

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

/** The minute after an HH:MM, past midnight to 00:00. */
function plusMinute(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const next = ((hours ?? 0) * 60 + (minutes ?? 0) + 1) % (24 * 60);
  return `${String(Math.floor(next / 60)).padStart(2, "0")}:${String(next % 60).padStart(2, "0")}`;
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
  // A break still running holds everything from its start on, as the
  // database's range with no end does.
  const others = shift.breaks
    .filter((one) => one.id !== breakId)
    .map((one) => {
      const read = parseBreakTimes(
        entry,
        { start: one.start, end: one.end ?? plusMinute(one.start) },
        TIME_ZONE,
        // Read as if over, so a running one isn't refused as still to come.
        new Date(8.64e15),
      );
      return read.ok
        ? {
            start: Date.parse(read.start),
            end:
              one.end === null
                ? Number.POSITIVE_INFINITY
                : Date.parse(read.end),
          }
        : null;
    });
  const overlaps = others.some(
    (other) =>
      other !== null &&
      other.start < Date.parse(times.end) &&
      Date.parse(times.start) < other.end,
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

/** Stopping a station stores nothing: the demo's list is the same on the next visit. */
export async function demoStopStation(
  _stationId: string,
): Promise<StationStopResult> {
  return { ok: true };
}

/** The toast's "ביטול": it shows the code again, as within the app's two minutes. */
export async function demoRestartStation(
  _stationId: string,
): Promise<StationStopResult> {
  return { ok: true };
}

/** The demo's today, as the team's twin has it. */
const DEMO_TODAY = "2026-11-06";

/**
 * Days away the stand-ins check as the app does: what was typed, then an
 * overlap with Noa's own days on the demo (other than the record changed).
 * Nothing is stored.
 */
function checkAbsence(
  values: AbsenceValues,
  except: string | null,
): AbsenceActionResult {
  const parsed = parseAbsence(values, DEMO_TODAY);
  if (!parsed.ok) return { ok: false, failure: parsed.problem };
  const overlaps = demoNoaAbsences.some(
    (one) =>
      one.id !== except &&
      one.from <= parsed.value.to &&
      parsed.value.from <= one.to,
  );
  return overlaps ? { ok: false, failure: "overlap" } : { ok: true };
}

export async function demoRecordAbsence(
  _personId: string,
  values: AbsenceValues,
): Promise<AbsenceActionResult> {
  return checkAbsence(values, null);
}

export async function demoChangeAbsence(
  absenceId: string,
  values: AbsenceValues,
): Promise<AbsenceActionResult> {
  return checkAbsence(values, absenceId);
}

/** Removing and bringing back store nothing: the rows stay for the next visit. */
export async function demoRemoveAbsence(
  _absenceId: string,
): Promise<AbsenceActionResult> {
  return { ok: true };
}

export async function demoRestoreAbsence(
  _absenceId: string,
): Promise<AbsenceActionResult> {
  return { ok: true };
}
