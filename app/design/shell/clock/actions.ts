"use server";

import type { PunchProof } from "@domain/punch-code-format";
import { redirect } from "next/navigation";
import type { ClockActionResult } from "../../../(app)/clock/clock-types";

// Stand-ins for the demo's clock: they store nothing and move to the state the
// real action would leave. With a code asked for (?code=on), "000000" stands
// for wrong digits; any others pass, and so does any clock code the camera
// reads, since the demo's code screen makes codes that nothing keeps.

const CLOCK = "/design/shell/clock";

/** The state to move to, keeping the demo's code mode when it was on. */
const to = (state: string, proof: PunchProof) =>
  `${CLOCK}?state=${state}${proof.kind === "plain" ? "" : "&code=on"}`;

function refused(proof: PunchProof): ClockActionResult | null {
  return proof.kind === "typed" && proof.digits === "000000"
    ? { ok: false, failure: "code" }
    : null;
}

export async function demoClockIn(
  proof: PunchProof,
): Promise<ClockActionResult> {
  const no = refused(proof);
  if (no) return no;
  redirect(to("working", proof));
}

export async function demoClockOut(
  proof: PunchProof,
): Promise<ClockActionResult> {
  const no = refused(proof);
  if (no) return no;
  redirect(to("left", proof));
}

export async function demoStartBreak(): Promise<ClockActionResult> {
  redirect(`${CLOCK}?state=break`);
}

export async function demoEndBreak(): Promise<ClockActionResult> {
  redirect(`${CLOCK}?state=working`);
}

export async function demoUndoClockOut(): Promise<ClockActionResult> {
  redirect(`${CLOCK}?state=working`);
}
