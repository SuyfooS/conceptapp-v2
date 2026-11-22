import { z } from "zod";
import { cleanTyped, oneLineSchema, tidyLine } from "./typed-text";

/*
 * A home address as Form 101 asks for it (part ב, "רחוב/שכונה"): a street with
 * its number; when there is no street name ("אין שם רחוב"), a neighbourhood or
 * place with the number optional, or a P.O. box. The city is a CBS settlement
 * code (סמל יישוב); its list and search come with CityField. Zip optional.
 */

export const ZIP_DIGITS = 7;

/** "61000 01" → "6100001"; seven digits, not all zeros; null otherwise. */
export function normalizeZip(input: string): string | null {
  const zip = cleanTyped(input).replace(/[\s-]/g, "");
  if (zip.length !== ZIP_DIGITS || !/^\d+$/.test(zip)) return null;
  return /^0+$/.test(zip) ? null : zip;
}

/** A zip code as typed, stored as its seven digits; the issue says "zip". */
export const zipSchema: z.ZodType<string, string> = z
  .string()
  .transform((value, ctx) => {
    const zip = normalizeZip(value);
    if (zip === null) {
      ctx.addIssue({ code: "custom", message: "zip" });
      return z.NEVER;
    }
    return zip;
  });

/**
 * A house number: 1–4 digits and at most one letter, Hebrew or Latin ("12א",
 * "12 א", "12A" → "12A"), stored without the space, a Latin letter in capitals
 * and the digits without leading zeros. Zero is no number.
 */
export function normalizeHouseNumber(input: string): string | null {
  const match = /^(\d{1,4})[ -]?([A-Za-zא-ת])?$/.exec(cleanTyped(input).trim());
  if (!match?.[1]) return null;
  const number = Number(match[1]);
  if (number === 0) return null;
  return `${number}${(match[2] ?? "").toUpperCase()}`;
}

/** A house number as typed, stored by `normalizeHouseNumber`; the issue says "houseNumber". */
export const houseNumberSchema: z.ZodType<string, string> = z
  .string()
  .transform((value, ctx) => {
    const number = normalizeHouseNumber(value);
    if (number === null) {
      ctx.addIssue({ code: "custom", message: "houseNumber" });
      return z.NEVER;
    }
    return number;
  });

/** A CBS settlement code (סמל יישוב). The list and its search come with CityField. */
export const cityCodeSchema = z.number().int().min(1).max(9999);

/** A P.O. box: digits only, 1–6 of them. The screen shows "ת.ד." beside the field, not in it. */
export const poBoxSchema = z
  .string()
  .transform((value) => cleanTyped(value).trim())
  .pipe(z.string().regex(/^\d{1,6}$/));

export const ADDRESS_TEXT_MAX = 60;
const addressText = oneLineSchema(1, ADDRESS_TEXT_MAX);
/** An apartment's most characters: short, one line ("12", "3ב"). */
export const APARTMENT_MAX = 10;
const apartment = oneLineSchema(1, APARTMENT_MAX);

/**
 * The 101's "רחוב/שכונה" field: a street with its number; a neighbourhood
 * or place with the number optional ("אין שם רחוב"); or a P.O. box. Apartment
 * and zip optional. Texts are trimmed, one line, 1–60 characters.
 */
export const addressSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("street"),
    cityCode: cityCodeSchema,
    street: addressText,
    number: houseNumberSchema,
    apartment: apartment.optional(),
    zip: zipSchema.optional(),
  }),
  z.object({
    kind: z.literal("area"),
    cityCode: cityCodeSchema,
    area: addressText,
    number: houseNumberSchema.optional(),
    apartment: apartment.optional(),
    zip: zipSchema.optional(),
  }),
  z.object({
    kind: z.literal("poBox"),
    cityCode: cityCodeSchema,
    poBox: poBoxSchema,
    zip: zipSchema.optional(),
  }),
]);

export type Address = z.infer<typeof addressSchema>;

/** The typed fields of an address a screen says a problem under. */
export type AddressField =
  | "street"
  | "area"
  | "number"
  | "apartment"
  | "zip"
  | "poBox";

/** Why a typed field is refused: too long, or not one of its kind (a zip, a house number, a P.O. box, one line). */
export type AddressProblem = "tooLong" | "invalid";

const ADDRESS_FIELDS: readonly AddressField[] = [
  "street",
  "area",
  "number",
  "apartment",
  "zip",
  "poBox",
];

/**
 * Where `addressSchema` refuses an address, field by field, so a screen can
 * say each refusal under its own field and none goes unsaid: too long, or
 * not one of its kind. A field left empty is no problem here (the screen
 * counts what is still missing), and neither is the town, which is chosen
 * from a list.
 */
export function addressProblems(
  input: Readonly<Record<string, unknown>>,
): Partial<Record<AddressField, AddressProblem>> {
  const checked = addressSchema.safeParse(input);
  if (checked.success) return {};
  const problems: Partial<Record<AddressField, AddressProblem>> = {};
  for (const issue of checked.error.issues) {
    const field = ADDRESS_FIELDS.find((name) => name === issue.path[0]);
    if (!field || problems[field]) continue;
    const typed = input[field];
    if (typeof typed !== "string" || tidyLine(typed) === "") continue;
    problems[field] = issue.code === "too_big" ? "tooLong" : "invalid";
  }
  return problems;
}
