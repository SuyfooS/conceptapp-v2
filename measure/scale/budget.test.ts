import { describe, expect, it } from "vitest";
import { BUDGET, budgetOf } from "./budget";

const s = (seconds: number) => ({ ms: seconds * 1000 });

describe("the database job's budget for the test business", () => {
  it("is the file's: both sizes are added up before the budget is read", () => {
    // Each size under the warning alone, together past it.
    expect(budgetOf([s(25), s(25)])).toEqual({ ms: 50_000, verdict: "warn" });
    // Each just under the failure alone, together far past it.
    expect(budgetOf([s(59), s(59)]).verdict).toBe("fail");
    // Each under the target alone, together over it.
    expect(budgetOf([s(10), s(10)]).verdict).toBe("over target");
    expect(budgetOf([s(6), s(8)]).verdict).toBe("on target");
  });

  it("warns only past 30 seconds and fails only past 60", () => {
    expect(BUDGET).toEqual({
      targetMs: 15_000,
      warnMs: 30_000,
      failMs: 60_000,
    });
    expect(budgetOf([s(30)]).verdict).toBe("over target");
    expect(budgetOf([s(30.1)]).verdict).toBe("warn");
    expect(budgetOf([s(60)]).verdict).toBe("warn");
    expect(budgetOf([s(60.1)]).verdict).toBe("fail");
    expect(budgetOf([]).verdict).toBe("on target");
  });
});
