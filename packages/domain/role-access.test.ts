import { describe, expect, it } from "vitest";
import {
  ACCESS_AREAS,
  ACCESS_EXTRA_KEYS,
  ACCESS_FLOOR,
  AREA_MODULE,
  areaAccess,
  areaOfExtra,
  checkRoleName,
  defaultAccess,
  editedAreas,
  editOrView,
  extraOpen,
  extrasOf,
  extrasTurned,
  holdsExtra,
  levelChoices,
  MODULE_AREAS,
  PLACE_AREAS,
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
