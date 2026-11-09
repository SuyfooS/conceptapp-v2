import { z } from "zod";
import { israeliIdSchema } from "./israeli-id";
import { cleanTyped, oneLineSchema } from "./typed-text";

/*
 * The document a worker is identified by: an Israeli ID, or for someone
 * without one a passport (number, issuing country, expiry) or another official
 * document (its name, number, and optionally country and expiry). The number
 * is encrypted when stored (H4); only its hint is kept in the clear.
 */

export const ID_KINDS = ["il", "passport", "other"] as const;
export type IdKind = (typeof ID_KINDS)[number];

/**
 * The day the country list below was taken. ISO 3166-1 has assigned no new
 * alpha-2 code since SS (South Sudan) in 2011; a change there is a new list
 * and a new date, by PR.
 */
export const COUNTRIES_AS_OF = "2026-11-09";

/**
 * ISO 3166-1 alpha-2, the 249 codes as of `COUNTRIES_AS_OF`, plus XK (Kosovo,
 * user-assigned in ISO but used on passports). Names come from
 * Intl.DisplayNames on screen, so there are none here or in the messages.
 */
// biome-ignore format: a table of codes, kept compact
export const ISO_COUNTRIES = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU",
  "AW", "AX", "AZ", "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL",
  "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY", "BZ", "CA", "CC",
  "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR", "CU", "CV",
  "CW", "CX", "CY", "CZ", "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE", "EG",
  "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FM", "FO", "FR", "GA", "GB", "GD",
  "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT",
  "GU", "GW", "GY", "HK", "HM", "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM",
  "IN", "IO", "IQ", "IR", "IS", "IT", "JE", "JM", "JO", "JP", "KE", "KG", "KH",
  "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC", "LI", "LK",
  "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MH",
  "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW",
  "MX", "MY", "MZ", "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR",
  "NU", "NZ", "OM", "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR",
  "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW", "SA", "SB", "SC",
  "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS",
  "ST", "SV", "SX", "SY", "SZ", "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL",
  "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "UM", "US", "UY",
  "UZ", "VA", "VC", "VE", "VG", "VI", "VN", "VU", "WF", "WS", "YE", "YT", "ZA",
  "ZM", "ZW",
  "XK",
] as const;

export type Country = (typeof ISO_COUNTRIES)[number];

/**
 * A document number as stored: upper case, A–Z and 0–9 only, spaces and dashes
 * dropped; null when anything else is left.
 */
export function normalizeDocumentNumber(input: string): string | null {
  const text = cleanTyped(input).replace(/[\s-]/g, "");
  // Checked before upper-casing, so "ß" can't turn into "SS".
  if (!/^[A-Za-z0-9]+$/.test(text)) return null;
  return text.toUpperCase();
}

/** The last four characters, for `id_hint` (^[0-9A-Z]{4}$). */
export function documentHint(number: string): string {
  return number.slice(-4).padStart(4, "0");
}

/** A document number as typed, `min` to `max` characters once normalized. */
function documentNumberSchema(min: number, max: number) {
  return z
    .string()
    .transform((value, ctx) => {
      const number = normalizeDocumentNumber(value);
      if (number === null) {
        ctx.addIssue({ code: "custom", message: "documentNumber" });
        return z.NEVER;
      }
      return number;
    })
    .pipe(z.string().min(min).max(max));
}

const country = z.enum(ISO_COUNTRIES);

/** An expiry date, YYYY-MM-DD, a real day between 2000 and 2100. */
const expiresOn = z.iso
  .date()
  .refine((day) => day >= "2000-01-01" && day <= "2100-12-31", {
    message: "dateRange",
  });

export const passportSchema = z.object({
  number: documentNumberSchema(5, 20),
  country,
  expiresOn: expiresOn.optional(),
});

export const otherDocumentSchema = z.object({
  /** What the document is called, e.g. "תעודת מבקש מקלט". */
  name: oneLineSchema(2, 40),
  number: documentNumberSchema(4, 20),
  country: country.optional(),
  expiresOn: expiresOn.optional(),
});

export const identityDocumentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("il"), number: israeliIdSchema }),
  passportSchema.extend({ kind: z.literal("passport") }),
  otherDocumentSchema.extend({ kind: z.literal("other") }),
]);

export type IdentityDocument = z.infer<typeof identityDocumentSchema>;
