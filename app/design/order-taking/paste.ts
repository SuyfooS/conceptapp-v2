import { parseShekels } from "@domain/money";
import { importWords } from "./data";
import type { ChoiceGroup, DepartmentKey, MenuItem } from "./model";

// How the demo reads a pasted menu (§5.2), roughly as `@domain/menu-import`
// will in P1: a line that ends in a price is an item, a line with no price
// heads the lines after it, "a/b" is two sizes and a line that starts with
// "+" is an extra for the item above. Only for the preview's look: P1
// writes the real reader with its tests.

/** An item's price at most: 10,000.00 ₪. */
const ITEM_MAX = 1_000_000;
const NAME_MAX = 60;
/** A word that starts with a final letter: a line a PDF turned around. */
const REVERSED = /(^|\s)[ךםןףץ]/;
const PRICE = /^[\d.,]+(\/[\d.,]+)?$/;

export type PasteProblem =
  | "noPrice"
  | "unclear"
  | "long"
  | "duplicate"
  | "reversed"
  | "noItem"
  | "noCategory";

export type PastedLine = {
  /** Its number in the paste, from 1. */
  n: number;
  text: string;
  kind: "category" | "item" | "extra" | "problem";
  name: string;
  /** In agorot; the first size's for two sizes. */
  price: number | null;
  /** Two sizes: the second's price, in agorot. */
  large: number | null;
  problem: PasteProblem | null;
  /** The category it falls under, by name. */
  category: string | null;
};

/** The last word, with the shekel sign and spaces off its edges. */
function splitPrice(text: string): { name: string; price: string | null } {
  const bare = text.replace(/[\s₪]+$/, "");
  const at = bare.search(/\S+$/);
  if (at <= 0) return { name: bare, price: null };
  const last = bare.slice(at).replace(/^₪/, "").replace(/^\+/, "");
  const name = bare
    .slice(0, at)
    .replace(/[\s₪+]+$/, "")
    .trim();
  return /\d/.test(last) ? { name, price: last } : { name: bare, price: null };
}

/** Each line of the paste, and what it became or what is wrong with it. */
export function readPaste(paste: string): PastedLine[] {
  const lines: PastedLine[] = [];
  let category: string | null = null;
  let lastItem: PastedLine | null = null;
  const seen = new Set<string>();
  paste.split(/\r?\n/).forEach((raw, index) => {
    const text = raw.trim();
    if (!text) return;
    const base = { n: index + 1, text, large: null, category };
    if (REVERSED.test(text)) {
      lines.push({
        ...base,
        kind: "problem",
        name: text,
        price: null,
        problem: "reversed",
      });
      return;
    }
    // Pasted from a spreadsheet: name, price and category, by tabs.
    const cells = text.split("\t");
    const extra = text.startsWith("+") || /\s\+[\d.,]+$/.test(text);
    const { name: rawName, price: rawPrice } =
      cells.length > 1
        ? { name: cells[0]?.trim() ?? "", price: cells[1]?.trim() || null }
        : splitPrice(text.replace(/^\+\s*/, ""));
    const name = rawName.replace(/^(\+\s*)/, "").trim();
    if (cells.length > 2 && cells[2]?.trim()) category = cells[2].trim();
    if (rawPrice === null) {
      if (cells.length > 1) {
        lines.push({
          ...base,
          kind: "problem",
          name,
          price: null,
          problem: "noPrice",
        });
        return;
      }
      category = text;
      lastItem = null;
      lines.push({
        ...base,
        kind: "category",
        name: text,
        price: null,
        problem: null,
        category: text,
      });
      return;
    }
    const sizes = PRICE.test(rawPrice) ? rawPrice.split("/") : [];
    const price = sizes[0] ? parseShekels(sizes[0], ITEM_MAX) : null;
    const large = sizes[1] ? parseShekels(sizes[1], ITEM_MAX) : null;
    const problem: PasteProblem | null =
      price === null || (sizes.length > 1 && (large === null || large < price))
        ? "unclear"
        : name.length > NAME_MAX
          ? "long"
          : extra && !lastItem
            ? "noItem"
            : !extra && category === null
              ? "noCategory"
              : !extra && seen.has(`${category}|${name}`)
                ? "duplicate"
                : null;
    const row: PastedLine = {
      ...base,
      category,
      kind: problem ? "problem" : extra ? "extra" : "item",
      name,
      price,
      large: sizes.length > 1 ? large : null,
      problem,
    };
    lines.push(row);
    if (!problem && !extra) {
      seen.add(`${category}|${name}`);
      lastItem = row;
    }
  });
  return lines;
}

/** The lines a PDF turned around, read the right way: the words, not the price. */
export function unreversed(paste: string): string {
  return paste
    .split(/\r?\n/)
    .map((raw) => {
      if (!REVERSED.test(raw.trim())) return raw;
      const { name, price } = splitPrice(raw.trim());
      const words = [...name].reverse().join("");
      return price ? `${words} ${price}` : words;
    })
    .join("\n");
}

export type Imported = {
  categories: { name: string; department: DepartmentKey }[];
  items: Omit<MenuItem, "id" | "categoryId">[];
  /** Each item's category, by name, in the order of `items`. */
  itemCategories: string[];
};

/**
 * What the import writes: the categories the paste names, each with the
 * department picked for it, and the items under them with their sizes and
 * extras. Lines with a problem are left out until fixed.
 */
export function imported(
  lines: readonly PastedLine[],
  departmentOf: (category: string) => DepartmentKey,
): Imported {
  const out: Imported = { categories: [], items: [], itemCategories: [] };
  let current: { groups: ChoiceGroup[] } | null = null;
  for (const line of lines) {
    if (line.kind === "category") {
      out.categories.push({
        name: line.name,
        department: departmentOf(line.name),
      });
      continue;
    }
    if (line.kind === "item" && line.price !== null && line.category) {
      const groups: ChoiceGroup[] =
        line.large !== null
          ? [
              {
                id: `size-${line.n}`,
                name: importWords.sizes,
                min: 1,
                max: 1,
                options: [
                  {
                    id: `regular-${line.n}`,
                    name: importWords.regular,
                    price: 0,
                  },
                  {
                    id: `large-${line.n}`,
                    name: importWords.large,
                    price: line.large - line.price,
                  },
                ],
              },
            ]
          : [];
      current = { groups };
      out.items.push({ name: line.name, price: line.price, groups });
      out.itemCategories.push(line.category);
      continue;
    }
    if (line.kind === "extra" && current && line.price !== null) {
      let extras = current.groups.find((g) => g.name === importWords.extras);
      if (!extras) {
        extras = {
          id: `extras-${line.n}`,
          name: importWords.extras,
          min: 0,
          max: 0,
          options: [],
        };
        current.groups.push(extras);
      }
      extras.options.push({
        id: `extra-${line.n}`,
        name: line.name,
        price: line.price,
      });
      extras.max = extras.options.length;
    }
  }
  return out;
}

/**
 * How many items an import writes: the lines `imported` keeps, so the
 * preview, the button and what is added never disagree. An item needs a
 * category above it, or it is a line to fix (`noCategory`).
 */
export const importCount = (lines: readonly PastedLine[]) =>
  lines.filter(
    (line) =>
      line.kind === "item" && line.price !== null && line.category !== null,
  ).length;
