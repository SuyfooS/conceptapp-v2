/**
 * The time the test business may add to CI's database job (the plan's
 * sections 0 and 4): one added test file, so one budget for the file, both
 * sizes together, never one for each. A target of 15 seconds; past 30 a
 * warning; past 60 a failure, since all six e2e shards wait on that job.
 */
export const BUDGET = {
  targetMs: 15_000,
  warnMs: 30_000,
  failMs: 60_000,
} as const;

export type Verdict = "on target" | "over target" | "warn" | "fail";

/** The sizes' times added up, and where the sum stands against the budget. */
export function budgetOf(times: readonly { ms: number }[]): {
  ms: number;
  verdict: Verdict;
} {
  const ms = times.reduce((sum, t) => sum + t.ms, 0);
  const verdict: Verdict =
    ms > BUDGET.failMs
      ? "fail"
      : ms > BUDGET.warnMs
        ? "warn"
        : ms > BUDGET.targetMs
          ? "over target"
          : "on target";
  return { ms, verdict };
}
