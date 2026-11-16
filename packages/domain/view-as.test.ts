import { describe, expect, it } from "vitest";
import type { NamedRole } from "./role-access";
import {
  canWrite,
  parseViewAsChoice,
  parseViewAsRole,
  readViewAsChoice,
  VIEW_AS_ROLES,
  viewAsChoices,
  viewAsFailureOf,
  viewAsKey,
} from "./view-as";

const shiftLead: NamedRole = {
  id: "a3000000-0000-4000-8000-000000000001",
  name: "אחראי משמרת",
  nameEn: "Shift lead",
  base: "worker",
};
const floorManager: NamedRole = {
  id: "a3000000-0000-4000-8000-000000000002",
  name: "מנהל רצפה",
  nameEn: null,
  base: "manager",
};
const barLead: NamedRole = {
  id: "a3000000-0000-4000-8000-000000000003",
  name: "אחראי בר",
  nameEn: null,
  base: "worker",
};

describe("parseViewAsRole", () => {
  it.each(VIEW_AS_ROLES)("accepts %s", (role) => {
    expect(parseViewAsRole(role)).toBe(role);
  });

  it.each(["", "admin", "platform_admin", "Owner", null, undefined, 3])(
    "refuses %s",
    (value) => {
      expect(parseViewAsRole(value)).toBeNull();
    },
  );
});

describe("viewAsChoices", () => {
  it("is the built-in roles alone in a business with no named role", () => {
    expect(viewAsChoices([])).toEqual(
      VIEW_AS_ROLES.map((role) => ({ role, namedRole: null })),
    );
  });

  it("puts each named role after its base, in the business's order", () => {
    expect(
      viewAsChoices([shiftLead, floorManager, barLead]).map(viewAsKey),
    ).toEqual([
      "owner",
      "manager",
      floorManager.id,
      "worker",
      shiftLead.id,
      barLead.id,
      "accountant",
    ]);
    // A named role is viewed on its base.
    expect(viewAsChoices([shiftLead])[3]).toEqual({
      role: "worker",
      namedRole: shiftLead,
    });
  });
});

describe("parseViewAsChoice", () => {
  const named = [shiftLead, floorManager];

  it.each(VIEW_AS_ROLES)("reads the built-in %s", (role) => {
    expect(parseViewAsChoice(role, named)).toEqual({ role, namedRole: null });
  });

  it("reads a live named role by its id, on its base", () => {
    expect(parseViewAsChoice(shiftLead.id, named)).toEqual({
      role: "worker",
      namedRole: shiftLead,
    });
    expect(parseViewAsChoice(floorManager.id, named)).toEqual({
      role: "manager",
      namedRole: floorManager,
    });
  });

  it.each([
    ["a role not among the business's", barLead.id],
    ["a role's name", shiftLead.name],
    ["nothing", ""],
    ["a number", 3],
    ["none", null],
  ])("refuses %s", (_what, value) => {
    expect(parseViewAsChoice(value, named)).toBeNull();
  });
});

describe("readViewAsChoice", () => {
  const named = [shiftLead, floorManager];

  it("reads a built-in role and a live named role as parseViewAsChoice does", () => {
    expect(readViewAsChoice("worker", [])).toEqual({
      role: "worker",
      namedRole: null,
    });
    expect(readViewAsChoice(floorManager.id, named)).toEqual({
      role: "manager",
      namedRole: floorManager,
    });
  });

  it("says a role's id no longer among the live ones is gone", () => {
    // Archived since the page was drawn: the page says so.
    expect(readViewAsChoice(barLead.id, named)).toBe("gone");
    expect(readViewAsChoice(shiftLead.id, [])).toBe("gone");
  });

  it.each([
    ["a role's name", shiftLead.name],
    ["something else", "admin"],
    ["nothing", ""],
    ["a number", 3],
    ["none", null],
  ])("refuses %s", (_what, value) => {
    expect(readViewAsChoice(value, named)).toBeNull();
  });
});

describe("viewAsFailureOf", () => {
  it("reads the two failures and nothing else", () => {
    expect(viewAsFailureOf("failed")).toBe("failed");
    expect(viewAsFailureOf("roleGone")).toBe("roleGone");
    expect(viewAsFailureOf("1")).toBeNull();
    expect(viewAsFailureOf(undefined)).toBeNull();
    expect(viewAsFailureOf(["failed"])).toBeNull();
  });
});

describe("canWrite", () => {
  it("allows writes outside a view session", () => {
    expect(canWrite(null)).toBe(true);
  });

  it.each(VIEW_AS_ROLES)("refuses writes while viewing as %s", (role) => {
    expect(
      canWrite({ role, namedRole: null, businessSlug: "demo-restaurant" }),
    ).toBe(false);
  });

  it("refuses writes while viewing as a named role", () => {
    expect(
      canWrite({
        role: "worker",
        namedRole: shiftLead,
        businessSlug: "demo-shop",
      }),
    ).toBe(false);
  });
});
