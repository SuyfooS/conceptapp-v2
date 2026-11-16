import { areaPermissions, matrixByDefault } from "@domain/role-access";
import { permissions } from "@modules/registry";
import { describe, expect, it } from "vitest";
import { rolesData } from "./roles-data";

/**
 * "תפקידים והרשאות" from a business's matrix, as the owner's screen and the
 * console's draw it: the areas whose module is on, each open once every one
 * of its permissions is settable, managers and workers as they hold it, and
 * who is in each role.
 */
const people = [
  { name: "Uri", photo: "/uri.jpg", role: "owner" as const },
  { name: "Shiran", photo: null, role: "manager" as const },
  { name: "Noa", photo: "/noa.jpg", role: "worker" as const },
  { name: "Maya", photo: null, role: "worker" as const },
  { name: "Galit", photo: null, role: "accountant" as const },
];

function matrix(open: readonly string[], payRoles: ("manager" | "worker")[]) {
  const byDefault = matrixByDefault(permissions, payRoles);
  return {
    ...byDefault,
    keys: byDefault.keys.map((key) =>
      open.includes(key.perm) ? { ...key, settable: true } : key,
    ),
  };
}

describe("roles and permissions from the database's answer", () => {
  it("shows the areas whose module is on, open once each permission is", () => {
    const data = rolesData({
      matrix: matrix(areaPermissions("scheduling"), []),
      enabled: ["scheduling", "time_clock"],
      people,
      viewOnly: false,
      documents: false,
    });
    expect(data.areas.map((area) => [area.key, area.open])).toEqual([
      ["scheduling", true],
      ["time_clock", false],
      ["team", false],
      ["manage", false],
    ]);
    expect(data.areas[0]?.icon).not.toBeNull();
    // Team and manage have icons of their own on the screen.
    expect(data.areas[2]?.icon).toBeNull();
  });

  it("draws managers and workers as they hold it, and pay as its row gives it", () => {
    const data = rolesData({
      matrix: matrix([], ["manager"]),
      enabled: ["scheduling", "time_clock", "lists", "chat"],
      people,
      viewOnly: true,
      documents: true,
    });
    const [manager, worker] = data.roles;
    expect(manager?.key).toBe("manager");
    expect(manager?.name).toBeNull();
    expect(manager?.access.levels.scheduling).toBe("edit");
    expect(manager?.access.levels.team).toBe("edit");
    expect(manager?.seesPay).toBe(true);
    expect(worker?.access.levels.scheduling).toBe("view");
    expect(worker?.access.levels.manage).toBe("none");
    expect(worker?.seesPay).toBe(false);
    expect(data.viewOnly).toBe(true);
    expect(data.documents).toBe(true);
  });

  it("puts each person in their role, with their photo", () => {
    const data = rolesData({
      matrix: matrix([], []),
      enabled: [],
      people,
      viewOnly: false,
      documents: false,
    });
    expect(data.owners).toEqual([{ name: "Uri", photo: "/uri.jpg" }]);
    expect(data.roles[0]?.people).toEqual([{ name: "Shiran", photo: null }]);
    expect(data.roles[1]?.people).toEqual([
      { name: "Noa", photo: "/noa.jpg" },
      { name: "Maya", photo: null },
    ]);
    expect(data.accountants).toEqual([{ name: "Galit", photo: null }]);
    // With no module on, only the team and the management page.
    expect(data.areas.map((area) => area.key)).toEqual(["team", "manage"]);
  });
});

describe("roles the business named (R11a)", () => {
  const LEAD = "a1000000-0000-4000-a000-0000000000c1";
  const lead = {
    id: LEAD,
    name: "Shift lead",
    nameEn: "Shift lead (en)",
    base: "worker" as const,
    byDefault: new Set<string>(),
    given: new Set(["schedule.edit", "clock.payroll"]),
    held: new Set(["schedule.edit", "clock.payroll"]),
  };

  it("come after managers and workers, as they hold it, never pay, with whoever holds them", () => {
    const data = rolesData({
      matrix: { ...matrix([], []), named: [lead], addsRoles: true },
      enabled: ["scheduling"],
      people: [
        ...people,
        {
          name: "Yoav",
          photo: null,
          role: "worker" as const,
          namedRole: LEAD,
        },
      ],
      viewOnly: false,
      documents: false,
    });
    expect(data.roles.map((role) => role.key)).toEqual([
      "manager",
      "worker",
      LEAD,
    ]);
    const named = data.roles[2];
    expect(named).toMatchObject({
      base: "worker",
      name: "Shift lead",
      nameEn: "Shift lead (en)",
      people: [{ name: "Yoav", photo: null }],
      seesPay: false,
    });
    expect(named?.access.levels.scheduling).toBe("edit");
    // Someone in a named role counts there, not in the role it is built on.
    expect(data.roles[1]?.people).toEqual([
      { name: "Noa", photo: "/noa.jpg" },
      { name: "Maya", photo: null },
    ]);
  });

  it("show nobody in them until someone holds them", () => {
    const data = rolesData({
      matrix: { ...matrix([], []), named: [lead], addsRoles: true },
      enabled: [],
      people,
      viewOnly: false,
      documents: false,
    });
    expect(data.roles[2]?.people).toEqual([]);
    expect(data.roles.map((role) => role.invited)).toEqual([0, 0, 0]);
  });

  it("count the open invites waiting for each (R11b)", () => {
    const data = rolesData({
      matrix: { ...matrix([], []), named: [lead], addsRoles: true },
      enabled: [],
      people,
      invites: new Map([
        [LEAD, 2],
        ["another-business-role", 1],
      ]),
      viewOnly: false,
      documents: false,
    });
    expect(data.roles.map((role) => [role.key, role.invited])).toEqual([
      ["manager", 0],
      ["worker", 0],
      [LEAD, 2],
    ]);
    expect(data.roles[2]?.people).toEqual([]);
  });
});
