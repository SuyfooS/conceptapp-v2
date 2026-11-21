import { beforeEach, describe, expect, it, vi } from "vitest";

// The menu's actions (waiter mode P2) with what they read and write stood in
// for: the member the session knows (`currentMember`), the modules on
// (`currentModules`), the database's writes and the refresh. They hold the
// rules a write keeps before it reaches the database: nothing for someone
// off the staff, with the module off or signed out; nothing while viewing,
// "נגמר" included; nothing in another business than the screen was drawn
// for; only "נגמר" for someone who doesn't run the menu; nothing with a
// shape the database wouldn't take. A save refused as changed brings the
// item as it is now.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  currentMember: vi.fn(),
  currentModules: vi.fn(),
  refresh: vi.fn(),
  getMenu: vi.fn(),
  saveMenuItem: vi.fn(),
  archiveMenuItem: vi.fn(),
  restoreMenuItem: vi.fn(),
  setMenuItemAvailable: vi.fn(),
  setMenuCategories: vi.fn(),
  setOrderPlaces: vi.fn(),
  importMenu: vi.fn(),
}));
vi.mock("../../member", () => ({ currentMember: mocks.currentMember }));
vi.mock("../../modules", () => ({ currentModules: mocks.currentModules }));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("@db/order-taking", () => ({
  getMenu: mocks.getMenu,
  saveMenuItem: mocks.saveMenuItem,
  archiveMenuItem: mocks.archiveMenuItem,
  restoreMenuItem: mocks.restoreMenuItem,
  setMenuItemAvailable: mocks.setMenuItemAvailable,
  setMenuCategories: mocks.setMenuCategories,
  setOrderPlaces: mocks.setOrderPlaces,
  importMenu: mocks.importMenu,
}));

const {
  archiveItemAction,
  importMenuAction,
  restoreItemAction,
  saveCategoriesAction,
  saveItemAction,
  savePlacesAction,
  setAvailableAction,
} = await import("./actions");

const PLACE = "11111111-1111-4111-a111-111111111111";
const OTHER = "22222222-2222-4222-a222-222222222222";
const PERSON = "33333333-3333-4333-a333-333333333333";
const ITEM = "44444444-4444-4444-a444-444444444444";
const MAINS = "55555555-5555-4555-a555-555555555555";
const KITCHEN = "66666666-6666-4666-a666-666666666666";

/** Someone in PLACE as `role`, holding `perms`, or the team viewing as it. */
function asking(role: string, perms: string[] = [], viewing = false) {
  mocks.currentMember.mockResolvedValue({
    userId: PERSON,
    viewing: viewing ? { role, namedRole: null, businessSlug: "place" } : null,
    membership: { role, perms, business: { id: PLACE } },
  });
}

const schnitzel = {
  id: ITEM,
  category: MAINS,
  name: "שניצל",
  description: null,
  priceAgorot: 6200,
  department: null,
  route: KITCHEN,
  available: true,
  optionGroups: [],
  version: 2,
};
const saved = { id: ITEM, category: MAINS, name: "שניצל", priceAgorot: 6400 };

/** Every action, each with input it takes, for PLACE or `business`. */
const every = (business = PLACE) => ({
  saveItem: () => saveItemAction(business, saved, 2),
  archiveItem: () => archiveItemAction(business, ITEM),
  restoreItem: () => restoreItemAction(business, ITEM),
  setAvailable: () => setAvailableAction(business, ITEM, false),
  saveCategories: () =>
    saveCategoriesAction(business, [{ name: "עיקריות", department: KITCHEN }]),
  savePlaces: () => savePlacesAction(business, [{ name: "1" }]),
  importMenu: () =>
    importMenuAction(business, [
      { category: { name: "עיקריות", department: KITCHEN } },
      { item: { name: "שניצל", priceAgorot: 6200 } },
    ]),
});

const writes = () => [
  mocks.saveMenuItem,
  mocks.archiveMenuItem,
  mocks.restoreMenuItem,
  mocks.setMenuItemAvailable,
  mocks.setMenuCategories,
  mocks.setOrderPlaces,
  mocks.importMenu,
];

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.currentModules.mockResolvedValue(["order_taking"]);
  asking("manager", ["order_taking.edit"]);
  mocks.saveMenuItem.mockResolvedValue({
    ok: true,
    value: { id: ITEM, version: 3 },
  });
  for (const write of [
    mocks.archiveMenuItem,
    mocks.restoreMenuItem,
    mocks.setMenuItemAvailable,
  ]) {
    write.mockResolvedValue({ ok: true, value: null });
  }
  mocks.setMenuCategories.mockResolvedValue({ ok: true, value: [MAINS] });
  mocks.setOrderPlaces.mockResolvedValue({ ok: true, value: [ITEM] });
  mocks.importMenu.mockResolvedValue({
    ok: true,
    value: { categories: 1, items: 1 },
  });
});

