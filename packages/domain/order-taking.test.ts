import { describe, expect, it } from "vitest";
import {
  categoriesInput,
  checkPicks,
  choiceId,
  choiceRule,
  type GroupDraft,
  groupDrafts,
  groupsFromDrafts,
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
  newChoiceId,
  newGroupDraft,
  type OptionGroup,
  optionGroups,
  placesInput,
  quickCount,
  quickPlaces,
  typedAgorot,
  typedMost,
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

  it("reads the quick start's typed count as the one number its button names and makes", () => {
    expect(quickCount("12", 10)).toBe(12);
    expect(quickCount(" 7 ", 10)).toBe(7);
    // Cleared, or no number: the start, which the button then makes.
    expect(quickCount("", 10)).toBe(10);
    expect(quickCount("abc", 10)).toBe(10);
    // Out of 1 to 60, or not whole: the nearest it can make.
    expect(quickCount("0", 10)).toBe(1);
    expect(quickCount("-3", 10)).toBe(1);
    expect(quickCount("75", 10)).toBe(MENU_CAPS.places);
    expect(quickCount("2.5", 10)).toBe(2);
    // What the button says is what it makes.
    for (const typed of ["", "0", "2.5", "75", "12"]) {
      expect(quickPlaces(quickCount(typed, 10))).toHaveLength(
        quickCount(typed, 10),
      );
    }
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

describe("the item's choices in its sheet (P6)", () => {
  const MAINS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  // A random that counts, so the new ids are known.
  const counting = () => {
    let n = 0;
    return () => {
      n += 1;
      return `${String(n).padStart(8, "0")}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
    };
  };
  const draft = (fields: Partial<GroupDraft> = {}): GroupDraft => ({
    ...newGroupDraft(),
    name: "רוטב",
    options: [
      { name: "עגבניות", price: "" },
      { name: "שמנת", price: "4" },
    ],
    ...fields,
  });
  const fromDrafts = (drafts: GroupDraft[]) =>
    groupsFromDrafts(drafts, counting());

  it("sends a change of the choices with the rest of the item as it is", () => {
    const item: MenuItem = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      category: MAINS,
      name: "המבורגר",
      description: null,
      priceAgorot: 6800,
      department: null,
      route: null,
      available: true,
      optionGroups: [doneness, extras],
      version: 3,
    };
    expect(itemSaveInput(item, { optionGroups: [size] }).optionGroups).toEqual([
      size,
    ]);
    expect(itemSaveInput(item, { optionGroups: [] }).optionGroups).toEqual([]);
    expect(itemSaveInput(item, { name: "x" }).optionGroups).toEqual([
      doneness,
      extras,
    ]);
  });

  it("makes new ids that fit, never one taken", () => {
    const id = newChoiceId([], counting(), "g");
    expect(id).toBe("g00000001");
    expect(choiceId.safeParse(id).success).toBe(true);
    expect(newChoiceId(["o00000001"], counting(), "o")).toBe("o00000002");
    // One that keeps coming back taken: counting up still finds one.
    const same = () => "00000001-aaaa";
    expect(newChoiceId(["g00000001", "g1"], same, "g")).toBe("g2");
    // Letters as a uuid has them, made small.
    expect(newChoiceId([], () => "ABCDEF12-0000", "o")).toBe("oabcdef12");
  });

  it("reads saved groups back unchanged, their ids kept", () => {
    const drafts = groupDrafts([doneness, extras, size]);
    expect(drafts[1]).toEqual({
      id: "extras",
      name: "תוספות",
      required: false,
      most: 2,
      least: 0,
      removed: false,
      options: [
        { id: "egg", name: "ביצה", price: "6" },
        { id: "cheese", name: "גבינה", price: "6" },
        { id: "bacon", name: "בייקון", price: "9" },
      ],
    });
    expect(fromDrafts(drafts)).toEqual({
      ok: true,
      groups: [doneness, extras, size],
    });
  });

  it("gives what is new fresh ids, a blank price none, and reads prices typed", () => {
    const drafts = [
      ...groupDrafts([size]),
      draft({
        options: [
          { name: " עגבניות ", price: " " },
          { name: "שמנת", price: "6.50" },
        ],
      }),
    ];
    const read = fromDrafts(drafts);
    expect(read).toEqual({
      ok: true,
      groups: [
        size,
        {
          id: "g00000003",
          name: "רוטב",
          min: 1,
          max: 1,
          options: [
            { id: "o00000001", name: "עגבניות", priceAgorot: 0 },
            { id: "o00000002", name: "שמנת", priceAgorot: 650 },
          ],
        },
      ],
    });
    if (read.ok) expect(valid(read.groups)).toBe(true);
    // An option added to a saved group keeps the others' ids.
    const [first] = groupDrafts([size]);
    const more = fromDrafts([
      {
        ...(first as GroupDraft),
        options: [...(first?.options ?? []), { name: "ענק", price: "8" }],
      },
    ]);
    expect(more.ok && more.groups[0]?.options.map((o) => o.id)).toEqual([
      "regular",
      "large",
      "o00000001",
    ]);
  });

  it("asks for a pick from the switch, up to the most, between one and every option", () => {
    const read = (fields: Partial<GroupDraft>) => {
      const result = fromDrafts([draft(fields)]);
      return result.ok ? result.groups[0] : null;
    };
    expect(read({ required: true, most: 1 })).toMatchObject({ min: 1, max: 1 });
    expect(read({ required: false, most: 2 })).toMatchObject({
      min: 0,
      max: 2,
    });
    // Clamped to the options there are, and to one at least.
    expect(read({ required: false, most: 9 })).toMatchObject({ max: 2 });
    expect(read({ required: true, most: 0 })).toMatchObject({ min: 1, max: 1 });
    // A saved least above one stays while required, up to the most.
    expect(read({ required: true, most: 2, least: 2 })).toMatchObject({
      min: 2,
      max: 2,
    });
    expect(read({ required: true, most: 1, least: 2 })).toMatchObject({
      min: 1,
      max: 1,
    });
    expect(read({ required: false, most: 2, least: 2 })).toMatchObject({
      min: 0,
    });
  });

  it("reads the most as typed, waiting on what it can't take yet", () => {
    expect(typedMost("2", 4)).toBe(2);
    expect(typedMost(" 4 ", 4)).toBe(4);
    // Cleared to type another, or past the options for a moment: it waits.
    expect(typedMost("", 4)).toBeNull();
    expect(typedMost("12", 4)).toBeNull();
    expect(typedMost("0", 4)).toBeNull();
    expect(typedMost("2.5", 4)).toBeNull();
    // Once the field is left, the nearest the group takes, or nothing.
    expect(typedMost("12", 4, true)).toBe(4);
    expect(typedMost("0", 4, true)).toBe(1);
    expect(typedMost("", 4, true)).toBeNull();
    expect(typedMost("2.5", 4, true)).toBeNull();
    expect(typedMost("3", 0, true)).toBe(1);
  });

  it("says every problem in the form's order, each under its own field", () => {
    const result = fromDrafts([
      draft({ name: " " }),
      draft({
        options: [
          { name: "", price: "" },
          { name: "שמנת", price: "4" },
          { name: " שמנת ", price: "x" },
        ],
      }),
      draft({ options: [] }),
    ]);
    expect(result).toEqual({
      ok: false,
      problems: [
        { group: 0, problem: "nameMissing" },
        { group: 1, option: 0, problem: "optionMissing" },
        { group: 1, option: 2, problem: "optionTwice" },
        { group: 1, option: 2, problem: "priceUnclear" },
        { group: 2, problem: "empty" },
      ],
    });
    // A name past 40 characters, a price past 1,000.00 ₪.
    expect(
      fromDrafts([
        draft({ name: "א".repeat(41) }),
        draft({ options: [{ name: "ב".repeat(41), price: "1000.01" }] }),
      ]),
    ).toEqual({
      ok: false,
      problems: [
        { group: 0, problem: "nameMissing" },
        { group: 1, option: 0, problem: "optionMissing" },
        { group: 1, option: 0, problem: "priceUnclear" },
      ],
    });
  });

  it("holds the choices together to the cap, under the card that passes it", () => {
    const priced = (price: string) =>
      draft({ options: [{ name: "יקר", price }], required: false });
    // 1,000.00 ₪ in all passes; one agora more is too much.
    expect(fromDrafts([priced("600"), priced("400")]).ok).toBe(true);
    expect(fromDrafts([priced("600"), priced("400.01")])).toEqual({
      ok: false,
      problems: [{ group: 1, problem: "tooMuch" }],
    });
    // How many may be picked counts too.
    const two = draft({
      required: false,
      most: 2,
      options: [
        { name: "א", price: "500" },
        { name: "ב", price: "500.01" },
      ],
    });
    expect(fromDrafts([two])).toEqual({
      ok: false,
      problems: [{ group: 0, problem: "tooMuch" }],
    });
  });

  it("refuses a sixth group and a thirteenth option, and leaves removed groups out", () => {
    const six = Array.from({ length: 6 }, (_, n) =>
      draft({ name: `קבוצה ${n}` }),
    );
    expect(fromDrafts(six)).toEqual({
      ok: false,
      problems: [{ group: 5, problem: "tooManyGroups" }],
    });
    // Removed, the sixth is no longer one.
    const kept = fromDrafts(
      six.map((g, n) => (n === 2 ? { ...g, removed: true } : g)),
    );
    expect(kept.ok && kept.groups.map((g) => g.name)).toEqual([
      "קבוצה 0",
      "קבוצה 1",
      "קבוצה 3",
      "קבוצה 4",
      "קבוצה 5",
    ]);
    // A removed card's problems aren't said, and its place still names the others.
    expect(
      fromDrafts([draft({ name: "", removed: true }), draft({ name: "" })]),
    ).toEqual({
      ok: false,
      problems: [{ group: 1, problem: "nameMissing" }],
    });
    const thirteen = draft({
      options: Array.from({ length: 13 }, (_, n) => ({
        name: `אפשרות ${n}`,
        price: "",
      })),
    });
    expect(fromDrafts([thirteen])).toEqual({
      ok: false,
      problems: [{ group: 0, problem: "tooManyOptions" }],
    });
  });

  it("always sends groups the database takes", () => {
    const cases: GroupDraft[][] = [
      [],
      groupDrafts([doneness, extras, size]),
      [draft(), draft({ required: false, most: 2 })],
      [
        draft({
          required: false,
          most: 12,
          options: Array.from({ length: 12 }, (_, n) => ({
            name: `אפשרות ${n}`,
            price: n % 2 ? "" : "8.33",
          })),
        }),
      ],
    ];
    for (const drafts of cases) {
      const result = fromDrafts(drafts);
      expect(result.ok).toBe(true);
      if (result.ok) expect(valid(result.groups)).toBe(true);
    }
  });
});
