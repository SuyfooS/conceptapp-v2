import { importRows, parseMenu, reverseLine } from "@domain/menu-import";
import { itemSaveInput } from "@domain/order-taking";
import { afterEach, describe, expect, it, vi } from "vitest";
import he from "@/messages/he.json";
import {
  addLine,
  closeOrder,
  importMenu,
  newTakeaway,
  reopenOrder,
  saveCategories,
  send,
} from "./changes";
import {
  DEMO_START,
  demoJustSent,
  demoPastedMenu,
  demoProblemPaste,
  demoReversedPaste,
  orderDemoDepartments,
  READER,
  READER_DEPARTMENTS,
} from "./data";
import { newId } from "./ids";
import {
  type ChoiceGroup,
  singleChoice,
  takeawaysOnFloor,
  takeBackOpen,
  toggleChoice,
} from "./model";
import {
  fromItemInput,
  twinDepartments,
  twinMenu,
  withoutDepartment,
} from "./real-menu";
import { scenario } from "./scenario";

// The order-taking twin's rules that a screen only draws (S0 of waiter
// mode, #191): what the reviewers caught, kept caught.

const MINUTE = 60_000;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("newId", () => {
  it("makes a version 4 id where the address has no randomUUID", () => {
    const real = globalThis.crypto;
    // A phone reaching the dev server over plain http: no secure context.
    vi.stubGlobal("crypto", {
      getRandomValues: real.getRandomValues.bind(real),
    });
    const first = newId();
    expect(first).toMatch(UUID);
    expect(newId()).not.toBe(first);
  });

  it("adds a line and sends it on such a phone", () => {
    const real = globalThis.crypto;
    vi.stubGlobal("crypto", {
      getRandomValues: real.getRandomValues.bind(real),
    });
    const added = addLine(scenario("quiet"), "table-6", "lemonade", [], 1);
    const sent = send(added, "table-6", READER, DEMO_START);
    expect(sent.orders.find((o) => o.placeId === "table-6")?.id).toMatch(UUID);
  });
});

describe("the demo's evenings", () => {
  it("opens the plain links on the evening as it is", () => {
    expect(scenario("service")).toEqual(scenario(null));
    expect(scenario("service").orders.length).toBeGreaterThan(0);
  });

  it("numbers the first takeaway 1 on an evening that has none", () => {
    for (const state of ["quiet", "nothingSent", "noMenu"]) {
      expect(scenario(state).takeaways).toEqual([]);
      expect(scenario(state).nextTakeaway).toBe(1);
    }
    const quiet = newTakeaway(scenario("quiet"), "takeaway-new");
    const sent = send(
      addLine(quiet, "takeaway-new", "lemonade", [], 1),
      "takeaway-new",
      READER,
      DEMO_START,
    );
    expect(sent.takeaways.find((p) => p.id === "takeaway-new")?.name).toBe("1");
    // The evening as it opens already has takeaway 1.
    expect(scenario(null).nextTakeaway).toBe(2);
  });
});

describe("taking a line back (§3.3)", () => {
  const viewer = { id: READER, departments: READER_DEPARTMENTS };
  const order = demoJustSent();
  const round = order.rounds[0];
  const ticketOf = (department: string) =>
    round?.tickets.find((t) => t.department === department);

  it("is offered to the sender outside the ticket's department", () => {
    const kitchen = ticketOf("kitchen");
    if (!round || !kitchen)
      throw new Error("the sent order has a kitchen part");
    expect(takeBackOpen(round, kitchen, DEMO_START + MINUTE, viewer)).toBe(
      true,
    );
  });

  it("is not offered in a department the sender works in", () => {
    const bar = ticketOf("bar");
    if (!round || !bar) throw new Error("the sent order has a bar part");
    expect(READER_DEPARTMENTS).toContain("bar");
    expect(takeBackOpen(round, bar, DEMO_START + MINUTE, viewer)).toBe(false);
  });

  it("closes after two minutes, and for anyone but the sender", () => {
    const kitchen = ticketOf("kitchen");
    if (!round || !kitchen)
      throw new Error("the sent order has a kitchen part");
    expect(takeBackOpen(round, kitchen, DEMO_START + 2 * MINUTE, viewer)).toBe(
      false,
    );
    expect(
      takeBackOpen(round, kitchen, DEMO_START, {
        id: "yoav",
        departments: [],
      }),
    ).toBe(false);
  });

  it("knows the reader's departments", () => {
    const keys = orderDemoDepartments.map((d) => d.key);
    for (const key of READER_DEPARTMENTS) expect(keys).toContain(key);
  });
});

