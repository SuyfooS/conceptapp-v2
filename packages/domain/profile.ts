import { z } from "zod";
import { atLeast, isStaff, type Role, type Viewer } from "./modules";
import { canEditTeam, parseTeamName, sameTeamName } from "./team";

/**
 * The profile a person's colleagues read (issue #82, H2): one line about
 * themselves, a cover drawn in the business's colour, and how the app
 * addresses them. The database holds the same limits
 * (20261109000400_profile_about.sql); these are the screen's.
 */

/** The longest line about yourself, in characters as Postgres counts them. */
export const BIO_MAX = 160;

/**
 * The covers a profile can wear, each drawn by @ui/profile-cover in the
 * reader's business colour. The database checks only a key's form, so a new
 * one needs no migration; a stored key this list no longer has draws the
 * default.
 */
export const COVER_PRESETS = [
  "glow",
  "waves",
  "arcs",
  "dots",
  "stripes",
  "horizon",
  "mosaic",
  "bloom",
] as const;
export type CoverPreset = (typeof COVER_PRESETS)[number];
export const DEFAULT_COVER: CoverPreset = "glow";

export function isCoverPreset(value: unknown): value is CoverPreset {
  return (COVER_PRESETS as readonly unknown[]).includes(value);
}

/** A stored cover as one we draw; an unknown or empty key draws the default. */
export function coverOf(value: string | null | undefined): CoverPreset {
  return isCoverPreset(value) ? value : DEFAULT_COVER;
}

/**
 * How the app addresses someone and writes about them: feminine, masculine,
 * or without gender ("x"). Chosen by the person; never read from, or written
 * into, anything legal.
 */
export const ADDRESS_FORMS = ["f", "m", "x"] as const;
export type AddressForm = (typeof ADDRESS_FORMS)[number];

/** A stored form of address, or null when none was chosen (or it's unknown). */
export function addressFormOf(value: unknown): AddressForm | null {
  return (ADDRESS_FORMS as readonly unknown[]).includes(value)
    ? (value as AddressForm)
    : null;
}

/**
 * What an ICU `select` reads: the chosen form, or "x" (the neutral words)
 * until one is chosen. Not for showing which form was chosen: there "not
 * chosen" is its own answer.
 */
export function formArg(form: AddressForm | null | undefined): AddressForm {
  return form ?? "x";
}

/**
 * The languages a person may read the app in (`profiles.locale`, checked
 * there too). The same as the app's locales in i18n/config.ts, which the
 * domain can't import (tooling/messages.test.ts holds the two equal). Only the
 * hiring file follows it so far (H5a); the rest of the app speaks Hebrew.
 */
export const PROFILE_LOCALES = ["he", "en"] as const;
export type ProfileLocale = (typeof PROFILE_LOCALES)[number];

/** A stored language, or Hebrew for one the app doesn't speak. */
export function profileLocaleOf(value: unknown): ProfileLocale {
  return (PROFILE_LOCALES as readonly unknown[]).includes(value)
    ? (value as ProfileLocale)
    : "he";
}

/**
 * A line about yourself as it is kept: NFC, every run of white space (line
 * breaks included) one space, other control characters dropped, trimmed.
 */
export function normalizeBio(text: string): string {
  return text
    .normalize("NFC")
    .replace(/\s+/gu, " ")
    .replace(/\p{Cc}/gu, "")
    .trim();
}

/** Characters as Postgres counts them: code points, so an emoji is one. */
export function bioLength(text: string): number {
  return [...text].length;
}

/** A change from the profile screen, as the screen names things. */
export type ProfileChange = {
  /**
   * Their own name (`profiles.full_name`), kept as the team keeps a name
   * (`parseTeamName`). Never cleared: someone named stays named.
   */
  name?: string;
  bio?: string | null;
  cover?: CoverPreset | null;
  addressForm?: AddressForm | null;
  /** Never cleared: the column always holds one. */
  locale?: ProfileLocale;
};

/** The same change as set_own_profile takes it: keys are column names. */
export type ProfilePatch = Partial<
  Record<
    "full_name" | "bio" | "cover" | "address_form" | "locale",
    string | null
  >
