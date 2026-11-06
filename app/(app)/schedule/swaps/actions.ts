"use server";

import { decideShiftSwap } from "@db/swaps";
import type { SwapFailure } from "@domain/swaps";
import { canSeeTeam } from "@domain/team";
import { canWrite } from "@domain/view-as";
import { refresh } from "next/cache";
import { currentMember } from "../../member";

export type DecideState = { failure?: SwapFailure };

/**
 * A manager or owner approves or declines a request a colleague took
 * (`id` is the request, `decision` is "approve" or "decline"). The
 * database checks every rule again; nothing changes while viewing as
 * someone else.
 */
export async function decideSwapAction(
  _prev: DecideState,
  form: FormData,
): Promise<DecideState> {
  const member = await currentMember();
  const role = member?.membership?.role;
  if (!member || !role || !canSeeTeam(role)) return { failure: "noAccess" };
  if (!canWrite(member.viewing)) return { failure: "viewOnly" };
  const decision = form.get("decision");
  const id = String(form.get("id") ?? "");
  if ((decision !== "approve" && decision !== "decline") || !id) {
    return { failure: "failed" };
  }
  const result = await decideShiftSwap(
    member.userId,
    id,
    decision === "approve",
  );
  if (!result.ok) return { failure: result.failure };
  // The screen re-reads the requests and the schedule.
  refresh();
  return {};
}
