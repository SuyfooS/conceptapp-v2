import { describe, expect, it } from "vitest";
import type { Role } from "./modules";
import {
  accessOrder,
  canGetPersonalPay,
  canGrantPay,
  canSeePay,
  coveredByRole,
  decimalHours,
  defaultPayMonth,
  hasPayRoleStaff,
  namedOnPayRole,
  namedRolesBesidePay,
  overPayHoldersWarning,
  PAY_PERMISSION,
  type PayHolderCandidate,
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

/** Someone as the access screen counts them, in their role as it is. */
const person = (
  userId: string,
  role: Role,
  personal = false,
): PayHolderCandidate => ({ userId, role, namedRole: null, personal });

/** Roles the business named (the roles plan's R11b), by their ids: one on managers, one on workers. */
const SHIFT_LEAD = { id: "93000000-0000-4000-a000-000000000001" };
const BAR_LEAD = { id: "93000000-0000-4000-a000-000000000002" };

describe("payHolderCount", () => {
  const people = [
    person("o", "owner"),
    person("a", "accountant"),
    person("m", "manager"),
    person("n", "manager"),
    person("w", "worker", true),
    person("v", "worker"),
  ];

  it("counts owners and accountants always, and each holder once", () => {
    expect(payHolderCount(people, [])).toBe(3);
    expect(payHolderCount(people, ["manager"])).toBe(5);
    expect(payHolderCount(people, ["manager", "worker"])).toBe(6);
  });

  it("counts someone in a role the business named only by their own access, once", () => {
    // A shift lead on managers, where managers see pay: not by the role.
    const lead = { ...person("l", "manager"), namedRole: SHIFT_LEAD };
    expect(payHolderCount([...people, lead], ["manager"])).toBe(5);
    expect(payHolderCount([...people, lead], ["manager", "worker"])).toBe(6);
    // Given it themselves: counted, and once, whatever their base gets.
    const given = { ...lead, personal: true };
    expect(payHolderCount([...people, given], [])).toBe(4);
    expect(payHolderCount([...people, given], ["manager"])).toBe(6);
  });

  it("warns past ten", () => {
    expect(overPayHoldersWarning(10)).toBe(false);
    expect(overPayHoldersWarning(11)).toBe(true);
  });
});

describe("coveredByRole", () => {
  it("is a role given pay, held as it is, never a role the business named", () => {
    expect(coveredByRole(person("m", "manager"), ["manager"])).toBe(true);
    expect(coveredByRole(person("m", "manager"), ["worker"])).toBe(false);
    expect(coveredByRole(person("w", "worker"), [])).toBe(false);
    // Built on managers, where managers see pay: their role doesn't.
    const lead = { ...person("l", "manager"), namedRole: SHIFT_LEAD };
    expect(coveredByRole(lead, ["manager"])).toBe(false);
    expect(coveredByRole(lead, ["manager", "worker"])).toBe(false);
  });
});

describe("namedOnPayRole", () => {
  it("is a role the business named on a role given pay, by the role or its id", () => {
    const lead = { ...person("l", "manager"), namedRole: SHIFT_LEAD };
    expect(namedOnPayRole(lead, ["manager"])).toBe(true);
    expect(namedOnPayRole(lead, ["worker"])).toBe(false);
    expect(namedOnPayRole(person("m", "manager"), ["manager"])).toBe(false);
    // A role choice, as the team's role sheet has it.
    const choice = { role: "worker", namedRole: BAR_LEAD.id } as const;
    expect(namedOnPayRole(choice, ["worker"])).toBe(true);
    expect(namedOnPayRole(choice, [])).toBe(false);
    expect(
      namedOnPayRole({ role: "worker", namedRole: null }, ["worker"]),
    ).toBe(false);
  });
});

describe("namedRolesBesidePay", () => {
  it("names each role the business named on a role given pay once, with its base", () => {
    const lead = { ...person("l", "manager"), namedRole: SHIFT_LEAD };
    const lead2 = { ...person("k", "manager"), namedRole: SHIFT_LEAD };
    const barLead = { ...person("b", "worker", true), namedRole: BAR_LEAD };
    const people = [
      person("o", "owner"),
      person("m", "manager"),
      lead,
      lead2,
      person("w", "worker"),
      barLead,
    ];
    expect(namedRolesBesidePay(people, [])).toEqual([]);
    expect(namedRolesBesidePay(people, ["manager"])).toEqual([
      { namedRole: SHIFT_LEAD, base: "manager" },
    ]);
    expect(namedRolesBesidePay(people, ["manager", "worker"])).toEqual([
      { namedRole: SHIFT_LEAD, base: "manager" },
      { namedRole: BAR_LEAD, base: "worker" },
    ]);
    expect(namedRolesBesidePay([person("m", "manager")], ["manager"])).toEqual(
      [],
    );
  });
});

describe("canGetPersonalPay", () => {
  it("offers someone in a role the business named, even where their base sees pay", () => {
    const lead = { ...person("l", "manager"), namedRole: SHIFT_LEAD };
    expect(canGetPersonalPay(lead, ["manager"], "o")).toBe(true);
    expect(canGetPersonalPay(lead, [], "o")).toBe(true);
    expect(
      canGetPersonalPay({ ...lead, personal: true }, ["manager"], "o"),
    ).toBe(false);
    expect(canGetPersonalPay(lead, ["manager"], "l")).toBe(false);
    // Someone in the base role itself is still covered by it.
    expect(canGetPersonalPay(person("m", "manager"), ["manager"], "o")).toBe(
      false,
    );
  });

  it("offers staff without it, never owners, accountants, the giver or a role that has it", () => {
    const worker = person("w", "worker");
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
