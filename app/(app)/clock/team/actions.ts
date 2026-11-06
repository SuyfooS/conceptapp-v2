"use server";

import {
  addTimeEntry,
  type ClockResult,
  correctTimeEntry,
} from "@db/time-clock";
import { canSeeTeam } from "@domain/team";
import { parseEntryTimes } from "@domain/time-clock";
import { canWrite } from "@domain/view-as";
import { refresh } from "next/cache";
import { z } from "zod";
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
    case "noAccess":
      return "noAccess";
    default:
      return "failed";
  }
}

/**
 * A manager's change to someone's hours. The database checks the actor again
 * and keeps the earlier times in the audit log.
 */
async function asManager(
  values: EntryValues,
  endRequired: boolean,
  run: (
    actorId: string,
    businessId: string,
    times: { clockIn: string; clockOut: string | null },
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

  const result = await run(member.userId, membership.business.id, times);
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
    }),
  );
}
