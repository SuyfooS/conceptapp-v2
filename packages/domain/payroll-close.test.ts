import { describe, expect, it } from "vitest";
import { ROLES } from "./modules";
import { closeFailureOf, closesMonths, monthEnded } from "./payroll-close";

describe("closing a month", () => {
  it("is the owner's or an accountant's, never another pay holder's", () => {
    expect(ROLES.filter(closesMonths)).toEqual(["owner", "accountant"]);
  });

  it("is only for a month that has ended", () => {
    expect(monthEnded("2026-10", "2026-11")).toBe(true);
    expect(monthEnded("2025-12", "2026-01")).toBe(true);
    expect(monthEnded("2026-11", "2026-11")).toBe(false);
    expect(monthEnded("2026-12", "2026-11")).toBe(false);
  });

  it("reads the database's refusals in the screen's terms", () => {
    expect(closeFailureOf("42501")).toBe("noAccess");
    expect(closeFailureOf("23505")).toBe("closed");
    expect(closeFailureOf("P0002")).toBe("notClosed");
    expect(closeFailureOf("22023", "The month has not ended yet")).toBe(
      "notEnded",
    );
    expect(closeFailureOf("22023", "Reopening a month needs its reason")).toBe(
      "reasonNeeded",
    );
    expect(closeFailureOf("22023", "Say which month")).toBe("failed");
    expect(closeFailureOf(undefined)).toBe("failed");
  });
});
