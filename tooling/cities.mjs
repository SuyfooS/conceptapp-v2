// Makes the list of Israel's settlements a worker picks their town from
// (profile H5a, CityField), from the Population Authority's list of CBS
// codes on data.gov.il, "רשימת ישובים בישראל - מתעדכן":
//
//   node tooling/cities.mjs
//
// writes packages/domain/cities-data.ts: each settlement's code (סמל יישוב,
// what the hiring file keeps), its Hebrew name and its English one, sorted by
// the Hebrew name, dated by the resource's last change. Run by hand when the
// list changes, and the new file goes in by PR, as the minimum wage's table
// does. It prints counts only. Arabic names wait for a dated source.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RESOURCE = "5c78e9fa-c2e2-4771-93ff-7f400a12f7ba";
/** The list's columns: the code, the Hebrew name and the English one. */
const COLUMN = { code: "סמל_ישוב", he: "שם_ישוב", en: "שם_ישוב_לועזי" };
const API = "https://data.gov.il/api/3/action";
const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "packages/domain/cities-data.ts",
);

async function json(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "cities-list" },
  });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const body = await response.json();
  if (!body.success) throw new Error(`${url}: not a success`);
  return body.result;
}

/** One line: trimmed, every run of spaces one space. */
const tidy = (text) =>
  String(text ?? "")
    .trim()
    .replace(/\s+/g, " ");

/**
 * The dataset's capitals in title case: each word's first letter, after a
 * space, a dash, a bracket, a dot or a slash ("QIRYAT ATTA" is "Qiryat
 * Atta", "BEN SHEMEN(K.NO'AR)" is "Ben Shemen(K.No'ar)"). An apostrophe
 * starts no word.
 */
const titleCase = (text) =>
  text
    .toLowerCase()
    .replace(
      /(^|[\s\-()./])(['`]*)([a-z])/g,
      (_, before, marks, letter) => `${before}${marks}${letter.toUpperCase()}`,
    );

const resource = await json(`${API}/resource_show?id=${RESOURCE}`);
const asOf = String(resource.last_modified ?? "").slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error("No date on the list");

const { records, total } = await json(
  `${API}/datastore_search?resource_id=${RESOURCE}&limit=5000`,
);
if (records.length !== total) {
  throw new Error(`Read ${records.length} of ${total} rows`);
}

const cities = records.map((row) => {
  const code = Number(String(row[COLUMN.code]).trim());
  const he = tidy(row[COLUMN.he]);
  const en = titleCase(tidy(row[COLUMN.en]));
  if (!Number.isInteger(code) || code < 1 || code > 9999) {
    throw new Error(`A code out of range: ${row[COLUMN.code]}`);
  }
  if (!he) throw new Error(`No Hebrew name for ${code}`);
  return [code, he, en];
});
const codes = new Set(cities.map(([code]) => code));
if (codes.size !== cities.length) throw new Error("A code twice");
cities.sort(([a, x], [b, y]) => x.localeCompare(y, "he") || a - b);

const rows = cities
  .map(
    ([code, he, en]) =>
      `  [${code}, ${JSON.stringify(he)}, ${JSON.stringify(en)}],`,
  )
  .join("\n");
writeFileSync(
  OUT,
  `/*
 * Israel's settlements by their CBS code (סמל יישוב), with their Hebrew and
 * English names, sorted by the Hebrew name. Made by tooling/cities.mjs from
 * the Population Authority's list on data.gov.il ("רשימת ישובים בישראל -
 * מתעדכן"): run it again when the list changes, never edit by hand. An English
 * name the list doesn't have is empty, and the Hebrew one shows instead.
 */

/** The day the list was last changed at its source. */
export const CITIES_AS_OF = "${asOf}";

export const CITIES_SOURCE =
  "https://data.gov.il/dataset/${resource.package_id}/resource/${RESOURCE}";

// biome-ignore format: a table
export const CITIES: readonly (readonly [code: number, he: string, en: string])[] = [
${rows}
];
`,
);
const english = cities.filter(([, , en]) => en !== "").length;
console.log(`${cities.length} settlements, ${english} with an English name`);
