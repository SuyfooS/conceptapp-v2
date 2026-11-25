import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineManifest } from "./modules";
import {
  checkSettingsChange,
  describeSettings,
  fieldsFor,
  type SettingLevel,
  settingLevelOf,
  textSettingShown,
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

  // As scheduling's `fillWeekHours` is (filling from availability, part 5):
  // a bounded whole number, said to be the business's, drawn as a number
  // field for owners, managers and the team, its ends as the schema's.
  it("draws a bounded whole number of the business's level as a number for everyone who edits", () => {
    const hours = z.object({
      fillWeekHours: z
        .int()
        .min(4)
        .max(58)
        .default(42)
        .meta({ level: "business" }),
    });
    const drawn = {
      key: "fillWeekHours",
      level: "business",
      kind: "number",
      min: 4,
      max: 58,
    };
    expect(describeSettings(hours)).toEqual([drawn]);
    for (const level of ["business", "owner", "team"] as const) {
      expect(fieldsFor(hours, level), level).toEqual([drawn]);
    }
    const scheduling = defineManifest({
      key: "scheduling",
      requires: [],
      nav: null,
      homeWidget: null,
      permissions: [],
      settings: hours,
    });
    expect(
      checkSettingsChange(scheduling, {}, { fillWeekHours: 58 }, "business"),
    ).toEqual({ ok: true, patch: { fillWeekHours: 58 } });
    expect(
      checkSettingsChange(scheduling, {}, { fillWeekHours: 3 }, "business"),
    ).toEqual({ ok: false, problem: "invalid" });
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

describe("a text setting typed left to right", () => {
  const typed = z.object({
    phone: z
      .string()
      .max(20)
      .transform((value) => value.replace(/-/g, ""))
      .refine((value) => value === "" || /^0\d{8,9}$/.test(value))
      .default("")
      .meta({ level: "owner", entry: "phone" }),
    link: z.string().max(300).default("").meta({ entry: "link" }),
  });

  it("is still text, with its length and how it is typed", () => {
    expect(describeSettings(typed)).toEqual([
      {
        key: "phone",
        level: "owner",
        kind: "text",
        maxLength: 20,
        entry: "phone",
      },
      {
        key: "link",
        level: "business",
        kind: "text",
        maxLength: 300,
        entry: "link",
      },
    ]);
    // A plain one says nothing of it.
    expect(
      describeSettings(settings).find((field) => field.key === "note"),
    ).not.toHaveProperty("entry");
  });

  it("saves what the schema outputs, and refuses what it refuses", () => {
    const withPhone = defineManifest({
      key: "employee_files",
      requires: [],
      nav: null,
      homeWidget: null,
      permissions: [],
      settings: typed,
    });
    expect(
      checkSettingsChange(withPhone, {}, { phone: "03-123-4567" }, "owner"),
    ).toEqual({ ok: true, patch: { phone: "031234567" } });
    expect(
      checkSettingsChange(withPhone, {}, { phone: "12" }, "owner"),
    ).toEqual({ ok: false, problem: "invalid" });
  });
});

describe("a text setting in the activity log", () => {
  it("says nothing set as such, for every text setting", () => {
    for (const raw of ["", null, undefined]) {
      expect(textSettingShown(raw)).toBeNull();
      expect(textSettingShown(raw, "phone")).toBeNull();
      expect(textSettingShown(raw, "link")).toBeNull();
    }
  });

  it("keeps words as written, right to left with the page", () => {
    expect(textSettingShown("משרד רואי החשבון")).toEqual({
      text: "משרד רואי החשבון",
      ltr: false,
    });
  });

  it("draws an entry left to right, a phone as people write it", () => {
    expect(textSettingShown("+97231234567", "phone")).toEqual({
      text: "03-123-4567",
      ltr: true,
    });
    expect(textSettingShown("+972501234567", "phone")).toEqual({
      text: "050-123-4567",
      ltr: true,
    });
    expect(textSettingShown("https://101.example/noa", "link")).toEqual({
      text: "https://101.example/noa",
      ltr: true,
    });
    expect(textSettingShown("912345678", "digits")).toEqual({
      text: "912345678",
      ltr: true,
    });
  });
});
