import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineManifest, MODULE_KEYS, type ModuleManifest } from "./modules";
import { validateTemplate } from "./templates";

// Fixtures, independent of the real manifests in modules/ (those are
// checked against the real templates in modules/templates.db.test.ts).
const manifest = (
  key: (typeof MODULE_KEYS)[number],
  requires: (typeof MODULE_KEYS)[number][] = [],
) =>
  defineManifest({
    key,
    requires,
    nav: null,
    homeWidget: null,
    permissions: [],
    settings: z.object({ level: z.int().min(0).max(5).default(1) }),
  });

const manifests: ModuleManifest[] = [
  manifest("scheduling"),
  manifest("time_clock", ["scheduling"]),
  manifest("reservations"),
  manifest("storefront"),
  manifest("notifications"),
];

const template = (overrides: Record<string, unknown> = {}) => ({
  modules: Object.fromEntries(
    MODULE_KEYS.map((key) => [key, { enabled: true, settings: {} }]),
  ),
  openingHours: [{ day: 0, open: "09:00", close: "17:00" }],
  ...overrides,
});

describe("validateTemplate", () => {
  it("fills every module's settings with defaults", () => {
    const valid = validateTemplate(manifests, template());
    expect(Object.keys(valid.modules)).toEqual([...MODULE_KEYS]);
    expect(valid.modules.scheduling).toEqual({
      enabled: true,
      settings: { level: 1 },
    });
    expect(valid.openingHours).toHaveLength(1);
  });

  it("keeps settings the template sets", () => {
    const input = template();
    input.modules.storefront = { enabled: false, settings: { level: 4 } };
    expect(validateTemplate(manifests, input).modules.storefront).toEqual({
      enabled: false,
      settings: { level: 4 },
    });
  });

  it("refuses a template that leaves out a module", () => {
    const input = template();
    delete input.modules.notifications;
    expect(() => validateTemplate(manifests, input)).toThrow(/notifications/);
  });

  it("refuses invalid and unknown settings", () => {
    const invalid = template();
    invalid.modules.scheduling = { enabled: true, settings: { level: 9 } };
    expect(() => validateTemplate(manifests, invalid)).toThrow(/scheduling/);

    const unknown = template();
    unknown.modules.reservations = { enabled: true, settings: { levle: 2 } };
    expect(() => validateTemplate(manifests, unknown)).toThrow(/levle/);
  });

  it("refuses a module switched on without what it requires", () => {
    const input = template();
    input.modules.scheduling = { enabled: false, settings: {} };
    expect(() => validateTemplate(manifests, input)).toThrow(/time_clock/);
  });

  it("refuses unknown modules, unknown fields and bad hours", () => {
    const extraModule = template();
    extraModule.modules.payroll = { enabled: true, settings: {} };
    expect(() => validateTemplate(manifests, extraModule)).toThrow();
    expect(() =>
      validateTemplate(manifests, template({ colour: "#000000" })),
    ).toThrow();
    expect(() =>
      validateTemplate(
        manifests,
        template({ openingHours: [{ day: 9, open: "09:00", close: "17:00" }] }),
      ),
    ).toThrow();
  });
});
