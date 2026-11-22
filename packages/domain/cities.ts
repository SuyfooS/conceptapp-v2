import { CITIES } from "./cities-data";
import { looseHebrew } from "./hebrew-search";
import { cleanTyped } from "./typed-text";

/*
 * The town in a worker's address (profile H5a): one of Israel's settlements,
 * kept by its CBS code (`cityCodeSchema`), found by what was typed in either
 * language. Spellings of the same name meet: קריית and קרית, גבעתיים and
 * גבעתים, Kiryat and Qiryat, Ata and Atta. The list is `cities-data.ts`.
 */

export type City = { code: number; he: string; en: string };

const asCity = ([code, he, en]: (typeof CITIES)[number]): City => ({
  code,
  he,
  en,
});

const byCode = new Map(CITIES.map((row) => [row[0], row]));

/** The settlement with this code, or null for one the list doesn't have. */
export function cityOf(code: number | null | undefined): City | null {
  const row = code == null ? undefined : byCode.get(code);
  return row ? asCity(row) : null;
}

/** Its name in `locale`: the English one, or the Hebrew where there is none. */
export function cityName(city: City, locale: "he" | "en"): string {
  return locale === "en" && city.en !== "" ? city.en : city.he;
}

/** Between words, and dropped: spaces, dashes, brackets, dots, quotes, geresh, gershayim. */
const BETWEEN = /[\s\-()./'"`\u05F3\u05F4\u2018\u2019\u201C\u201D]+/u;

/**
 * Text as the search compares it, in one script: cleaned (`cleanTyped`),
 * lower case, no niqqud and nothing between words. Hebrew: final letters as
 * the others, a doubled yod or vav once ("קריית", "קרית"). English: q as k,
 * a doubled letter once ("Qiryat Atta", "kiryat ata"), counted across the
 * apostrophe the list writes inside a name ("Ra'anana", "raanana").
 */
export function normalizeCityQuery(text: string, script: "he" | "en"): string {
  return collapsed(cityWords(text).join(""), script);
}

/** The words of a name or a query, nothing between them. */
function cityWords(text: string): string[] {
  return looseHebrew(cleanTyped(text)).split(BETWEEN).filter(Boolean);
}

/**
 * Spellings of the same letters as one, once the words are joined: a
 * doubled letter the list splits with an apostrophe ("Be'er Sheva") meets
 * the same name typed without it ("Beer Sheva").
 */
function collapsed(joined: string, script: "he" | "en"): string {
  return script === "he"
    ? joined.replace(/יי+/g, "י").replace(/וו+/g, "ו")
    : joined.replace(/q/g, "k").replace(/([a-z])\1+/g, "$1");
}

/** Whether the text is typed in Hebrew letters. */
const HEBREW = /[א-ת]/;

/** A name as the search reads it: whole, and from each of its words on. */
type Indexed = { whole: string; tails: string[] };

function indexed(name: string, script: "he" | "en"): Indexed {
  const words = cityWords(name);
  return {
    whole: collapsed(words.join(""), script),
    tails: words
      .slice(1)
      .map((_, i) => collapsed(words.slice(i + 1).join(""), script)),
  };
}

let index: { he: Indexed; en: Indexed }[] | null = null;

/** Both names of every settlement, normalized once, on the first search. */
function searchIndex() {
  index ??= CITIES.map(([, he, en]) => ({
    he: indexed(he, "he"),
    en: indexed(en, "en"),
  }));
  return index;
}

/** How well a name meets the query: its start, a word's start, anywhere, or not. */
function rankOf(name: Indexed, query: string): number | null {
  if (name.whole === "") return null;
  if (name.whole.startsWith(query)) return 0;
  if (name.tails.some((tail) => tail.startsWith(query))) return 1;
  if (name.whole.includes(query)) return 2;
  return null;
}

/**
 * The settlements whose name meets what was typed, best first: a name that
 * starts with it, then one with a word that does, then one that holds it,
 * each by the Hebrew name. Hebrew letters search the Hebrew names, anything
 * else the English ones. Nothing for an empty query.
 */
export function searchCities(query: string, limit = 8): City[] {
  const script = HEBREW.test(query) ? "he" : "en";
  const typed = normalizeCityQuery(query, script);
  if (typed === "") return [];
  const found: { rank: number; at: number }[] = [];
  searchIndex().forEach((names, at) => {
    const rank = rankOf(names[script], typed);
    if (rank !== null) found.push({ rank, at });
  });
  // CITIES is in the Hebrew names' order already, so its place breaks ties.
  found.sort((a, b) => a.rank - b.rank || a.at - b.at);
  return found.slice(0, limit).flatMap(({ at }) => {
    const row = CITIES[at];
    return row ? [asCity(row)] : [];
  });
}

/**
 * The settlement that what was typed names by itself, for a field left
 * without a choice from its list: the one whose name it is, spelled either
 * way ("אשדוד", "kiryat ata"), or the only one it meets ("תל אביב"). Null
 * when it names none, or several.
 */
export function cityNamed(query: string): City | null {
  const script = HEBREW.test(query) ? "he" : "en";
  const typed = normalizeCityQuery(query, script);
  if (typed === "") return null;
  const exact = searchIndex().flatMap((names, at) =>
    names[script].whole === typed ? [at] : [],
  );
  if (exact.length > 1) return null;
  const row = exact[0] === undefined ? undefined : CITIES[exact[0]];
  if (row) return asCity(row);
  const found = searchCities(query, 2);
  return found.length === 1 ? (found[0] ?? null) : null;
}
