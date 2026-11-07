import {
  accentError,
  BUSINESS_ADDRESS_MAX,
  nameError,
  tidyText,
} from "./business";
import { accentTokens } from "./color";
import { type ShabbatCity, shabbatCityOf } from "./shabbat";

/**
 * A business's own details, which its owner, its managers and the ConceptApp
 * team change from a screen: the name, the colour, the address and the city its
 * Shabbat times follow. Each control saves one of them, so a change names some
 * and leaves the rest. `checkBusinessDetailsChange` is the one check the screen,
 * the console and their demos run; the database repeats the hard limits.
 */

export type BusinessDetails = {
  name: string;
  accent: string;
  /** Null when there is none. */
  address: string | null;
  /** Null until one is chosen: the times are then Tel Aviv's. */
  shabbatCity: ShabbatCity | null;
};

export const BUSINESS_DETAIL_KEYS = [
  "name",
  "accent",
  "address",
  "shabbatCity",
] as const satisfies readonly (keyof BusinessDetails)[];

export type BusinessDetailKey = (typeof BUSINESS_DETAIL_KEYS)[number];

/** Some of the details, as they're stored. */
export type BusinessDetailsPatch = Partial<
  Omit<BusinessDetails, "shabbatCity"> & { shabbatCity: ShabbatCity }
>;

/** What can be wrong with what was typed, for the screen to say. */
export type BusinessDetailProblem = {
  name?: "required" | "tooLong";
  accent?: "required" | "invalid";
  address?: "tooLong";
  shabbatCity?: "invalid";
};

/** What's wrong with one detail as typed, or null when it can be saved. */
export function businessDetailProblem(
  key: BusinessDetailKey,
  value: unknown,
): BusinessDetailProblem[BusinessDetailKey] | null {
  switch (key) {
    case "name":
      return nameError(tidyText(value));
    case "accent":
      return accentError(typeof value === "string" ? value.trim() : "");
    case "address":
      return tidyText(value).length > BUSINESS_ADDRESS_MAX ? "tooLong" : null;
    case "shabbatCity":
      return shabbatCityOf(value) ? null : "invalid";
  }
}

/** One detail as it is stored: tidied, the colour made readable, no empty address. */
function stored(key: BusinessDetailKey, value: unknown) {
  switch (key) {
    case "name":
      return tidyText(value);
    case "accent":
      return accentTokens(String(value).trim().toLowerCase()).accent;
    case "address":
      return tidyText(value) || null;
    case "shabbatCity":
      return shabbatCityOf(value);
  }
}

export type CheckedBusinessDetails =
  | { ok: true; patch: BusinessDetailsPatch }
  | { ok: false; problem: "invalid" };

/**
 * Checks a change from the screen, which isn't trusted: an object naming at
 * least one detail, nothing else, each of them valid. A city can be changed
 * but not taken away.
 */
export function checkBusinessDetailsChange(
  change: unknown,
): CheckedBusinessDetails {
  if (typeof change !== "object" || change === null || Array.isArray(change)) {
    return { ok: false, problem: "invalid" };
  }
  const entries = Object.entries(change);
  if (entries.length === 0) return { ok: false, problem: "invalid" };

  const patch: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    const known = BUSINESS_DETAIL_KEYS.find((detail) => detail === key);
    const text =
      typeof value === "string" || (known === "address" && value === null);
    if (!known || !text || businessDetailProblem(known, value)) {
      return { ok: false, problem: "invalid" };
    }
    patch[known] = stored(known, value);
  }
  return { ok: true, patch: patch as BusinessDetailsPatch };
}
