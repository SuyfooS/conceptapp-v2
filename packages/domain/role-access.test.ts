import { describe, expect, it } from "vitest";
import { declaredPermissions } from "./permissions";
import {
  ACCESS_AREAS,
  ACCESS_EXTRA_KEYS,
  ACCESS_FLOOR,
  AREA_EDIT,
  AREA_MODULE,
  AREA_VIEW,
  accessFromHeld,
  areaAccess,
  areaGrants,
  areaOfExtra,
  areaOpen,
  areaPermissions,
  areaShown,
  areaWrites,
  changesPermissions,
  checkRoleName,
  defaultAccess,
  editedAreas,
  editOrView,
  extraOpen,
  extrasOf,
  extrasTurned,
  heldBeyond,
  holdsExtra,
  levelChoices,
  MODULE_AREAS,
  matrixByDefault,
  PLACE_AREAS,
  parseRoleAreaChange,
  withAreaAccess,
  withExtra,
  withLevel,
} from "./role-access";

describe("role access", () => {
  it("starts from today's rules", () => {
    const manager = defaultAccess("manager");
    const worker = defaultAccess("worker");
    for (const area of ACCESS_AREAS) {
      expect(manager.levels[area]).toBe("edit");
    }
    expect(worker.levels).toEqual({
      scheduling: "view",
      time_clock: "view",
      lists: "view",
      chat: "view",
      team: "none",
      manage: "none",
    });
    for (const extra of ACCESS_EXTRA_KEYS) {
      expect(holdsExtra(manager, extra)).toBe(true);
      expect(holdsExtra(worker, extra)).toBe(false);
    }
  });

  it("keeps view as the least in each module's area, and none in the others", () => {
    for (const area of MODULE_AREAS) {
      expect(ACCESS_FLOOR[area]).toBe("view");
      expect(AREA_MODULE[area]).toBe(area);
    }
    for (const area of PLACE_AREAS) {
      expect(ACCESS_FLOOR[area]).toBe("none");
      expect(AREA_MODULE[area]).toBeNull();
      expect(extrasOf(area)).toEqual([]);
    }
  });

  it("offers view as the least in the modules, and none in team and manage", () => {
    expect(levelChoices("scheduling")).toEqual(["edit", "view"]);
    expect(levelChoices("chat")).toEqual(["edit", "view"]);
    expect(levelChoices("team")).toEqual(["edit", "view", "none"]);
    expect(levelChoices("manage")).toEqual(["edit", "view", "none"]);
    expect(editOrView("lists")).toBe(true);
    expect(editOrView("team")).toBe(false);
  });

  it("puts each switch in its area", () => {
    expect(areaOfExtra("schedule.publish")).toBe("scheduling");
    expect(areaOfExtra("lists.send")).toBe("lists");
    expect(areaOfExtra("chat.announce")).toBe("chat");
    expect(areaOfExtra("chat.send_documents")).toBe("chat");
  });

  it("turns an area's switches on when it is raised to edit, and off when it leaves", () => {
    const worker = defaultAccess("worker");
    expect(extraOpen(worker, "lists.send")).toBe(false);
    const raised = withLevel(worker, "lists", "edit");
    expect(raised.levels.lists).toBe("edit");
    expect(holdsExtra(raised, "lists.send")).toBe(true);
    // Other areas keep theirs.
    expect(holdsExtra(raised, "schedule.publish")).toBe(false);
    expect(extrasTurned(worker, raised, true)).toEqual(["lists.send"]);

    const lowered = withLevel(raised, "lists", "view");
    expect(holdsExtra(lowered, "lists.send")).toBe(false);
    expect(lowered).toEqual(worker);
  });

  it("never goes under an area's floor", () => {
    const worker = defaultAccess("worker");
    expect(withLevel(worker, "scheduling", "none")).toBe(worker);
    expect(withLevel(worker, "team", "view").levels.team).toBe("view");
    expect(
      withLevel(withLevel(worker, "team", "view"), "team", "none").levels.team,
    ).toBe("none");
  });

  it("switches only under edit", () => {
    const worker = defaultAccess("worker");
    expect(withExtra(worker, "lists.send", true)).toBe(worker);
    const manager = defaultAccess("manager");
    const noPublish = withExtra(manager, "schedule.publish", false);
    expect(holdsExtra(noPublish, "schedule.publish")).toBe(false);
    expect(noPublish.levels.scheduling).toBe("edit");
    expect(extrasTurned(manager, noPublish, false)).toEqual([
      "schedule.publish",
    ]);
  });

  it("puts one area back as it was, for its undo", () => {
    const manager = withExtra(defaultAccess("manager"), "chat.announce", false);
    const before = areaAccess(manager, "chat");
    expect(before).toEqual({
      level: "edit",
      extras: { "chat.announce": false, "chat.send_documents": true },
    });
    const lowered = withLevel(manager, "chat", "view");
    expect(withAreaAccess(lowered, "chat", before)).toEqual(manager);
    // A floor is kept even when what comes back is under it.
    expect(
      withAreaAccess(lowered, "chat", { level: "none", extras: {} }).levels
        .chat,
    ).toBe("view");
  });

  it("names the areas a role edits, of those shown", () => {
    const role = withLevel(
      withLevel(defaultAccess("worker"), "scheduling", "edit"),
      "lists",
      "edit",
    );
    expect(editedAreas(role, ACCESS_AREAS)).toEqual(["scheduling", "lists"]);
    expect(editedAreas(role, ["time_clock", "lists"])).toEqual(["lists"]);
  });

  it("checks a role's name", () => {
    expect(checkRoleName("  אחראי   בר ", [])).toEqual({
      ok: true,
      name: "אחראי בר",
    });
    expect(checkRoleName("   ", [])).toEqual({ ok: false, problem: "empty" });
    expect(checkRoleName("א".repeat(41), [])).toEqual({
      ok: false,
      problem: "long",
    });
    expect(checkRoleName("Bar lead", ["bar LEAD"])).toEqual({
      ok: false,
      problem: "taken",
    });
  });
});

