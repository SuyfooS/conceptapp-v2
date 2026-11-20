import { describe, expect, it } from "vitest";
import {
  againstMenu,
  importRows,
  menuImportRows,
  parseMenu,
  reverseLine,
} from "./menu-import";
import { MENU_CAPS, optionGroups } from "./order-taking";

// The screens pass the words from modules.order_taking.importWords.
const words = {
  size: "גודל",
  regular: "רגיל",
  large: "גדול",
  extras: "תוספות",
  general: "כללי",
};

const parse = (text: string) => parseMenu(text, words);

/** What each line became, or why not. */
const outcomes = (text: string) =>
  parse(text).rows.map((row) => (row.ok ? row.became : row.problem));

describe("a pasted menu", () => {
  it("reads a café's menu: a category line, two sizes and an extra", () => {
    // The walkthrough's paste (P1 demo, the PR).
    const menu = parse(
      [
        "שתייה חמה",
        "אספרסו 9",
        "קפה הפוך 14/17",
        "+ שוט אספרסו 4",
        "",
        "מאפים",
        "קרואסון חמאה ₪16",
      ].join("\n"),
    );
    expect(menu.error).toBe(null);
    expect(menu.reversed).toBe(false);
    expect(menu.rows.map((row) => row.line)).toEqual([1, 2, 3, 4, 6, 7]);
    expect(menu.rows.map((row) => (row.ok ? row.became : row.problem))).toEqual(
      [
        { kind: "category", name: "שתייה חמה" },
        {
          kind: "item",
          name: "אספרסו",
          priceAgorot: 900,
          category: "שתייה חמה",
        },
        {
          kind: "sizes",
          name: "קפה הפוך",
          priceAgorot: 1400,
          largeAgorot: 1700,
          category: "שתייה חמה",
        },
        {
          kind: "extra",
          name: "שוט אספרסו",
          priceAgorot: 400,
          item: "קפה הפוך",
        },
        { kind: "category", name: "מאפים" },
        {
          kind: "item",
          name: "קרואסון חמאה",
          priceAgorot: 1600,
          category: "מאפים",
        },
      ],
    );
    expect(menu.categories).toEqual([
      {
        name: "שתייה חמה",
        items: [
          { name: "אספרסו", priceAgorot: 900, optionGroups: [] },
          {
            name: "קפה הפוך",
            priceAgorot: 1400,
            optionGroups: [
              {
                id: "size",
                name: "גודל",
                min: 1,
                max: 1,
                options: [
                  { id: "regular", name: "רגיל", priceAgorot: 0 },
                  { id: "large", name: "גדול", priceAgorot: 300 },
                ],
              },
              {
                id: "extras",
                name: "תוספות",
                min: 0,
                max: 1,
                options: [{ id: "x1", name: "שוט אספרסו", priceAgorot: 400 }],
              },
            ],
          },
        ],
      },
      {
        name: "מאפים",
        items: [{ name: "קרואסון חמאה", priceAgorot: 1600, optionGroups: [] }],
      },
    ]);
    // Every group it makes is one the database keeps.
    for (const category of menu.categories) {
      for (const item of category.items) {
        expect(optionGroups.safeParse(item.optionGroups).success).toBe(true);
      }
    }
  });

  it("reads prices with ₪, a comma for the point, decimals and direction marks", () => {
    expect(
      parse(
        [
          "פרגית על האש ₪72",
          "קפה הפוך 14.50",
          "סלט 14,50",
          "\u200fשניצל 62\u200f",
          "Burger 68 ₪",
          'מרק 32 ש"ח',
          "חומוס ....... 30",
          "פלאפל - 24",
          "בירה 0.5 28",
          "• מים 10",
          "\u202bלימונדה\u202c 16",
        ].join("\n"),
      ).categories[0]?.items.map((item) => [item.name, item.priceAgorot]),
    ).toEqual([
      ["פרגית על האש", 7200],
      ["קפה הפוך", 1450],
      ["סלט", 1450],
      ["שניצל", 6200],
      ["Burger", 6800],
      ["מרק", 3200],
      ["חומוס", 3000],
      ["פלאפל", 2400],
      ["בירה 0.5", 2800],
      ["מים", 1000],
      ["לימונדה", 1600],
    ]);
  });

  it("reads a typeset menu's leaders that run straight into the price", () => {
    // As a PDF menu copies them, with no space before the price.
    expect(
      outcomes(
        [
          "שניצל.....62",
          "תוספת ביצה.....+6",
          "פסטה....58 ₪",
          "המבורגר .......68 ₪",
          "מרק.......₪32",
          "פלאפל-24",
          "חומוס:30",
          "קפה הפוך…14/17",
          "סלט_____44.-",
        ].join("\n"),
      ),
    ).toEqual([
      { kind: "item", name: "שניצל", priceAgorot: 6200, category: "כללי" },
      { kind: "extra", name: "תוספת ביצה", priceAgorot: 600, item: "שניצל" },
      { kind: "item", name: "פסטה", priceAgorot: 5800, category: "כללי" },
      { kind: "item", name: "המבורגר", priceAgorot: 6800, category: "כללי" },
      { kind: "item", name: "מרק", priceAgorot: 3200, category: "כללי" },
      { kind: "item", name: "פלאפל", priceAgorot: 2400, category: "כללי" },
      { kind: "item", name: "חומוס", priceAgorot: 3000, category: "כללי" },
      {
        kind: "sizes",
        name: "קפה הפוך",
        priceAgorot: 1400,
        largeAgorot: 1700,
        category: "כללי",
      },
      { kind: "item", name: "סלט", priceAgorot: 4400, category: "כללי" },
    ]);
  });

  it("never takes a dash between two numbers for leaders", () => {
    // "12-14" is two prices, not "קפה 12" at 14.
    expect(outcomes("קפה 12-14\nתה 12––14\nמגש 1.....5")).toEqual([
      "unclearPrice",
      "unclearPrice",
      "unclearPrice",
    ]);
  });

  it("puts items before any category line in one of their own", () => {
    const menu = parse("שניצל 62\nעיקריות\nפסטה 58");
    expect(menu.categories.map((category) => category.name)).toEqual([
      "כללי",
      "עיקריות",
    ]);
  });

  it("goes on in a category named again, case aside", () => {
    const menu = parse("Drinks\nWater 10\nFood\nToast 30\ndrinks\nTea 9");
    expect(
      menu.categories.map((category) => [
        category.name,
        category.items.map((item) => item.name),
      ]),
    ).toEqual([
      ["Drinks", ["Water", "Tea"]],
      ["Food", ["Toast"]],
    ]);
  });

  it("leaves out a category with no items", () => {
    const menu = parse("ראשונות\nעיקריות\nשניצל 62");
    expect(menu.categories.map((category) => category.name)).toEqual([
      "עיקריות",
    ]);
    expect(menu.error).toBe(null);
  });

  it("is empty for an empty paste, with nothing wrong", () => {
    expect(parse("  \n\n")).toEqual({
      rows: [],
      categories: [],
      error: null,
      reversed: false,
    });
  });
});

