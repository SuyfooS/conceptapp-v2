import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineManifest } from "./modules";
import {
  checkSettingsChange,
  describeSettings,
  fieldsFor,
  type SettingLevel,
  settingLevelOf,
} from "./settings-form";

const settings = z.object({
  on: z.boolean().default(false),
  round: z.union([z.literal(0), z.literal(5)]).default(0),
  mode: z.enum(["a", "b"]).default("a"),
  count: z.int().min(1).max(9).default(2),
  note: z.string().trim().max(20).default(""),
  due: z.string().default("18:00").meta({ editor: "time" }),
  people: z.array(z.string()).default([]).meta({ editor: "positions" }),
  advanced: z.boolean().default(false).meta({ level: "team" }),
  ownersOnly: z.boolean().default(false).meta({ level: "owner" }),
  secret: z.boolean().default(false).meta({ hidden: true }),
});

const manifest = defineManifest({
  key: "time_clock",
  requires: [],
  nav: null,
  homeWidget: null,
  permissions: [],
  settings,
});

describe("describeSettings", () => {
  it("says what each field needs on screen", () => {
    const fields = Object.fromEntries(
      describeSettings(settings).map((field) => [field.key, field]),
    );
    expect(fields.on).toMatchObject({ kind: "toggle", level: "business" });
    expect(fields.round).toMatchObject({ kind: "choice", options: [0, 5] });
    expect(fields.mode).toMatchObject({ kind: "choice", options: ["a", "b"] });
    expect(fields.count).toMatchObject({ kind: "number", min: 1, max: 9 });
    expect(fields.note).toMatchObject({ kind: "text", maxLength: 20 });
    expect(fields.due).toMatchObject({ kind: "editor", editor: "time" });
    expect(fields.people).toMatchObject({
      kind: "editor",
      editor: "positions",
    });
  });

  it("keeps a hidden field off the screen", () => {
    expect(describeSettings(settings).map((field) => field.key)).not.toContain(
      "secret",
    );
  });

  it("refuses a field no form can draw", () => {
    expect(() =>
      describeSettings(z.object({ list: z.array(z.string()).default([]) })),
    ).toThrow(/list/);
  });

  it("draws only whole numbers with both ends", () => {
    for (const [field, schema] of Object.entries({
      decimal: z.number().min(1).max(3).default(1),
      open: z.int().min(0).default(0),
    })) {
      expect(() => describeSettings(z.object({ [field]: schema }))).toThrow(
        field,
      );
    }
  });
});

describe("fieldsFor", () => {
  const keys = (level: SettingLevel) =>
    fieldsFor(settings, level).map((field) => field.key);

  it("shows the team's fields to the team only", () => {
    expect(keys("business")).not.toContain("advanced");
    expect(keys("owner")).not.toContain("advanced");
    expect(keys("team")).toContain("advanced");
  });

  it("shows owners' fields to owners and the team, not to managers", () => {
    expect(keys("business")).not.toContain("ownersOnly");
    expect(keys("owner")).toContain("ownersOnly");
    expect(keys("team")).toContain("ownersOnly");
    // Owners still see everything a manager does.
    expect(keys("owner")).toEqual(expect.arrayContaining(keys("business")));
    expect(
      describeSettings(settings).find((field) => field.key === "ownersOnly"),
    ).toMatchObject({ level: "owner", kind: "toggle" });
  });

  it("gives owners the owner level and everyone else the business level", () => {
    expect(settingLevelOf("owner")).toBe("owner");
    expect(settingLevelOf("manager")).toBe("business");
    expect(settingLevelOf("worker")).toBe("business");
  });
});

describe("checkSettingsChange", () => {
  it("returns only what changed, as the schema reads it", () => {
    expect(
      checkSettingsChange(manifest, {}, { note: "  hi  " }, "business"),
    ).toEqual({ ok: true, patch: { note: "hi" } });
  });

  it("refuses a team setting from a manager, and allows it from the team", () => {
    expect(
      checkSettingsChange(manifest, {}, { advanced: true }, "business"),
    ).toEqual({ ok: false, problem: "notAllowed" });
    expect(
      checkSettingsChange(manifest, {}, { advanced: true }, "team"),
    ).toEqual({ ok: true, patch: { advanced: true } });
  });

  it("refuses an owner's setting from a manager, and saves it from an owner", () => {
    expect(
      checkSettingsChange(manifest, {}, { ownersOnly: true }, "business"),
    ).toEqual({ ok: false, problem: "notAllowed" });
    expect(
      checkSettingsChange(manifest, {}, { ownersOnly: true }, "owner"),
    ).toEqual({ ok: true, patch: { ownersOnly: true } });
    expect(
      checkSettingsChange(manifest, {}, { ownersOnly: true }, "team"),
    ).toEqual({ ok: true, patch: { ownersOnly: true } });
    // A manager's own change goes through while the owner's field is left alone.
    expect(
      checkSettingsChange(
        manifest,
        { ownersOnly: true },
        { on: true },
        "business",
      ),
    ).toEqual({ ok: true, patch: { on: true } });
  });

  it("refuses a hidden field and an unknown one, even from the team", () => {
    for (const change of [{ secret: true }, { nope: 1 }]) {
      expect(checkSettingsChange(manifest, {}, change, "team")).toEqual({
        ok: false,
        problem: "notAllowed",
      });
    }
  });

  it("refuses a value the schema refuses", () => {
    expect(
      checkSettingsChange(manifest, {}, { count: 99 }, "business"),
    ).toEqual({ ok: false, problem: "invalid" });
  });

  it("refuses what isn't a change at all", () => {
    for (const change of [null, "x", {}]) {
      expect(checkSettingsChange(manifest, {}, change, "business").ok).toBe(
        false,
      );
    }
  });

  it("survives stored settings older than the manifest", () => {
    expect(
      checkSettingsChange(
        manifest,
        { count: 999, removed: true },
        { on: true },
        "business",
      ),
    ).toEqual({ ok: true, patch: { on: true } });
  });
});
