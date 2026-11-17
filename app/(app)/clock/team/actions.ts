"use server";

import {
  addTimeEntry,
  type ClockResult,
  cancelTimeEntry,
  confirmTimeEntry,
  correctTimeEntry,
  restoreTimeEntry,
} from "@db/time-clock";
import { editsClock, parseEntryTimes, parseReason } from "@domain/time-clock";
import { canWrite } from "@domain/view-as";
import { refresh } from "next/cache";
import { z } from "zod";
import { pushSoon } from "../../../push/server";
import { currentMember } from "../../member";
import type {
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
