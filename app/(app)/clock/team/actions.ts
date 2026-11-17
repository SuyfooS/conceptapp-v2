"use server";

import {
  addTimeBreak,
  addTimeEntry,
  type ClockResult,
  cancelTimeEntry,
  changeTimeBreak,
  confirmTimeEntry,
  correctTimeEntry,
  getTimeEntry,
  removeTimeBreak,
  restoreTimeBreak,
  restoreTimeEntry,
} from "@db/time-clock";
import {
  editsClock,
  parseBreakTimes,
  parseEntryTimes,
  parseReason,
} from "@domain/time-clock";
import { canWrite } from "@domain/view-as";
import { refresh } from "next/cache";
import { z } from "zod";
import { pushSoon } from "../../../push/server";
import { currentMember } from "../../member";
import type {
  BreakValues,
  EntryActionResult,
  EntryFailure,
  EntryValues,
} from "./team-types";

/** What the database's refusal means on this screen. */
function failureOf(
  result: Extract<ClockResult<unknown>, { ok: false }>,
): EntryFailure {
  switch (result.failure) {
    case "times":
    case "tooLong":
      return "times";
    case "needsEnd":
      return "needsEnd";
    case "reasonNeeded":
      return "reasonNeeded";
    case "cancelled":
    case "notCancelled":
    case "breaksAfterDay":
    case "notOnStaff":
      return result.failure;
    // Of the writes here, only a cancel and bringing one back ask whose shift
    // it is.
    case "ownHours":
      return "ownShift";
    case "noAccess":
      return "noAccess";
    default:
      return "failed";
  }
}

/**
 * The signed-in person, when they edit the clock (`editsClock`: clock.edit,
 * the roles plan's R4) and write as themselves, not viewing as someone else.
 * The database checks the actor again.
 */
async function clockEditor(): Promise<
  | { ok: true; actorId: string; businessId: string; timeZone: string }
  | { ok: false; failure: EntryFailure }
> {
  const member = await currentMember();
  const membership = member?.membership;
  if (!member || !membership || !editsClock(membership)) {
    return { ok: false, failure: "noAccess" };
  }
  if (!canWrite(member.viewing)) return { ok: false, failure: "viewOnly" };
  return {
    ok: true,
    actorId: member.userId,
    businessId: membership.business.id,
    timeZone: membership.business.place.timeZone,
  };
}

/**
 * A change to someone's hours by whoever edits the clock, with why. The
 * database refuses it without a reason, and keeps the earlier times and the
 * reason in the audit log.
 */
async function asManager(
  values: EntryValues,
  endRequired: boolean,
  run: (
    actorId: string,
    businessId: string,
    times: { clockIn: string; clockOut: string | null; note: string },
  ) => Promise<ClockResult<unknown>>,
): Promise<EntryActionResult> {
  const editor = await clockEditor();
  if (!editor.ok) return editor;

  const times = parseEntryTimes(values, editor.timeZone, new Date(), {
    endRequired,
  });
  if (!times.ok) return { ok: false, failure: times.problem };
  // After the times, so the form says what's wrong with them first.
  const note = parseReason(values.reason);
  if (note === null) return { ok: false, failure: "reasonNeeded" };

  const result = await run(editor.actorId, editor.businessId, {
    clockIn: times.clockIn,
    clockOut: times.clockOut,
    note,
  });
  // Hours someone set for themselves wait for an owner, who hears it.
  if (result.ok) pushSoon();
  refresh();
  return result.ok ? { ok: true } : { ok: false, failure: failureOf(result) };
}

/**
 * Correct an entry. An open one may stay open by leaving out its end; the
 * database refuses that for one that has ended, and for a cancelled one.
 */
export async function correctEntryAction(
  entryId: string,
  values: EntryValues,
): Promise<EntryActionResult> {
  const entry = z.uuid().safeParse(entryId);
  if (!entry.success) return { ok: false, failure: "failed" };
  return asManager(values, false, (actor, _business, times) =>
    correctTimeEntry(actor, entry.data, times),
  );
}

