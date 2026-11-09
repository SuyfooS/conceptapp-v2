"use server";

import { parseEntryTimes } from "@domain/time-clock";
import type {
  EntryActionResult,
  EntryValues,
} from "../../../../(app)/clock/team/team-types";

// Stand-ins for the demo: the same checks on what was typed, nothing stored.

function check(values: EntryValues, endRequired: boolean): EntryActionResult {
  const times = parseEntryTimes(values, "Asia/Jerusalem", new Date(), {
    endRequired,
  });
  return times.ok ? { ok: true } : { ok: false, failure: times.problem };
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
