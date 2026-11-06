"use server";

import type { SwapState } from "../../../../(app)/schedule/shifts/actions";

// Stand-in for a swap step on the design demo: the form must say what it
// asks for and about which shift or request, and nothing is stored.
export async function demoSwap(
  _prev: SwapState,
  form: FormData,
): Promise<SwapState> {
  const intent = form.get("intent");
  const ok =
    (intent === "give" || intent === "cancel" || intent === "take") &&
    String(form.get("id") ?? "") !== "";
  return ok ? {} : { failure: "failed" };
}