describe("a price that isn't clear", () => {
  it("is said for each line, so nothing is guessed", () => {
    expect(
      outcomes(
        [
          "עיקריות",
          "סטייק 1,000",
          "קפה 14.555",
          "קפה 17/14",
          "קפה 14/14",
          "מגש 50/1100",
          "סטייק 20000",
          "קפה 10/12/14",
        ].join("\n"),
      ),
    ).toEqual([
      { kind: "category", name: "עיקריות" },
      "unclearPrice",
      "unclearPrice",
      "unclearPrice",
      "unclearPrice",
      // The large one adds more than one option's 1,000.00 ₪.
      "unclearPrice",
      // More than an item's 10,000.00 ₪.
      "unclearPrice",
      "unclearPrice",
    ]);
  });

  it("marks the menu as needing a look, and keeps the lines that are fine", () => {
    const menu = parse("עיקריות\nשניצל 62\nסטייק 1,000");
    expect(menu.error).toBe("invalid");
    expect(menu.categories[0]?.items.map((item) => item.name)).toEqual([
      "שניצל",
    ]);
  });
});

describe("other lines it can't take as they are", () => {
  it("say what is wrong with each", () => {
    expect(
      outcomes(
        [
          "62",
          `עיקריות ${"מנה ".repeat(12)}`,
          "עיקריות",
          `${"ש".repeat(61)} 62`,
          "שניצל 62",
          "שניצל 64",
        ].join("\n"),
      ),
    ).toEqual([
      // A price with no name.
      "noName",
      // Too long for a category, so an item whose price is missing.
      "noPrice",
      { kind: "category", name: "עיקריות" },
      "nameTooLong",
      { kind: "item", name: "שניצל", priceAgorot: 6200, category: "עיקריות" },
      "duplicate",
    ]);
  });

  it("let the same item be in two categories", () => {
    expect(parse("בוקר\nקפה 12\nערב\nקפה 14").error).toBe(null);
  });
});