describe("an item's choices", () => {
  const one = (min: number, max: number, ids: string[]): ChoiceGroup => ({
    id: "g",
    name: "g",
    min,
    max,
    options: ids.map((id) => ({ id, name: id, price: 0 })),
  });

  it("draws radios only for exactly one choice", () => {
    expect(singleChoice(one(1, 1, ["a", "b"]))).toBe(true);
    expect(singleChoice(one(0, 1, ["a"]))).toBe(false);
    expect(singleChoice(one(0, 2, ["a", "b"]))).toBe(false);
  });

  it("lets an optional extra of one option be picked and unpicked", () => {
    // The paste's own "+ גבינה בולגרית" under its shakshuka, as the real
    // import reads it.
    const pasted = parseMenu("ארוחות\nשקשוקה 54\n+ גבינה 6", {
      size: "גודל",
      regular: "רגיל",
      large: "גדול",
      extras: "תוספות",
      general: "כללי",
    });
    const item = importMenu(
      scenario("service"),
      importRows(pasted.categories, ["kitchen"]),
    ).data.menu.items.at(-1);
    const group = item?.groups[0];
    if (!group) throw new Error("the shakshuka has its extras");
    expect(group).toMatchObject({ min: 0, max: 1 });
    expect(singleChoice(group)).toBe(false);
    const option = group.options[0]?.id ?? "";
    const on = toggleChoice(group, [], option, true);
    expect(on).toEqual([option]);
    expect(toggleChoice(group, on, option, false)).toEqual([]);
  });

  it("keeps a group within its most", () => {
    const pickOne = one(0, 1, ["a", "b"]);
    expect(toggleChoice(pickOne, ["a", "x"], "b", true)).toEqual(["x", "b"]);
    const pickTwo = one(0, 2, ["a", "b", "c"]);
    expect(toggleChoice(pickTwo, ["a", "b"], "c", true)).toEqual(["a", "b"]);
    expect(toggleChoice(pickTwo, ["a"], "c", true)).toEqual(["a", "c"]);
  });
});

describe("the floor's takeaways", () => {
  const onFloor = (data: ReturnType<typeof scenario>) =>
    takeawaysOnFloor(data.takeaways, data.orders, data.drafts).map((p) => p.id);

  it("leaves the floor once closed, and comes back when reopened", () => {
    const evening = scenario(null);
    expect(onFloor(evening)).toEqual(["takeaway-1"]);
    const closed = closeOrder(evening, "takeaway-1", READER, DEMO_START);
    expect(onFloor(closed)).toEqual([]);
    expect(closed.closed[0]?.placeId).toBe("takeaway-1");
    const id = closed.closed[0]?.id ?? "";
    expect(onFloor(reopenOrder(closed, id))).toEqual(["takeaway-1"]);
  });

  it("shows a new one while its draft has something in it", () => {
    const started = newTakeaway(scenario("quiet"), "takeaway-new");
    expect(onFloor(started)).toEqual([]);
    const drafted = addLine(started, "takeaway-new", "water", [], 1);
    expect(onFloor(drafted)).toEqual(["takeaway-new"]);
  });
});

