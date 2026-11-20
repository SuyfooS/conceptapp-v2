import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The business's rows as PostgREST serves them to the secret key, by table,
 * each already filtered and ordered as asked (the stand-in records the asks),
 * and what was asked.
 */
const served = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  errors: {} as Record<string, { code: string; message: string }>,
  calls: [] as unknown[][],
}));
vi.mock("./supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      served.calls.push(["from", table]);
      const step =
        (method: string) =>
        (...args: unknown[]) => {
          served.calls.push([table, method, ...args]);
          return query;
        };
      const query = {
        select: step("select"),
        eq: step("eq"),
        is: step("is"),
        order: step("order"),
        // biome-ignore lint/suspicious/noThenProperty: PostgREST's builders are awaited
        then: (
          resolve: (value: unknown) => void,
          reject: (error: unknown) => void,
        ) =>
          Promise.resolve(
            served.errors[table]
              ? { data: null, error: served.errors[table] }
              : { data: served.tables[table] ?? [], error: null },
          ).then(resolve, reject),
      };
      return query;
    },
  }),
}));
vi.mock("./supabase/server", () => ({ createClient: async () => ({}) }));

const { getMenuForTeam } = await import("./order-taking");

const KITCHEN = "00000000-0000-4000-8000-0000000000c1";
const BAR = "00000000-0000-4000-8000-0000000000c2";
const PASTRY = "00000000-0000-4000-8000-0000000000c3";
const MAINS = "00000000-0000-4000-8000-0000000000d1";
const DRINKS = "00000000-0000-4000-8000-0000000000d2";
const DESSERTS = "00000000-0000-4000-8000-0000000000d3";

const item = (id: string, fields: Record<string, unknown>) => ({
  id: `00000000-0000-4000-8000-0000000000e${id}`,
  name: `Item ${id}`,
  description: null,
  price_agorot: 1000,
  department_id: null,
  available: true,
  option_groups: [],
  version: 1,
  ...fields,
});

afterEach(() => {
  served.tables = {};
  served.errors = {};
  served.calls = [];
});

// The console's read of a business's menu (waiter mode P2): the team is no
// member, so it reads with the secret key what public.order_menu would give.
describe("getMenuForTeam", () => {
  it("reads the menu as the phones do, in its order, each item with where it goes", async () => {
    served.tables = {
      // Desserts go to the pastry, which was removed: live departments only.
      menu_categories: [
        { id: DRINKS, name: "Drinks", department_id: BAR },
        { id: MAINS, name: "Mains", department_id: KITCHEN },
        { id: DESSERTS, name: "Desserts", department_id: PASTRY },
      ],
      menu_items: [
        item("1", { category_id: MAINS }),
        item("2", { category_id: DRINKS }),
        // Its own department over its category's.
        item("3", { category_id: MAINS, department_id: BAR }),
        item("4", { category_id: DESSERTS }),
        // A removed category's item is left out with it.
        item("5", { category_id: "00000000-0000-4000-8000-0000000000d9" }),
      ],
      departments: [{ id: KITCHEN }, { id: BAR }],
      order_places: [{ id: "00000000-0000-4000-8000-0000000000f1", name: "1" }],
    };
    const menu = await getMenuForTeam("biz");
    if (menu === "notYet") throw new Error("read");
    expect(menu.categories.map((c) => c.name)).toEqual([
      "Drinks",
      "Mains",
      "Desserts",
    ]);
    expect(menu.items.map((i) => [i.name, i.route])).toEqual([
      ["Item 2", BAR],
      ["Item 1", KITCHEN],
      ["Item 3", BAR],
      ["Item 4", null],
    ]);
    expect(menu.items[2]).toMatchObject({
      category: MAINS,
      department: BAR,
      priceAgorot: 1000,
      optionGroups: [],
    });
    expect(menu.places).toEqual([
      { id: "00000000-0000-4000-8000-0000000000f1", name: "1" },
    ]);
    expect("version" in menu).toBe(false);
    for (const table of [
      "menu_categories",
      "menu_items",
      "departments",
      "order_places",
    ]) {
      expect(served.calls).toContainEqual([table, "eq", "business_id", "biz"]);
      expect(served.calls).toContainEqual([table, "is", "archived_at", null]);
    }
    expect(served.calls).toContainEqual(["menu_items", "order", "position"]);
  });

  it("says the menu isn't there yet before the migration", async () => {
    served.errors = {
      menu_categories: { code: "PGRST205", message: "no table" },
    };
    await expect(getMenuForTeam("biz")).resolves.toBe("notYet");
  });

  it("refuses rows it doesn't read as a menu", async () => {
    served.tables = {
      menu_categories: [{ id: MAINS, name: "Mains", department_id: KITCHEN }],
      menu_items: [item("1", { category_id: MAINS, price_agorot: -1 })],
      departments: [{ id: KITCHEN }],
      order_places: [],
    };
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(getMenuForTeam("biz")).rejects.toThrow();
    quiet.mockRestore();
  });
});
