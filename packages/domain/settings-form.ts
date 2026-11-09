import { z } from "zod";
import type { ModuleManifest, Role } from "./modules";
import { readModuleSettings } from "./modules";

/**
 * Settings become screens by themselves. A module's settings schema says what
 * each field is, and this turns it into a description a form can draw, so a new
 * setting gets its place on screen without new screen code: it needs only a
 * label in the message files, which a test checks.
 *
 * A field says more through Zod's `.meta()`, typed below.
 */

/**
 * Who edits a field. business: owners, managers and the ConceptApp team. owner:
 * owners and the team (the database enforces it where it matters:
 * set_module_settings for the punch code). team: only the team, for what could
 * break a business if changed lightly.
 */
export type SettingLevel = "business" | "owner" | "team";

/** Each level sees its own fields and those of the levels below it. */
const RANK: Record<SettingLevel, number> = { business: 0, owner: 1, team: 2 };

/** The level a member of the business edits at: owners their own, everyone else the business's. */
export function settingLevelOf(role: Role): Exclude<SettingLevel, "team"> {
  return role === "owner" ? "owner" : "business";
}

export type SettingEditor = "positions" | "shifts" | "weekday" | "time";

type SettingMeta = {
  level?: SettingLevel;
  /** Kept in the settings, but on no screen. */
  hidden?: boolean;
  /** Drawn by a control of its own, not by its type. */
  editor?: SettingEditor;
};

declare module "zod" {
  interface GlobalMeta {
    level?: SettingLevel;
    hidden?: boolean;
    editor?: SettingEditor;
  }
}

type Common = { key: string; level: SettingLevel };

export type SettingField = Common &
  (
    | { kind: "toggle" }
    | { kind: "choice"; options: (string | number)[] }
    | { kind: "number"; min: number; max: number }
    | { kind: "text"; maxLength?: number }
    | { kind: "editor"; editor: SettingEditor }
  );

type JsonSchema = SettingMeta & {
  type?: string;
  const?: string | number;
  enum?: (string | number)[];
  anyOf?: JsonSchema[];
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  properties?: Record<string, JsonSchema>;
};

/** Zod fills in the largest safe integer for a bound nobody set. */
const MAX_NUMBER_SETTING = 100_000;

function shapeOf(schema: JsonSchema) {
  if (schema.editor) {
    return { kind: "editor" as const, editor: schema.editor };
  }
  if (schema.type === "boolean") return { kind: "toggle" as const };
  const options =
    schema.enum ??
    schema.anyOf?.flatMap((option) =>
      option.const === undefined ? [] : [option.const],
    );
  if (options?.length) return { kind: "choice" as const, options };
  // Whole numbers with both ends: anything else needs an editor of its own.
  if (
    schema.type === "integer" &&
    schema.minimum !== undefined &&
    schema.maximum !== undefined &&
    schema.maximum <= MAX_NUMBER_SETTING
  ) {
    return {
      kind: "number" as const,
      min: schema.minimum,
      max: schema.maximum,
    };
  }
  if (schema.type === "string") {
    return { kind: "text" as const, maxLength: schema.maxLength };
  }
  return null;
}

/**
 * What a settings schema asks for on screen, in the schema's order. Throws on a
 * field no form can draw, so a new kind of setting is noticed by a test rather
 * than missing from the screen.
 */
export function describeSettings(settings: z.ZodType): SettingField[] {
  const schema = z.toJSONSchema(settings, {
    io: "input",
    unrepresentable: "any",
  }) as JsonSchema;
  return Object.entries(schema.properties ?? {}).flatMap(([key, field]) => {
    if (field.hidden) return [];
    const shape = shapeOf(field);
    if (!shape) {
      throw new Error(`Setting ${key} needs an editor in its .meta()`);
    }
    return [{ key, level: field.level ?? "business", ...shape }];
  });
}

/** The fields someone at this level sees: the team sees them all. */
export function fieldsFor(
  settings: z.ZodType,
  level: SettingLevel,
): SettingField[] {
  return describeSettings(settings).filter(
    (field) => RANK[field.level] <= RANK[level],
  );
}

export type SettingsChange =
  | { ok: true; patch: Record<string, unknown> }
  | { ok: false; problem: "notAllowed" | "invalid" };

/**
 * Checks some changed settings before saving: each field is one this person may
 * edit, and the settings are valid as a whole once it's applied. What's stored
 * may be older than the manifest, so it's read leniently first. Returns the changed
 * fields as the schema reads them.
 */
export function checkSettingsChange(
  manifest: ModuleManifest,
  stored: unknown,
  change: unknown,
  level: SettingLevel,
): SettingsChange {
  const parsed = z.record(z.string(), z.unknown()).safeParse(change);
  if (!parsed.success) return { ok: false, problem: "invalid" };

  const allowed = new Set(
    fieldsFor(manifest.settings, level).map((field) => field.key),
  );
  const keys = Object.keys(parsed.data);
  if (keys.length === 0 || keys.some((key) => !allowed.has(key))) {
    return { ok: false, problem: "notAllowed" };
  }

  const current = readModuleSettings(manifest, stored) as Record<
    string,
    unknown
  >;
  const merged = manifest.settings.safeParse({ ...current, ...parsed.data });
  if (!merged.success) return { ok: false, problem: "invalid" };
  const values = merged.data as Record<string, unknown>;
  return {
    ok: true,
    patch: Object.fromEntries(keys.map((key) => [key, values[key]])),
  };
}
