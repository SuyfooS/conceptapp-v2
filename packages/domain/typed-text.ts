import { z } from "zod";

/*
 * What people type or paste into a number field is not always ASCII: a Hebrew
 * phone pastes direction marks around digits, an Arabic or Persian keyboard
 * types its own digits, a bank app copies an en dash or a no-break space. Every
 * check that reads numbers from typed text (ID, bank account, zip) runs it
 * through `cleanTyped` first, so the same number is the same however it came.
 *
 * Every special character here is written as a \u escape: a literal no-break
 * space trips Biome's noIrregularWhitespace, and a literal RLM can't be seen.
 */

/**
 * Removed: the direction marks and controls a Hebrew app pastes, the soft
 * hyphen a web page copies, the zero-width space, word joiner and byte-order
 * mark. The zero-width joiner and non-joiner (U+200C, U+200D) stay: they shape
 * Arabic-script words and emoji, which a street or a document's name may hold.
 */
const INVISIBLE =
  /[\u00AD\u200B\u200E\u200F\u061C\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;
/** Arabic-Indic digits U+0660 to U+0669. */
const ARABIC_INDIC_DIGIT = /[\u0660-\u0669]/g;
/** Persian (extended Arabic-Indic) digits U+06F0 to U+06F9. */
const PERSIAN_DIGIT = /[\u06F0-\u06F9]/g;
/** The Hebrew maqaf, hyphens and dashes, the minus sign, and their small and full-width forms. */
const DASH = /[\u05BE\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g;
/** A tab, the no-break space and the other spaces of Unicode; line breaks are kept. */
const SPACE = /[\t\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;

/**
 * Text as a person typed or pasted it, ready to read numbers from: NFKC
 * (full-width digits and letters become ASCII); Arabic-Indic (U+0660–0669) and
 * Persian (U+06F0–06F9) digits as 0–9; the direction marks a Hebrew app pastes
 * (U+200E, U+200F, U+061C, U+202A–U+202E, U+2066–U+2069) removed, with the
 * soft hyphen (U+00AD), zero-width space, word joiner and byte-order mark; the
 * Hebrew maqaf (U+05BE) and every dash (U+2010–U+2015, U+2212, U+FE58, U+FE63,
 * U+FF0D) as "-"; a tab, NBSP and other spaces as " ". Line breaks and other
 * controls stay, so a one-line field can still refuse them. Nothing is
 * trimmed: plain ASCII comes back as it was.
 */
export function cleanTyped(text: string): string {
  return text
    .normalize("NFKC")
    .replace(INVISIBLE, "")
    .replace(ARABIC_INDIC_DIGIT, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(PERSIAN_DIGIT, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(DASH, "-")
    .replace(SPACE, " ");
}

/** A line break or any other control character (C0, DEL, C1, NEL included). */
const CONTROL_OR_BREAK = /[\p{Cc}\u2028\u2029]/u;

/** One line of typed text as stored: cleaned, trimmed, runs of spaces as one. */
export function tidyLine(text: string): string {
  return cleanTyped(text).trim().replace(/ {2,}/g, " ");
}

/**
 * A one-line text field (a street, a document's name): tidied by `tidyLine`,
 * then `min` to `max` characters with no line break or control character.
 */
export function oneLineSchema(min: number, max: number) {
  return z
    .string()
    .transform(tidyLine)
    .pipe(
      z
        .string()
        .min(min)
        .max(max)
        .refine((text) => !CONTROL_OR_BREAK.test(text), {
          message: "oneLine",
        }),
    );
}
