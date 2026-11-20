import { describe, expect, it } from "vitest";
import {
  categoriesInput,
  checkPicks,
  choiceRule,
  itemInput,
  itemSaveInput,
  itemsByDepartment,
  MAX_EXTRAS_AGOROT,
  MAX_ITEM_AGOROT,
  MAX_OPTION_AGOROT,
  MAX_UNIT_AGOROT,
  MENU_CAPS,
  type MenuItem,
  marksSoldOut,
  maxUnitAgorot,
  menuSchema,
  menuStatus,
  type OptionGroup,
  optionGroups,
  placesInput,
  quickPlaces,
  typedAgorot,
  unitAgorot,
} from "./order-taking";

// The demo's burger, as a later phase gives it choices: a required doneness,
// up to two extras, and a size.
const doneness: OptionGroup = {
  id: "doneness",
  name: "מידת עשייה",
  min: 1,
  max: 1,
  options: [
    { id: "m", name: "M", priceAgorot: 0 },
    { id: "mw", name: "MW", priceAgorot: 0 },
    { id: "wd", name: "WD", priceAgorot: 0 },
  ],
};
const extras: OptionGroup = {
  id: "extras",
  name: "תוספות",
  min: 0,
  max: 2,
  options: [
    { id: "egg", name: "ביצה", priceAgorot: 600 },
    { id: "cheese", name: "גבינה", priceAgorot: 600 },
    { id: "bacon", name: "בייקון", priceAgorot: 900 },
  ],
};
const size: OptionGroup = {
  id: "size",
  name: "גודל",
  min: 1,
  max: 1,
  options: [
    { id: "regular", name: "רגיל", priceAgorot: 0 },
    { id: "large", name: "גדול", priceAgorot: 1200 },
  ],
};
const burger = { priceAgorot: 6800, optionGroups: [doneness, extras, size] };

/** A group of `count` options, each at `agorot`, picked up to `max`. */
function group(
  id: string,
  count: number,
  agorot: number,
  max = 1,
): OptionGroup {
  return {
    id,
    name: `Group ${id}`,
    min: 0,
    max,
    options: Array.from({ length: count }, (_, index) => ({
      id: `o${index + 1}`,
      name: `Option ${index + 1}`,
      priceAgorot: agorot,
    })),
  };
}

const valid = (groups: unknown) => optionGroups.safeParse(groups).success;

describe("a line's unit price", () => {
  it("is the item's price and each option picked", () => {
    expect(
      unitAgorot(burger, [
        { group: "doneness", option: "m" },
        { group: "size", option: "regular" },
      ]),
    ).toBe(6800);
    expect(
      unitAgorot(burger, [
        { group: "doneness", option: "mw" },
        { group: "extras", option: "egg" },
        { group: "extras", option: "bacon" },
        { group: "size", option: "large" },
      ]),
    ).toBe(6800 + 600 + 900 + 1200);
    expect(unitAgorot({ priceAgorot: 1000, optionGroups: [] }, [])).toBe(1000);
  });

  it("is nothing for picks that don't fit", () => {
    expect(unitAgorot(burger, [{ group: "size", option: "large" }])).toBe(null);
    expect(
      unitAgorot({ priceAgorot: 1000, optionGroups: [] }, [
        { group: "size", option: "large" },
      ]),
    ).toBe(null);
  });

  it("is at most the item's price and each group's most expensive picks", () => {
    expect(maxUnitAgorot(burger)).toBe(6800 + 0 + (900 + 600) + 1200);
    expect(maxUnitAgorot({ priceAgorot: 500, optionGroups: [] })).toBe(500);
  });

  it("never passes 11,000.00 ₪ for an item the database keeps", () => {
    expect(MAX_UNIT_AGOROT).toBe(1_100_000);
    // Two groups whose most expensive picks add exactly the cap.
    const top = [group("a", 2, 50_000, 1), group("b", 12, 4_166, 12)];
    const added = 50_000 + 12 * 4_166;
    expect(added).toBeLessThanOrEqual(MAX_EXTRAS_AGOROT);
    expect(valid(top)).toBe(true);
    const item = { priceAgorot: MAX_ITEM_AGOROT, optionGroups: top };
    expect(maxUnitAgorot(item)).toBe(MAX_ITEM_AGOROT + added);
    expect(maxUnitAgorot(item)).toBeLessThanOrEqual(MAX_UNIT_AGOROT);
    // One agora more is refused, so nothing passes the cap.
    expect(valid([group("a", 1, MAX_EXTRAS_AGOROT)])).toBe(true);
    expect(valid([group("a", 1, MAX_EXTRAS_AGOROT), group("b", 1, 1)])).toBe(
      false,
    );
  });
});

