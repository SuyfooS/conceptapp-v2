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
  manifest("lists"),
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

  it("starts a module the template leaves out off, with its defaults", () => {
    const input = template();
    delete input.modules.notifications;
    expect(validateTemplate(manifests, input).modules.notifications).toEqual({
      enabled: false,
      settings: { level: 1 },
    });
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

  it("refuses more tabs than the tab bar holds", () => {
    // Every fixture module gets a tab; the bar holds MAX_MODULE_NAV of them.
    const tabbed = manifests.map((m, i) => ({
      ...m,
      nav: {
        href: `/m${i}` as const,
        icon: "calendar" as const,
        minRole: "worker" as const,
        order: i,
      },
    }));
    expect(() => validateTemplate(tabbed, template())).toThrow(/tab bar/);

    const fewer = template();
    fewer.modules.notifications = { enabled: false, settings: {} };
    fewer.modules.lists = { enabled: false, settings: {} };
    expect(() => validateTemplate(tabbed, fewer)).not.toThrow();
  });

  it("starts a business with no departments or lists when it names none", () => {
    const valid = validateTemplate(manifests, template());
    expect(valid.departments).toEqual([]);
    expect(valid.listTemplates).toEqual([]);
  });

  it("keeps its departments and lists, a schedule going where its list goes", () => {
    const valid = validateTemplate(
      manifests,
      template({
        departments: [
          { key: "kitchen", name: "Kitchen" },
          { key: "bar", name: "Bar" },
        ],
        listTemplates: [
          {
            key: "kitchen-opening",
            name: "Kitchen opening",
            recipient: { kind: "department", department: "kitchen" },
            items: [{ kind: "check", label: "Clean" }],
            schedules: [{ days: [0], opens: "08:30", dueAfterMinutes: 45 }],
          },
        ],
      }),
    );
    expect(valid.departments.map((d) => d.key)).toEqual(["kitchen", "bar"]);
    expect(valid.listTemplates[0]?.schedules[0]?.recipient).toEqual({
      kind: "department",
      department: "kitchen",
    });
  });

  it("refuses lists that point at what the template doesn't have", () => {
    const list = (recipient: unknown, extra: Record<string, unknown> = {}) =>
      template({
        departments: [{ key: "kitchen", name: "Kitchen" }],
        listTemplates: [
          {
            key: "list",
            name: "List",
            recipient,
            items: [{ kind: "check", label: "A" }],
            ...extra,
          },
        ],
      });
    expect(() =>
      validateTemplate(
        manifests,
        list({ kind: "department", department: "bar" }),
      ),
    ).toThrow(/unknown department: bar/);
    // These fixtures' scheduling settings have no shift pattern.
    expect(() =>
      validateTemplate(manifests, list({ kind: "shift", shift: "evening" })),
    ).toThrow(/unknown shift: evening/);
    expect(() =>
      validateTemplate(
        manifests,
        list({ kind: "role", role: "worker" }, { fromDepartment: "kitchen" }),
      ),
    ).toThrow(/order/);
    // A photo item is a template's own from L6, as the restaurant's weekly
    // cleaning has one; a photo with a number's range is not.
    expect(
      validateTemplate(
        manifests,
        list(
          { kind: "role", role: "worker" },
          { items: [{ kind: "photo", label: "Picture", required: false }] },
        ),
      ).listTemplates[0]?.items[0]?.kind,
    ).toBe("photo");
    expect(() =>
      validateTemplate(
        manifests,
        list(
          { kind: "role", role: "worker" },
          { items: [{ kind: "photo", label: "Picture", unit: "°C" }] },
        ),
      ),
    ).toThrow(/Only numbers/);
    expect(() =>
      validateTemplate(
        manifests,
        template({
          departments: [
            { key: "kitchen", name: "Kitchen" },
            { key: "kitchen", name: "Second" },
          ],
        }),
      ),
    ).toThrow();
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
