import { z } from "zod";

/**
 * Taking orders (waiter mode, P1): the menu as the database keeps it
 * (supabase/migrations/20261117000500_order_taking_menu.sql). Prices are
 * whole agorot, VAT included, exactly as the business types them
 * (@domain/money: nothing in between is a float). An item may have up to five
 * groups of choices ("גודל", "תוספות"), each saying how few and how many of
 * its options are picked, and each option adds its own price. Pure: the
 * database decides every write, and this says the same to the screens.
 */

/** How much a business's menu holds (`public.save_menu_item` and the others say the same). */
export const MENU_CAPS = {
  /** Live items. */
  items: 300,
  /** Live categories. */
  categories: 30,
  /** Live places. */
  places: 60,
  /** Groups of choices on one item. */
  groups: 5,
  /** Options in one group. */
  options: 12,
} as const;

/** An item's own price: up to 10,000.00 ₪ (`menu_items.price_agorot`). */
export const MAX_ITEM_AGOROT = 1_000_000;

/** One option's price: up to 1,000.00 ₪. */
export const MAX_OPTION_AGOROT = 100_000;

/**
 * The most an item's choices may add, every group's most expensive options
 * as many as it lets one pick: 1,000.00 ₪.
 */
export const MAX_EXTRAS_AGOROT = 100_000;

/** So no line's unit price is ever more than 11,000.00 ₪. */
export const MAX_UNIT_AGOROT = MAX_ITEM_AGOROT + MAX_EXTRAS_AGOROT;

/** How long names and the description may be, in characters, as the database counts them. */
export const MENU_TEXT_MAX = {
  category: 40,
  item: 60,
  description: 200,
  place: 20,
  group: 40,
  option: 40,
} as const;

/** Characters as Postgres counts them (code points), not UTF-16 units. */
const chars = (text: string) => [...text].length;

/**
 * A name as the database keeps it: 1 to `max` characters, with no space at
 * either end (`btrim`, which takes off spaces only).
 */
export const menuName = (max: number) =>
  z
    .string()
    .refine(
      (text) => chars(text) >= 1 && chars(text) <= max,
      `From 1 to ${max} characters`,
    )
    .refine(
      (text) => !text.startsWith(" ") && !text.endsWith(" "),
      "No space at either end",
    );

/**
 * A name as someone types it, for a save: trimmed, then 1 to `max`
 * characters, as the database's `private.json_text` reads it.
 */
export const typedName = (max: number) =>
  z
    .string()
    .trim()
    .refine(
      (text) => chars(text) >= 1 && chars(text) <= max,
      `From 1 to ${max} characters`,
    );

/** A group's or an option's id: what a pick names, kept across saves. */
export const choiceId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);

export const menuOption = z.strictObject({
  id: choiceId,
  name: menuName(MENU_TEXT_MAX.option),
  priceAgorot: z.int().min(0).max(MAX_OPTION_AGOROT),
});

export type MenuOption = z.infer<typeof menuOption>;

const unique = (ids: readonly string[]) => new Set(ids).size === ids.length;

export const optionGroup = z
  .strictObject({
    id: choiceId,
    name: menuName(MENU_TEXT_MAX.group),
    /** How few to pick: 0 for optional, 1 or more for required. */
    min: z.int().min(0),
    /** How many may be picked: at least one, at most every option. */
    max: z.int().min(1),
    options: z.array(menuOption).min(1).max(MENU_CAPS.options),
  })
  .refine(
    (group) => group.min <= group.max && group.max <= group.options.length,
    "From min to max, at most every option",
  )
  .refine(
    (group) => unique(group.options.map((option) => option.id)),
    "Each option's id once",
  );

export type OptionGroup = z.infer<typeof optionGroup>;

/**
 * What a group's choices may add at most: its `max` most expensive options.
 */
function groupMostAgorot(group: OptionGroup): number {
  return [...group.options]
    .map((option) => option.priceAgorot)
    .sort((a, b) => b - a)
    .slice(0, group.max)
    .reduce((sum, price) => sum + price, 0);
}

/**
 * An item's groups of choices, the twin of `private.valid_option_groups`: at
 * most five, each id once, each group valid, and every group's most
 * expensive picks together at most `MAX_EXTRAS_AGOROT`.
 */
export const optionGroups = z
  .array(optionGroup)
  .max(MENU_CAPS.groups)
  .refine(
    (groups) => unique(groups.map((group) => group.id)),
    "Each group's id once",
  )
  .refine(
    (groups) =>
      groups.reduce((sum, group) => sum + groupMostAgorot(group), 0) <=
      MAX_EXTRAS_AGOROT,
    `The choices add at most ${MAX_EXTRAS_AGOROT} agorot`,
  );

/** An item's price and its choices: what a line's unit price comes from. */
export type PricedItem = {
  priceAgorot: number;
  optionGroups: readonly OptionGroup[];
};

/** One option picked in one group. */
export type ChoicePick = { group: string; option: string };

