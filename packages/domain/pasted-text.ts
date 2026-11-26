/**
 * Text as it comes pasted from wherever it already was: a website, a PDF, a
 * WhatsApp message, a note or a spreadsheet. What two readers share, the
 * menu's (@domain/menu-import) and the list of people's
 * (@domain/people-import): the marks nobody sees, the spaces of every kind,
 * a bullet before the line, a phone's own digits, and Hebrew that a PDF
 * copied backwards.
 */

/** Direction marks, embeddings and the byte order mark that pasted text carries. */
export const MARKS =
  /[\u{200e}\u{200f}\u{202a}-\u{202e}\u{2066}-\u{2069}\u{feff}]/gu;
/** Spaces of any kind, as one. Tabs too: split a sheet's row before cleaning it. */
export const SPACES = /[\s\u{a0}\u{2007}\u{202f}]+/gu;
/** A bullet before the line, as lists are pasted. */
export const BULLET = /^[-*•·]\s*/u;
/** A word that starts with a final letter: Hebrew copied backwards. */
export const FINAL_FIRST = /^[^\p{L}\d]*[םןץףך]/u;

/** One line of text: what nobody sees dropped, every run of spaces one. */
export function clean(text: string): string {
  return text.replace(MARKS, "").replace(SPACES, " ").trim();
}

/** Whether the line reads backwards, as a PDF copies Hebrew. */
export function readsBackwards(text: string): boolean {
  return text.split(" ").some((word) => FINAL_FIRST.test(word));
}

/** Arabic-Indic (U+0660–0669) and Extended Arabic-Indic (U+06F0–06F9) digits. */
const EASTERN_DIGITS = /[\u{660}-\u{669}\u{6f0}-\u{6f9}]/gu;

/**
 * The digits 0–9 in place of Arabic-Indic and Extended Arabic-Indic ones, so
 * a number typed on a phone set to Arabic or Persian reads as a number.
 */
export function westernDigits(text: string): string {
  return text.replace(EASTERN_DIGITS, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x6f0 ? code - 0x6f0 : code - 0x660);
  });
}