describe("extras", () => {
  it("go on the item above, from a leading + or a +price", () => {
    const menu = parse(
      [
        "עיקריות",
        "המבורגר 68",
        "+ גבינה 6",
        "תוספת ביצה +6",
        "+ בצל",
        "+ גבינה 7",
      ].join("\n"),
    );
    expect(menu.rows.map((row) => (row.ok ? row.became : row.problem))).toEqual(
      [
        { kind: "category", name: "עיקריות" },
        {
          kind: "item",
          name: "המבורגר",
          priceAgorot: 6800,
          category: "עיקריות",
        },
        { kind: "extra", name: "גבינה", priceAgorot: 600, item: "המבורגר" },
        {
          kind: "extra",
          name: "תוספת ביצה",
          priceAgorot: 600,
          item: "המבורגר",
        },
        // One with no price is free.
        { kind: "extra", name: "בצל", priceAgorot: 0, item: "המבורגר" },
        "duplicate",
      ],
    );
    expect(menu.categories[0]?.items[0]?.optionGroups).toEqual([
      {
        id: "extras",
        name: "תוספות",
        min: 0,
        max: 3,
        options: [
          { id: "x1", name: "גבינה", priceAgorot: 600 },
          { id: "x2", name: "תוספת ביצה", priceAgorot: 600 },
          { id: "x3", name: "בצל", priceAgorot: 0 },
        ],
      },
    ]);
  });

  it("need an item above them in their category", () => {
    expect(outcomes("+ גבינה 6")).toEqual(["noItem"]);
    expect(outcomes("עיקריות\nשניצל 62\nקינוחים\n+ קצפת 4")).toEqual([
      { kind: "category", name: "עיקריות" },
      { kind: "item", name: "שניצל", priceAgorot: 6200, category: "עיקריות" },
      { kind: "category", name: "קינוחים" },
      "noItem",
    ]);
  });

  it("stop at twelve on an item, and at what the choices may add", () => {
    const thirteen = Array.from(
      { length: 13 },
      (_, index) => `+ תוספת ${index + 1} 1`,
    );
    expect(outcomes(["פיצה 50", ...thirteen].join("\n")).at(-1)).toBe(
      "tooManyExtras",
    );
    expect(outcomes(["פיצה 50", ...thirteen].join("\n")).at(-2)).toEqual({
      kind: "extra",
      name: "תוספת 12",
      priceAgorot: 100,
      item: "פיצה",
    });
    // Two sizes whose large one adds the whole 1,000.00 ₪: no extra fits.
    expect(outcomes("מגש 10/1010\n+ שוט 1")).toEqual([
      {
        kind: "sizes",
        name: "מגש",
        priceAgorot: 1000,
        largeAgorot: 101000,
        category: "כללי",
      },
      "tooManyExtras",
    ]);
  });

  it("take one price only", () => {
    expect(outcomes("קפה 12\n+ חלב 2/3")).toEqual([
      { kind: "item", name: "קפה", priceAgorot: 1200, category: "כללי" },
      "unclearPrice",
    ]);
  });
});

