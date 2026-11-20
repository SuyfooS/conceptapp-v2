import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ACCOUNTANT_PERMISSIONS,
  atLeast,
  canOpenModule,
  defineManifest,
  enabledModules,
  fitsTabBar,
  holdsPermission,
  isStaff,
  MAX_MODULE_NAV,
  type ModuleManifest,
  type ModuleRow,
  moduleModes,
  moduleNav,
  moduleWidgets,
  permissionInUse,
  ROLES,
  type Role,
  readModuleSettings,
  STAFF_ROLES,
  type Viewer,
  validateModuleSettings,
} from "./modules";

// Fixtures, independent of the real manifests in modules/.
const schedule = defineManifest({
  key: "scheduling",
  requires: [],
  nav: { href: "/schedule", icon: "calendar", minRole: "worker", order: 10 },
  homeWidget: { minRole: "worker" },
  permissions: [
    { key: "schedule.edit", area: "scheduling", defaultRole: "manager" },
  ],
  settings: z.object({
    dueTime: z
      .string()
      .regex(/^\d\d:\d\d$/)
      .default("18:00"),
    weekStartsOn: z.int().min(0).max(1).default(0),
  }),
});
const clock = defineManifest({
  key: "time_clock",
  requires: ["scheduling"],
  nav: {
    href: "/clock",
    icon: "clock",
    minRole: "worker",
    order: 20,
    outsideStaff: { perm: "clock.payroll", href: "/clock/pay" },
  },
  homeWidget: { minRole: "worker" },
  permissions: [],
  settings: z.object({}),
});
const reservations = defineManifest({
  key: "reservations",
  requires: [],
  nav: null,
  homeWidget: null,
  permissions: [
    { key: "reservations.edit", area: "reservations", defaultRole: "worker" },
    {
      key: "clock.payroll",
      area: "time_clock",
      defaultRole: "owner",
      byOwner: true,
    },
  ],
  settings: z.object({}),
});
const notifications = defineManifest({
  key: "notifications",
  requires: ["time_clock"],
  nav: null,
  homeWidget: null,
  permissions: [],
  settings: z.object({}),
});
const storefront = defineManifest({
  key: "storefront",
  requires: [],
  nav: { href: "/storefront", icon: "store", minRole: "manager", order: 5 },
  homeWidget: null,
  permissions: [],
  settings: z.object({}),
});
const all: ModuleManifest[] = [schedule, clock, notifications, storefront];

const rows = (...on: ModuleRow["key"][]): ModuleRow[] =>
  on.map((key) => ({ key, enabled: true, settings: {} }));

/** Someone in a role, holding these permissions (`public.my_permissions`). */
const as = (role: Role, perms: string[] = []): Viewer => ({ role, perms });

describe("atLeast", () => {
  it("ranks owner over manager over worker", () => {
    expect(atLeast("owner", "manager")).toBe(true);
    expect(atLeast("manager", "manager")).toBe(true);
    expect(atLeast("worker", "manager")).toBe(false);
    expect(atLeast("manager", "owner")).toBe(false);
  });

  it("ranks an accountant as a worker", () => {
    expect(atLeast("accountant", "worker")).toBe(true);
    expect(atLeast("accountant", "manager")).toBe(false);
  });
});

describe("isStaff", () => {
  it("puts everyone on the staff but an accountant", () => {
    expect(ROLES.filter(isStaff)).toEqual([...STAFF_ROLES]);
    expect(isStaff("accountant")).toBe(false);
  });
});

describe("enabledModules", () => {
  it("returns switched-on modules in manifest order", () => {
    expect(
      enabledModules(all, rows("storefront", "time_clock", "scheduling")),
    ).toEqual(["scheduling", "time_clock", "storefront"]);
  });

  it("treats a row with enabled = false like a missing row", () => {
    expect(
      enabledModules(all, [
        { key: "scheduling", enabled: false, settings: {} },
        { key: "storefront", enabled: true, settings: {} },
      ]),
    ).toEqual(["storefront"]);
  });

  it("turns off a module whose requirement is off, transitively", () => {
    expect(enabledModules(all, rows("time_clock", "notifications"))).toEqual(
      [],
    );
    expect(
      enabledModules(all, rows("scheduling", "time_clock", "notifications")),
    ).toEqual(["scheduling", "time_clock", "notifications"]);
  });

  it("ignores rows for modules without a manifest", () => {
    expect(
      enabledModules([schedule], rows("scheduling", "storefront")),
    ).toEqual(["scheduling"]);
  });

  it("treats a dependency cycle as off", () => {
    const a = { ...clock, requires: ["storefront"] } as ModuleManifest;
    const b = { ...storefront, requires: ["time_clock"] } as ModuleManifest;
    expect(enabledModules([a, b], rows("time_clock", "storefront"))).toEqual(
      [],
    );
  });
});

