"use server";

import {
  type ClockResult,
  endBreak,
  punch,
  startBreak,
  undoClockOut,
} from "@db/time-clock";
import { type PunchProof, punchProof } from "@domain/punch-code";
import { punchFailureOf } from "@domain/time-clock";
import { canWrite } from "@domain/view-as";
import { refresh } from "next/cache";
import { z } from "zod";
import { currentMember } from "../member";
import type { ClockActionResult } from "./clock-types";

/**
 * Run a clock write as the signed-in person. The database holds the rules. The
 * screen re-reads afterwards in any case, so a refusal because the state moved
 * on (another device, say, or the owner asking for a code since) also shows
 * where things really stand. `proof` is how a punch was proved, null for a
 * break and taking a clock-out back; `done` says what went through.
 */
async function asMember<T>(
  proof: PunchProof["kind"] | null,
  run: (actorId: string, businessId: string) => Promise<ClockResult<T>>,
  done: (value: T) => ClockActionResult = () => ({ ok: true }),
): Promise<ClockActionResult> {
  const member = await currentMember();
  const businessId = member?.membership?.business.id;
  if (!member || !businessId) return { ok: false, failure: "noAccess" };
  if (!canWrite(member.viewing)) return { ok: false, failure: "viewOnly" };
  const result = await run(member.userId, businessId);
  refresh();
  return result.ok
    ? done(result.value)
    : { ok: false, failure: punchFailureOf(result.failure, proof) };
}

/**
 * A punch, with how it was proved: checked here, then by the database. What
 * the database recorded says whether the time waits for a manager, since the
 * owner may have switched codes off since the page loaded.
 */
function punchAs(
  direction: "in" | "out",
  proof: unknown,
): Promise<ClockActionResult> {
  const parsed = punchProof.safeParse(proof);
  if (!parsed.success) return Promise.resolve({ ok: false, failure: "failed" });
  return asMember(
    parsed.data.kind,
    (actor, business) => punch(direction, actor, business, parsed.data),
    (punched) => ({
      ok: true,
      marked:
        punched.proof === null
          ? parsed.data.kind === "none"
          : punched.proof === "none",
    }),
  );
}

export async function clockInAction(
  proof: unknown,
): Promise<ClockActionResult> {
  return punchAs("in", proof);
}

export async function clockOutAction(
  proof: unknown,
): Promise<ClockActionResult> {
  return punchAs("out", proof);
}

export async function startBreakAction(): Promise<ClockActionResult> {
  return asMember(null, startBreak);
}

export async function endBreakAction(): Promise<ClockActionResult> {
  return asMember(null, endBreak);
}

export async function undoClockOutAction(
  entryId: string,
): Promise<ClockActionResult> {
  const entry = z.uuid().safeParse(entryId);
  if (!entry.success) return { ok: false, failure: "failed" };
  return asMember(null, (actor) => undoClockOut(actor, entry.data));
}
