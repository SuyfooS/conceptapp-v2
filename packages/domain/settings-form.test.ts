import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineManifest } from "./modules";
import {
  checkSettingsChange,
  describeSettings,
  fieldsFor,
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
});

describe("fieldsFor", () => {
  it("shows the team's fields to the team only", () => {
    const keys = (level: "business" | "team") =>
      fieldsFor(settings, level).map((field) => field.key);
    expect(keys("business")).not.toContain("advanced");
    expect(keys("team")).toContain("advanced");
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
