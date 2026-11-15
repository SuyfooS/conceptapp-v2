import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineManifest } from "./modules";
import {
  CORE_PERMISSIONS,
  declaredPermissions,
  type PermissionEntry,
  permissionsByDefault,
} from "./permissions";

// Fixtures, independent of the real manifests in modules/.
const scheduling = defineManifest({
  key: "scheduling",
  requires: [],
  nav: null,
  homeWidget: null,
  permissions: [
    { key: "schedule.edit", area: "scheduling", defaultRole: "manager" },
    {
      key: "schedule.publish",
      area: "scheduling",
      defaultRole: "manager",
      requires: "schedule.edit",
    },
  ],
  settings: z.object({}),
});
const clock = defineManifest({
  key: "time_clock",
  requires: [],
  nav: null,
  homeWidget: null,
  permissions: [
    {
      key: "clock.payroll",
      area: "time_clock",
      defaultRole: "owner",
      byOwner: true,
    },
  ],
  settings: z.object({}),
});
const reservations = defineManifest({
  key: "reservations",
  requires: [],
  nav: null,
  homeWidget: null,
  permissions: [
    { key: "reservations.edit", area: "reservations", defaultRole: "worker" },
  ],
  settings: z.object({}),
});
const catalogue = declaredPermissions([scheduling, clock, reservations]);
const core = CORE_PERMISSIONS.map((p) => p.key);

describe("declaredPermissions", () => {
  it("lists the manifests' permissions with their module, then the core ones", () => {
    expect(catalogue.map((p) => [p.key, p.module, p.area])).toEqual([
      ["schedule.edit", "scheduling", "scheduling"],
      ["schedule.publish", "scheduling", "scheduling"],
      ["clock.payroll", "time_clock", "time_clock"],
      ["reservations.edit", "reservations", "reservations"],
      ["team.view", null, "team"],
      ["team.edit", null, "team"],
      ["manage.view", null, "manage"],
      ["manage.edit", null, "manage"],
    ]);
  });

  it("gives each the default roles the database keeps, what it requires and whether owners switch it", () => {
    const byKey = new Map(catalogue.map((p) => [p.key, p]));
    expect(byKey.get("schedule.publish")).toEqual({
      key: "schedule.publish",
      module: "scheduling",
      area: "scheduling",
      defaultRoles: ["manager"],
      byOwner: false,
      requires: "schedule.edit",
      settable: false,
    });
    // A minimum: "worker" is managers and workers; never the owner, who
    // holds every key, and none for one an owner gives.
    expect(byKey.get("reservations.edit")?.defaultRoles).toEqual([
      "manager",
      "worker",
    ]);
    expect(byKey.get("clock.payroll")).toMatchObject({
      defaultRoles: [],
      byOwner: true,
      requires: null,
    });
    expect(byKey.get("team.edit")).toMatchObject({
      defaultRoles: ["manager"],
      requires: "team.view",
    });
    expect(catalogue.every((p) => !p.settable)).toBe(true);
  });
});

describe("permissionsByDefault", () => {
  const member = (role: PermissionEntry["defaultRoles"][number] | "owner") => ({
    role,
    given: [],
    viewing: false,
  });

  it("gives an owner every key, and an owner's view every key but one an owner gives", () => {
    expect(permissionsByDefault(catalogue, member("owner"))).toEqual(
      catalogue.map((p) => p.key).sort(),
    );
    expect(
      permissionsByDefault(catalogue, {
        role: "owner",
        given: [],
        viewing: true,
      }),
    ).not.toContain("clock.payroll");
  });

  it("gives an accountant, and a view as one, only what accountants hold", () => {
    for (const viewing of [false, true]) {
      expect(
        permissionsByDefault(catalogue, {
          role: "accountant",
          given: ["reservations.edit"],
          viewing,
        }),
      ).toEqual(["clock.payroll"]);
    }
  });

  it("gives the staff their role's defaults, core ones included, and never pay by role", () => {
    expect(permissionsByDefault(catalogue, member("manager"))).toEqual(
      [
        "reservations.edit",
        "schedule.edit",
        "schedule.publish",
        ...core,
      ].sort(),
    );
    expect(permissionsByDefault(catalogue, member("worker"))).toEqual([
      "reservations.edit",
    ]);
  });

  it("adds what was given, as it was given, whatever it requires", () => {
    expect(
      permissionsByDefault(catalogue, {
        role: "worker",
        given: ["schedule.publish", "clock.payroll", "billing.manage"],
        viewing: false,
      }),
    ).toEqual([
      "billing.manage",
      "clock.payroll",
      "reservations.edit",
      "schedule.publish",
    ]);
  });

  it("gives a view nothing of its own", () => {
    expect(
      permissionsByDefault(catalogue, {
        role: "worker",
        given: ["schedule.edit"],
        viewing: true,
      }),
    ).toEqual(["reservations.edit"]);
  });

  it("holds a key by role only with what it requires, held either way", () => {
    // A key workers hold by default that needs one only managers do.
    const needs: PermissionEntry[] = [
      ...catalogue,
      {
        key: "schedule.swaps",
        module: "scheduling",
        area: "scheduling",
        defaultRoles: ["manager", "worker"],
        byOwner: false,
        requires: "schedule.edit",
        settable: false,
      },
    ];
    expect(permissionsByDefault(needs, member("worker"))).not.toContain(
      "schedule.swaps",
    );
    expect(
      permissionsByDefault(needs, {
        role: "worker",
        given: ["schedule.edit"],
        viewing: false,
      }),
    ).toContain("schedule.swaps");
    expect(permissionsByDefault(needs, member("manager"))).toContain(
      "schedule.swaps",
    );
  });

  it("holds nothing down a chain that loops", () => {
    const loop: PermissionEntry[] = [
      {
        key: "a.one",
        module: null,
        area: "team",
        defaultRoles: ["manager"],
        byOwner: false,
        requires: "a.two",
        settable: false,
      },
      {
        key: "a.two",
        module: null,
        area: "team",
        defaultRoles: ["manager"],
        byOwner: false,
        requires: "a.one",
        settable: false,
      },
    ];
    expect(permissionsByDefault(loop, member("manager"))).toEqual([]);
  });
});