>;

export type ProfileProblem =
  | "empty"
  | "bioTooLong"
  | "nameRequired"
  | "nameTooLong"
  | "invalid";

/** Everything saving a profile change can answer with, for the screen's words. */
export type ProfileFailure =
  | ProfileProblem
  | "demo"
  | "noAccess"
  /** A colleague's line was rewritten since it was read, so it stays. */
  | "changed"
  /**
   * The person switched business since the screen was drawn (payroll P3b),
   * so a colleague's line there stays.
   */
  | "businessChanged"
  | "notYet"
  | "failed"
  | "viewOnly";

export type ProfileSaveResult =
  | { ok: true }
  | { ok: false; failure: ProfileFailure };

const changeSchema = z
  .object({
    // Generous, as the team's fix takes one: the length is checked after
    // normalizing, with its own answer. Never null: a name isn't cleared.
    name: z.string().max(400).optional(),
    // Generous: the length is checked after normalizing, with its own answer.
    bio: z.string().max(4000).nullable().optional(),
    cover: z.enum(COVER_PRESETS).nullable().optional(),
    addressForm: z.enum(ADDRESS_FORMS).nullable().optional(),
    locale: z.enum(PROFILE_LOCALES).optional(),
  })
  .strict();

/** Checks a change from the screen and turns it into the database's patch. */
export function checkProfileChange(
  change: unknown,
): { ok: true; patch: ProfilePatch } | { ok: false; problem: ProfileProblem } {
  const parsed = changeSchema.safeParse(change);
  if (!parsed.success) return { ok: false, problem: "invalid" };
  const { name, bio, cover, addressForm, locale } = parsed.data;
  const patch: ProfilePatch = {};
  if (name !== undefined) {
    const kept = parseTeamName(name);
    if (!kept.ok) {
      return {
        ok: false,
        problem: kept.error === "required" ? "nameRequired" : "nameTooLong",
      };
    }
    patch.full_name = kept.name;
  }
  if (bio !== undefined) {
    const line = bio === null ? "" : normalizeBio(bio);
    if (bioLength(line) > BIO_MAX) return { ok: false, problem: "bioTooLong" };
    patch.bio = line || null;
  }
  if (cover !== undefined) patch.cover = cover;
  if (addressForm !== undefined) patch.address_form = addressForm;
  if (locale !== undefined) patch.locale = locale;
  if (Object.keys(patch).length === 0) return { ok: false, problem: "empty" };
  return { ok: true, patch };
}

/**
 * The name a business keeps for the person over their own
 * (`public.member_names`), as `/me` says it beside their own: `shown`, the
 * name the business shows them by (`CurrentMember.name`), when it is not
 * their own name `own` as the team keeps names (`sameTeamName`); null when
 * it is, or when there is none.
 */
export function keptNameOf(
  shown: string | null | undefined,
  own: string | null | undefined,
): string | null {
  return shown && !sameTeamName(shown, own) ? shown : null;
}

/**
 * The line a manager asks to delete, as the screen read it, so a line
 * rewritten since is not the one deleted. Null when it can't be a kept line.
 * Taken as it came: the database compares it with the stored one exactly.
 */
export function seenBioOf(value: unknown): string | null {
  const parsed = z.string().min(1).max(4000).safeParse(value);
  return parsed.success && bioLength(parsed.data) <= BIO_MAX
    ? parsed.data
    : null;
}

/**
 * Whether the viewer may clear the line of someone in `person`'s role, when
 * it is abusive: whoever edits the team (`canEditTeam`, the roles plan's
 * R6), the line of their own role or one below it. By default owners clear
 * anyone's, managers anyone's but an owner's, and workers nobody's; a worker
 * raised to edit the team, a worker's. An accountant, at a worker's rank and
 * with one line in every business they serve, is cleared only from above
 * (a manager, an owner). The database holds the same rule
 * (`public.clear_profile_bio`).
 */
export function mayClearBio(viewer: Viewer, person: Role): boolean {
  return (
    canEditTeam(viewer) &&
    atLeast(viewer.role, person) &&
    (isStaff(person) || !atLeast(person, viewer.role))
  );
}