describe("rows from a spreadsheet", () => {
  it("read as a name, a price and the category", () => {
    const menu = parse(
      [
        "שניצל\t62\tעיקריות",
        "צ'יפס\t18",
        "לימונדה\t₪16\tשתייה",
        "קפה\t12/14\tשתייה",
        "מיץ\t\tשתייה",
        `סלט\t30\t${"ק".repeat(41)}`,
      ].join("\n"),
    );
    expect(menu.rows.map((row) => (row.ok ? row.became : row.problem))).toEqual(
      [
        {
          kind: "item",
          name: "שניצל",
          priceAgorot: 6200,
          category: "עיקריות",
        },
        { kind: "item", name: "צ'יפס", priceAgorot: 1800, category: "עיקריות" },
        { kind: "item", name: "לימונדה", priceAgorot: 1600, category: "שתייה" },
        {
          kind: "sizes",
          name: "קפה",
          priceAgorot: 1200,
          largeAgorot: 1400,
          category: "שתייה",
        },
        "noPrice",
        "nameTooLong",
      ],
    );
  });

  it("take an extra from a name or a price that starts with +", () => {
    const menu = parse(
      [
        "המבורגר\t68\tעיקריות",
        "+ גבינה\t6",
        "ביצה\t+4\tעיקריות",
        "+ בצל\t\t0",
        "+ חלב\t2/3",
        "+ קצפת\tשתייה",
      ].join("\n"),
    );
    expect(menu.rows.map((row) => (row.ok ? row.became : row.problem))).toEqual(
      [
        {
          kind: "item",
          name: "המבורגר",
          priceAgorot: 6800,
          category: "עיקריות",
        },
        { kind: "extra", name: "גבינה", priceAgorot: 600, item: "המבורגר" },
        { kind: "extra", name: "ביצה", priceAgorot: 400, item: "המבורגר" },
        { kind: "extra", name: "בצל", priceAgorot: 0, item: "המבורגר" },
        // An extra takes one price only.
        "unclearPrice",
        "noPrice",
      ],
    );
    expect(menu.categories).toEqual([
      {
        name: "עיקריות",
        items: [
          {
            name: "המבורגר",
            priceAgorot: 6800,
            optionGroups: [
              {
                id: "extras",
                name: "תוספות",
                min: 0,
                max: 3,
                options: [
                  { id: "x1", name: "גבינה", priceAgorot: 600 },
                  { id: "x2", name: "ביצה", priceAgorot: 400 },
                  { id: "x3", name: "בצל", priceAgorot: 0 },
                ],
              },
            ],
          },
        ],
      },
    ]);
    // With no item above, as a line has it.
    expect(outcomes("+ גבינה\t6")).toEqual(["noItem"]);
  });

  it("skip the empty cells a price is lined up with", () => {
    const menu = parse(
      ["שניצל\t\t62", "פסטה\t\t\t58 ₪", "\tמרק\t32", "סלט\t44\t\tראשונות"].join(
        "\n",
      ),
    );
    expect(menu.rows.map((row) => (row.ok ? row.became : row.problem))).toEqual(
      [
        { kind: "item", name: "שניצל", priceAgorot: 6200, category: "כללי" },
        { kind: "item", name: "פסטה", priceAgorot: 5800, category: "כללי" },
        { kind: "item", name: "מרק", priceAgorot: 3200, category: "כללי" },
        { kind: "item", name: "סלט", priceAgorot: 4400, category: "ראשונות" },
      ],
    );
    // The preview shows each row as it reads.
    expect(menu.rows[0]?.text).toBe("שניצל 62");
  });

  it("read a first row that names the columns as nothing", () => {
    const menu = parse(["שם\tמחיר\tקטגוריה", "שניצל\t62\tעיקריות"].join("\n"));
    expect(menu.error).toBe(null);
    expect(menu.rows.map((row) => (row.ok ? row.became : row.problem))).toEqual(
      [
        { kind: "header" },
        {
          kind: "item",
          name: "שניצל",
          priceAgorot: 6200,
          category: "עיקריות",
        },
      ],
    );
    expect(menu.categories).toEqual([
      {
        name: "עיקריות",
        items: [{ name: "שניצל", priceAgorot: 6200, optionGroups: [] }],
      },
    ]);
    expect(outcomes("Name\tPrice\tCategory\nTea\t9")).toEqual([
      { kind: "header" },
      { kind: "item", name: "Tea", priceAgorot: 900, category: "כללי" },
    ]);
    // Only the first row: one further down is an item with no price.
    expect(outcomes("שניצל\t62\nשם\tמחיר")).toEqual([
      { kind: "item", name: "שניצל", priceAgorot: 6200, category: "כללי" },
      "noPrice",
    ]);
  });
});

