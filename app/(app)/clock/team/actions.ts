"use server";

import {
  addTimeEntry,
  type ClockResult,
  confirmTimeEntry,
  correctTimeEntry,
} from "@db/time-clock";
import { canSeeTeam } from "@domain/team";
import { parseEntryTimes, parseReason } from "@domain/time-clock";
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
    case "noAccess":
      return "noAccess";
    default:
      return "failed";
  }
}

/**
 * A manager's change to someone's hours, with why. The database checks the
 * actor again, refuses it without a reason, and keeps the earlier times and
 * the reason in the audit log.
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
  const member = await currentMember();
  const membership = member?.membership;
  if (!member || !membership || !canSeeTeam(membership.role)) {
    return { ok: false, failure: "noAccess" };
  }
  if (!canWrite(member.viewing)) return { ok: false, failure: "viewOnly" };

  const { timeZone } = membership.business.place;
  const times = parseEntryTimes(values, timeZone, new Date(), { endRequired });
  if (!times.ok) return { ok: false, failure: times.problem };
  // After the times, so the form says what's wrong with them first.
  const note = parseReason(values.reason);
  if (note === null) return { ok: false, failure: "reasonNeeded" };

  const result = await run(member.userId, membership.business.id, {
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
 * database refuses that for one that has ended.
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
 * Approve an entry made without a code, or one a manager set for themselves
 * (an owner's to approve). Approved by someone else first is approved all the
 * same. There is nothing to take back: a wrong approval is fixed by correcting
 * the shift.
 */
export async function confirmEntryAction(
  entryId: string,
): Promise<EntryActionResult> {
  const entry = z.uuid().safeParse(entryId);
  if (!entry.success) return { ok: false, failure: "failed" };
  const member = await currentMember();
  const membership = member?.membership;
  if (!member || !membership || !canSeeTeam(membership.role)) {
    return { ok: false, failure: "noAccess" };
  }
  if (!canWrite(member.viewing)) return { ok: false, failure: "viewOnly" };

  const result = await confirmTimeEntry(member.userId, entry.data);
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
