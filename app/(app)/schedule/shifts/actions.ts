"use server";

import { cancelShiftSwap, requestShiftSwap, takeShiftSwap } from "@db/swaps";
import type { SwapFailure } from "@domain/swaps";
import { canWrite } from "@domain/view-as";
import { refresh } from "next/cache";
import { currentMember } from "../../member";
import { currentPublishedSchedule } from "../week";

export type SwapIntent = "give" | "cancel" | "take";
export type SwapState = { failure?: SwapFailure };

const intentOf = (value: unknown): SwapIntent | null =>
  value === "give" || value === "cancel" || value === "take" ? value : null;

/**
 * One step of a shift swap for the signed-in person: give away one of
 * their published shifts (`id` is the shift), withdraw their request, or
 * take a colleague's (`id` is the request). The database checks every
 * rule; nothing changes while viewing as someone else.
 */
export async function swapAction(
  _prev: SwapState,
  form: FormData,
): Promise<SwapState> {
  const [member, schedule] = await Promise.all([
    currentMember(),
    currentPublishedSchedule(),
  ]);
  if (!member || !schedule) return { failure: "noAccess" };
  if (!canWrite(member.viewing)) return { failure: "viewOnly" };
  const intent = intentOf(form.get("intent"));
  const id = String(form.get("id") ?? "");
  if (!intent || !id) return { failure: "failed" };

  const run =
    intent === "give"
      ? requestShiftSwap
      : intent === "cancel"
        ? cancelShiftSwap
        : takeShiftSwap;
  const result = await run(member.userId, id);
  if (!result.ok) return { failure: result.failure };
  // The screen re-reads the requests.
  refresh();
  return {};
}
