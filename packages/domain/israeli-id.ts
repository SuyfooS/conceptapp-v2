import { z } from "zod";
import { cleanTyped } from "./typed-text";

/*
 * The Israeli ID number (מספר זהות), which payslips, the notice of terms, the
 * 101, pension and the safety register all need. Nine digits, the last a check
 * digit. There is no primary specification of the check; this is the one every
 * common validator uses: weights 1, 2, 1, 2… from the left, a product over 9
 * counts as the sum of its digits, and the total is a multiple of 10.
 */

export const ISRAELI_ID_DIGITS = 9;

/**
 * The nine-digit form of an Israeli ID number, or null. Spaces, dashes and dots
 * are dropped; 1–9 digits are padded with zeros on the left; the check digit
 * must hold (weights 1,2,1,2…; a product over 9 counts its digit sum; the total
 * is a multiple of 10). All zeros is no number.
 */
export function normalizeIsraeliId(input: string): string | null {
  const digits = cleanTyped(input).replace(/[\s.-]/g, "");
  if (!/^\d{1,9}$/.test(digits)) return null;
  const id = digits.padStart(ISRAELI_ID_DIGITS, "0");
  if (/^0+$/.test(id)) return null;
  let total = 0;
  for (let i = 0; i < ISRAELI_ID_DIGITS; i++) {
    const product = Number(id[i]) * (i % 2 === 0 ? 1 : 2);
    total += product > 9 ? product - 9 : product;
  }
  return total % 10 === 0 ? id : null;
}

export function isIsraeliId(input: string): boolean {
  return normalizeIsraeliId(input) !== null;
}

/** The last four digits, for `id_hint`. */
export function israeliIdHint(id: string): string {
  return id.slice(-4);
}

/** An Israeli ID as typed, stored in its nine-digit form; the issue says "israeliId". */
export const israeliIdSchema: z.ZodType<string, string> = z
  .string()
  .transform((value, ctx) => {
    const id = normalizeIsraeliId(value);
    if (id === null) {
      ctx.addIssue({ code: "custom", message: "israeliId" });
      return z.NEVER;
    }
    return id;
  });
