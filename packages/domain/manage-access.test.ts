import { describe, expect, it } from "vitest";
import {
  LOG_AREA_PERMISSIONS,
  MANAGE_EDIT,
  MANAGE_VIEW,
  manageReach,
  manageReadOnly,
  readsEveryLogArea,
  settingsPermission,
} from "./manage-access";
import { MODULE_KEYS } from "./modules";
import { AREA_EDIT } from "./role-access";

// A manager on today's rules, as public.my_permissions answers them.
const MANAGER = [
  "chat.announce",
  "chat.moderate",
  "chat.send_documents",
  "clock.edit",
  "lists.manage",
  "lists.send",
  "manage.edit",
  "manage.view",
  "reservations.edit",
  "schedule.edit",
  "schedule.publish",
  "storefront.edit",
  "team.edit",
  "team.view",
];

describe("manageReach", () => {
  it("is today's rule on the defaults: owners and managers edit, workers and accountants reach nothing", () => {
    expect(manageReach({ role: "owner", perms: [] })).toBe("edit");
    expect(manageReach({ role: "manager", perms: MANAGER })).toBe("edit");
    expect(manageReach({ role: "worker", perms: ["reservations.edit"] })).toBe(
      null,
    );
    expect(manageReach({ role: "accountant", perms: ["clock.payroll"] })).toBe(
      null,
    );
  });

  it("follows the permissions, not the role", () => {
    // A worker raised to view, then to edit; a manager lowered to view and
    // to none.
    expect(manageReach({ role: "worker", perms: [MANAGE_VIEW] })).toBe("view");
    expect(
      manageReach({ role: "worker", perms: [MANAGE_VIEW, MANAGE_EDIT] }),
    ).toBe("edit");
    const lowered = MANAGER.filter((key) => key !== MANAGE_EDIT);
    expect(manageReach({ role: "manager", perms: lowered })).toBe("view");
    expect(
      manageReach({
        role: "manager",
        perms: lowered.filter((key) => key !== MANAGE_VIEW),
      }),
    ).toBe(null);
  });
});

describe("settingsPermission", () => {
  it("is each module's own edit, as the roles screen draws its area", () => {
    expect(settingsPermission("scheduling")).toBe("schedule.edit");
    expect(settingsPermission("time_clock")).toBe("clock.edit");
    expect(settingsPermission("lists")).toBe("lists.manage");
    expect(settingsPermission("chat")).toBe("chat.moderate");
    const byArea: Partial<Record<string, string>> = AREA_EDIT;
    for (const module of MODULE_KEYS) {
      expect(settingsPermission(module)).toBe(byArea[module] ?? null);
    }
  });

  it("is none for a module without an area of its own", () => {
    expect(settingsPermission("notifications")).toBe(null);
    expect(settingsPermission("reservations")).toBe(null);
    expect(settingsPermission("storefront")).toBe(null);
  });
});

describe("manageReadOnly", () => {
  it("saves at edit, and a module's settings with its own edit too", () => {
    const viewer = { role: "manager" as const, perms: MANAGER };
    expect(manageReadOnly(viewer, false)).toBe(null);
    expect(manageReadOnly(viewer, false, "scheduling")).toBe(null);
    expect(manageReadOnly(viewer, false, "notifications")).toBe(null);
    expect(manageReadOnly({ role: "owner", perms: [] }, false, "chat")).toBe(
      null,
    );
  });

  it("says why it doesn't: a view, the role at view, or the module's edit missing", () => {
    const manager = { role: "manager" as const, perms: MANAGER };
    expect(manageReadOnly(manager, true)).toBe("viewing");
    expect(manageReadOnly({ role: "owner", perms: [] }, true, "lists")).toBe(
      "viewing",
    );
    const atView = { role: "worker" as const, perms: [MANAGE_VIEW] };
    expect(manageReadOnly(atView, false)).toBe("manage");
    expect(manageReadOnly(atView, false, "scheduling")).toBe("manage");
    // A manager lowered in scheduling still saves the rest.
    const notBuilding = {
      role: "manager" as const,
      perms: MANAGER.filter((key) => !key.startsWith("schedule.")),
    };
    expect(manageReadOnly(notBuilding, false, "scheduling")).toBe("module");
    expect(manageReadOnly(notBuilding, false, "time_clock")).toBe(null);
    expect(manageReadOnly(notBuilding, false)).toBe(null);
    // A worker raised to edit here saves what needs nothing more.
    const raised = {
      role: "worker" as const,
      perms: [MANAGE_VIEW, MANAGE_EDIT],
    };
    expect(manageReadOnly(raised, false, "notifications")).toBe(null);
    expect(manageReadOnly(raised, false, "lists")).toBe("module");
  });
});

describe("readsEveryLogArea", () => {
  it("is each area's own permission of the log: the four modules' edit and the team's view", () => {
    expect([...LOG_AREA_PERMISSIONS].sort()).toEqual([
      "chat.moderate",
      "clock.edit",
      "lists.manage",
      "schedule.edit",
      "team.view",
    ]);
  });

  it("holds for owners and for managers on the defaults", () => {
    expect(readsEveryLogArea({ role: "owner", perms: [] })).toBe(true);
    expect(readsEveryLogArea({ role: "manager", perms: MANAGER })).toBe(true);
  });

  it("doesn't for a worker raised to view, nor for a manager lowered in one area", () => {
    expect(readsEveryLogArea({ role: "worker", perms: [MANAGE_VIEW] })).toBe(
      false,
    );
    expect(
      readsEveryLogArea({
        role: "manager",
        perms: MANAGER.filter((key) => key !== "team.view"),
      }),
    ).toBe(false);
  });
});