describe("a line copied backwards from a PDF", () => {
  it("is marked when a word starts with a final letter", () => {
    const backwards = reverseLine("קפה הפוך 14/17");
    expect(backwards).toBe("14/17 ךופה הפק");
    const menu = parse(`שתייה\n${backwards}`);
    expect(menu.rows[1]).toMatchObject({ ok: false, problem: "reversed" });
    expect(menu.reversed).toBe(true);
    expect(menu.error).toBe("invalid");
  });

  it("reads once turned around, its numbers as they were", () => {
    expect(reverseLine("14/17 ךופה הפק")).toBe("קפה הפוך 14/17");
    expect(reverseLine("62 לצינש")).toBe("שניצל 62");
    expect(reverseLine("14.50 ןומלס")).toBe("סלמון 14.50");
    expect(outcomes(reverseLine("14/17 ךופה הפק"))).toEqual([
      {
        kind: "sizes",
        name: "קפה הפוך",
        priceAgorot: 1400,
        largeAgorot: 1700,
        category: "כללי",
      },
    ]);
  });

  it("is never one with Hebrew the right way round", () => {
    expect(parse("קפה הפוך 14/17\nסלמון 72\nעוף 58\nשקדים 9").reversed).toBe(
      false,
    );
  });
});

describe("the caps", () => {
  it("are 300 items and 30 categories", () => {
    const items = (count: number) =>
      Array.from({ length: count }, (_, index) => `פריט ${index + 1} 10`);
    expect(parse(items(MENU_CAPS.items).join("\n")).error).toBe(null);
    expect(parse(items(MENU_CAPS.items + 1).join("\n")).error).toBe("tooMany");
    const categories = (count: number) =>
      Array.from(
        { length: count },
        (_, index) => `קטגוריה ${"ב".repeat(index + 1)}\nפריט 10`,
      );
    expect(parse(categories(MENU_CAPS.categories).join("\n")).error).toBe(null);
    expect(parse(categories(MENU_CAPS.categories + 1).join("\n")).error).toBe(
      "tooMany",
    );
  });
});

describe("what the import writes", () => {
  const KITCHEN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const BAR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  it("is each category with its department, then its items", () => {
    const menu = parse("שתייה\nקפה הפוך 14/17\nמאפים\nקרואסון 16");
    const rows = importRows(menu.categories, [BAR, KITCHEN]);
    expect(rows).toEqual([
      { category: { name: "שתייה", department: BAR } },
      {
        item: {
          name: "קפה הפוך",
          priceAgorot: 1400,
          optionGroups: menu.categories[0]?.items[0]?.optionGroups,
        },
      },
      { category: { name: "מאפים", department: KITCHEN } },
      { item: { name: "קרואסון", priceAgorot: 1600 } },
    ]);
    expect(menuImportRows.safeParse(rows).success).toBe(true);
  });

  it("is refused before it reaches the database without a department, or starting with an item", () => {
    const menu = parse("שתייה\nקפה 12");
    expect(
      menuImportRows.safeParse(importRows(menu.categories, [])).success,
    ).toBe(false);
    expect(
      menuImportRows.safeParse([{ item: { name: "קפה", priceAgorot: 1200 } }])
        .success,
    ).toBe(false);
  });
});