/** Why picks don't fit an item's choices. */
export type PickProblem =
  /** A group or an option the item doesn't have. */
  | "unknown"
  /** The same option twice. */
  | "repeated"
  /** Nothing picked in a group that needs a pick. */
  | "required"
  /** Fewer than the group's least. */
  | "tooFew"
  /** More than the group allows. */
  | "tooMany";

export type PickCheck =
  | { ok: true }
  | { ok: false; problem: PickProblem; group: string | null };

/**
 * Whether picks fit an item's groups, as `private.unit_agorot` checks them:
 * every pick a real option, none twice, and in each group from its `min` to
 * its `max`. The first problem, in the groups' order.
 */
export function checkPicks(
  groups: readonly OptionGroup[],
  picks: readonly ChoicePick[],
): PickCheck {
  const seen = new Set<string>();
  for (const pick of picks) {
    const group = groups.find((candidate) => candidate.id === pick.group);
    if (!group?.options.some((option) => option.id === pick.option)) {
      return { ok: false, problem: "unknown", group: group?.id ?? null };
    }
    const key = `${pick.group}\u0000${pick.option}`;
    if (seen.has(key)) {
      return { ok: false, problem: "repeated", group: group.id };
    }
    seen.add(key);
  }
  for (const group of groups) {
    const count = picks.filter((pick) => pick.group === group.id).length;
    if (count === 0 && group.min > 0) {
      return { ok: false, problem: "required", group: group.id };
    }
    if (count < group.min) {
      return { ok: false, problem: "tooFew", group: group.id };
    }
    if (count > group.max) {
      return { ok: false, problem: "tooMany", group: group.id };
    }
  }
  return { ok: true };
}

/**
 * A line's unit price: the item's own and its picks', in agorot, as
 * `private.unit_agorot` computes it (`modules/order_taking/unit-price.db.test.ts`
 * keeps the two the same). Null when the picks don't fit (`checkPicks`).
 */
export function unitAgorot(
  item: PricedItem,
  picks: readonly ChoicePick[],
): number | null {
  if (!checkPicks(item.optionGroups, picks).ok) return null;
  return picks.reduce((sum, pick) => {
    const option = item.optionGroups
      .find((group) => group.id === pick.group)
      ?.options.find((candidate) => candidate.id === pick.option);
    return sum + (option?.priceAgorot ?? 0);
  }, item.priceAgorot);
}

/**
 * The most a line of the item may cost: its price and every group's most
 * expensive options, as many as it lets one pick. Never over
 * `MAX_UNIT_AGOROT` for an item the database keeps.
 */
export function maxUnitAgorot(item: PricedItem): number {
  return item.optionGroups.reduce(
    (sum, group) => sum + groupMostAgorot(group),
    item.priceAgorot,
  );
}

/** A category of the menu, as `public.order_menu` gives it. */
export type MenuCategory = {
  id: string;
  name: string;
  /** The department its items go to. */
  department: string;
};

/** An item of the menu, as `public.order_menu` gives it. */
export type MenuItem = PricedItem & {
  id: string;
  category: string;
  name: string;
  description: string | null;
  /** Its own department, when it doesn't go where its category does. */
  department: string | null;
  /** Where its lines go now: a live department, or null for nowhere. */
  route: string | null;
  available: boolean;
  /** What a save names, so a save from an old screen is refused. */
  version: number;
};

/** A place orders are for: a table, a seat at the bar, a room. */
export type OrderPlace = { id: string; name: string };

/** The menu and places of a business, at one version. */
export type Menu = {
  /** Moves with every write; a read that names it gets nothing new. */
  version: number;
  categories: MenuCategory[];
  items: MenuItem[];
  places: OrderPlace[];
};

const uuid = z.uuid();

/** `public.order_menu`'s answer, read strictly: a menu the screens can trust. */
export const menuSchema = z.object({
  version: z.int().min(0),
  categories: z.array(
    z.object({ id: uuid, name: z.string(), department: uuid }),
  ),
  items: z.array(
    z.object({
      id: uuid,
      category: uuid,
      name: z.string(),
      description: z.string().nullable(),
      priceAgorot: z.int().min(0).max(MAX_ITEM_AGOROT),
      department: uuid.nullable(),
      route: uuid.nullable(),
      available: z.boolean(),
      optionGroups,
      version: z.int().min(1),
    }),
  ),
  places: z.array(z.object({ id: uuid, name: z.string() })),
}) satisfies z.ZodType<Menu>;

/** A category as a save sends it, in order: a new one has no id. */
export const categoryInput = z.strictObject({
  id: uuid.optional(),
  name: typedName(MENU_TEXT_MAX.category),
  department: uuid,
});

export type CategoryInput = z.infer<typeof categoryInput>;

const nameKey = (name: string) => name.toLowerCase();

/** A business's categories as one save sends them: each name and id once. */
export const categoriesInput = z
  .array(categoryInput)
  .max(MENU_CAPS.categories)
  .refine(
    (list) => unique(list.map((category) => nameKey(category.name))),
    "Each category's name once",
  )
  .refine(
    (list) => unique(list.flatMap((category) => category.id ?? [])),
    "Each category once",
  );

