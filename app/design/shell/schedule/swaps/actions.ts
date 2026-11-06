"use server";

import type { DecideState } from "../../../../(app)/schedule/swaps/actions";

// Stand-in for a manager's decision on the design demo: the form must say
// what it decides and about which request, and nothing is stored.
export async function demoDecide(
  _prev: DecideState,
  form: FormData,
): Promise<DecideState> {
  const decision = form.get("decision");
  const ok =
    (decision === "approve" || decision === "decline") &&
    String(form.get("id") ?? "") !== "";
  return ok ? {} : { failure: "failed" };
}
