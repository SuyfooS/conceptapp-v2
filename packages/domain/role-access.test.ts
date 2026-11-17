import { describe, expect, it } from "vitest";
import { declaredPermissions } from "./permissions";
import {
  ACCESS_AREAS,
  ACCESS_EXTRA_KEYS,
  ACCESS_FLOOR,
  type AccessArea,
  AREA_EDIT,
  AREA_MODULE,
  AREA_VIEW,
  accessFromHeld,
  areaAccess,
  areaChanged,
  areaChangeOf,
  areaGrants,
  areaOfExtra,
  areaOpen,
  areaPermissions,
  areaShown,
  areasWrites,
  areaWrites,
  changedAreas,
  changesAnything,
  changesPermissions,
  checkRoleName,
  defaultAccess,
  editedAreas,
  editOrView,
  extraLevel,
  extraOpen,
  extrasOf,
  extrasTurned,
  heldBeyond,
  holdsExtra,
  isBaseRole,
  knownExtras,
  levelChoices,
  MODULE_AREAS,
  matrixByDefault,
  namedRoleName,
  PLACE_AREAS,
  parseNewRole,
  parseRoleAreaChange,
  parseRoleAreasChange,
  parseRoleRename,
  type RoleAccess,
  type RoleMatrix,
  resetParts,
  rulesOf,
  startingAccess,
  VIEW_EXTRAS,
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
    expect(areaOfExtra("lists.fix")).toBe("lists");
    expect(areaOfExtra("chat.announce")).toBe("chat");
    expect(areaOfExtra("chat.send_documents")).toBe("chat");
    expect(ACCESS_EXTRA_KEYS).toEqual([
      "schedule.publish",
      "lists.send",
      "lists.fix",
      "chat.announce",
      "chat.send_documents",
    ]);
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

  it("switches those under edit only under edit, and the one at view only at view, locked at edit", () => {
    const worker = defaultAccess("worker");
    expect(withExtra(worker, "lists.send", true)).toBe(worker);
    const manager = defaultAccess("manager");
    const noPublish = withExtra(manager, "schedule.publish", false);
    expect(holdsExtra(noPublish, "schedule.publish")).toBe(false);
    expect(noPublish.levels.scheduling).toBe("edit");
    expect(extrasTurned(manager, noPublish, false)).toEqual([
      "schedule.publish",
    ]);
    // Fixing closed lists changes at view, and holds while it is on.
    expect(extraOpen(worker, "lists.fix")).toBe(true);
    const fixes = withExtra(worker, "lists.fix", true);
    expect(holdsExtra(fixes, "lists.fix")).toBe(true);
    expect(fixes.levels.lists).toBe("view");
    expect(extrasTurned(worker, fixes, true)).toEqual(["lists.fix"]);
    expect(withExtra(fixes, "lists.fix", false)).toEqual(worker);
    // At edit it is held, and locked: nothing changes it there.
    expect(extraOpen(manager, "lists.fix")).toBe(false);
    expect(holdsExtra(manager, "lists.fix")).toBe(true);
    expect(withExtra(manager, "lists.fix", false)).toBe(manager);
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
    expect(areaPermissions("lists")).toEqual([
      "lists.manage",
      "lists.send",
      "lists.fix",
    ]);
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
      { perm: "lists.fix", granted: false },
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
    // A switch that requires nothing is turned off with its area's edit
    // (here the catalogue's chain isn't given: lists.send requires nothing),
    // fixing closed lists among them, as it is off at view.
    expect(
      areaWrites(
        "lists",
        { level: "view", extras: { "lists.send": false, "lists.fix": false } },
        manager,
      ),
    ).toEqual([
      { perm: "lists.manage", granted: false },
      { perm: "lists.send", granted: false },
      { perm: "lists.fix", granted: false },
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
      // Fixing closed lists keeps its rule (off here): edit covers it.
      { perm: "lists.manage", granted: true },
    ]);
  });

  it("opens an area only when every one of its permissions is settable", () => {
    const settable = new Set([
      "schedule.edit",
      "schedule.publish",
      "team.edit",
    ]);
    // The matrix lists every key of the six areas, these settable.
    const keys = ACCESS_AREAS.flatMap(areaPermissions).map((perm) => ({
      perm,
      settable: settable.has(perm),
    }));
    expect(areaOpen("scheduling", keys)).toBe(true);
    expect(areaOpen("team", keys)).toBe(false);
    expect(areaOpen("time_clock", keys)).toBe(false);
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

describe("roles a business names (R11a)", () => {
  const LEAD = "a1000000-0000-4000-a000-0000000000c1";

  it("are told from managers and workers by their id", () => {
    expect(isBaseRole("manager")).toBe(true);
    expect(isBaseRole("worker")).toBe(true);
    for (const key of ["owner", "accountant", LEAD]) {
      expect(isBaseRole(key)).toBe(false);
    }
  });

  it("have an area changed by their id, as any role", () => {
    const change = {
      role: LEAD,
      area: "scheduling",
      access: { level: "edit", extras: { "schedule.publish": false } },
    };
    expect(parseRoleAreaChange(change)).toEqual(change);
  });

  it("start from the declarations with none, and none to add", () => {
    const matrix = matrixByDefault(declaredPermissions([]), []);
    expect(matrix.named).toEqual([]);
    expect(matrix.addsRoles).toBe(false);
  });

  it("have their rules found by their key, built-in or named", () => {
    const base = matrixByDefault(declaredPermissions([]), []);
    const lead = {
      id: LEAD,
      name: "Shift lead",
      nameEn: null,
      base: "worker" as const,
      byDefault: new Set<string>(),
      given: new Set(["schedule.edit"]),
      held: new Set(["schedule.edit"]),
    };
    const matrix: RoleMatrix = { ...base, named: [lead], addsRoles: true };
    expect(rulesOf(matrix, "manager")).toEqual({
      base: "manager",
      named: null,
      byDefault: base.byDefault.manager,
      given: base.given.manager,
      held: base.held.manager,
    });
    expect(rulesOf(matrix, LEAD)).toEqual({
      base: "worker",
      named: lead,
      byDefault: lead.byDefault,
      given: lead.given,
      held: lead.held,
    });
    // Archived, or another business's: nothing to change.
    expect(rulesOf(matrix, "a1000000-0000-4000-a000-0000000000c9")).toBeNull();
  });

  it("are added with a name kept tidy, built on a manager or a worker, copying any role", () => {
    expect(
      parseNewRole(
        { name: "  Shift   lead ", base: "worker", copyFrom: "manager" },
        [],
      ),
    ).toEqual({
      ok: true,
      role: { name: "Shift lead", base: "worker", copyFrom: "manager" },
    });
    expect(
      parseNewRole({ name: "Bar lead", base: "manager", copyFrom: LEAD }, []),
    ).toEqual({
      ok: true,
      role: { name: "Bar lead", base: "manager", copyFrom: LEAD },
    });
    expect(
      parseNewRole({ name: "Manager", base: "worker", copyFrom: "worker" }, [
        "manager",
      ]),
    ).toEqual({ ok: false, problem: "taken" });
    expect(
      parseNewRole({ name: "", base: "worker", copyFrom: "worker" }, []),
    ).toEqual({ ok: false, problem: "empty" });
    for (const input of [
      { name: "Lead", base: "owner", copyFrom: "worker" },
      { name: "Lead", base: "accountant", copyFrom: "worker" },
      { name: "Lead", base: "worker", copyFrom: "owner" },
      { name: "Lead", base: "worker", copyFrom: "shift-lead" },
      { name: 4, base: "worker", copyFrom: "worker" },
      null,
    ]) {
      expect(parseNewRole(input, [])).toEqual({ ok: false, problem: null });
    }
  });

  it("are renamed by their id, to a name no other role goes by", () => {
    expect(parseRoleRename({ role: LEAD, name: " Shift leader " }, [])).toEqual(
      { ok: true, role: LEAD, name: "Shift leader" },
    );
    expect(
      parseRoleRename({ role: LEAD, name: "Bar lead" }, ["Bar Lead"]),
    ).toEqual({ ok: false, problem: "taken" });
    expect(parseRoleRename({ role: LEAD, name: "א".repeat(41) }, [])).toEqual({
      ok: false,
      problem: "long",
    });
    expect(parseRoleRename({ role: "worker", name: "Lead" }, [])).toEqual({
      ok: false,
      problem: null,
    });
  });

  it("go by their English name in English, when they have one", () => {
    const role = { name: "אחראי משמרת", nameEn: "Shift lead" };
    expect(namedRoleName(role, "he")).toBe("אחראי משמרת");
    expect(namedRoleName(role, "en")).toBe("Shift lead");
    expect(namedRoleName({ ...role, nameEn: null }, "en")).toBe("אחראי משמרת");
  });
});

// The roles plan's R10 (Orel, 16 November 2026): an area that differs from
// where its role started says "שונה", and "חזרה להתחלה" puts every such area
// back in one write.
describe("where a role started (R10)", () => {
  /** What the catalogue requires (`public.permission_keys.requires`). */
  const REQUIRES: Record<string, string> = {
    "schedule.publish": "schedule.edit",
    "lists.send": "lists.manage",
    "chat.announce": "chat.moderate",
    "chat.send_documents": "chat.moderate",
    "team.edit": "team.view",
    "manage.edit": "manage.view",
  };
  const requires = (key: string) => REQUIRES[key] ?? null;
  /** The keys' default roles: managers every key of the six areas, workers none. */
  const defaults = {
    byDefault: {
      manager: new Set<string>(ACCESS_AREAS.flatMap(areaPermissions)),
      worker: new Set<string>(),
    },
  };
  const startOf = (byDefault: ReadonlySet<string>) =>
    startingAccess({ byDefault: (key) => byDefault.has(key), requires });

  it("is where every business starts, for managers and workers", () => {
    expect(startOf(defaults.byDefault.manager)).toEqual(
      defaultAccess("manager"),
    );
    expect(startOf(defaults.byDefault.worker)).toEqual(defaultAccess("worker"));
  });

  it("is its base as it is now for a role the business named, with what each key requires", () => {
    // Its base keeps publishing but no longer builds: publishing needs
    // building, so it starts without either.
    const base = new Set(
      [...defaults.byDefault.manager].filter((key) => key !== "schedule.edit"),
    );
    const start = startOf(base);
    expect(start.levels.scheduling).toBe("view");
    expect(holdsExtra(start, "schedule.publish")).toBe(false);
    expect(start.levels.lists).toBe("edit");
  });

  it("marks only the areas that differ, by what the role holds there", () => {
    const start = defaultAccess("worker");
    const raised = withLevel(start, "lists", "edit");
    expect(areaChanged(raised, start, "lists")).toBe(true);
    expect(areaChanged(raised, start, "scheduling")).toBe(false);
    expect(changedAreas(raised, start, ACCESS_AREAS)).toEqual(["lists"]);
    // A switch alone at the same level is a change too.
    const manager = defaultAccess("manager");
    const noPublish = withExtra(manager, "schedule.publish", false);
    expect(changedAreas(noPublish, manager, ACCESS_AREAS)).toEqual([
      "scheduling",
    ]);
    // A switch that holds nothing (its area isn't at edit) marks nothing.
    const viewed = withLevel(manager, "scheduling", "view");
    const stale: RoleAccess = {
      ...viewed,
      extras: { ...viewed.extras, "schedule.publish": true },
    };
    expect(
      areaChanged(
        stale,
        withLevel(manager, "scheduling", "view"),
        "scheduling",
      ),
    ).toBe(false);
    expect(changedAreas(manager, manager, ACCESS_AREAS)).toEqual([]);
  });

  it("puts every changed area back as it starts, and keeps each as it was for the undo", () => {
    const start = defaultAccess("worker");
    const now = withLevel(withLevel(start, "lists", "edit"), "team", "view");
    const { forward, back } = resetParts(now, start, ACCESS_AREAS);
    expect(forward).toEqual([
      {
        area: "lists",
        access: {
          level: "view",
          extras: { "lists.send": false, "lists.fix": false },
        },
      },
      { area: "team", access: { level: "none", extras: {} } },
    ]);
    expect(back).toEqual([
      {
        area: "lists",
        access: {
          level: "edit",
          extras: { "lists.send": true, "lists.fix": true },
        },
      },
      { area: "team", access: { level: "view", extras: {} } },
    ]);
    // Only the areas asked about: a closed one is left as it is.
    expect(resetParts(now, start, ["scheduling", "team"]).forward).toEqual([
      { area: "team", access: { level: "none", extras: {} } },
    ]);
    expect(resetParts(start, start, ACCESS_AREAS)).toEqual({
      forward: [],
      back: [],
    });
  });

  it("writes the way back as the areas' own writes, so nothing is refused for what it requires", () => {
    // Workers raised in lists and the team, by rows of their own (lists
    // before fixing closed lists came, so without its row).
    const given = new Set(["lists.manage", "lists.send", "team.view"]);
    const rules = {
      given: (key: string) => given.has(key),
      byDefault: (key: string) => defaults.byDefault.worker.has(key),
      requires,
    };
    const start = defaultAccess("worker");
    const now = withLevel(withLevel(start, "lists", "edit"), "team", "view");
    const { forward, back } = resetParts(now, start, ACCESS_AREAS);
    // Each denial before what it requires: nobody holds a step between.
    expect(areasWrites(forward, rules)).toEqual([
      { perm: "lists.send", granted: false },
      { perm: "lists.manage", granted: false },
      { perm: "team.view", granted: false },
    ]);
    // Its undo, from the rules as the reset leaves them (the defaults):
    // each grant after what it requires.
    const after = {
      ...rules,
      given: (key: string) => defaults.byDefault.worker.has(key),
    };
    // Fixing closed lists, which edit covers, is granted with the edit.
    expect(areasWrites(back, after)).toEqual([
      { perm: "lists.manage", granted: true },
      { perm: "lists.fix", granted: true },
      { perm: "lists.send", granted: true },
      { perm: "team.view", granted: true },
    ]);
  });

  it("is said in words by what moved: the level, and the switches that came and went", () => {
    const manager = defaultAccess("manager");
    const part = (access: RoleAccess, area: AccessArea) =>
      areaAccess(access, area);
    expect(
      areaChangeOf(
        "scheduling",
        part(manager, "scheduling"),
        part(withLevel(manager, "scheduling", "view"), "scheduling"),
      ),
    ).toEqual({ level: "view", on: [], off: ["schedule.publish"] });
    expect(
      areaChangeOf(
        "chat",
        part(manager, "chat"),
        part(withExtra(manager, "chat.announce", false), "chat"),
      ),
    ).toEqual({ level: null, on: [], off: ["chat.announce"] });
    const worker = defaultAccess("worker");
    expect(
      areaChangeOf(
        "team",
        part(worker, "team"),
        part(withLevel(worker, "team", "view"), "team"),
      ),
    ).toEqual({ level: "view", on: [], off: [] });
    expect(
      changesAnything(
        areaChangeOf("lists", part(worker, "lists"), part(worker, "lists")),
      ),
    ).toBe(false);
  });

  it("takes several areas of one role, each once, each as one area's change", () => {
    const parts = [
      {
        area: "lists",
        access: { level: "view", extras: { "lists.send": false } },
      },
      { area: "team", access: { level: "none", extras: {} } },
    ];
    expect(parseRoleAreasChange({ role: "worker", parts })).toEqual({
      role: "worker",
      parts,
    });
    const LEAD = "a1000000-0000-4000-a000-0000000000c1";
    expect(parseRoleAreasChange({ role: LEAD, parts })?.role).toBe(LEAD);
    for (const input of [
      { role: "worker", parts: [] },
      { role: "worker", parts: [parts[0], parts[0]] },
      { role: "owner", parts },
      // Under the area's floor, or another area's switch.
      {
        role: "worker",
        parts: [{ area: "lists", access: { level: "none", extras: {} } }],
      },
      {
        role: "worker",
        parts: [
          {
            area: "team",
            access: { level: "edit", extras: { "lists.send": true } },
          },
        ],
      },
      null,
    ]) {
      expect(parseRoleAreasChange(input), JSON.stringify(input)).toBeNull();
    }
  });
});

// L6b-2 (Orel, 16 November 2026): "תיקון רשימות שנסגרו", the first switch
// that works at view. A role that doesn't edit the lists, such as "עובד
// בכיר" on workers, fixes a closed list that reaches it; edit covers it, so
// at edit it is held, on and locked. The switches under edit keep every
// word and every write they had.
describe("a switch at view (L6b-2)", () => {
  /** The catalogue's chains (`public.permission_keys.requires`): fixing requires nothing. */
  const REQUIRES: Record<string, string> = {
    "schedule.publish": "schedule.edit",
    "lists.send": "lists.manage",
    "chat.announce": "chat.moderate",
    "chat.send_documents": "chat.moderate",
    "team.edit": "team.view",
    "manage.edit": "manage.view",
  };
  const requires = (key: string) => REQUIRES[key] ?? null;
  /** A role's rules: the keys it is given, and those its default gives. */
  const rules = (given: readonly string[], defaults: readonly string[]) => ({
    given: (key: string) => given.includes(key),
    byDefault: (key: string) => defaults.includes(key),
    requires,
  });
  /** Managers' default: every key of the six areas. */
  const MANAGER: readonly string[] = ACCESS_AREAS.flatMap(areaPermissions);
  const manager = defaultAccess("manager");
  const worker = defaultAccess("worker");
  /** "עובד בכיר": lists at view, fixing closed lists on. */
  const senior = withExtra(worker, "lists.fix", true);
  const lists = (access: RoleAccess) => areaAccess(access, "lists");

  it("is fixing closed lists alone, in a module's area, whose least is view", () => {
    expect(VIEW_EXTRAS).toEqual(["lists.fix"]);
    for (const extra of ACCESS_EXTRA_KEYS) {
      expect(extraLevel(extra), extra).toBe(
        extra === "lists.fix" ? "view" : "edit",
      );
    }
    for (const extra of VIEW_EXTRAS) {
      const area = areaOfExtra(extra);
      expect(editOrView(area)).toBe(true);
      expect(ACCESS_FLOOR[area]).toBe("view");
    }
    // Managers hold it where every business starts; workers don't.
    expect(holdsExtra(manager, "lists.fix")).toBe(true);
    expect(worker.extras["lists.fix"]).toBe(false);
    expect(holdsExtra(worker, "lists.fix")).toBe(false);
  });

  it("opens and holds each switch at its own level", () => {
    const at = (level: "view" | "edit", send: boolean, fix: boolean) => {
      const placed = withLevel(worker, "lists", level);
      return {
        ...placed,
        extras: { ...placed.extras, "lists.send": send, "lists.fix": fix },
      };
    };
    // At view: fixing changes and holds while on; sending is off, whatever
    // is stored.
    expect(extraOpen(at("view", true, true), "lists.fix")).toBe(true);
    expect(extraOpen(at("view", true, true), "lists.send")).toBe(false);
    expect(holdsExtra(at("view", true, true), "lists.fix")).toBe(true);
    expect(holdsExtra(at("view", true, false), "lists.fix")).toBe(false);
    expect(holdsExtra(at("view", true, true), "lists.send")).toBe(false);
    // At edit: fixing is held and locked, on or not as stored; sending
    // changes and holds while on.
    for (const fix of [true, false]) {
      expect(extraOpen(at("edit", true, fix), "lists.fix")).toBe(false);
      expect(holdsExtra(at("edit", true, fix), "lists.fix")).toBe(true);
    }
    expect(extraOpen(at("edit", false, false), "lists.send")).toBe(true);
    expect(holdsExtra(at("edit", false, true), "lists.send")).toBe(false);
    expect(holdsExtra(at("edit", true, false), "lists.send")).toBe(true);
  });

  it("keeps every switch under edit as it was, in every area and at every level", () => {
    for (const area of ACCESS_AREAS) {
      for (const level of levelChoices(area)) {
        const placed = {
          ...worker,
          levels: { ...worker.levels, [area]: level },
        };
        for (const extra of extrasOf(area)) {
          if (extraLevel(extra) !== "edit") continue;
          for (const on of [true, false]) {
            const access = {
              ...placed,
              extras: { ...placed.extras, [extra]: on },
            };
            const what = `${area} ${level} ${extra} ${on}`;
            expect(extraOpen(access, extra), what).toBe(level === "edit");
            expect(holdsExtra(access, extra), what).toBe(
              level === "edit" && on,
            );
          }
        }
      }
    }
  });

  it("comes on with edit and goes with it, so a raise and a lower end with it off", () => {
    const raised = withLevel(senior, "lists", "edit");
    expect(raised.extras).toMatchObject({
      "lists.send": true,
      "lists.fix": true,
    });
    // Lowered, it goes with every switch of the area (a risk the plan
    // names): the card shows it off, and the toast's undo puts edit back.
    const lowered = withLevel(raised, "lists", "view");
    expect(lowered).toEqual(worker);
    expect(holdsExtra(lowered, "lists.fix")).toBe(false);
    // Workers raised and lowered are back where they started.
    expect(
      withLevel(withLevel(worker, "lists", "edit"), "lists", "view"),
    ).toEqual(worker);
    // Managers lowered lose it, and raised again hold it.
    const managers = withLevel(manager, "lists", "view");
    expect(holdsExtra(managers, "lists.fix")).toBe(false);
    expect(withLevel(managers, "lists", "edit")).toEqual(manager);
    // Another area's level leaves it alone.
    for (const area of ACCESS_AREAS) {
      if (area === "lists") continue;
      for (const level of levelChoices(area)) {
        expect(
          holdsExtra(withLevel(senior, area, level), "lists.fix"),
          `${area} ${level}`,
        ).toBe(true);
      }
    }
  });

  it("raises and lowers every area of managers, workers and a named role back to where they were", () => {
    for (const start of [manager, worker, senior]) {
      for (const area of ACCESS_AREAS) {
        for (const level of levelChoices(area)) {
          const there = withLevel(start, area, level);
          for (const other of ACCESS_AREAS) {
            if (other === area) continue;
            expect(areaAccess(there, other), `${area} ${other}`).toEqual(
              areaAccess(start, other),
            );
          }
          const back = withLevel(there, area, start.levels[area]);
          // Back where it was, but for the switch at view that a lower took.
          const expected =
            start === senior && area === "lists" && level === "edit"
              ? worker
              : start;
          expect(back, `${area} ${level}`).toEqual(expected);
        }
      }
    }
  });

  it("is put back by an undo as it was, and is on whenever edit comes back", () => {
    const raised = withLevel(senior, "lists", "edit");
    // The raise's undo: back at view, with fixing on as it was.
    expect(withAreaAccess(raised, "lists", lists(senior))).toEqual(senior);
    // The switch's undo, either way.
    expect(withAreaAccess(senior, "lists", lists(worker))).toEqual(worker);
    expect(withAreaAccess(worker, "lists", lists(senior))).toEqual(senior);
    // At edit its rule comes back as it was, and edit holds it either way.
    const atEdit = withAreaAccess(worker, "lists", {
      level: "edit",
      extras: { "lists.send": false, "lists.fix": false },
    });
    expect(atEdit.extras).toMatchObject({
      "lists.send": false,
      "lists.fix": false,
    });
    expect(holdsExtra(atEdit, "lists.fix")).toBe(true);
    // At view sending is off, and fixing as it comes back.
    expect(
      withAreaAccess(manager, "lists", {
        level: "view",
        extras: { "lists.send": true, "lists.fix": true },
      }).extras,
    ).toMatchObject({ "lists.send": false, "lists.fix": true });
  });

  it("grants it while it is on, at view or at edit, and a raise turns it on", () => {
    expect(areaGrants("lists", lists(senior))).toEqual([
      { perm: "lists.manage", granted: false },
      { perm: "lists.send", granted: false },
      { perm: "lists.fix", granted: true },
    ]);
    expect(areaGrants("lists", lists(worker))).toEqual([
      { perm: "lists.manage", granted: false },
      { perm: "lists.send", granted: false },
      { perm: "lists.fix", granted: false },
    ]);
    // At edit, as its rule keeps it: edit holds it either way, so nothing
    // is written for it but what differs.
    expect(
      areaGrants("lists", {
        level: "edit",
        extras: { "lists.send": false, "lists.fix": false },
      }),
    ).toEqual([
      { perm: "lists.manage", granted: true },
      { perm: "lists.send", granted: false },
      { perm: "lists.fix", granted: false },
    ]);
    expect(
      areaGrants("lists", lists(withLevel(worker, "lists", "edit"))),
    ).toEqual([
      { perm: "lists.manage", granted: true },
      { perm: "lists.send", granted: true },
      { perm: "lists.fix", granted: true },
    ]);
  });

  // A role at lists edit whose rule for fixing is off: one raised before the
  // key came (or while the app had it and the database didn't), or a named
  // role at edit whose base's switch went off. Whatever is written there
  // keeps that rule, so it adds no row, no log entry and no line.
  describe("at edit with its rule off", () => {
    const LISTS_KEYS = ["lists.manage", "lists.send", "lists.fix"];
    /** Lists at edit with sending, fixing's rule off, as the database draws it. */
    const stale = accessFromHeld(
      (key) => key === "lists.manage" || key === "lists.send",
    );
    const staleRules = rules(["lists.manage", "lists.send"], []);
    const rowsAfter = (
      given: readonly string[],
      writes: { perm: string; granted: boolean }[],
    ) =>
      LISTS_KEYS.filter((key) => {
        const write = writes.find((w) => w.perm === key);
        return write ? write.granted : given.includes(key);
      });

    it("is lowered and put back by the undo with what it had, and no more", () => {
      const lowered = withLevel(stale, "lists", "view");
      const down = areaWrites("lists", lists(lowered), staleRules);
      expect(down).toEqual([
        { perm: "lists.send", granted: false },
        { perm: "lists.manage", granted: false },
      ]);
      const given = rowsAfter(["lists.manage", "lists.send"], down);
      expect(given).toEqual([]);
      // The toast's undo: the area as it was, written against the rows now.
      const undone = withAreaAccess(lowered, "lists", lists(stale));
      expect(undone).toEqual(stale);
      const up = areaWrites("lists", lists(stale), rules(given, []));
      expect(up).toEqual([
        { perm: "lists.manage", granted: true },
        { perm: "lists.send", granted: true },
      ]);
      expect(rowsAfter(given, up)).toEqual(["lists.manage", "lists.send"]);
    });

    it("turns sending off alone", () => {
      const noSend = withExtra(stale, "lists.send", false);
      expect(areaWrites("lists", lists(noSend), staleRules)).toEqual([
        { perm: "lists.send", granted: false },
      ]);
      expect(
        areaWrites(
          "lists",
          lists(withExtra(noSend, "lists.send", true)),
          rules(["lists.manage"], []),
        ),
      ).toEqual([{ perm: "lists.send", granted: true }]);
      // The toast says sending alone, either way.
      expect(extrasTurned(stale, noSend, false)).toEqual(["lists.send"]);
      expect(extrasTurned(stale, noSend, true)).toEqual([]);
    });

    it('is drawn held, and "חזרה להתחלה" leaves its rule alone', () => {
      expect(holdsExtra(stale, "lists.fix")).toBe(true);
      expect(extraOpen(stale, "lists.fix")).toBe(false);
      // Workers start at view: back there, fixing's rule is already off.
      const { forward, back } = resetParts(stale, worker, ACCESS_AREAS);
      expect(areasWrites(forward, staleRules)).toEqual([
        { perm: "lists.send", granted: false },
        { perm: "lists.manage", granted: false },
      ]);
      expect(areasWrites(back, rules([], []))).toEqual([
        { perm: "lists.manage", granted: true },
        { perm: "lists.send", granted: true },
      ]);
    });

    it("keeps a named role at view from fixing when its base, lowered, is put back by the undo", () => {
      // Workers raised before the key came; "עובד בכיר" on them, lowered to
      // view, with no rule of its own for fixing: it follows workers, off.
      const lowered = withLevel(stale, "lists", "view");
      const down = areaWrites("lists", lists(lowered), staleRules);
      const workersNow = rowsAfter(["lists.manage", "lists.send"], down);
      const up = areaWrites("lists", lists(stale), rules(workersNow, []));
      // The undo gives workers no rule for fixing, so the named role, which
      // follows them there, still doesn't fix.
      expect(up.some((write) => write.perm === "lists.fix")).toBe(false);
      expect(rowsAfter(workersNow, up)).not.toContain("lists.fix");
    });
  });

  // The L6 plan's accepted case (role-access's withLevel): a named role
  // given the switch at view while its base is at edit holds it by its
  // base's rule, which the database keeps instead of a row of its own, so
  // its base's lowering takes it.
  it("follows its base's lowering, for a named role given it while the base was at edit", () => {
    const workers = withLevel(worker, "lists", "edit");
    // Its base's rule, as the named role starts from it.
    const base = (access: RoleAccess) =>
      areaGrants("lists", lists(access))
        .filter((grant) => grant.granted)
        .map((grant) => grant.perm as string);
    // "עובד בכיר" on workers, lowered to view: its own denials (sending
    // keeps its base's rule, holding nothing without the edit).
    const named = withLevel(workers, "lists", "view");
    expect(
      areaWrites("lists", lists(named), rules(base(workers), base(workers))),
    ).toEqual([
      { perm: "lists.manage", granted: false },
      { perm: "lists.fix", granted: false },
    ]);
    // On at view: the write is its base's rule, so the database removes its
    // row instead of keeping one, and it follows its base there.
    const given = withExtra(named, "lists.fix", true);
    expect(holdsExtra(given, "lists.fix")).toBe(true);
    expect(
      areaWrites("lists", lists(given), rules(["lists.send"], base(workers))),
    ).toEqual([{ perm: "lists.fix", granted: true }]);
    expect(base(workers)).toContain("lists.fix");
    // Workers lowered: their rule for fixing goes, and with it the named
    // role's, which follows it.
    const lowered = withLevel(workers, "lists", "view");
    expect(base(lowered)).toEqual([]);
    expect(
      areaWrites("lists", lists(lowered), rules(base(workers), [])),
    ).toContainEqual({ perm: "lists.fix", granted: false });
  });

  it("is said at view alone, and left to edit's words when either side is at edit", () => {
    const change = (before: RoleAccess, after: RoleAccess) =>
      areaChangeOf("lists", lists(before), lists(after));
    expect(change(worker, senior)).toEqual({
      level: null,
      on: ["lists.fix"],
      off: [],
    });
    expect(change(senior, worker)).toEqual({
      level: null,
      on: [],
      off: ["lists.fix"],
    });
    const raised = withLevel(senior, "lists", "edit");
    expect(change(senior, raised)).toEqual({
      level: "edit",
      on: ["lists.send"],
      off: [],
    });
    expect(change(raised, withLevel(raised, "lists", "view"))).toEqual({
      level: "view",
      on: [],
      off: ["lists.send"],
    });
    // The raise's undo says the level and sending, as any lowering does.
    expect(
      change(raised, withAreaAccess(raised, "lists", lists(senior))),
    ).toEqual({ level: "view", on: [], off: ["lists.send"] });
    // A role at edit whose database has no row for it (raised before it
    // came) is where managers start: no "שונה".
    const before: RoleAccess = {
      ...manager,
      extras: { ...manager.extras, "lists.fix": false },
    };
    expect(changesAnything(change(before, manager))).toBe(false);
    expect(areaChanged(before, manager, "lists")).toBe(false);
    expect(extrasTurned(before, manager, true)).toEqual([]);
  });

  it("is held beyond managers who don't hold it, as any key", () => {
    const managers = withLevel(manager, "lists", "view");
    expect(heldBeyond(managers, senior, ACCESS_AREAS)).toEqual(["lists"]);
    expect(heldBeyond(managers, worker, ACCESS_AREAS)).toEqual([]);
    // Managers at edit hold it, and managers at view with it on too.
    expect(heldBeyond(manager, senior, ACCESS_AREAS)).toEqual([]);
    expect(
      heldBeyond(withExtra(managers, "lists.fix", true), senior, ACCESS_AREAS),
    ).toEqual([]);
    // Only among the areas shown.
    expect(heldBeyond(managers, senior, ["scheduling", "team"])).toEqual([]);
  });

  it("is drawn from what the database says a role holds", () => {
    expect(accessFromHeld((key) => key === "lists.fix")).toEqual(senior);
    // Raised before it came: no row, and edit covers it.
    const raised = accessFromHeld(
      (key) => key === "lists.manage" || key === "lists.send",
    );
    expect(raised.extras["lists.fix"]).toBe(false);
    expect(holdsExtra(raised, "lists.fix")).toBe(true);
    expect(extraOpen(raised, "lists.fix")).toBe(false);
  });

  it("writes it alone at view, and with edit's keys when the area is raised", () => {
    // The owner turns it on for a role at view, and off.
    expect(areaWrites("lists", lists(senior), rules([], []))).toEqual([
      { perm: "lists.fix", granted: true },
    ]);
    expect(
      areaWrites("lists", lists(worker), rules(["lists.fix"], [])),
    ).toEqual([{ perm: "lists.fix", granted: false }]);
    // Workers raised: three rows (two before), each after what it requires.
    const raised = withLevel(worker, "lists", "edit");
    expect(areaWrites("lists", lists(raised), rules([], []))).toEqual([
      { perm: "lists.manage", granted: true },
      { perm: "lists.fix", granted: true },
      { perm: "lists.send", granted: true },
    ]);
    // And lowered again: each denial before what it requires.
    expect(
      areaWrites(
        "lists",
        lists(worker),
        rules(["lists.manage", "lists.send", "lists.fix"], []),
      ),
    ).toEqual([
      { perm: "lists.send", granted: false },
      { perm: "lists.manage", granted: false },
      { perm: "lists.fix", granted: false },
    ]);
    // Managers lowered: their edit and fixing; sending keeps its default,
    // holding nothing without the edit.
    expect(
      areaWrites(
        "lists",
        lists(withLevel(manager, "lists", "view")),
        rules(MANAGER, MANAGER),
      ),
    ).toEqual([
      { perm: "lists.manage", granted: false },
      { perm: "lists.fix", granted: false },
    ]);
    // And raised again: both back.
    expect(
      areaWrites(
        "lists",
        lists(manager),
        rules(
          MANAGER.filter(
            (key) => key !== "lists.manage" && key !== "lists.fix",
          ),
          MANAGER,
        ),
      ),
    ).toEqual([
      { perm: "lists.manage", granted: true },
      { perm: "lists.fix", granted: true },
    ]);
    // A role with it on at view, raised: it is given already.
    expect(
      areaWrites(
        "lists",
        lists(withLevel(senior, "lists", "edit")),
        rules(["lists.fix"], []),
      ),
    ).toEqual([
      { perm: "lists.manage", granted: true },
      { perm: "lists.send", granted: true },
    ]);
  });

  it("is reset on a role the business named to its base's rule, and back by its undo", () => {
    // Named on workers, given it by a row of its own.
    const start = startingAccess({ byDefault: () => false, requires });
    expect(start).toEqual(worker);
    expect(changedAreas(senior, start, ACCESS_AREAS)).toEqual(["lists"]);
    const { forward, back } = resetParts(senior, start, ACCESS_AREAS);
    expect(forward).toEqual([
      {
        area: "lists",
        access: {
          level: "view",
          extras: { "lists.send": false, "lists.fix": false },
        },
      },
    ]);
    expect(back).toEqual([
      {
        area: "lists",
        access: {
          level: "view",
          extras: { "lists.send": false, "lists.fix": true },
        },
      },
    ]);
    // Its row goes (the key back on its base's rule), and the undo gives it.
    expect(areasWrites(forward, rules(["lists.fix"], []))).toEqual([
      { perm: "lists.fix", granted: false },
    ]);
    expect(areasWrites(back, rules([], []))).toEqual([
      { perm: "lists.fix", granted: true },
    ]);
    expect(
      forward.reduce(
        (access, part) => withAreaAccess(access, part.area, part.access),
        senior,
      ),
    ).toEqual(start);
    // Its base given it: a named role without a row starts with it, and is
    // no different.
    const fromBase = startingAccess({
      byDefault: (key) => key === "lists.fix",
      requires,
    });
    expect(fromBase).toEqual(senior);
    expect(changedAreas(senior, fromBase, ACCESS_AREAS)).toEqual([]);
    // Managers start with it, at edit.
    expect(
      startingAccess({ byDefault: (key) => MANAGER.includes(key), requires }),
    ).toEqual(manager);
  });

  it("is taken in a change of the lists area, and of no other", () => {
    const LEAD = "a1000000-0000-4000-a000-0000000000c1";
    const access = { level: "view", extras: { "lists.fix": true } };
    const change = { role: LEAD, area: "lists", access };
    expect(parseRoleAreaChange(change)).toEqual(change);
    expect(
      parseRoleAreaChange({
        role: "worker",
        area: "lists",
        access: {
          level: "edit",
          extras: { "lists.send": true, "lists.fix": true },
        },
      }),
    ).not.toBeNull();
    expect(
      parseRoleAreaChange({ role: "worker", area: "scheduling", access }),
    ).toBeNull();
    expect(
      parseRoleAreasChange({ role: LEAD, parts: [{ area: "lists", access }] }),
    ).toEqual({ role: LEAD, parts: [{ area: "lists", access }] });
  });
});

// The deploy guard (L6b-2): Vercel has the code before Migrate runs, so a
// switch the database doesn't list yet neither closes its area on the roles
// screen nor is written, and the writes stay as they were until it is there.
describe("a switch the database doesn't list yet", () => {
  const requires = (key: string) =>
    key === "lists.send" ? "lists.manage" : null;
  /** Every key of the six areas, settable, but those left out. */
  const keysWithout = (...missing: string[]) =>
    ACCESS_AREAS.flatMap(areaPermissions)
      .filter((perm) => !missing.includes(perm))
      .map((perm) => ({ perm, settable: true }));
  const known = (key: string) => key !== "lists.fix";
  const none = { given: () => false, byDefault: () => false, requires, known };

  it("leaves its area open, and isn't drawn", () => {
    const before = keysWithout("lists.fix");
    expect(areaOpen("lists", before)).toBe(true);
    expect(knownExtras("lists", before)).toEqual(["lists.send"]);
    const after = keysWithout();
    expect(areaOpen("lists", after)).toBe(true);
    expect(knownExtras("lists", after)).toEqual(["lists.send", "lists.fix"]);
    for (const area of ACCESS_AREAS) {
      expect(knownExtras(area, after)).toEqual(extrasOf(area));
    }
  });

  it("still closes the area when the database lists it unsettable, or lacks the area's edit or view", () => {
    const listed = keysWithout().map((key) =>
      key.perm === "lists.fix" ? { ...key, settable: false } : key,
    );
    expect(areaOpen("lists", listed)).toBe(false);
    expect(knownExtras("lists", listed)).toEqual(["lists.send", "lists.fix"]);
    expect(areaOpen("lists", keysWithout("lists.manage"))).toBe(false);
    expect(areaOpen("team", keysWithout("team.view"))).toBe(false);
    for (const area of ACCESS_AREAS) {
      expect(areaOpen(area, []), area).toBe(false);
    }
    // The other areas are as they were.
    expect(areaOpen("scheduling", listed)).toBe(true);
  });

  it("is never written", () => {
    const worker = defaultAccess("worker");
    const manager = defaultAccess("manager");
    const raised = areaAccess(withLevel(worker, "lists", "edit"), "lists");
    // Workers raised: the two rows they had before it came.
    expect(areaWrites("lists", raised, none)).toEqual([
      { perm: "lists.manage", granted: true },
      { perm: "lists.send", granted: true },
    ]);
    // Managers lowered: their edit alone, as before it came.
    const all: readonly string[] = ACCESS_AREAS.flatMap(areaPermissions);
    expect(
      areaWrites(
        "lists",
        areaAccess(withLevel(manager, "lists", "view"), "lists"),
        {
          given: (key) => all.includes(key),
          byDefault: (key) => all.includes(key),
          requires,
          known,
        },
      ),
    ).toEqual([{ perm: "lists.manage", granted: false }]);
    // Asked for at view (a change may say so; the screen doesn't draw it).
    expect(
      areaWrites(
        "lists",
        { level: "view", extras: { "lists.fix": true } },
        none,
      ),
    ).toEqual([]);
    expect(
      areasWrites(
        [
          { area: "lists", access: raised },
          { area: "team", access: { level: "view", extras: {} } },
        ],
        none,
      ),
    ).toEqual([
      { perm: "lists.manage", granted: true },
      { perm: "lists.send", granted: true },
      { perm: "team.view", granted: true },
    ]);
  });
});

// Every word the roles screen's toast and the line to a role's people said
// for the switches under edit stays as it was (`extrasTurned`, rebuilt from
// `areaChangeOf`): checked against the rule they followed before, over every
// state of a role and every change of one step, and pinned for each switch.
describe("the words for the switches under edit", () => {
  /** The switches there were before L6b-2. */
  const TODAY = [
    "schedule.publish",
    "lists.send",
    "chat.announce",
    "chat.send_documents",
  ] as const;
  type TodayExtra = (typeof TODAY)[number];
  /** The rule before: on, and its area at edit. */
  const heldBefore = (access: RoleAccess, extra: TodayExtra) =>
    access.levels[areaOfExtra(extra)] === "edit" && access.extras[extra];
  const turnedBefore = (before: RoleAccess, after: RoleAccess, on: boolean) =>
    TODAY.filter(
      (extra) =>
        heldBefore(after, extra) === on && heldBefore(before, extra) !== on,
    );
  const today = (extras: readonly string[]) =>
    extras.filter((extra) => (TODAY as readonly string[]).includes(extra));
  const same = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b);

  /**
   * Every level of each area with switches, and of the team screen (one that
   * goes down to none), with every switch on or off, stored stale or not;
   * the clock and the management page as workers have them (each step
   * still moves them).
   */
  function everyState(): RoleAccess[] {
    let levels: RoleAccess["levels"][] = [
      { ...defaultAccess("worker").levels },
    ];
    for (const area of ["scheduling", "lists", "chat", "team"] as const) {
      levels = levels.flatMap((partial) =>
        levelChoices(area).map((level) => ({ ...partial, [area]: level })),
      );
    }
    const extras: RoleAccess["extras"][] = [];
    for (let bits = 0; bits < 2 ** ACCESS_EXTRA_KEYS.length; bits += 1) {
      extras.push(
        Object.fromEntries(
          ACCESS_EXTRA_KEYS.map((extra, i) => [extra, (bits & (1 << i)) > 0]),
        ) as RoleAccess["extras"],
      );
    }
    return levels.flatMap((l) => extras.map((e) => ({ levels: l, extras: e })));
  }

  /** Each change of one step the screen makes: a level, or a switch. */
  function stepsFrom(
    access: RoleAccess,
  ): { area: AccessArea; after: RoleAccess }[] {
    const steps: { area: AccessArea; after: RoleAccess }[] = [];
    for (const area of ACCESS_AREAS) {
      for (const level of levelChoices(area)) {
        steps.push({ area, after: withLevel(access, area, level) });
      }
      for (const extra of extrasOf(area)) {
        for (const on of [true, false]) {
          steps.push({ area, after: withExtra(access, extra, on) });
        }
      }
    }
    return steps;
  }

  it("name what they named before, and the switch at view never beside edit", () => {
    const wrong: string[] = [];
    for (const before of everyState()) {
      for (const { area, after } of stepsFrom(before)) {
        for (const on of [true, false]) {
          const turned = extrasTurned(before, after, on);
          if (!same(today(turned), turnedBefore(before, after, on))) {
            wrong.push(`turned ${JSON.stringify({ before, after, on })}`);
          }
          const atEdit =
            before.levels.lists === "edit" || after.levels.lists === "edit";
          if (atEdit && turned.includes("lists.fix")) {
            wrong.push(`beside edit ${JSON.stringify({ before, after })}`);
          }
        }
        const change = areaChangeOf(
          area,
          areaAccess(before, area),
          areaAccess(after, area),
        );
        const level =
          before.levels[area] === after.levels[area]
            ? null
            : after.levels[area];
        if (
          change.level !== level ||
          !same(today(change.on), turnedBefore(before, after, true)) ||
          !same(today(change.off), turnedBefore(before, after, false))
        ) {
          wrong.push(`change ${JSON.stringify({ area, before, after })}`);
        }
        // The toast's undo brings back what the role held, and writes it
        // (it puts back the one area, and leaves the others alone).
        const undo = withAreaAccess(after, area, areaAccess(before, area));
        if (
          undo.levels[area] !== before.levels[area] ||
          ACCESS_EXTRA_KEYS.some(
            (extra) => holdsExtra(undo, extra) !== holdsExtra(before, extra),
          ) ||
          !same(
            areaGrants(area, areaAccess(undo, area)),
            areaGrants(area, areaAccess(before, area)),
          )
        ) {
          wrong.push(`undo ${JSON.stringify({ area, before, after })}`);
        }
      }
    }
    expect(wrong.slice(0, 5)).toEqual([]);
  });

  it("grant each of them as before, at edit while it is on", () => {
    const wrong: string[] = [];
    for (const access of everyState()) {
      for (const area of ACCESS_AREAS) {
        for (const grant of areaGrants(area, areaAccess(access, area))) {
          const extra = TODAY.find((key) => key === grant.perm);
          if (extra && grant.granted !== heldBefore(access, extra)) {
            wrong.push(`${area} ${extra} ${JSON.stringify(access)}`);
          }
        }
      }
    }
    expect(wrong.slice(0, 5)).toEqual([]);
  });

  it("are pinned for each switch, raised, lowered and switched alone", () => {
    const manager = defaultAccess("manager");
    const worker = defaultAccess("worker");
    const said = (before: RoleAccess, after: RoleAccess) => ({
      on: extrasTurned(before, after, true),
      off: extrasTurned(before, after, false),
    });
    // Raised to edit: the toast's "עם …", R10's editWith.
    expect(said(worker, withLevel(worker, "scheduling", "edit"))).toEqual({
      on: ["schedule.publish"],
      off: [],
    });
    expect(said(worker, withLevel(worker, "lists", "edit"))).toEqual({
      on: ["lists.send"],
      off: [],
    });
    expect(said(worker, withLevel(worker, "chat", "edit"))).toEqual({
      on: ["chat.announce", "chat.send_documents"],
      off: [],
    });
    for (const area of ["time_clock", "team", "manage"] as const) {
      expect(said(worker, withLevel(worker, area, "edit")), area).toEqual({
        on: [],
        off: [],
      });
    }
    // Lowered from edit: "ובלי …", R10's viewWithout.
    expect(said(manager, withLevel(manager, "scheduling", "view"))).toEqual({
      on: [],
      off: ["schedule.publish"],
    });
    expect(said(manager, withLevel(manager, "lists", "view"))).toEqual({
      on: [],
      off: ["lists.send"],
    });
    expect(said(manager, withLevel(manager, "chat", "view"))).toEqual({
      on: [],
      off: ["chat.announce", "chat.send_documents"],
    });
    expect(said(manager, withLevel(manager, "manage", "none"))).toEqual({
      on: [],
      off: [],
    });
    // One switch alone at edit: extraOn and extraOff.
    for (const extra of TODAY) {
      const off = withExtra(manager, extra, false);
      expect(said(manager, off), extra).toEqual({ on: [], off: [extra] });
      expect(said(off, manager), extra).toEqual({ on: [extra], off: [] });
    }
    // Lowered with sending already off says the level alone.
    const noSend = withExtra(
      withLevel(worker, "lists", "edit"),
      "lists.send",
      false,
    );
    expect(said(noSend, withLevel(noSend, "lists", "view"))).toEqual({
      on: [],
      off: [],
    });
    // And the one new word: fixing closed lists at view, on and off.
    const senior = withExtra(worker, "lists.fix", true);
    expect(said(worker, senior)).toEqual({ on: ["lists.fix"], off: [] });
    expect(said(senior, worker)).toEqual({ on: [], off: ["lists.fix"] });
    expect(said(senior, withLevel(senior, "lists", "edit"))).toEqual({
      on: ["lists.send"],
      off: [],
    });
  });
});