/** A place as a save sends it, in order: a new one has no id. */
export const placeInput = z.strictObject({
  id: uuid.optional(),
  name: typedName(MENU_TEXT_MAX.place),
});

export type PlaceInput = z.infer<typeof placeInput>;

/** A business's places as one save sends them: each name and id once. */
export const placesInput = z
  .array(placeInput)
  .max(MENU_CAPS.places)
  .refine(
    (list) => unique(list.map((place) => nameKey(place.name))),
    "Each place's name once",
  )
  .refine(
    (list) => unique(list.flatMap((place) => place.id ?? [])),
    "Each place once",
  );

/** An item as a save sends it (`public.save_menu_item`): a new one has no id. */
export const itemInput = z.strictObject({
  id: uuid.optional(),
  category: uuid,
  name: typedName(MENU_TEXT_MAX.item),
  description: typedName(MENU_TEXT_MAX.description).nullable().optional(),
  priceAgorot: z.int().min(0).max(MAX_ITEM_AGOROT),
  /** Its own department; none goes where its category does. */
  department: uuid.nullable().optional(),
  optionGroups: optionGroups.optional(),
  /** Its place in its category; a new one goes last. */
  position: z.int().min(0).max(999).optional(),
});

export type ItemInput = z.infer<typeof itemInput>;

/*
 * The menu on screen (P2): what the screens work out from the menu they
 * read, so every shape of a screen says the same.
 */

/** What a save of an item changes; the rest is sent as the item has it. */
export type ItemChange = Partial<
  Pick<
    ItemInput,
    "category" | "name" | "description" | "priceAgorot" | "department"
  >
>;

/**
 * An item as `public.save_menu_item` saves it: whole, since it replaces
 * every field, so what isn't changed goes as the item has it, its choices,
 * its description and its own department too. A blank description is none.
 * No place is sent: one moved to another category goes last there, and one
 * that stays keeps its place.
 */
export function itemSaveInput(
  item: MenuItem,
  change: ItemChange = {},
): ItemInput {
  const description =
    "description" in change ? change.description : item.description;
  return {
    id: item.id,
    category: change.category ?? item.category,
    name: change.name ?? item.name,
    description: description?.trim() ? description.trim() : null,
    priceAgorot: change.priceAgorot ?? item.priceAgorot,
    department:
      "department" in change ? (change.department ?? null) : item.department,
    optionGroups: [...item.optionGroups],
  };
}

/** What the menu's title says first: its items, those sold out, and those that reach no one. */
export function menuStatus(menu: Pick<Menu, "items">): {
  items: number;
  soldOut: number;
  noRoute: number;
} {
  return {
    items: menu.items.length,
    soldOut: menu.items.filter((item) => !item.available).length,
    noRoute: menu.items.filter((item) => item.route === null).length,
  };
}

/** How many items each department prepares, by where their lines go now. */
export function itemsByDepartment(
  menu: Pick<Menu, "items">,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of menu.items) {
    if (item.route === null) continue;
    counts.set(item.route, (counts.get(item.route) ?? 0) + 1);
  }
  return counts;
}

/**
 * Whether the person marks this item sold out, as
 * `public.set_menu_item_available` allows: they run the menu, or its lines go
 * to one of their live departments. One that goes nowhere is only theirs who
 * run the menu.
 */
export function marksSoldOut(
  item: Pick<MenuItem, "route">,
  person: { runsMenu: boolean; myDepartments: readonly string[] },
): boolean {
  return (
    person.runsMenu ||
    (item.route !== null && person.myDepartments.includes(item.route))
  );
}

/**
 * Places named "1" to "count", for a business that has none yet: names
 * already taken (case aside) are skipped and counting goes on, and the
 * places it has come after them, so no more than the menu's 60 in all.
 */
export function quickPlaces(
  count: number,
  existing: readonly PlaceInput[] = [],
): PlaceInput[] {
  const taken = new Set(existing.map((place) => nameKey(place.name)));
  const wanted = Math.max(
    0,
    Math.min(Math.floor(count), MENU_CAPS.places - existing.length),
  );
  const made: PlaceInput[] = [];
  for (let n = 1; made.length < wanted; n++) {
    if (!taken.has(String(n))) made.push({ name: String(n) });
  }
  return [...made, ...existing];
}

/** Agorot as typed back into a price field: "62", or "14.50" with agorot. */
export function typedAgorot(agorot: number): string {
  return agorot % 100 === 0 ? String(agorot / 100) : (agorot / 100).toFixed(2);
}

/**
 * How a group of choices is picked, for its words: exactly one, up to some,
 * from some to some, or any of them.
 */
export function choiceRule(
  group: Pick<OptionGroup, "min" | "max" | "options">,
): "one" | "upTo" | "between" | "any" {
  if (group.min === 1 && group.max === 1) return "one";
  if (group.min === 0) {
    return group.max >= group.options.length ? "any" : "upTo";
  }
  return "between";
}
