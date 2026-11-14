import { describe, expect, it } from "vitest";
import {
  accessOrder,
  canGetPersonalPay,
  canGrantPay,
  canSeePay,
  decimalHours,
  defaultPayMonth,
  hasPayRoleStaff,
  overPayHoldersWarning,
  PAY_PERMISSION,
  payHolderCount,
  payMonthFrom,
} from "./payroll-access";

describe("canSeePay", () => {
  it("follows clock.payroll and nothing else", () => {
    expect(PAY_PERMISSION).toBe("clock.payroll");
    expect(canSeePay({ role: "accountant", perms: ["clock.payroll"] })).toBe(
      true,
    );
    expect(canSeePay({ role: "worker", perms: ["clock.payroll"] })).toBe(true);
    // A view as owner holds no pay (my_permissions), so it opens nothing,
    // rather than a screen where every wage reads as missing.
    expect(canSeePay({ role: "owner", perms: ["clock.edit"] })).toBe(false);
    expect(canSeePay({ role: "manager", perms: [] })).toBe(false);
  });
});

describe("canGrantPay", () => {
  it("is the owner's", () => {
    expect(canGrantPay("owner")).toBe(true);
    for (const role of ["manager", "worker", "accountant"] as const) {
      expect(canGrantPay(role)).toBe(false);
    }
  });
});

describe("payHolderCount", () => {
  const people = [
    { userId: "o", role: "owner" as const, personal: false },
    { userId: "a", role: "accountant" as const, personal: false },
    { userId: "m", role: "manager" as const, personal: false },
    { userId: "n", role: "manager" as const, personal: false },
    { userId: "w", role: "worker" as const, personal: true },
    { userId: "v", role: "worker" as const, personal: false },
  ];

  it("counts owners and accountants always, and each holder once", () => {
    expect(payHolderCount(people, [])).toBe(3);
    expect(payHolderCount(people, ["manager"])).toBe(5);
    expect(payHolderCount(people, ["manager", "worker"])).toBe(6);
  });

  it("warns past ten", () => {
    expect(overPayHoldersWarning(10)).toBe(false);
    expect(overPayHoldersWarning(11)).toBe(true);
  });
});

describe("canGetPersonalPay", () => {
  it("offers staff without it, never owners, accountants, the giver or a role that has it", () => {
    const worker = { userId: "w", role: "worker" as const, personal: false };
    expect(canGetPersonalPay(worker, [], "o")).toBe(true);
    expect(canGetPersonalPay(worker, ["worker"], "o")).toBe(false);
    expect(canGetPersonalPay({ ...worker, personal: true }, [], "o")).toBe(
      false,
    );
    expect(canGetPersonalPay(worker, [], "w")).toBe(false);
    expect(canGetPersonalPay({ ...worker, role: "accountant" }, [], "o")).toBe(
      false,
    );
    expect(canGetPersonalPay({ ...worker, role: "owner" }, [], "x")).toBe(
      false,
    );
    expect(canGetPersonalPay({ ...worker, role: "manager" }, [], "o")).toBe(
      true,
    );
  });
});

describe("defaultPayMonth", () => {
  it("opens on the month before until the 10th", () => {
    expect(defaultPayMonth("2026-11-01")).toBe("2026-10");
    expect(defaultPayMonth("2026-11-10")).toBe("2026-10");
    expect(defaultPayMonth("2026-11-11")).toBe("2026-11");
    expect(defaultPayMonth("2027-01-05")).toBe("2026-12");
  });
});

describe("payMonthFrom", () => {
  it("takes a real month up to now, and the default otherwise", () => {
    expect(payMonthFrom("2026-09", "2026-11", "2026-10")).toBe("2026-09");
    expect(payMonthFrom("2026-11", "2026-11", "2026-10")).toBe("2026-11");
    for (const asked of ["2026-12", "2026-13", "26-09", "", undefined, 7]) {
      expect(payMonthFrom(asked, "2026-11", "2026-10")).toBe("2026-10");
    }
  });
});

describe("decimalHours", () => {
  it("writes summed minutes as hours with two decimals", () => {
    expect(decimalHours(10_110)).toBe("168.50");
    expect(decimalHours(0)).toBe("0.00");
    expect(decimalHours(1)).toBe("0.02");
    expect(decimalHours(-5)).toBe("0.00");
  });
});

describe("accessOrder", () => {
  it("lists people by name in Hebrew order, those without one last", () => {
    const people = [
      { name: null },
      { name: "תמר" },
      { name: "אורי" },
      { name: "מאיה" },
    ];
    expect([...people].sort(accessOrder).map((p) => p.name)).toEqual([
      "אורי",
      "מאיה",
      "תמר",
      null,
    ]);
  });
});

describe("hasPayRoleStaff", () => {
  it("is true once a manager or a worker is in the business", () => {
    expect(hasPayRoleStaff([{ role: "manager" }])).toBe(true);
    expect(hasPayRoleStaff([{ role: "owner" }, { role: "worker" }])).toBe(true);
  });

  it("is false with nobody, or only owners and accountants", () => {
    // A business the team has just set up, before anyone joined.
    expect(hasPayRoleStaff([])).toBe(false);
    expect(hasPayRoleStaff([{ role: "owner" }, { role: "accountant" }])).toBe(
      false,
    );
  });
});
