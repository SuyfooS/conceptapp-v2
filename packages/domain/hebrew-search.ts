/**
 * Finding a name by what was typed, the way a waiter types on a phone
 * (waiter mode's picker, from S0's twin): by the starts of its words, Hebrew
 * written loosely. Pure, so the twin and the app search alike.
 */

/** Hebrew written loosely: no niqqud, final letters as the others. */
export function looseHebrew(text: string): string {
  return text
    .toLowerCase()
    .replace(/[֑-ׇ]/g, "")
    .replace(/[ךםןףץ]/g, (letter) =>
      String.fromCharCode(letter.charCodeAt(0) + 1),
    );
}

/** Between words: spaces, dashes, quotes and the geresh and gershayim. */
const BETWEEN_WORDS = /[\s'"\-׳״]+/;

/** Whether every word typed starts a word of the name. */
export function nameMatches(name: string, query: string): boolean {
  const words = looseHebrew(name).split(BETWEEN_WORDS);
  const typed = looseHebrew(query).split(/\s+/).filter(Boolean);
  return typed.every((part) => words.some((word) => word.startsWith(part)));
}