describe("the menu's actions", () => {
  it("write as the person, in the business the screen was drawn for, and refresh", async () => {
    for (const [name, run] of Object.entries(every())) {
      const result = await run();
      expect(result.ok, name).toBe(true);
    }
    expect(mocks.saveMenuItem).toHaveBeenCalledWith(PERSON, PLACE, saved, 2);
    expect(mocks.setMenuItemAvailable).toHaveBeenCalledWith(
      PERSON,
      PLACE,
      ITEM,
      false,
    );
    expect(mocks.refresh).toHaveBeenCalledTimes(7);
  });

  it("write nothing for someone signed out, with the module off, or off the staff", async () => {
    mocks.currentMember.mockResolvedValue(null);
    for (const run of Object.values(every())) {
      await expect(run()).resolves.toEqual({ ok: false, failure: "noAccess" });
    }
    asking("owner");
    mocks.currentModules.mockResolvedValue(["lists"]);
    for (const run of Object.values(every())) {
      await expect(run()).resolves.toEqual({ ok: false, failure: "noAccess" });
    }
    mocks.currentModules.mockResolvedValue(["order_taking"]);
    asking("accountant", ["order_taking.edit"]);
    for (const run of Object.values(every())) {
      await expect(run()).resolves.toEqual({ ok: false, failure: "noAccess" });
    }
    for (const write of writes()) expect(write).not.toHaveBeenCalled();
  });

  it("write nothing while viewing as someone, not even sold out", async () => {
    asking("manager", ["order_taking.edit"], true);
    for (const run of Object.values(every())) {
      await expect(run()).resolves.toEqual({ ok: false, failure: "viewOnly" });
    }
    for (const write of writes()) expect(write).not.toHaveBeenCalled();
  });

  it("write nothing in another business than the screen's", async () => {
    for (const run of Object.values(every(OTHER))) {
      await expect(run()).resolves.toEqual({
        ok: false,
        failure: "businessChanged",
      });
    }
    for (const write of writes()) expect(write).not.toHaveBeenCalled();
  });

  it("let someone who doesn't run the menu mark sold out, and nothing else", async () => {
    asking("worker");
    const { setAvailable, ...rest } = every();
    for (const run of Object.values(rest)) {
      await expect(run()).resolves.toEqual({ ok: false, failure: "noAccess" });
    }
    await expect(setAvailable()).resolves.toEqual({ ok: true, value: null });
    expect(mocks.setMenuItemAvailable).toHaveBeenCalledTimes(1);
    // The owner runs it always.
    asking("owner");
    await expect(every().saveCategories()).resolves.toMatchObject({
      ok: true,
    });
  });

  it("refuse what the database wouldn't take before it gets there", async () => {
    const refused = [
      saveItemAction(PLACE, { ...saved, priceAgorot: -1 }, 2),
      saveItemAction(PLACE, saved, 0),
      archiveItemAction(PLACE, "not an id"),
      restoreItemAction(PLACE, 7),
      setAvailableAction(PLACE, ITEM, "no"),
      saveCategoriesAction(PLACE, [
        { name: "עיקריות", department: KITCHEN },
        { name: "עיקריות", department: KITCHEN },
      ]),
      savePlacesAction(PLACE, [{ name: "" }]),
      importMenuAction(PLACE, [{ item: { name: "שניצל", priceAgorot: 6200 } }]),
    ];
    for (const result of await Promise.all(refused)) {
      expect(result).toEqual({ ok: false, failure: "invalid" });
    }
    for (const write of writes()) expect(write).not.toHaveBeenCalled();
  });

  it("save an item's groups of choices as they were sent (P6)", async () => {
    const sauce = {
      id: "g1a2b3c4d",
      name: "רוטב",
      min: 1,
      max: 1,
      options: [
        { id: "o1a2b3c4d", name: "עגבניות", priceAgorot: 0 },
        { id: "o5e6f7a8b", name: "שמנת", priceAgorot: 400 },
      ],
    };
    const result = await saveItemAction(
      PLACE,
      { ...saved, optionGroups: [sauce] },
      2,
    );
    expect(result.ok).toBe(true);
    expect(mocks.saveMenuItem).toHaveBeenCalledWith(
      PERSON,
      PLACE,
      { ...saved, optionGroups: [sauce] },
      2,
    );
  });

  it("refuse choices past what the database takes before it gets there (P6)", async () => {
    const dear = (id: string, priceAgorot: number) => ({
      id,
      name: id,
      min: 0,
      max: 1,
      options: [{ id: "o1", name: "יקר", priceAgorot }],
    });
    const refused = [
      // Together over 1,000.00 ₪.
      saveItemAction(
        PLACE,
        { ...saved, optionGroups: [dear("a", 60_000), dear("b", 40_001)] },
        2,
      ),
      // Two picks out of one option.
      saveItemAction(
        PLACE,
        { ...saved, optionGroups: [{ ...dear("a", 0), max: 2 }] },
        2,
      ),
      // An id no pick could name.
      saveItemAction(PLACE, { ...saved, optionGroups: [dear("Size!", 0)] }, 2),
    ];
    for (const result of await Promise.all(refused)) {
      expect(result).toEqual({ ok: false, failure: "invalid" });
    }
    expect(mocks.saveMenuItem).not.toHaveBeenCalled();
  });

  it("brings the item as it is now when someone saved it since", async () => {
    mocks.saveMenuItem.mockResolvedValue({ ok: false, failure: "changed" });
    const now = { ...schnitzel, priceAgorot: 6600, version: 3 };
    mocks.getMenu.mockResolvedValue({
      version: 9,
      categories: [],
      items: [now],
      places: [],
    });
    await expect(saveItemAction(PLACE, saved, 2)).resolves.toEqual({
      ok: false,
      failure: "changed",
      current: now,
    });
    // Gone meanwhile, or the menu closed: no item to show.
    mocks.getMenu.mockResolvedValue("closed");
    await expect(saveItemAction(PLACE, saved, 2)).resolves.toEqual({
      ok: false,
      failure: "changed",
      current: null,
    });
  });

  it("pass on why the database refused", async () => {
    mocks.setMenuCategories.mockResolvedValue({ ok: false, failure: "route" });
    await expect(every().saveCategories()).resolves.toEqual({
      ok: false,
      failure: "route",
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
});
