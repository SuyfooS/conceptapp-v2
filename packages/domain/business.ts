import { accentTokens, parseHex } from "./color";
import { parseStaffList, type StaffEntry } from "./staff-list";
import { TEMPLATE_KEYS, type TemplateKey } from "./templates";

/**
 * A new business as the admin console's wizard collects it: a template,
 * then the name, the slug (the public page's address), an optional address,
 * the accent and the staff list to invite (`@domain/staff-list`). `parseNewBusiness` is the one check both the form (per
 * step) and the server action run; the database repeats the hard limits.
 */

export const BUSINESS_NAME_MAX = 80;
export const BUSINESS_ADDRESS_MAX = 200;
export const SLUG_MIN = 3;
export const SLUG_MAX = 40;

/** Same rule as the `businesses.slug` check in the database. */
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Slugs that would collide with the app's own paths or read as ours. The
 * public page lives at a business's slug, so these stay free.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "admin",
  "api",
  "app",
  "clock",
  "conceptapp",
  "design",
  "help",
  "home",
  "reservations",
  "schedule",
  "sign-in",
  "enter",
  "storefront",
  "support",
  "www",
]);

/**
 * The slug as typed, tidied: trimmed, lower case, spaces and underscores
 * turned into single hyphens, no hyphen at either end. Anything else
 * (Hebrew letters, punctuation) is kept so the check can reject it.
 */
export function normalizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const NEW_BUSINESS_FIELDS = [
  "template",
  "name",
  "slug",
  "address",
  "accent",
  "staff",
] as const;
export type NewBusinessField = (typeof NEW_BUSINESS_FIELDS)[number];

/** What can be wrong with each field ("taken" comes from the database). */
export type NewBusinessErrors = {
  template?: "required" | "invalid";
  name?: "required" | "tooLong";
  slug?: "required" | "tooShort" | "tooLong" | "invalid" | "reserved" | "taken";
  address?: "tooLong";
  accent?: "required" | "invalid";
  /** Details per line come from `parseStaffList`. */
  staff?: "invalid" | "tooMany";
};

export type NewBusiness = {
  template: TemplateKey;
  name: string;
  slug: string;
  /** Null when left empty. */
  address: string | null;
  /** The accent to store: the pick, darkened if it was not readable. */
  accent: string;
  /** People to invite, possibly none. */
  staff: StaffEntry[];
};

export type NewBusinessInput = Partial<Record<NewBusinessField, unknown>>;

const text = (value: unknown) => (typeof value === "string" ? value : "");

function templateError(value: string): NewBusinessErrors["template"] | null {
  if (!value) return "required";
  return TEMPLATE_KEYS.includes(value as TemplateKey) ? null : "invalid";
}

function nameError(value: string): NewBusinessErrors["name"] | null {
  if (!value) return "required";
  return value.length > BUSINESS_NAME_MAX ? "tooLong" : null;
}

function slugError(value: string): NewBusinessErrors["slug"] | null {
  if (!value) return "required";
  if (value.length < SLUG_MIN) return "tooShort";
  if (value.length > SLUG_MAX) return "tooLong";
  if (!SLUG_PATTERN.test(value)) return "invalid";
  return RESERVED_SLUGS.has(value) ? "reserved" : null;
}

function accentError(value: string): NewBusinessErrors["accent"] | null {
  if (!value) return "required";
  return /^#[0-9a-f]{6}$/i.test(value) && parseHex(value) ? null : "invalid";
}

export type ParsedNewBusiness =
  | { ok: true; value: NewBusiness }
  | { ok: false; errors: NewBusinessErrors };

/**
 * Checks the wizard's fields. Pass `only` to check some of them (one step
 * of the wizard); the result is then `ok` when those fields pass, with
 * `value` built from whatever was given.
 */
export function parseNewBusiness(
  input: NewBusinessInput,
  only: readonly NewBusinessField[] = NEW_BUSINESS_FIELDS,
): ParsedNewBusiness {
  const template = text(input.template).trim();
  const name = text(input.name).trim().replace(/\s+/g, " ");
  const slug = normalizeSlug(text(input.slug));
  const address = text(input.address).trim().replace(/\s+/g, " ");
  const accent = text(input.accent).trim();
  const staff = parseStaffList(text(input.staff));

  const found: { [F in NewBusinessField]-?: NewBusinessErrors[F] | null } = {
    template: templateError(template),
    name: nameError(name),
    slug: slugError(slug),
    address: address.length > BUSINESS_ADDRESS_MAX ? "tooLong" : null,
    accent: accentError(accent),
    staff: staff.error,
  };

  const errors: NewBusinessErrors = {};
  for (const field of only) {
    const error = found[field];
    // Each field keeps its own error type; the loop only copies them over.
    if (error) Object.assign(errors, { [field]: error });
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      template: template as TemplateKey,
      name,
      slug,
      address: address || null,
      accent: found.accent ? accent : accentTokens(accent).accent,
      staff: staff.entries,
    },
  };
}

/** Which wizard step each field is asked on, in order. */
export const NEW_BUSINESS_STEPS = [
  ["template"],
  ["name", "slug", "address"],
  ["accent"],
  ["staff"],
] as const satisfies readonly (readonly NewBusinessField[])[];

/** The first step holding one of the errors, so the form can go back to it. */
export function firstStepWithError(errors: NewBusinessErrors): number {
  const index = NEW_BUSINESS_STEPS.findIndex((fields) =>
    fields.some((field) => errors[field]),
  );
  return index === -1 ? 0 : index;
}