/**
 * Approve an entry made without a code, or one someone set for themselves
 * (an owner's to approve, whoever else edits the clock). Approved by someone
 * else first is approved all the same. There is nothing to take back: a wrong
 * approval is fixed by correcting the shift.
 */
export async function confirmEntryAction(
  entryId: string,
): Promise<EntryActionResult> {
  const entry = z.uuid().safeParse(entryId);
  if (!entry.success) return { ok: false, failure: "failed" };
  const editor = await clockEditor();
  if (!editor.ok) return editor;

  const result = await confirmTimeEntry(editor.actorId, entry.data);
  // What waited is settled: nothing of it goes to a phone any more.
  if (result.ok) pushSoon();
  refresh();
  if (result.ok) return { ok: true };
  switch (result.failure) {
    case "nothingToConfirm":
      return { ok: true };
    case "ownHours":
    case "ownerOnly":
    case "noAccess":
    // Cancelled meanwhile: the card, read again, no longer lists it.
    case "cancelled":
      return { ok: false, failure: result.failure };
    default:
      return { ok: false, failure: "failed" };
  }
}

/** Add a shift someone forgot to punch. */
export async function addEntryAction(
  personId: string,
  values: EntryValues,
): Promise<EntryActionResult> {
  const person = z.uuid().safeParse(personId);
  if (!person.success) return { ok: false, failure: "failed" };
  return asManager(values, true, (actor, business, times) =>
    addTimeEntry(actor, business, person.data, {
      clockIn: times.clockIn,
      // Required above, so parseEntryTimes never leaves it out here.
      clockOut: times.clockOut ?? "",
      note: times.note,
    }),
  );
}

/**
 * Cancel a shift entered by mistake, with why: it stays, marked with who,
 * when and why, counts nowhere, and can be brought back. One still open ends
 * with it. The database refuses it without a reason, and refuses someone's
 * own shift unless they are an owner.
 */
export async function cancelEntryAction(
  entryId: string,
  reason: string,
): Promise<EntryActionResult> {
  const entry = z.uuid().safeParse(entryId);
  if (!entry.success) return { ok: false, failure: "failed" };
  const editor = await clockEditor();
  if (!editor.ok) return editor;
  const note = parseReason(reason);
  if (note === null) return { ok: false, failure: "reasonNeeded" };

  const result = await cancelTimeEntry(editor.actorId, entry.data, note);
  // Its lines settle (a confirmation waiting on it, a reminder that it's
  // still open), and nothing of them goes to a phone any more.
  if (result.ok) pushSoon();
  refresh();
  return result.ok ? { ok: true } : { ok: false, failure: failureOf(result) };
}

/**
 * Bring a cancelled shift back as it was, with no reason (the log keeps who
 * and when): the toast's "ביטול" right after cancelling, or any time after.
 * A live shift of the person over those hours refuses it.
 */
export async function restoreEntryAction(
  entryId: string,
): Promise<EntryActionResult> {
  const entry = z.uuid().safeParse(entryId);
  if (!entry.success) return { ok: false, failure: "failed" };
  const editor = await clockEditor();
  if (!editor.ok) return editor;

  const result = await restoreTimeEntry(editor.actorId, entry.data);
  // A confirmation still waiting comes back to those who give it.
  if (result.ok) pushSoon();
  refresh();
  if (result.ok) return { ok: true };
  // Its only clash is the no-overlap constraint's (23P01).
  return {
    ok: false,
    failure: result.failure === "times" ? "overlap" : failureOf(result),
  };
}

/** What the database's refusal of a break edit means on this screen. */
function breakFailureOf(
  result: Extract<ClockResult<unknown>, { ok: false }>,
): EntryFailure {
  switch (result.failure) {
    case "breakOutside":
    case "breakTimes":
    case "breakOverlap":
    case "breakOpen":
    case "breakGone":
    case "tooLate":
    case "cancelled":
    case "reasonNeeded":
    case "noAccess":
      return result.failure;
    // Only an owner edits the breaks of their own shift.
    case "ownHours":
      return "ownBreaks";
    default:
      return "failed";
  }
}

