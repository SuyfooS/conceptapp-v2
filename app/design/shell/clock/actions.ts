"use server";

import { redirect } from "next/navigation";
import type { ClockActionResult } from "../../../(app)/clock/clock-types";

// Stand-ins for the demo's clock: they store nothing and move to the state the
// real action would leave.

const CLOCK = "/design/shell/clock";

export async function demoClockIn(): Promise<ClockActionResult> {
  redirect(`${CLOCK}?state=working`);
}

export async function demoClockOut(): Promise<ClockActionResult> {
  redirect(`${CLOCK}?state=left`);
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