// The paste against the menu already there (P2): what the import screen adds.
describe("a paste against the menu", () => {
  const KITCHEN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const BAR = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const MAINS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const menu = {
    categories: [{ id: MAINS, name: "עיקריות", department: KITCHEN }],
    items: [
      { category: MAINS, name: "שניצל" },
      { category: MAINS, name: "Pasta" },
    ],
  };

  it("adds to a category the menu has, which keeps its department", () => {
    const check = againstMenu(
      parse("עיקריות\nהמבורגר 68\nקינוחים\nמלבי 26"),
      menu,
    );
    expect(check.categories).toEqual([
      {
        name: "עיקריות",
        existing: { id: MAINS, department: KITCHEN },
        items: [{ name: "המבורגר", priceAgorot: 6800, optionGroups: [] }],
      },
      {
        name: "קינוחים",
        existing: null,
        items: [{ name: "מלבי", priceAgorot: 2600, optionGroups: [] }],
      },
    ]);
    expect([check.newItems, check.newCategories, check.tooMany]).toEqual([
      2,
      1,
      false,
    ]);
    // The new category's department is the one chosen; the menu's keeps its own.
    expect(
      importRows(
        check.categories,
        check.categories.map((c) => c.existing?.department ?? BAR),
      ),
    ).toEqual([
      { category: { name: "עיקריות", department: KITCHEN } },
      { item: { name: "המבורגר", priceAgorot: 6800 } },
      { category: { name: "קינוחים", department: BAR } },
      { item: { name: "מלבי", priceAgorot: 2600 } },
    ]);
  });

  it("leaves out an item already in that category, with its extras, case aside", () => {
    const pasted = parse(
      [
        "עיקריות",
        "שניצל 62",
        "+ צ׳יפס 12",
        "pasta 58",
        "פסטה 58",
        "שתייה",
        "שניצל 62",
      ].join("\n"),
    );
    const check = againstMenu(pasted, menu);
    expect([...check.known].sort((a, b) => a - b)).toEqual([2, 3, 4]);
    expect(
      check.categories.map((c) => [c.name, c.items.map((i) => i.name)]),
    ).toEqual([
      ["עיקריות", ["פסטה"]],
      // Another category: not the same item, so it goes in.
      ["שתייה", ["שניצל"]],
    ]);
    expect(check.newItems).toBe(2);
  });

  it("leaves out a category whose every item is there already", () => {
    const check = againstMenu(parse("עיקריות\nשניצל 62"), menu);
    expect(check.categories).toEqual([]);
    expect([check.newItems, check.newCategories]).toEqual([0, 0]);
  });

  it("is too many when the menu and the paste pass 300 items or 30 categories", () => {
    const full = {
      categories: menu.categories,
      items: Array.from({ length: MENU_CAPS.items - 1 }, (_, n) => ({
        category: MAINS,
        name: `פריט ${n}`,
      })),
    };
    expect(againstMenu(parse("עיקריות\nאחד 10"), full).tooMany).toBe(false);
    expect(againstMenu(parse("עיקריות\nאחד 10\nשניים 10"), full).tooMany).toBe(
      true,
    );
    const many = {
      categories: Array.from({ length: MENU_CAPS.categories - 1 }, (_, n) => ({
        id: `c${n}`,
        name: `קטגוריה ${n}`,
        department: KITCHEN,
      })),
      items: [],
    };
    expect(againstMenu(parse("חדשה\nאחד 10"), many).tooMany).toBe(false);
    expect(
      againstMenu(parse("חדשה\nאחד 10\nעוד אחת\nשניים 10"), many).tooMany,
    ).toBe(true);
  });

  it("knows nothing on an empty menu", () => {
    const check = againstMenu(parse("עיקריות\nשניצל 62"), {
      categories: [],
      items: [],
    });
    expect(check.known.size).toBe(0);
    expect(check.newItems).toBe(1);
    expect(check.newCategories).toBe(1);
  });
});