describe("moduleNav", () => {
  const on = enabledModules(
    all,
    rows("scheduling", "time_clock", "storefront"),
  );

  it("lists enabled modules with a nav item, by order", () => {
    expect(moduleNav(all, on, as("owner")).map((e) => e.href)).toEqual([
      "/storefront",
      "/schedule",
      "/clock",
    ]);
  });

  it("hides items above the person's role", () => {
    expect(moduleNav(all, on, as("worker")).map((e) => e.key)).toEqual([
      "scheduling",
      "time_clock",
    ]);
  });

  it("drops a module that is switched off", () => {
    const fewer = enabledModules(all, rows("scheduling", "storefront"));
    expect(moduleNav(all, fewer, as("owner")).map((e) => e.key)).toEqual([
      "storefront",
      "scheduling",
    ]);
  });

  it("gives an accountant only the tabs off the staff whose permission they hold", () => {
    expect(moduleNav(all, on, as("accountant"))).toEqual([]);
    expect(moduleNav(all, on, as("accountant", ["clock.payroll"]))).toEqual([
      { key: "time_clock", href: "/clock/pay", icon: "clock", outside: true },
    ]);
    // Not while the module is off.
    expect(
      moduleNav(all, ["scheduling"], as("accountant", ["clock.payroll"])),
    ).toEqual([]);
  });

  it("keeps the staff on the module's own tab, pay access or not", () => {
    const tabs = moduleNav(all, on, as("manager", ["clock.payroll"]));
    expect(tabs.find((e) => e.key === "time_clock")).toEqual({
      key: "time_clock",
      href: "/clock",
      icon: "clock",
      outside: false,
    });
    expect(tabs.some((e) => e.outside)).toBe(false);
  });

  it(`never returns more than ${MAX_MODULE_NAV} items`, () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      ...schedule,
      nav: { ...schedule.nav, href: `/m${i}` as const, order: i },
    })) as ModuleManifest[];
    expect(moduleNav(many, ["scheduling"], as("owner"))).toHaveLength(
      MAX_MODULE_NAV,
    );
  });
});

describe("fitsTabBar", () => {
  // Five modules, each with a tab: more than the bar holds if all are on.
  const tab = (key: ModuleRow["key"], i: number) =>
    ({
      ...storefront,
      key,
      nav: { ...storefront.nav, href: `/t${i}` as const, order: i },
    }) as ModuleManifest;
  const five = (
    [
      "scheduling",
      "time_clock",
      "reservations",
      "storefront",
      "notifications",
    ] as const
  ).map(tab);

  it("counts only what is on, not every module there is", () => {
    expect(fitsTabBar(five, ["scheduling", "time_clock"])).toBe(true);
    expect(
      fitsTabBar(five, [
        "scheduling",
        "time_clock",
        "reservations",
        "storefront",
      ]),
    ).toBe(true);
  });

  it("refuses more tabs than the bar holds", () => {
    expect(
      fitsTabBar(
        five,
        five.map((m) => m.key),
      ),
    ).toBe(false);
  });

  it("does not count modules without a tab", () => {
    expect(
      fitsTabBar(all, [
        "scheduling",
        "time_clock",
        "storefront",
        "notifications",
      ]),
    ).toBe(true);
  });
});

describe("moduleWidgets", () => {
  it("shows home cards only for modules that declare one", () => {
    const on = enabledModules(all, rows("scheduling", "storefront"));
    expect(moduleWidgets(all, on, as("owner")).map((w) => w.key)).toEqual([
      "scheduling",
    ]);
    expect(moduleWidgets(all, [], as("owner"))).toEqual([]);
  });

  it("gives someone off the staff none: their Home is their own", () => {
    const on = enabledModules(all, rows("scheduling", "time_clock"));
    expect(moduleWidgets(all, on, as("accountant"))).toEqual([]);
    expect(moduleWidgets(all, on, as("accountant", ["clock.payroll"]))).toEqual(
      [],
    );
  });
});

describe("a mode (P4)", () => {
  const orders = defineManifest({
    key: "order_taking",
    requires: [],
    nav: null,
    icon: "pad",
    homeWidget: { minRole: "worker" },
    mode: {
      href: "/orders",
      icon: "pad",
      entries: ["home", "clockIn", "me"],
      items: [{ key: "places", href: "/orders", icon: "grid", exact: true }],
    },
    permissions: [],
    settings: z.object({}),
  });
  const withMode: ModuleManifest[] = [schedule, orders];

  it("is listed while its module is on, in the registry's order", () => {
    expect(moduleModes(withMode, ["order_taking"]).map((m) => m.key)).toEqual([
      "order_taking",
    ]);
    expect(moduleModes(withMode, ["scheduling"])).toEqual([]);
  });

  it("shows on Home by its own path and icon, and to nobody off the staff", () => {
    const on = enabledModules(withMode, rows("scheduling", "order_taking"));
    expect(moduleWidgets(withMode, on, as("worker"))).toEqual([
      {
        key: "scheduling",
        href: "/schedule",
        icon: "calendar",
        outside: false,
      },
      {
        key: "order_taking",
        href: "/orders",
        icon: "pad",
        outside: false,
        mode: true,
      },
    ]);
    expect(moduleWidgets(withMode, on, as("accountant"))).toEqual([]);
    // Without "home" among its ways in, nothing on Home.
    const quiet = defineManifest({
      ...orders,
      mode: { ...orders.mode, entries: ["me"] } as NonNullable<
        typeof orders.mode
      >,
    });
    expect(moduleWidgets([quiet], ["order_taking"], as("owner"))).toEqual([]);
  });

  it("opens no module screen by itself: the mode's screens check their own", () => {
    expect(canOpenModule(orders, ["order_taking"], as("owner"))).toBe(false);
  });
});