describe("picks", () => {
  it("fit when each group has from its least to its most", () => {
    expect(
      checkPicks(burger.optionGroups, [
        { group: "doneness", option: "wd" },
        { group: "size", option: "regular" },
      ]),
    ).toEqual({ ok: true });
  });

  it("need a pick in a required group", () => {
    expect(
      checkPicks(burger.optionGroups, [{ group: "size", option: "regular" }]),
    ).toEqual({ ok: false, problem: "required", group: "doneness" });
  });

  it("take no more than a group allows", () => {
    expect(
      checkPicks(burger.optionGroups, [
        { group: "doneness", option: "m" },
        { group: "doneness", option: "wd" },
        { group: "size", option: "regular" },
      ]),
    ).toEqual({ ok: false, problem: "tooMany", group: "doneness" });
    expect(
      checkPicks(burger.optionGroups, [
        { group: "doneness", option: "m" },
        { group: "extras", option: "egg" },
        { group: "extras", option: "cheese" },
        { group: "extras", option: "bacon" },
        { group: "size", option: "regular" },
      ]),
    ).toEqual({ ok: false, problem: "tooMany", group: "extras" });
  });

  it("take no fewer than a group's least, once it has any", () => {
    const two = { ...extras, min: 2 };
    expect(checkPicks([two], [{ group: "extras", option: "egg" }])).toEqual({
      ok: false,
      problem: "tooFew",
      group: "extras",
    });
    expect(checkPicks([two], [])).toEqual({
      ok: false,
      problem: "required",
      group: "extras",
    });
  });

  it("name only the item's options, each once", () => {
    expect(
      checkPicks(burger.optionGroups, [{ group: "sauce", option: "aioli" }]),
    ).toEqual({ ok: false, problem: "unknown", group: null });
    expect(
      checkPicks(burger.optionGroups, [{ group: "size", option: "huge" }]),
    ).toEqual({ ok: false, problem: "unknown", group: "size" });
    expect(
      checkPicks(burger.optionGroups, [
        { group: "doneness", option: "m" },
        { group: "extras", option: "egg" },
        { group: "extras", option: "egg" },
        { group: "size", option: "regular" },
      ]),
    ).toEqual({ ok: false, problem: "repeated", group: "extras" });
  });
});

// The edges private.valid_option_groups checks, the same here
// (order_taking_menu.test.sql checks the database at them).
describe("an item's choices", () => {
  it("hold up to five groups, none at all too", () => {
    expect(valid([])).toBe(true);
    const five = ["a", "b", "c", "d", "e"].map((id) => group(id, 1, 0));
    expect(valid(five)).toBe(true);
    expect(valid([...five, group("f", 1, 0)])).toBe(false);
    expect(MENU_CAPS.groups).toBe(5);
  });

  it("hold one to twelve options in a group", () => {
    expect(valid([group("a", 12, 0)])).toBe(true);
    expect(valid([group("a", 13, 0)])).toBe(false);
    expect(valid([{ ...group("a", 1, 0), options: [] }])).toBe(false);
  });

  it("pick from min to max, at least one and at most every option", () => {
    expect(valid([{ ...group("a", 3, 0), min: 0, max: 3 }])).toBe(true);
    expect(valid([{ ...group("a", 3, 0), min: 3, max: 3 }])).toBe(true);
    expect(valid([{ ...group("a", 3, 0), min: 2, max: 1 }])).toBe(false);
    expect(valid([{ ...group("a", 3, 0), min: 0, max: 4 }])).toBe(false);
    expect(valid([{ ...group("a", 3, 0), min: 0, max: 0 }])).toBe(false);
    expect(valid([{ ...group("a", 3, 0), min: -1, max: 1 }])).toBe(false);
    expect(valid([{ ...group("a", 3, 0), min: 0.5, max: 1 }])).toBe(false);
  });

  it("have each group's id once, and each option's once in its group", () => {
    expect(valid([group("a", 1, 0), group("a", 1, 0)])).toBe(false);
    const twice = group("a", 2, 0);
    expect(
      valid([
        {
          ...twice,
          options: twice.options.map((option) => ({ ...option, id: "o1" })),
        },
      ]),
    ).toBe(false);
    // The same option id in two groups is fine.
    expect(valid([group("a", 1, 0), group("b", 1, 0)])).toBe(true);
  });

  it("price each option in whole agorot, up to 1,000.00 ₪", () => {
    expect(valid([group("a", 1, MAX_OPTION_AGOROT)])).toBe(true);
    expect(valid([group("a", 1, MAX_OPTION_AGOROT + 1)])).toBe(false);
    expect(valid([group("a", 1, -1)])).toBe(false);
    expect(valid([group("a", 1, 10.5)])).toBe(false);
  });

  it("add at most 1,000.00 ₪ however they are picked", () => {
    // Each group's `max` most expensive options count: here two of three.
    expect(valid([group("a", 3, 50_000, 2)])).toBe(true);
    expect(valid([group("a", 3, 50_001, 2)])).toBe(false);
    // A group picked once counts its dearest option only.
    expect(valid([group("a", 3, 50_001, 1), group("b", 1, 49_999)])).toBe(true);
    expect(valid([group("a", 3, 50_001, 1), group("b", 1, 50_000)])).toBe(
      false,
    );
  });

  it("name groups and options as the database keeps them", () => {
    const named = (name: string) => [{ ...group("a", 1, 0), name }];
    expect(valid(named("א".repeat(40)))).toBe(true);
    expect(valid(named("א".repeat(41)))).toBe(false);
    expect(valid(named(""))).toBe(false);
    expect(valid(named(" גודל"))).toBe(false);
    expect(valid(named("גודל "))).toBe(false);
    const option = (name: string) => [
      { ...group("a", 1, 0), options: [{ id: "o1", name, priceAgorot: 0 }] },
    ];
    expect(valid(option("ב".repeat(40)))).toBe(true);
    expect(valid(option("ב".repeat(41)))).toBe(false);
  });

  it("key groups and options with short lowercase ids, and nothing more", () => {
    const keyed = (id: string) => [{ ...group("a", 1, 0), id }];
    expect(valid(keyed("size-2"))).toBe(true);
    expect(valid(keyed("a".repeat(40)))).toBe(true);
    expect(valid(keyed("a".repeat(41)))).toBe(false);
    expect(valid(keyed("Size"))).toBe(false);
    expect(valid(keyed("-size"))).toBe(false);
    expect(valid([{ ...group("a", 1, 0), note: "x" }])).toBe(false);
    expect(
      valid([
        {
          ...group("a", 1, 0),
          options: [{ id: "o1", name: "x", priceAgorot: 0, hidden: true }],
        },
      ]),
    ).toBe(false);
  });
});

