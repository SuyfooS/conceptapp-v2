import { z } from "zod";
import { type DepartmentSeed, departmentSeeds } from "./departments";
import { openingHours } from "./hours";
import {
  type ListTemplateSeed,
  listTemplateProblem,
  listTemplateSeeds,
} from "./lists";
import {
  enabledModules,
  fitsTabBar,
  MAX_MODULE_NAV,
  MODULE_KEYS,
  type ModuleKey,
  type ModuleManifest,
  validateModuleSettings,
} from "./modules";

/**
 * A template is how a business starts: which modules are on, their
 * settings (positions and shifts are scheduling settings), the opening hours,
 * its departments and its lists (opening, closing, orders between
 * departments). Templates are rows in the `templates` table, written by
 * migrations; `public.apply_template` copies one into an empty business in
 * a single transaction. This file is the contract both sides are tested
 * against.
 */

/** In the order the wizard offers them: kinds first, the general one last. */
export const TEMPLATE_KEYS = [
  "retail",
  "restaurant",
  "cafe-bar",
  "general",
] as const;

export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

const moduleEntry = z.strictObject({
  enabled: z.boolean(),
  settings: z.record(z.string(), z.unknown()),
});

export const templateDefinition = z.strictObject({
  modules: z.partialRecord(z.enum(MODULE_KEYS), moduleEntry),
  openingHours,
  /** The business's own groups of people; none for a kind it can't know. */
  departments: departmentSeeds.default([]),
  /** The lists it starts with, pointing at its departments by key. */
  listTemplates: listTemplateSeeds.default([]),
});

export type TemplateDefinition = z.infer<typeof templateDefinition>;

export type ValidTemplate = {
  modules: Record<ModuleKey, { enabled: boolean; settings: unknown }>;
  openingHours: z.infer<typeof openingHours>;
  departments: DepartmentSeed[];
  listTemplates: ListTemplateSeed[];
};

/**
 * Checks a template (or a business it produced) against the manifests: every
 * module's settings valid with no unknown fields, every switched-on module's
 * requirements switched on too, no more tabs than the tab bar holds, and lists
 * that point only at the template's own departments and shifts. A module it
 * doesn't name starts off, with its defaults, so a module built for one
 * business touches no template. Throws with a readable message on the first
 * problem.
 */
export function validateTemplate(
  manifests: readonly ModuleManifest[],
  input: unknown,
): ValidTemplate {
  const parsed = templateDefinition.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid template: ${z.prettifyError(parsed.error)}`);
  }
  const { modules } = parsed.data;

  const result = {} as ValidTemplate["modules"];
  for (const manifest of manifests) {
    const entry = modules[manifest.key] ?? { enabled: false, settings: {} };
    const settings = validateModuleSettings(manifest, entry.settings);
    const unknown = Object.keys(entry.settings).filter(
      (field) => !(field in (settings as Record<string, unknown>)),
    );
    if (unknown.length > 0) {
      throw new Error(
        `Unknown settings for module ${manifest.key}: ${unknown.join(", ")}`,
      );
    }
    result[manifest.key] = { enabled: entry.enabled, settings };
  }

  const switchedOn = MODULE_KEYS.filter((key) => modules[key]?.enabled);
  const on = enabledModules(
    manifests,
    MODULE_KEYS.map((key) => ({
      key,
      enabled: modules[key]?.enabled ?? false,
      settings: modules[key]?.settings,
    })),
  );
  const blocked = switchedOn.filter((key) => !on.includes(key));
  if (blocked.length > 0) {
    throw new Error(
      `Modules switched on without what they require: ${blocked.join(", ")}`,
    );
  }
  if (!fitsTabBar(manifests, on)) {
    throw new Error(
      `More tabs than the tab bar holds (${MAX_MODULE_NAV}): ${on.join(", ")}`,
    );
  }

  const { departments, listTemplates } = parsed.data;
  const problem = listTemplateProblem(
    listTemplates,
    departments.map((d) => d.key),
    shiftKeysOf(result.scheduling?.settings),
  );
  if (problem) throw new Error(`Invalid template: ${problem}`);

  return {
    modules: result,
    openingHours: parsed.data.openingHours,
    departments,
    listTemplates,
  };
}

/** The keys of a scheduling settings' shift pattern, whatever it holds. */
function shiftKeysOf(settings: unknown): string[] {
  const parsed = z
    .object({ shifts: z.array(z.object({ key: z.string() })) })
    .safeParse(settings);
  return parsed.success ? parsed.data.shifts.map((shift) => shift.key) : [];
}
