import { z } from "zod";
import { openingHours } from "./hours";
import {
  enabledModules,
  MODULE_KEYS,
  type ModuleKey,
  type ModuleManifest,
  validateModuleSettings,
} from "./modules";

/**
 * A template is how a business starts: which modules are on, their
 * settings (positions and shifts are scheduling settings), and the opening
 * hours. Templates are rows in the `templates` table, written by
 * migrations; `public.apply_template` copies one into an empty business in
 * a single transaction. This file is the contract both sides are tested
 * against.
 */

export const TEMPLATE_KEYS = ["restaurant", "cafe-bar"] as const;

export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

const moduleEntry = z.strictObject({
  enabled: z.boolean(),
  settings: z.record(z.string(), z.unknown()),
});

export const templateDefinition = z.strictObject({
  modules: z.partialRecord(z.enum(MODULE_KEYS), moduleEntry),
  openingHours,
});

export type TemplateDefinition = z.infer<typeof templateDefinition>;

export type ValidTemplate = {
  modules: Record<ModuleKey, { enabled: boolean; settings: unknown }>;
  openingHours: z.infer<typeof openingHours>;
};

/**
 * Checks a template (or a business it produced) against the manifests: every
 * module's settings valid with no unknown fields, and every switched-on
 * module's requirements switched on too. A module it doesn't name starts off,
 * with its defaults, so a module built for one business touches no template.
 * Throws with a readable message on the first problem.
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

  return { modules: result, openingHours: parsed.data.openingHours };
}