/** After a break edit: the shift reads as corrected, its total follows. */
function afterBreakEdit(result: ClockResult<unknown>): EntryActionResult {
  // An unpaid break of a closed month tells its closer and the accountants.
  if (result.ok) pushSoon();
  refresh();
  return result.ok
    ? { ok: true }
    : { ok: false, failure: breakFailureOf(result) };
}

/**
 * A break's typed times as instants of the shift they belong to, read as the
 * editor may read it, and why it changes. The database checks them again.
 */
async function breakTimesOf(
  entryId: string,
  values: BreakValues,
  /** The break being changed: a time left as it shows stays as stored. */
  keep?: string,
): Promise<
  | {
      ok: true;
      actorId: string;
      times: { start: string; end: string; note: string };
    }
  | { ok: false; failure: EntryFailure }
> {
  const entry = z.uuid().safeParse(entryId);
  if (!entry.success) return { ok: false, failure: "failed" };
  const editor = await clockEditor();
  if (!editor.ok) return editor;
  const shift = await getTimeEntry(editor.businessId, entry.data);
  if (!shift) return { ok: false, failure: "noAccess" };

  const times = parseBreakTimes(
    shift,
    values,
    editor.timeZone,
    new Date(),
    keep,
  );
  if (!times.ok) return { ok: false, failure: times.problem };
  // After the times, so the form says what's wrong with them first.
  const note = parseReason(values.reason);
  if (note === null) return { ok: false, failure: "reasonNeeded" };
  return {
    ok: true,
    actorId: editor.actorId,
    times: { start: times.start, end: times.end, note },
  };
}

/**
 * Add a break the shift is missing, with why: paid or not by the business's
 * setting now. Its times are read against the shift, so a break past midnight
 * takes no date.
 */
export async function addBreakAction(
  entryId: string,
  values: BreakValues,
): Promise<EntryActionResult> {
  const typed = await breakTimesOf(entryId, values);
  if (!typed.ok) return typed;
  return afterBreakEdit(
    await addTimeBreak(typed.actorId, entryId, typed.times),
  );
}

/**
 * Change the times of a break that ended, with why; it stays paid or not as
 * it was. A break still running isn't changed: it ends first.
 */
export async function changeBreakAction(
  entryId: string,
  breakId: string,
  values: BreakValues,
): Promise<EntryActionResult> {
  const pause = z.uuid().safeParse(breakId);
  if (!pause.success) return { ok: false, failure: "failed" };
  const typed = await breakTimesOf(entryId, values, pause.data);
  if (!typed.ok) return typed;
  return afterBreakEdit(
    await changeTimeBreak(typed.actorId, pause.data, typed.times),
  );
}

/**
 * Remove a break pressed by mistake, with why, at once: it is marked removed
 * and kept, and counts nowhere. The toast's "ביטול" takes it back.
 */
export async function removeBreakAction(
  breakId: string,
  reason: string,
): Promise<EntryActionResult> {
  const pause = z.uuid().safeParse(breakId);
  if (!pause.success) return { ok: false, failure: "failed" };
  const editor = await clockEditor();
  if (!editor.ok) return editor;
  const note = parseReason(reason);
  if (note === null) return { ok: false, failure: "reasonNeeded" };
  return afterBreakEdit(
    await removeTimeBreak(editor.actorId, pause.data, note),
  );
}

/**
 * Take a removal back, with no reason: only whoever removed it, within ten
 * minutes (the database's). Already back counts as back.
 */
export async function restoreBreakAction(
  breakId: string,
): Promise<EntryActionResult> {
  const pause = z.uuid().safeParse(breakId);
  if (!pause.success) return { ok: false, failure: "failed" };
  const editor = await clockEditor();
  if (!editor.ok) return editor;
  const result = await restoreTimeBreak(editor.actorId, pause.data);
  if (!result.ok && result.failure === "notRemoved") {
    refresh();
    return { ok: true };
  }
  // Its own clash is with a live break that took its time meanwhile (23P01),
  // and its shift corrected so it no longer fits (22023).
  return afterBreakEdit(result);
}