// The real menu screens on the twin's rows (waiter mode P2): the twin's
// store stays the one store, read and written as the app reads and writes.
describe("the twin's menu as the real screens read it", () => {
  it("reads the menu in its categories' order, sold out as the store says", () => {
    const data = scenario("service");
    const menu = twinMenu(data, 3);
    expect(menu.version).toBe(3);
    expect(menu.categories.map((c) => c.id)).toEqual(
      data.menu.categories.map((c) => c.id),
    );
    expect(menu.items).toHaveLength(data.menu.items.length);
    const fish = menu.items.find((item) => item.id === "fish");
    expect(fish?.available).toBe(false);
    expect(fish?.route).toBe("kitchen");
    const burger = menu.items.find((item) => item.id === "burger");
    expect(burger?.optionGroups[1]?.options[0]?.priceAgorot).toBe(600);
    expect(menu.places).toHaveLength(12);
  });

  it("saves an item back as it was read, its choices kept", () => {
    const data = scenario("service");
    const burger = twinMenu(data, 1).items.find((item) => item.id === "burger");
    if (!burger) throw new Error("the burger");
    const saved = fromItemInput(
      itemSaveInput(burger, { priceAgorot: 7200 }),
      burger.id,
    );
    const before = data.menu.items.find((item) => item.id === "burger");
    expect(saved).toEqual({ ...before, price: 7200 });
  });

  it("removes a department from one category, whose items then go nowhere", () => {
    const menu = withoutDepartment(
      twinMenu(scenario("service"), 1),
      "desserts",
      "pastry",
    );
    expect(menu.categories.find((c) => c.id === "desserts")?.department).toBe(
      "pastry",
    );
    expect(
      menu.items.filter((item) => item.route === null).map((item) => item.id),
    ).toEqual(["malabi", "cake"]);
    expect(
      twinDepartments([{ id: "pastry", name: "x", live: false }]),
    ).toHaveLength(3);
  });

  it("saves the categories whole: renamed, moved, added and removed, with an undo", () => {
    const data = scenario("service");
    const [starters, mains, desserts, drinks] = data.menu.categories;
    if (!starters || !mains || !desserts || !drinks) throw new Error("four");
    const renamed = saveCategories(data, [
      { id: drinks.id, name: "משקאות", department: "bar" },
      { id: mains.id, name: mains.name, department: "kitchen" },
      { id: starters.id, name: starters.name, department: "kitchen" },
      { name: "  בדיקות ", department: "bar" },
    ]);
    expect(renamed.data.menu.categories.map((c) => c.name)).toEqual([
      "משקאות",
      "עיקריות",
      "ראשונות",
      "בדיקות",
    ]);
    expect(renamed.ids.slice(0, 3)).toEqual([drinks.id, mains.id, starters.id]);
    // The desserts are gone from the menu, their items kept for the undo.
    expect(
      twinMenu(renamed.data, 2).items.some((item) => item.id === "malabi"),
    ).toBe(false);
    const undone = saveCategories(renamed.data, [
      ...renamed.data.menu.categories,
      desserts,
    ]);
    expect(
      twinMenu(undone.data, 3).items.some((item) => item.id === "malabi"),
    ).toBe(true);
  });

  it("opens the import on pastes whose lines read as the walks expect", () => {
    const words = he.modules.order_taking.importWords;
    const problems = (paste: string) =>
      parseMenu(paste, words).rows.flatMap((row) =>
        row.ok ? [] : [row.problem],
      );
    // Clean: five items in two categories, nothing held.
    expect(problems(demoPastedMenu)).toEqual([]);
    expect(
      parseMenu(demoPastedMenu, words).categories.map((c) => [
        c.name,
        c.items.length,
      ]),
    ).toEqual([
      ["ארוחות בוקר", 3],
      ["שתייה חמה", 2],
    ]);
    // One line a PDF turned around, which "היפוך השורות" turns back.
    expect(parseMenu(demoReversedPaste, words).reversed).toBe(true);
    expect(problems(demoReversedPaste)).toEqual(["reversed"]);
    expect(
      problems(
        demoReversedPaste.replace("םח וקוש 15", reverseLine("םח וקוש 15")),
      ),
    ).toEqual([]);
    // Lines to fix, which hold the import.
    expect(problems(demoProblemPaste)).toEqual(["reversed", "noPrice"]);
  });

  it("imports a checked paste: an existing category takes its items, a new one goes last", () => {
    const data = scenario("service");
    const done = importMenu(data, [
      { category: { name: "עיקריות", department: "bar" } },
      { item: { name: "פרגית", priceAgorot: 7200 } },
      { category: { name: "בראנץ'", department: "bar" } },
      {
        item: {
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
          ],
        },
      },
    ]);
    expect([done.categories, done.items]).toEqual([1, 2]);
    const menu = twinMenu(done.data, 2);
    const mains = menu.categories.find((c) => c.name === "עיקריות");
    expect(mains?.department).toBe("kitchen");
    expect(menu.categories.at(-1)).toMatchObject({
      name: "בראנץ'",
      department: "bar",
    });
    const coffee = menu.items.find((item) => item.name === "קפה הפוך");
    expect(coffee?.optionGroups[0]?.options[1]?.priceAgorot).toBe(300);
  });
});
