"use server";

import { decideShiftSwap } from "@db/swaps";
import { buildsSchedule } from "@domain/schedule";
import type { SwapFailure } from "@domain/swaps";
import { canWrite } from "@domain/view-as";
import { refresh } from "next/cache";
import { pushSoon } from "../../../push/server";
import { currentMember } from "../../member";

export type DecideState = { failure?: SwapFailure };

/**
 * Whoever builds the schedule (`buildsSchedule`: Orel's answer 6 of 15
 * November 2026) approves or declines a request a colleague took (`id` is
 * the request, `decision` is "approve" or "decline"). The database checks
 * every rule again; nothing changes while viewing as someone else.
 */
export async function decideSwapAction(
  _prev: DecideState,
  form: FormData,
): Promise<DecideState> {
  const member = await currentMember();
  const membership = member?.membership;
  if (!member || !membership || !buildsSchedule(membership)) {
    return { failure: "noAccess" };
  }
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
  // Both people hear the decision, on their phones too.
  pushSoon();
  // The screen re-reads the requests and the schedule.
  refresh();
  return {};
}
