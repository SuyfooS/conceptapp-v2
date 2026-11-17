"use server";

import { parseEntryTimes, parseReason } from "@domain/time-clock";
import type {
  EntryActionResult,
  EntryValues,
} from "../../../../(app)/clock/team/team-types";
import { DEMO_OVERLAPPING_COPY } from "./data";

// Stand-ins for the demo: the same checks on what was typed, nothing stored.

function check(values: EntryValues, endRequired: boolean): EntryActionResult {
  const times = parseEntryTimes(values, "Asia/Jerusalem", new Date(), {
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