describe("what a save sends", () => {
  const KITCHEN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const MAINS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  it("trims names and keeps them within the database's lengths", () => {
    expect(
      itemInput.parse({ category: MAINS, name: " שניצל ", priceAgorot: 6200 })
        .name,
    ).toBe("שניצל");
    expect(
      itemInput.safeParse({
        category: MAINS,
        name: "ש".repeat(61),
        priceAgorot: 6200,
      }).success,
    ).toBe(false);
    expect(
      itemInput.safeParse({
        category: MAINS,
        name: "שניצל",
        priceAgorot: MAX_ITEM_AGOROT + 1,
      }).success,
    ).toBe(false);
  });

  it("names each category and each place once, case aside", () => {
    expect(
      categoriesInput.safeParse([
        { name: "Mains", department: KITCHEN },
        { name: "mains ", department: KITCHEN },
      ]).success,
    ).toBe(false);
    expect(
      placesInput.safeParse([{ name: "בר 1" }, { name: "בר 2" }]).success,
    ).toBe(true);
    expect(placesInput.safeParse([{ name: "1" }, { name: "1" }]).success).toBe(
      false,
    );
    expect(
      placesInput.safeParse(
        Array.from({ length: MENU_CAPS.places + 1 }, (_, index) => ({
          name: String(index + 1),
        })),
      ).success,
    ).toBe(false);
  });
});

describe("the menu as the database gives it", () => {
  it("is read with its items' choices and where they go", () => {
    const KITCHEN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const MAINS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const BURGER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const menu = {
      version: 1_763_400_000_000_000,
      categories: [{ id: MAINS, name: "עיקריות", department: KITCHEN }],
      items: [
        {
          id: BURGER,
          category: MAINS,
          name: "המבורגר",
          description: null,
          priceAgorot: 6800,
          department: null,
          route: KITCHEN,
          available: true,
          optionGroups: [doneness],
          version: 1,
        },
      ],
      places: [{ id: KITCHEN, name: "1" }],
    };
    expect(menuSchema.parse(menu)).toEqual(menu);
    expect(
      menuSchema.safeParse({
        ...menu,
        items: [{ ...menu.items[0], optionGroups: [{ id: "x" }] }],
      }).success,
    ).toBe(false);
  });
});

