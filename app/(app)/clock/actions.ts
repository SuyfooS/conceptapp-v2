"use server";

import {
  type ClockResult,
  clockIn,
  clockOut,
  endBreak,
  startBreak,
  undoClockOut,
} from "@db/time-clock";
import { canWrite } from "@domain/view-as";
import { refresh } from "next/cache";
import { z } from "zod";
import { currentMember } from "../member";
import type { ClockActionResult } from "./clock-types";

/**
 * Run a clock write as the signed-in person. The database holds the rules. The
 * screen re-reads afterwards in any case, so a refusal because the state moved
 * on (another device, say) also shows where things really stand.
 */
async function asMember(
  run: (actorId: string, businessId: string) => Promise<ClockResult<unknown>>,
): Promise<ClockActionResult> {
  const member = await currentMember();
  const businessId = member?.membership?.business.id;
  if (!member || !businessId) return { ok: false, failure: "noAccess" };
  if (!canWrite(member.viewing)) return { ok: false, failure: "viewOnly" };
  const result = await run(member.userId, businessId);
  refresh();
  return result.ok ? { ok: true } : { ok: false, failure: result.failure };
}

export async function clockInAction(): Promise<ClockActionResult> {
  return asMember((actor, business) => clockIn(actor, business, null));
}

export async function clockOutAction(): Promise<ClockActionResult> {
  return asMember((actor, business) => clockOut(actor, business, null));
}

export async function startBreakAction(): Promise<ClockActionResult> {
  return asMember(startBreak);
}

export async function endBreakAction(): Promise<ClockActionResult> {
  return asMember(endBreak);
}

export async function undoClockOutAction(
  entryId: string,
): Promise<ClockActionResult> {
  const entry = z.uuid().safeParse(entryId);
  if (!entry.success) return { ok: false, failure: "failed" };
  return asMember((actor) => undoClockOut(actor, entry.data));
}
