import { z } from "zod";
import { parseShekels } from "./money";
import {
  MAX_ITEM_AGOROT,
  MAX_OPTION_AGOROT,
  MENU_CAPS,
  MENU_TEXT_MAX,
  type OptionGroup,
  optionGroups,
  typedName,
} from "./order-taking";

/**
 * A menu pasted from wherever it already is: the business's website, a PDF, a
 * WhatsApp message or a spreadsheet from its till (waiter mode, P1; read in
 * the spirit of the pasted staff list, @domain/staff-list). The import writes
 * what this reads in one go (`public.import_menu`), after the person checks
 * the preview line by line.
 *
 *   an item      a line that ends in a price: "שניצל 62", "פרגית על האש ₪72",
 *                "קפה הפוך 14.50", and with a typeset menu's leaders,
 *                "שניצל.....62". The price is read by `parseShekels`, which
 *                takes ₪, a comma for the point and direction marks.
 *   two sizes    two prices with a slash, "קפה הפוך 14/17": the item at the
 *                first, and a required group of two sizes, the regular at 0
 *                and the large at the difference.
 *   an extra     a line that starts with "+" ("+ גבינה 6"), or whose price
 *                does ("תוספת ביצה +6"): an option, in an optional group of
 *                extras, of the item above it. One with no price is free.
 *   a category   a line with no price, up to 40 characters: it heads the
 *                lines after it. Items before any go to one of their own.
 *   a sheet row  tab-separated, as a spreadsheet pastes it: a name, a price
 *                and, if there is one, the category, with empty cells
 *                between them skipped. A name or a price that starts with
 *                "+" makes an extra, as a line does. A first row with no
 *                number where the price goes names the columns, and is
 *                read as nothing.
 *   backwards    a PDF copies Hebrew in the order it is drawn, so a word
 *                comes out starting with a final letter (ם ן ץ ף ך): the line
 *                is marked, and `reverseLine` turns it around.
 *
 * Descriptions and other groups of choices aren't read: the editor adds them.
 * The words for the groups it makes ("גודל", "רגיל", "גדול", "תוספות") and
 * for the category of items before any come from the screen's messages
 * (`modules.order_taking.importWords`), as everything a person reads does.
 */

/** The words the groups and categories it makes are named with. */
export type ImportWords = {
  /** The group of two sizes. */
  size: string;
  regular: string;
  large: string;
  /** The group of extras. */
  extras: string;
  /** The category of items before any category line. */
  general: string;
};

export type MenuProblem =
  /** An item's line, or a sheet row, with no price. */
  | "noPrice"
  /** A price that isn't read as one: "1,000", "14.555", sizes "17/14". */
  | "unclearPrice"
  /** A price with nothing before it. */
  | "noName"
  | "nameTooLong"
  /** The same item in its category, or the same extra on its item, again. */
  | "duplicate"
  /** Reads backwards, as a PDF copies it (`reverseLine`). */
  | "reversed"
  /** An extra with no item above it in its category. */
  | "noItem"
  /** Past 12 extras on an item, or more than they may add together. */
  | "tooManyExtras";

/** What a line became. */
export type MenuRowResult =
  /** A spreadsheet's first row, naming its columns: read as nothing. */
  | { kind: "header" }
  | { kind: "category"; name: string }
  | { kind: "item"; name: string; priceAgorot: number; category: string }
  | {
      kind: "sizes";
      name: string;
      priceAgorot: number;
      /** What the large one costs. */
      largeAgorot: number;
      category: string;
    }
  | { kind: "extra"; name: string; priceAgorot: number; item: string };

/** One line of the paste, numbered as pasted, and what it became or why not. */
export type MenuRow = { line: number; text: string } & (
  | { ok: true; became: MenuRowResult }
  | { ok: false; problem: MenuProblem }
);

export type ImportItem = {
  name: string;
  priceAgorot: number;
  optionGroups: OptionGroup[];
};

export type ImportCategory = { name: string; items: ImportItem[] };

export type ParsedMenu = {
  /** Every non-empty line, numbered from 1 as pasted. */
  rows: MenuRow[];
  /** The categories with their items, in order; none without an item. */
  categories: ImportCategory[];
  /** "invalid": a line has a problem. "tooMany": past the menu's caps. */
  error: "invalid" | "tooMany" | null;
  /** A line reads backwards: the preview offers to turn the lines around. */
  reversed: boolean;
};