// The menu on screen (P2): what its screens work out from the menu they read.
describe("the menu on screen", () => {
  const KITCHEN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const BAR = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const MAINS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const DRINKS = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const item = (fields: Partial<MenuItem> = {}): MenuItem => ({
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    category: MAINS,
    name: "המבורגר",
    description: "קציצה של 220 גרם",
    priceAgorot: 6800,
    department: BAR,
    route: BAR,
    available: true,
    optionGroups: [doneness, extras],
    version: 3,
    ...fields,
  });

  it("sends an item whole, so a price change keeps its choices, description and department", () => {
    // public.save_menu_item replaces every field: one left out is erased.
    const saved = itemSaveInput(item(), { priceAgorot: 7200 });
    expect(saved).toEqual({
      id: item().id,
      category: MAINS,
      name: "המבורגר",
      description: "קציצה של 220 גרם",
      priceAgorot: 7200,
      department: BAR,
      optionGroups: [doneness, extras],
    });
    expect(itemInput.safeParse(saved).success).toBe(true);
  });

  it("clears a description and a department only when asked", () => {
    expect(itemSaveInput(item(), { description: "  " }).description).toBe(null);
    expect(itemSaveInput(item(), { description: null }).description).toBe(null);
    expect(itemSaveInput(item(), { department: null }).department).toBe(null);
    expect(itemSaveInput(item(), { name: "צ׳יזבורגר" }).department).toBe(BAR);
  });

  it("never sends a place: one moved to another category goes last there", () => {
    const moved = itemSaveInput(item(), { category: DRINKS });
    expect(moved.category).toBe(DRINKS);
    expect("position" in moved).toBe(false);
  });

  it("counts the items, those sold out and those that reach no one", () => {
    const items = [
      item(),
      item({ available: false }),
      item({ route: null }),
      item({ route: null, available: false }),
    ];
    expect(menuStatus({ items })).toEqual({
      items: 4,
      soldOut: 2,
      noRoute: 2,
    });
    expect(menuStatus({ items: [] })).toEqual({
      items: 0,
      soldOut: 0,
      noRoute: 0,
    });
  });

  it("counts the items each department prepares, none for one that goes nowhere", () => {
    const counts = itemsByDepartment({
      items: [
        item(),
        item({ route: KITCHEN }),
        item({ route: KITCHEN }),
        item({ route: null }),
      ],
    });
    expect([...counts]).toEqual([
      [BAR, 1],
      [KITCHEN, 2],
    ]);
  });

  it("lets those who run the menu mark anything sold out, and a department what it prepares", () => {
    const kitchenWorker = { runsMenu: false, myDepartments: [KITCHEN] };
    expect(
      marksSoldOut(item({ route: KITCHEN }), {
        runsMenu: true,
        myDepartments: [],
      }),
    ).toBe(true);
    expect(marksSoldOut(item({ route: KITCHEN }), kitchenWorker)).toBe(true);
    expect(marksSoldOut(item({ route: BAR }), kitchenWorker)).toBe(false);
    // Its department was removed: only those who run the menu.
    expect(marksSoldOut(item({ route: null }), kitchenWorker)).toBe(false);
    expect(
      marksSoldOut(item({ route: null }), {
        runsMenu: true,
        myDepartments: [],
      }),
    ).toBe(true);
  });

  it("makes places 1 to N, at most the menu's 60, skipping names taken", () => {
    expect(quickPlaces(1)).toEqual([{ name: "1" }]);
    expect(quickPlaces(10).map((place) => place.name)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
    ]);
    expect(quickPlaces(60)).toHaveLength(MENU_CAPS.places);
    expect(quickPlaces(75)).toHaveLength(MENU_CAPS.places);
    expect(quickPlaces(0)).toEqual([]);
    const kept = { id: "ffffffff-ffff-4fff-8fff-ffffffffffff", name: "2" };
    expect(quickPlaces(3, [kept])).toEqual([
      { name: "1" },
      { name: "3" },
      { name: "4" },
      kept,
    ]);
    expect(placesInput.safeParse(quickPlaces(60)).success).toBe(true);
    expect(quickPlaces(60, [kept])).toHaveLength(MENU_CAPS.places);
  });

  it("types agorot back as shekels, with agorot only when there are some", () => {
    expect(typedAgorot(6200)).toBe("62");
    expect(typedAgorot(1450)).toBe("14.50");
    expect(typedAgorot(5)).toBe("0.05");
    expect(typedAgorot(0)).toBe("0");
  });

  it("names how a group of choices is picked", () => {
    expect(choiceRule(doneness)).toBe("one");
    expect(choiceRule(extras)).toBe("upTo");
    expect(choiceRule({ ...extras, max: extras.options.length })).toBe("any");
    expect(choiceRule({ ...extras, min: 1 })).toBe("between");
  });
});