// What the console reads and writes (the roles plan's R2): each area's
// permissions, the screen's levels and switches drawn from what the database
// says a role holds, and the writes that bring one area to a level: denials
// first, each key before what it requires, then grants, each after it.
describe("role access from the database", () => {
  /** What the catalogue requires (`public.permission_keys.requires`). */
  const REQUIRES: Record<string, string> = {
    "schedule.publish": "schedule.edit",
    "team.edit": "team.view",
    "manage.edit": "manage.view",
  };
  const requires = (key: string) => REQUIRES[key] ?? null;
  /**
   * A role's rules: the keys it is given, and those its default gives (the
   * same, unless a row says otherwise).
   */
  const rules = (
    given: readonly string[],
    defaults: readonly string[] = given,
  ) => ({
    given: (key: string) => given.includes(key),
    byDefault: (key: string) => defaults.includes(key),
    requires,
  });
  /** Today's rules for managers: every key of the six areas. */
  const MANAGER: readonly string[] = ACCESS_AREAS.flatMap(areaPermissions);

  it("names each area's permissions, its view and edit before its switches", () => {
    expect(areaPermissions("scheduling")).toEqual([
      "schedule.edit",
      "schedule.publish",
    ]);
    expect(areaPermissions("time_clock")).toEqual(["clock.edit"]);
    expect(areaPermissions("lists")).toEqual(["lists.manage", "lists.send"]);
    expect(areaPermissions("chat")).toEqual([
      "chat.moderate",
      "chat.announce",
      "chat.send_documents",
    ]);
    expect(areaPermissions("team")).toEqual(["team.view", "team.edit"]);
    expect(areaPermissions("manage")).toEqual(["manage.view", "manage.edit"]);
    for (const area of ACCESS_AREAS) {
      expect(areaPermissions(area)).not.toContain("clock.payroll");
    }
  });

  it("draws today's rules from what each role holds by default", () => {
    expect(accessFromHeld((key) => MANAGER.includes(key))).toEqual(
      defaultAccess("manager"),
    );
    expect(accessFromHeld(() => false)).toEqual(defaultAccess("worker"));
  });

  it("draws a level from the area's edit and view", () => {
    const held = ["team.view", "manage.view", "manage.edit", "lists.send"];
    const access = accessFromHeld((key) => held.includes(key));
    expect(access.levels).toEqual({
      scheduling: "view",
      time_clock: "view",
      lists: "view",
      chat: "view",
      team: "view",
      manage: "edit",
    });
    // Held, though the screen shows a switch only under edit.
    expect(access.extras["lists.send"]).toBe(true);
    expect(holdsExtra(access, "lists.send")).toBe(false);
  });

  it("says what an area at a level gives, key by key", () => {
    expect(
      areaGrants("scheduling", {
        level: "edit",
        extras: { "schedule.publish": false },
      }),
    ).toEqual([
      { perm: "schedule.edit", granted: true },
      { perm: "schedule.publish", granted: false },
    ]);
    expect(
      areaGrants("lists", { level: "view", extras: { "lists.send": true } }),
    ).toEqual([
      { perm: "lists.manage", granted: false },
      { perm: "lists.send", granted: false },
    ]);
    expect(areaGrants("team", { level: "view", extras: {} })).toEqual([
      { perm: "team.view", granted: true },
      { perm: "team.edit", granted: false },
    ]);
    expect(areaGrants("manage", { level: "none", extras: {} })).toEqual([
      { perm: "manage.view", granted: false },
      { perm: "manage.edit", granted: false },
    ]);
  });

  it("writes what differs, each key after what it requires", () => {
    const worker = rules([]);
    expect(
      areaWrites(
        "scheduling",
        { level: "edit", extras: { "schedule.publish": true } },
        worker,
      ),
    ).toEqual([
      { perm: "schedule.edit", granted: true },
      { perm: "schedule.publish", granted: true },
    ]);
    expect(areaWrites("team", { level: "edit", extras: {} }, worker)).toEqual([
      { perm: "team.view", granted: true },
      { perm: "team.edit", granted: true },
    ]);
    // Already so: nothing to write.
    expect(
      areaWrites(
        "scheduling",
        { level: "view", extras: { "schedule.publish": false } },
        worker,
      ),
    ).toEqual([]);
  });

  it("leaves a key whose requirement it turns off as it is: it holds nothing either way", () => {
    const manager = rules(MANAGER);
    expect(
      areaWrites(
        "scheduling",
        { level: "view", extras: { "schedule.publish": false } },
        manager,
      ),
    ).toEqual([{ perm: "schedule.edit", granted: false }]);
    expect(areaWrites("team", { level: "none", extras: {} }, manager)).toEqual([
      { perm: "team.view", granted: false },
    ]);
    // Back up to view, its edit stays off: written now that its view is
    // on, and denied before the view is given, so on the way they never
    // edit the team.
    expect(
      areaWrites(
        "team",
        { level: "view", extras: {} },
        rules(
          MANAGER.filter((key) => key !== "team.view"),
          MANAGER,
        ),
      ),
    ).toEqual([
      { perm: "team.edit", granted: false },
      { perm: "team.view", granted: true },
    ]);
    // A switch denied before its area went down keeps its denial.
    expect(
      areaWrites(
        "scheduling",
        { level: "view", extras: { "schedule.publish": false } },
        rules(
          MANAGER.filter((key) => key !== "schedule.publish"),
          MANAGER,
        ),
      ),
    ).toEqual([{ perm: "schedule.edit", granted: false }]);
    // A switch that requires nothing is turned off with its area's edit.
    expect(
      areaWrites(
        "lists",
        { level: "view", extras: { "lists.send": false } },
        manager,
      ),
    ).toEqual([
      { perm: "lists.manage", granted: false },
      { perm: "lists.send", granted: false },
    ]);
  });

  it("takes back a grant whose requirement goes, so an undo leaves no row", () => {
    // Workers raised to edit with publishing, then put back: publishing's
    // grant goes too, first, though it holds nothing without building.
    const raised = rules(["schedule.edit", "schedule.publish"], []);
    expect(
      areaWrites(
        "scheduling",
        { level: "view", extras: { "schedule.publish": false } },
        raised,
      ),
    ).toEqual([
      { perm: "schedule.publish", granted: false },
      { perm: "schedule.edit", granted: false },
    ]);
    expect(
      areaWrites(
        "team",
        { level: "none", extras: {} },
        rules(["team.view", "team.edit"], []),
      ),
    ).toEqual([
      { perm: "team.edit", granted: false },
      { perm: "team.view", granted: false },
    ]);
  });

  it("orders the writes by what each key requires, whatever the area's order", () => {
    const backwards = {
      given: () => false,
      byDefault: () => false,
      requires: (key: string) => (key === "lists.manage" ? "lists.send" : null),
    };
    expect(
      areaWrites(
        "lists",
        { level: "edit", extras: { "lists.send": true } },
        backwards,
      ),
    ).toEqual([
      { perm: "lists.send", granted: true },
      { perm: "lists.manage", granted: true },
    ]);
  });

  it("opens an area only when every one of its permissions is settable", () => {
    const settable = new Set([
      "schedule.edit",
      "schedule.publish",
      "team.edit",
    ]);
    const open = (key: string) => settable.has(key);
    expect(areaOpen("scheduling", open)).toBe(true);
    expect(areaOpen("team", open)).toBe(false);
    expect(areaOpen("time_clock", open)).toBe(false);
  });

  it("keeps each area's edit and view in that area", () => {
    for (const area of ACCESS_AREAS) {
      expect(areaPermissions(area)).toContain(AREA_EDIT[area]);
    }
    expect(AREA_VIEW).toEqual({ team: "team.view", manage: "manage.view" });
  });

  it("makes the matrix from the declarations before the database can answer", () => {
    const catalogue = declaredPermissions([]);
    const matrix = matrixByDefault(catalogue, ["worker"]);
    expect(matrix.keys.map((key) => key.perm)).toEqual(
      catalogue.map((entry) => entry.key),
    );
    expect(matrix.keys.every((key) => !key.settable)).toBe(true);
    expect([...matrix.held.manager].sort()).toEqual([
      "manage.edit",
      "manage.view",
      "team.edit",
      "team.view",
    ]);
    expect([...matrix.held.worker]).toEqual([]);
    // Each role's default: the managers' keys, the workers' none.
    expect(matrix.byDefault.worker.size).toBe(0);
    expect([...matrix.byDefault.manager].sort()).toEqual([
      "manage.edit",
      "manage.view",
      "team.edit",
      "team.view",
    ]);
  });
});