/** Direction marks, embeddings and the byte order mark that pasted text carries. */
const MARKS = /[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
/** Spaces of any kind, as one. */
const SPACES = /[\s\u00a0\u2007\u202f]+/g;
/** A bullet before the line, as lists are pasted. */
const BULLET = /^[-*•·]\s*/u;
/** What separates a name from its price in a printed menu: dots, dashes, colons. */
const LEADERS = /[\s.\-–—:·…_|]+$/u;
/** The currency after a price, and a "62.-". */
const CURRENCY_AFTER = /\s*(?:₪|ש["״']?ח|שקלים|שקל)\s*$|\.?-$/u;
/**
 * A price at the end of a line: "62", "₪72", "+6", "14/17". A space comes
 * before it, or the leaders a typeset menu runs straight into it
 * ("שניצל.....62", "פסטה....₪58", "שניצל-62"), the whole run of them, but
 * never a run that follows a number: "12-14" is two numbers, not a name and
 * its price.
 */
const PRICE_AT_END =
  /(?:^|\s|(?<![\d.\-–—:·…_|])[.\-–—:·…_|]+)(\+)?\s*(?:₪\s*)?(\d[\d.,]*(?:\s*\/\s*\d[\d.,]*)?)\s*(?:₪)?$/u;
/**
 * Something that ends in a number but isn't a price read as one ("10/12/14",
 * "62₪₪"): the line is an item whose price isn't clear, never a category.
 */
const NUMBER_AT_END = /(?:^|\s)(\+)?(\S*\d)$/u;
/** A spreadsheet's price cell with a number in it, read or not. */
const HAS_NUMBER = /\d/u;
/** A word that starts with a final letter: Hebrew copied backwards. */
const FINAL_FIRST = /^[^\p{L}\d]*[םןץףך]/u;

function clean(text: string): string {
  return text.replace(MARKS, "").replace(SPACES, " ").trim();
}

/** Names compare as the database compares them: case aside. */
const nameKey = (name: string) => name.toLowerCase();

const chars = (text: string) => [...text].length;

/** Whether the line reads backwards, as a PDF copies Hebrew. */
function readsBackwards(text: string): boolean {
  return text.split(" ").some((word) => FINAL_FIRST.test(word));
}

/**
 * A line turned around: its characters backwards, and each number back as it
 * was, since a PDF copies numbers in the order they read ("62 לצינש" is
 * "שניצל 62").
 */
export function reverseLine(text: string): string {
  const backwards = [...text].reverse().join("");
  return backwards.replace(/\d[\d.,/]*\d|\d/g, (run) =>
    [...run].reverse().join(""),
  );
}

type Price = { ok: true; agorot: number; large: number | null } | { ok: false };

/** A price as written, one or two with a slash, or nothing readable. */
function readPrice(written: string, max: number): Price {
  const [first, second, more] = written.split("/");
  if (more !== undefined || first === undefined) return { ok: false };
  const agorot = parseShekels(first, max);
  if (agorot === null) return { ok: false };
  if (second === undefined) return { ok: true, agorot, large: null };
  const large = parseShekels(second, max);
  // The large one costs more, and what it adds is one option's at most.
  if (large === null || large <= agorot || large - agorot > MAX_OPTION_AGOROT) {
    return { ok: false };
  }
  return { ok: true, agorot, large };
}

type Line =
  | { kind: "none"; name: string }
  | { kind: "priced"; name: string; extra: boolean; written: string };

/** A cleaned line split into its name and the price at its end, if any. */
function splitLine(text: string): Line {
  let rest = text.replace(BULLET, "");
  let extra = false;
  if (rest.startsWith("+")) {
    extra = true;
    rest = rest.slice(1).trim();
  }
  const bare = rest.replace(CURRENCY_AFTER, "");
  const match = PRICE_AT_END.exec(bare) ?? NUMBER_AT_END.exec(bare);
  if (!match) return { kind: "none", name: rest.replace(LEADERS, "") };
  const name = bare
    .slice(0, match.index)
    .replace(LEADERS, "")
    .replace(/\s*₪$/u, "");
  return {
    kind: "priced",
    name,
    extra: extra || match[1] === "+",
    written: (match[2] ?? "").replace(/\s+/g, ""),
  };
}

/** The required group of two sizes an "a/b" makes. */
function sizeGroup(words: ImportWords, largeAgorot: number): OptionGroup {
  return {
    id: "size",
    name: words.size,
    min: 1,
    max: 1,
    options: [
      { id: "regular", name: words.regular, priceAgorot: 0 },
      { id: "large", name: words.large, priceAgorot: largeAgorot },
    ],
  };
}

/** Reads a pasted menu. Empty input is a valid, empty menu. */
export function parseMenu(input: string, words: ImportWords): ParsedMenu {
  const rows: MenuRow[] = [];
  const categories: ImportCategory[] = [];
  let current: ImportCategory | null = null;
  /** The item extras go on, while nothing came between. */
  let lastItem: ImportItem | null = null;

  const categoryNamed = (name: string): ImportCategory => {
    const found = categories.find(
      (category) => nameKey(category.name) === nameKey(name),
    );
    if (found) return found;
    const made: ImportCategory = { name, items: [] };
    categories.push(made);
    return made;
  };

  /** An item into the current category, or its problem. */
  const addItem = (
    name: string,
    price: Extract<Price, { ok: true }>,
    into: ImportCategory | null,
  ): MenuRowResult | MenuProblem => {
    if (!name) return "noName";
    if (chars(name) > MENU_TEXT_MAX.item) return "nameTooLong";
    const category = into ?? current ?? categoryNamed(words.general);
    if (category.items.some((item) => nameKey(item.name) === nameKey(name))) {
      return "duplicate";
    }
    const item: ImportItem = {
      name,
      priceAgorot: price.agorot,
      optionGroups:
        price.large === null
          ? []
          : [sizeGroup(words, price.large - price.agorot)],
    };
    category.items.push(item);
    current = category;
    lastItem = item;
    return price.large === null
      ? {
          kind: "item",
          name,
          priceAgorot: price.agorot,
          category: category.name,
        }
      : {
          kind: "sizes",
          name,
          priceAgorot: price.agorot,
          largeAgorot: price.large,
          category: category.name,
        };
  };

  /** An extra onto the item above, or its problem. */
  const addExtra = (
    name: string,
    priceAgorot: number,
  ): MenuRowResult | MenuProblem => {
    if (!name) return "noName";
    if (chars(name) > MENU_TEXT_MAX.option) return "nameTooLong";
    const item: ImportItem | null = lastItem;
    if (!item) return "noItem";
    const group = item.optionGroups.find(
      (candidate) => candidate.id === "extras",
    );
    if (
      group?.options.some((option) => nameKey(option.name) === nameKey(name))
    ) {
      return "duplicate";
    }
    const options = [
      ...(group?.options ?? []),
      { id: `x${(group?.options.length ?? 0) + 1}`, name, priceAgorot },
    ];
    const next: OptionGroup = {
      id: "extras",
      name: words.extras,
      min: 0,
      max: options.length,
      options,
    };
    const groups = [
      ...item.optionGroups.filter((candidate) => candidate.id !== "extras"),
      next,
    ];
    if (!optionGroups.safeParse(groups).success) return "tooManyExtras";
    item.optionGroups = groups;
    return { kind: "extra", name, priceAgorot, item: item.name };
  };

  input.split(/\r?\n/).forEach((raw, index) => {
    const text = clean(raw);
    if (!text) return;
    const line = index + 1;
    const push = (result: MenuRowResult | MenuProblem) => {
      rows.push(
        typeof result === "string"
          ? { line, text, ok: false, problem: result }
          : { line, text, ok: true, became: result },
      );
    };

    if (readsBackwards(text)) {
      lastItem = null;
      push("reversed");
      return;
    }

    // A row from a spreadsheet: a name, a price and maybe its category, the
    // empty cells between them skipped, as Word and Docs line a price up
    // with two tabs ("שניצל\t\t62").
    const fields = raw.split("\t").map(clean).filter(Boolean);
    if (fields.length > 1) {
      const [first = "", written = "", categoryName = ""] = fields;
      const bare = written.replace(CURRENCY_AFTER, "");
      // An extra, as a line is: its name starts with "+", or its price does.
      if (first.startsWith("+") || bare.startsWith("+")) {
        const name = first.replace(/^\+\s*/u, "").replace(LEADERS, "");
        const price = readPrice(
          bare.replace(/^\+/u, "").replace(/\s+/g, ""),
          MAX_OPTION_AGOROT,
        );
        push(
          !HAS_NUMBER.test(bare)
            ? "noPrice"
            : price.ok && price.large === null
              ? addExtra(name, price.agorot)
              : "unclearPrice",
        );
        return;
      }
      lastItem = null;
      if (!HAS_NUMBER.test(bare)) {
        // The first row with no number where the price goes names the
        // columns ("שם\tמחיר\tקטגוריה"); any other is an item with no price.
        push(rows.length === 0 ? { kind: "header" } : "noPrice");
        return;
      }
      if (categoryName && chars(categoryName) > MENU_TEXT_MAX.category) {
        push("nameTooLong");
        return;
      }
      const price = readPrice(bare.replace(/\s+/g, ""), MAX_ITEM_AGOROT);
      if (!price.ok) {
        push("unclearPrice");
        return;
      }
      push(
        addItem(
          first.replace(LEADERS, ""),
          price,
          categoryName ? categoryNamed(categoryName) : null,
        ),
      );
      return;
    }

    const split = splitLine(text);
    if (split.kind === "none") {
      if (text.startsWith("+")) {
        push(addExtra(split.name, 0));
        return;
      }
      lastItem = null;
      if (chars(split.name) > MENU_TEXT_MAX.category || !split.name) {
        push("noPrice");
        return;
      }
      current = categoryNamed(split.name);
      push({ kind: "category", name: current.name });
      return;
    }
    if (split.extra) {
      const price = readPrice(split.written, MAX_OPTION_AGOROT);
      push(
        price.ok && price.large === null
          ? addExtra(split.name, price.agorot)
          : "unclearPrice",
      );
      return;
    }
    const price = readPrice(split.written, MAX_ITEM_AGOROT);
    if (!price.ok) {
      lastItem = null;
      push("unclearPrice");
      return;
    }
    const result = addItem(split.name, price, null);
    if (typeof result === "string") lastItem = null;
    push(result);
  });

  const kept = categories.filter((category) => category.items.length > 0);
  const items = kept.reduce((sum, category) => sum + category.items.length, 0);
  const error = rows.some((row) => !row.ok)
    ? "invalid"
    : items > MENU_CAPS.items || kept.length > MENU_CAPS.categories
      ? "tooMany"
      : null;
  return {
    rows,
    categories: kept,
    error,
    reversed: rows.some((row) => !row.ok && row.problem === "reversed"),
  };
}

const uuid = z.uuid();

/**
 * One row as `public.import_menu` takes it, in order: a category, by its name
 * (one the business has takes the items after it) with the department its
 * items go to, or an item of the category above it.
 */
export const menuImportRow = z.union([
  z.strictObject({
    category: z.strictObject({
      name: typedName(MENU_TEXT_MAX.category),
      department: uuid,
    }),
  }),
  z.strictObject({
    item: z.strictObject({
      name: typedName(MENU_TEXT_MAX.item),
      priceAgorot: z.int().min(0).max(MAX_ITEM_AGOROT),
      optionGroups: optionGroups.optional(),
    }),
  }),
]);

export type MenuImportRow = z.infer<typeof menuImportRow>;

/** A whole import: at most a menu's caps of categories and items. */
export const menuImportRows = z
  .array(menuImportRow)
  .max(MENU_CAPS.categories + MENU_CAPS.items)
  .refine(
    (rows) => rows.length === 0 || "category" in (rows[0] ?? {}),
    "The first row is a category",
  );

/**
 * What the import writes: each category with the department chosen for it
 * (`departments`, in the same order), then its items.
 */
export function importRows(
  categories: readonly ImportCategory[],
  departments: readonly string[],
): MenuImportRow[] {
  return categories.flatMap((category, index): MenuImportRow[] => [
    {
      category: { name: category.name, department: departments[index] ?? "" },
    },
    ...category.items.map((item) => ({
      item: {
        name: item.name,
        priceAgorot: item.priceAgorot,
        ...(item.optionGroups.length > 0
          ? { optionGroups: item.optionGroups }
          : {}),
      },
    })),
  ]);
}