describe("canOpenModule", () => {
  it("needs the module on and the role in reach", () => {
    expect(canOpenModule(storefront, ["storefront"], as("manager"))).toBe(true);
    expect(canOpenModule(storefront, ["storefront"], as("worker"))).toBe(false);
    expect(canOpenModule(storefront, [], as("owner"))).toBe(false);
    expect(canOpenModule(notifications, ["notifications"], as("owner"))).toBe(
      false,
    );
    expect(canOpenModule(schedule, ["scheduling"], as("accountant"))).toBe(
      false,
    );
  });

  it("keeps a module's own screens closed to an accountant with its tab", () => {
    expect(
      canOpenModule(
        clock,
        ["scheduling", "time_clock"],
        as("accountant", ["clock.payroll"]),
      ),
    ).toBe(false);
  });
});

describe("permissionInUse", () => {
  it("is in use where a module that is on declares it", () => {
    const both = [schedule, reservations];
    expect(permissionInUse(both, ["reservations"], "clock.payroll")).toBe(true);
    expect(permissionInUse(both, ["scheduling"], "clock.payroll")).toBe(false);
  });

  it("is in use where a module that is on opens a tab off the staff by it", () => {
    // This clock declares no permission: its accountants' tab alone counts.
    expect(permissionInUse(all, ["time_clock"], "clock.payroll")).toBe(true);
    expect(permissionInUse(all, ["scheduling"], "clock.payroll")).toBe(false);
  });

  it("is never in use with nothing on, or for a key no module names", () => {
    expect(permissionInUse(all, [], "clock.payroll")).toBe(false);
    expect(
      permissionInUse(all, ["scheduling", "time_clock"], "lists.manage"),
    ).toBe(false);
  });
});

describe("holdsPermission", () => {
  it("gives an owner every permission, declared or not", () => {
    expect(holdsPermission(as("owner"), "schedule.edit")).toBe(true);
    expect(holdsPermission(as("owner"), "clock.payroll")).toBe(true);
    expect(holdsPermission(as("owner"), "billing.manage")).toBe(true);
  });

  it("gives anyone else what the database answered, and nothing by role", () => {
    // public.my_permissions counts the role's defaults, the business's rows
    // for the role and what was given; the app adds none of its own, so a
    // manager the business took schedule.edit from doesn't hold it.
    expect(holdsPermission(as("manager"), "schedule.edit")).toBe(false);
    expect(
      holdsPermission(as("manager", ["schedule.edit"]), "schedule.edit"),
    ).toBe(true);
    expect(
      holdsPermission(as("worker", ["schedule.edit"]), "schedule.edit"),
    ).toBe(true);
    expect(holdsPermission(as("worker", ["other.key"]), "schedule.edit")).toBe(
      false,
    );
  });

  it("gives an accountant only what the database answered for them", () => {
    for (const key of ACCOUNTANT_PERMISSIONS) {
      expect(holdsPermission(as("accountant", [key]), key)).toBe(true);
      expect(holdsPermission(as("accountant"), key)).toBe(false);
    }
    expect(holdsPermission(as("accountant"), "reservations.edit")).toBe(false);
  });
});

describe("module settings", () => {
  it("fill in defaults for an empty or missing row", () => {
    expect(readModuleSettings(schedule, {})).toEqual({
      dueTime: "18:00",
      weekStartsOn: 0,
    });
    expect(readModuleSettings(schedule, null)).toEqual({
      dueTime: "18:00",
      weekStartsOn: 0,
    });
  });

  it("keep valid stored fields and replace invalid ones with defaults", () => {
    expect(
      readModuleSettings(schedule, {
        dueTime: "nonsense",
        weekStartsOn: 1,
        retired: true,
      }),
    ).toEqual({ dueTime: "18:00", weekStartsOn: 1 });
    expect(readModuleSettings(schedule, "not an object")).toEqual({
      dueTime: "18:00",
      weekStartsOn: 0,
    });
  });

  it("refuse invalid settings on write", () => {
    expect(
      validateModuleSettings(schedule, { dueTime: "09:30", weekStartsOn: 1 }),
    ).toEqual({ dueTime: "09:30", weekStartsOn: 1 });
    expect(() => validateModuleSettings(schedule, { weekStartsOn: 7 })).toThrow(
      /scheduling/,
    );
  });
});
