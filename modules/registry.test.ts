import { Constants } from "@db/database.types";
import {
  MODULE_KEYS,
  type ModuleManifest,
  ROLES,
  readModuleSettings,
} from "@domain/modules";
import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import he from "../messages/he.json";
import { manifestFor, manifests } from "./registry";

describe("module registry", () => {
  it("has one manifest per module key, matching the database enum", () => {
    expect(manifests.map((m) => m.key)).toEqual([...MODULE_KEYS]);
    expect([...Constants.public.Enums.module_key]).toEqual([...MODULE_KEYS]);
    expect([...Constants.public.Enums.member_role]).toEqual([...ROLES]);
  });

  it("finds each manifest by key", () => {
    for (const key of MODULE_KEYS) expect(manifestFor(key).key).toBe(key);
  });

  it("gives every module complete default settings", () => {
    const all: readonly ModuleManifest[] = manifests;
    for (const manifest of all) {
      expect(() => manifest.settings.parse({})).not.toThrow();
      expect(readModuleSettings(manifest, {})).toEqual(
        manifest.settings.parse({}),
      );
    }
  });

  it("gives every nav item its own place next to home", () => {
    // How many fit is checked per business and template (`fitsTabBar`),
    // so the registry may hold more modules with a tab than the bar does.
    const hrefs = manifests.filter((m) => m.nav).map((m) => m.nav?.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).not.toContain("/home");
  });

  it("only puts home cards on modules with a screen", () => {
    for (const m of manifests) if (m.homeWidget) expect(m.nav).not.toBeNull();
  });

  it("names each permission once", () => {
    const keys = manifests.flatMap((m) => m.permissions.map((p) => p.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("only requires modules that exist", () => {
    for (const m of manifests) {
      for (const dep of m.requires) expect(MODULE_KEYS).toContain(dep);
      expect(m.requires).not.toContain(m.key);
    }
  });

  it("has a name and description in Hebrew and English for every module", () => {
    for (const key of MODULE_KEYS) {
      for (const messages of [he, en]) {
        expect(messages.modules[key].name).toBeTruthy();
        expect(messages.modules[key].description).toBeTruthy();
      }
    }
  });
});