describe("who changes roles, and what a change may say", () => {
  it("is the owners' alone in the app", () => {
    expect(changesPermissions("owner")).toBe(true);
    for (const role of ["manager", "worker", "accountant"] as const) {
      expect(changesPermissions(role)).toBe(false);
    }
  });

  it("takes one area of managers or workers, with its own switches", () => {
    const change = {
      role: "worker",
      area: "lists",
      access: { level: "edit", extras: { "lists.send": true } },
    };
    expect(parseRoleAreaChange(change)).toEqual(change);
    expect(
      parseRoleAreaChange({
        role: "manager",
        area: "team",
        access: { level: "none", extras: {} },
      }),
    ).toEqual({
      role: "manager",
      area: "team",
      access: { level: "none", extras: {} },
    });
  });

  it("refuses the fixed roles, unknown areas and levels, and other areas' switches", () => {
    const access = { level: "edit", extras: {} };
    for (const role of ["owner", "accountant", "shift-lead"]) {
      expect(parseRoleAreaChange({ role, area: "lists", access })).toBeNull();
    }
    expect(
      parseRoleAreaChange({ role: "worker", area: "reservations", access }),
    ).toBeNull();
    expect(
      parseRoleAreaChange({
        role: "worker",
        area: "lists",
        access: { level: "all", extras: {} },
      }),
    ).toBeNull();
    expect(
      parseRoleAreaChange({
        role: "worker",
        area: "scheduling",
        access: { level: "edit", extras: { "lists.send": true } },
      }),
    ).toBeNull();
    expect(
      parseRoleAreaChange({
        role: "worker",
        area: "lists",
        access: { level: "edit", extras: { "lists.later": true } },
      }),
    ).toBeNull();
    expect(parseRoleAreaChange(null)).toBeNull();
  });

  it("never goes under an area's floor", () => {
    for (const area of MODULE_AREAS) {
      expect(
        parseRoleAreaChange({
          role: "manager",
          area,
          access: { level: "none", extras: {} },
        }),
      ).toBeNull();
    }
  });
});

describe("the areas a business has", () => {
  it("has a module's area while the module is on, and team and manage always", () => {
    const enabled = ["scheduling", "time_clock"] as const;
    expect(ACCESS_AREAS.filter((area) => areaShown(area, enabled))).toEqual([
      "scheduling",
      "time_clock",
      "team",
      "manage",
    ]);
    expect(ACCESS_AREAS.filter((area) => areaShown(area, []))).toEqual([
      "team",
      "manage",
    ]);
  });
});

describe("workers above managers", () => {
  const manager = defaultAccess("manager");
  const worker = defaultAccess("worker");

  it("is never so on the defaults", () => {
    expect(heldBeyond(manager, worker, ACCESS_AREAS)).toEqual([]);
    // The other way, managers hold more everywhere workers can go higher.
    expect(heldBeyond(worker, manager, ACCESS_AREAS)).toEqual(ACCESS_AREAS);
  });

  it("names each area where workers hold a permission or a switch managers don't", () => {
    // Managers stop sending lists; workers are raised to run them, sending
    // with it, and to see the team screen managers were lowered out of.
    const managers = withLevel(
      withExtra(manager, "lists.send", false),
      "team",
      "none",
    );
    const workers = withLevel(
      withLevel(worker, "lists", "edit"),
      "team",
      "view",
    );
    expect(heldBeyond(managers, workers, ACCESS_AREAS)).toEqual([
      "lists",
      "team",
    ]);
    // Only among the areas shown.
    expect(heldBeyond(managers, workers, ["scheduling", "lists"])).toEqual([
      "lists",
    ]);
  });

  it("counts a switch only while its area is at edit", () => {
    const managers = withLevel(manager, "scheduling", "view");
    const workers = withExtra(worker, "schedule.publish", true);
    expect(heldBeyond(managers, workers, ACCESS_AREAS)).toEqual([]);
    expect(
      heldBeyond(managers, withLevel(worker, "scheduling", "edit"), [
        "scheduling",
      ]),
    ).toEqual(["scheduling"]);
  });
});
