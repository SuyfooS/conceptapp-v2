import { importRows, parseMenu, reverseLine } from "@domain/menu-import";
import {
  addToDraft,
  draftKey,
  overGroups,
  placeState,
  staleChoiceLines,
  toggleChoice,
  waitingGroups,
} from "@domain/order-screens";
import {
  stationMenuSchema,
  stationPrepSchema,
  stationTillSchema,
} from "@domain/order-stations";
import {
  choiceRule,
  itemSaveInput,
  type OptionGroup,
} from "@domain/order-taking";
import {
  myOrdersSchema,
  orderDetailSchema,
  orderPrepSchema,
  orderTill,
  takeBackState,
} from "@domain/orders";
import { afterEach, describe, expect, it, vi } from "vitest";
import he from "@/messages/he.json";
import {
  cancelLine,
  cancelOrder,
  changeTicket,
  closeOrder,
  compLine,
  importMenu,
  moveOrder,
  pendingByKey,
  reopenOrder,
  restoreLine,
  saveCategories,
  sendRound,
  stationWrite,
  uncompLine,
  undoCloseOrder,
  withoutPending,
  withPending,
} from "./changes";
import {
  DEMO_START,
  demoDraft,
  demoJustSent,
  demoPastedMenu,
  demoProblemPaste,
  demoReversedPaste,
  READER,
  READER_DEPARTMENTS,
} from "./data";
import { newId } from "./ids";
import { takeawaysOnFloor } from "./model";
import {
  fromItemInput,
  twinDepartments,
  twinGroups,
  twinMenu,
  withoutDepartment,
} from "./real-menu";
import {
  choicesRefused,
  soldOutIn,
  twinDetail,
  twinFloor,
  twinFrame,
  twinMine,
  twinOrderAt,
  twinPrep,
  twinSentRound,
  twinStationMenu,
  twinStationPrep,
  twinStationTill,
} from "./real-orders";
import { scenario } from "./scenario";

// The order-taking twin's rules that a screen only draws (S0 of waiter
// mode, #191): what the reviewers caught, kept caught. Since P4 the mode's
// screens are the app's, reading the twin's rows through real-orders.ts.

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
    const lines = addToDraft([], "lemonade", newId);
    const sent = sendRound(
      scenario("quiet"),
      { orderId: null, placeId: "table-6" },
      lines,
      READER,
      DEMO_START,
    );
    expect(sent.order.id).toMatch(UUID);
    expect(sent.data.orders.find((o) => o.placeId === "table-6")).toBe(
      sent.order,
    );
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
    const sent = sendRound(
      scenario("quiet"),
      { orderId: null, placeId: null, label: " דנה " },
      addToDraft([], "lemonade", newId),
      READER,
      DEMO_START,
    );
    const place = sent.data.takeaways.find((p) => p.id === sent.order.placeId);
    expect(place).toMatchObject({ name: "1", label: "דנה" });
    expect(twinSentRound(sent.data, sent.order, sent.round)).toMatchObject({
      first: true,
      place: null,
      takeaway: 1,
    });
    // The evening as it opens already has takeaway 1, and 2 cancelled.
    expect(scenario(null).nextTakeaway).toBe(3);
  });
});

describe("the twin's rows as the app's screens read them (P4)", () => {
  const evening = scenario(null);
  const at = DEMO_START + MINUTE;

  it("reads the floor as public.order_floor gives it, with what is ready", () => {
    const floor = twinFloor(evening, at);
    expect(floor.orders.map((o) => o.placeName ?? o.takeaway)).toEqual([
      "2",
      "4",
      "7",
      "9",
      "11",
      1,
    ]);
    const table9 = floor.orders.find((o) => o.placeName === "9");
    // Waiting since 20:22: past the late mark by 20:43.
    expect(table9 && placeState(table9, at, 15)).toEqual({
      kind: "late",
      minutes: 21,
    });
    expect(floor.ready.map((r) => r.ticket)).toEqual([
      "t-7a-bar",
      "t-11b-kitchen",
    ]);
    const table4 = floor.orders.find((o) => o.placeName === "4");
    expect(table4?.tickets).toEqual({ held: 1, new: 1, ready: 0, served: 1 });
  });

  it("reads an order whole, its held block held and its allergy in its note", () => {
    const detail = twinDetail(evening, "order-4", at);
    const tickets = detail?.rounds[0]?.tickets ?? [];
    expect(tickets.map((t) => t.status)).toEqual(["new", "held", "served"]);
    expect(tickets[1]?.lines[1]).toMatchObject({
      note: "שומשום",
      allergy: true,
    });
    expect(twinDetail(evening, "none", at)).toBeNull();
    // Shaped as the server's, only with the twin's ids.
    expect(Object.keys(detail ?? {}).sort()).toEqual(
      Object.keys(orderDetailSchema.shape).sort(),
    );
  });

  it("reads Shiran's own rounds, ready first, and the kitchen's tickets", () => {
    const mine = twinMine(evening, at);
    expect(Object.keys(mine).sort()).toEqual(
      Object.keys(myOrdersSchema.shape).sort(),
    );
    expect(mine.rounds[0]?.tickets.some((t) => t.status === "ready")).toBe(
      true,
    );
    const own = new Set(
      [...evening.orders, ...evening.closed].flatMap((o) =>
        o.rounds.filter((r) => r.by === READER).map((r) => r.id),
      ),
    );
    expect(mine.rounds.every((round) => own.has(round.id))).toBe(true);
    const prep = twinPrep(evening, ["kitchen"], at);
    expect(Object.keys(prep).sort()).toEqual(
      Object.keys(orderPrepSchema.shape).sort(),
    );
    expect(prep.tickets.every((t) => t.department === "kitchen")).toBe(true);
    expect(prep.tickets.some((t) => t.status === "held")).toBe(true);
  });

  it("splits a send by department and its held block, as the database does", () => {
    const sent = sendRound(
      evening,
      { orderId: null, placeId: "table-6" },
      demoDraft(),
      READER,
      at,
    );
    expect(
      sent.round.tickets.map((t) => [t.department, t.held, t.lines.length]),
    ).toEqual([
      ["kitchen", false, 1],
      ["bar", false, 1],
      ["kitchen", true, 1],
    ]);
    expect(sent.round.tickets[2]?.lines[0]).toMatchObject({
      name: "שניצל",
      choices: ["פירה"],
      note: "בלי מלח",
    });
    expect(sent.round.tickets[0]?.lines[0]).toMatchObject({
      note: null,
      allergy: "אגוזים",
    });
  });

  it("refuses the fish, sold out meanwhile, by its id", () => {
    expect(soldOutIn(evening, ["fish", "water", "fish"])).toEqual(["fish"]);
  });

  it("offers a take-back to the sender outside the ticket's department only", () => {
    const round = demoJustSent().rounds[0];
    const frame = twinFrame("shiran");
    const state = (department: string) =>
      takeBackState({
        sentAt: new Date(round?.at ?? 0),
        now: new Date((round?.at ?? 0) + MINUTE),
        minutes: 2,
        ticket: { status: "new", prepared: false },
        isSender: round?.by === frame.userId,
        senderInDepartment: frame.own.includes(department),
        line: "live",
      });
    expect(READER_DEPARTMENTS).toContain("bar");
    expect(state("kitchen")).toBe("open");
    expect(state("bar")).toBe("ownDepartment");
  });

  it("frames who looks: Noa prepares in the kitchen, Yoav waits for his shift", () => {
    expect(twinFrame("noa")).toMatchObject({
      takes: false,
      prepares: ["kitchen"],
    });
    expect(twinFrame("offClock")).toMatchObject({
      runs: false,
      clock: "clock",
    });
    expect(twinFrame("viewing").viewing).toBe(true);
    expect(draftKey({ place: "table-6" })).toBe("place:table-6");
    expect(scenario("draft").drafts["place:table-6"]).toHaveLength(3);
  });
});

describe("an item's choices", () => {
  const one = (min: number, max: number, ids: string[]): OptionGroup => ({
    id: "g",
    name: "g",
    min,
    max,
    options: ids.map((id) => ({ id, name: id, priceAgorot: 0 })),
  });
  const picks = (...options: string[]) =>
    options.map((option) => ({ group: "g", option }));

  it("draws radios only for exactly one choice", () => {
    expect(choiceRule(one(1, 1, ["a", "b"]))).toBe("one");
    expect(choiceRule(one(0, 1, ["a"]))).not.toBe("one");
    expect(choiceRule(one(0, 2, ["a", "b"]))).not.toBe("one");
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
    const group = item ? twinGroups(item)[0] : undefined;
    if (!group) throw new Error("the shakshuka has its extras");
    expect(group).toMatchObject({ min: 0, max: 1 });
    expect(choiceRule(group)).not.toBe("one");
    const option = group.options[0]?.id ?? "";
    const on = toggleChoice(group, [], option, true);
    expect(on).toEqual([{ group: group.id, option }]);
    expect(toggleChoice(group, on, option, false)).toEqual([]);
  });

  it("keeps a group within its most", () => {
    const pickOne = one(0, 1, ["a", "b"]);
    expect(toggleChoice(pickOne, picks("a"), "b", true)).toEqual(picks("b"));
    const pickTwo = one(0, 2, ["a", "b", "c"]);
    expect(toggleChoice(pickTwo, picks("a", "b"), "c", true)).toEqual(
      picks("a", "b"),
    );
    expect(toggleChoice(pickTwo, picks("a"), "c", true)).toEqual(
      picks("a", "c"),
    );
  });

  it("names each sent choice with its group and price, as order_detail does (P6)", () => {
    const evening = scenario(null);
    const detail = twinDetail(evening, "order-4", DEMO_START);
    const burger = detail?.rounds[0]?.tickets[1]?.lines[1];
    expect(burger?.choices).toEqual([
      { group: "מידת עשייה", option: "מדיום", priceAgorot: 0 },
      { group: "תוספות", option: "גבינה", priceAgorot: 600 },
    ]);
    expect(burger?.unitAgorot).toBe(7400);
    const beer = detail?.rounds[0]?.tickets[2]?.lines[0];
    expect(beer?.choices).toEqual([
      { group: "גודל", option: "חצי", priceAgorot: 800 },
    ]);
    // A choice the menu no longer has keeps its name, with no group.
    const changed = scenario("choicesChanged");
    const table7 = twinDetail(changed, "order-7", DEMO_START);
    expect(table7?.rounds[0]?.tickets[1]?.lines[0]?.choices).toEqual([
      { group: "", option: "מדיום וול", priceAgorot: 0 },
    ]);
  });

  it("refuses a draft whose choices don't fit, as the send does, and sends one that does (P6)", () => {
    const evening = scenario(null);
    const line = (
      item: string,
      choices: { group: string; option: string }[],
    ) => ({
      id: newId(),
      item,
      quantity: 1,
      note: null,
      allergy: false,
      held: false,
      choices,
    });
    // A burger with no doneness, or two.
    expect(choicesRefused(evening, [line("burger", [])])).toBe(true);
    expect(
      choicesRefused(evening, [
        line("burger", [
          { group: "doneness", option: "m" },
          { group: "doneness", option: "wd" },
        ]),
      ]),
    ).toBe(true);
    // One that fits goes, a salad with no extras too.
    const fits = [
      line("burger", [
        { group: "doneness", option: "m" },
        { group: "extras", option: "cheese" },
      ]),
      line("salad", []),
    ];
    expect(choicesRefused(evening, fits)).toBe(false);
    const sent = sendRound(
      evening,
      { orderId: null, placeId: "table-6" },
      fits,
      READER,
      DEMO_START,
    );
    const kitchen = sent.round.tickets.find((t) => t.department === "kitchen");
    expect(kitchen?.lines.map((l) => [l.name, l.choices, l.unit])).toEqual([
      ["המבורגר", ["מדיום", "גבינה"], 7400],
      ["סלט ירוק", [], 3600],
    ]);
    // A sold-out item is left to its own refusal.
    expect(
      choicesRefused(evening, [line("fish", [{ group: "x", option: "y" }])]),
    ).toBe(false);
  });

  it("opens the choices' states: the burger's sheet, and a choice gone from the menu (P6)", () => {
    expect(scenario("choices")).toEqual(scenario("service"));
    const changed = scenario("choicesChanged");
    const draft = changed.drafts["place:table-6"] ?? [];
    expect(draft.map((l) => l.item)).toEqual(["burger", "coffee"]);
    const menu = twinMenu(changed, 1);
    expect(staleChoiceLines(menu.items, draft)).toEqual(["d6"]);
    expect(choicesRefused(changed, draft)).toBe(true);
    // The evening's menu still has it.
    expect(staleChoiceLines(twinMenu(scenario(null), 1).items, draft)).toEqual(
      [],
    );
  });

  it("refuses a line past a group's most once the menu lowers it, and its sheet waits too (P6)", () => {
    const evening = scenario(null);
    // The burger's extras set to up to one, under a draft with both.
    const lowered = {
      ...evening,
      menu: {
        ...evening.menu,
        items: evening.menu.items.map((item) =>
          item.id === "burger"
            ? {
                ...item,
                groups: item.groups.map((group) =>
                  group.id === "extras" ? { ...group, max: 1 } : group,
                ),
              }
            : item,
        ),
      },
    };
    const both = [
      { group: "doneness", option: "m" },
      { group: "extras", option: "egg" },
      { group: "extras", option: "cheese" },
    ];
    const draft = [
      {
        id: "d1",
        item: "burger",
        quantity: 1,
        note: null,
        allergy: false,
        held: false,
        choices: both,
      },
    ];
    expect(choicesRefused(evening, draft)).toBe(false);
    expect(choicesRefused(lowered, draft)).toBe(true);
    const items = twinMenu(lowered, 1).items;
    expect(staleChoiceLines(items, draft)).toEqual(["d1"]);
    // The app's sheet, which the twin draws, holds the same picks, and its
    // footer says to take one off the extras.
    const burger = items.find((item) => item.id === "burger");
    expect(overGroups(burger ?? { optionGroups: [] }, both)).toMatchObject([
      { id: "extras", max: 1 },
    ]);
    expect(waitingGroups(burger ?? { optionGroups: [] }, both)).toMatchObject({
      choose: [],
      takeOff: [{ id: "extras", max: 1 }],
    });
  });
});

describe("the floor's takeaways", () => {
  const onFloor = (data: ReturnType<typeof scenario>) =>
    takeawaysOnFloor(data.takeaways, data.orders).map((p) => p.id);

  it("leaves the floor once closed, and comes back when reopened", () => {
    const evening = scenario(null);
    expect(onFloor(evening)).toEqual(["takeaway-1"]);
    const closed = closeOrder(evening, "order-takeaway-1", READER, DEMO_START);
    expect(onFloor(closed)).toEqual([]);
    expect(closed.closed[0]?.placeId).toBe("takeaway-1");
    const id = closed.closed[0]?.id ?? "";
    expect(onFloor(reopenOrder(closed, id, READER, DEMO_START))).toEqual([
      "takeaway-1",
    ]);
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

// P5's fixes on the twin's store, read back as the app's screens read them.
describe("the twin's rounds on their way (P7)", () => {
  const TABLE_6 = "place:table-6";

  it("opens table 6's round asking after 12 minutes, and with no connection", () => {
    expect(scenario("asking").pending[TABLE_6]).toMatchObject({
      state: "ask",
      age: { unit: "minutes", count: 12 },
    });
    expect(scenario("offline")).toMatchObject({
      connection: "down",
      pending: { [TABLE_6]: { state: "waiting" } },
    });
    expect(scenario("service")).toMatchObject({
      connection: "ok",
      lost: null,
    });
    expect(scenario("lost").lost).toEqual({
      count: 1,
      placeNames: ["6"],
      why: "signedOut",
    });
  });

  it("sends a round that asked once, off its way, as the twin's send goes", () => {
    const asking = scenario("asking");
    const found = pendingByKey(asking, "pending-table-6");
    expect(found?.draft).toBe(TABLE_6);
    const off = withoutPending(asking, "pending-table-6");
    expect(off.pending).toEqual({});
    expect(pendingByKey(off, "pending-table-6")).toBeNull();
    const before = twinOrderAt(off, "table-6");
    expect(before).toBeNull();
    const sent = sendRound(
      off,
      { orderId: null, placeId: "table-6" },
      found?.round.lines ?? [],
      READER,
      DEMO_START,
    );
    const opened = sent.data.orders.filter((o) => o.placeId === "table-6");
    expect(opened).toHaveLength(1);
    expect(opened[0]?.rounds).toHaveLength(1);
  });

  it("takes a round off the phone and puts it back on its undo, asking as it was", () => {
    const asking = scenario("asking");
    const found = pendingByKey(asking, "pending-table-6");
    if (!found) throw new Error("no round");
    const removed = withoutPending(asking, found.round.key);
    expect(removed.pending).toEqual({});
    // A key no longer there changes nothing.
    expect(withoutPending(removed, found.round.key)).toBe(removed);
    expect(withPending(removed, found.draft, found.round).pending).toEqual(
      asking.pending,
    );
  });
});

describe("the twin's fixes (P5)", () => {
  const evening = scenario(null);
  const at = DEMO_START + MINUTE;
  const lineOf = (data: ReturnType<typeof scenario>, id: string) =>
    twinDetail(data, "order-4", at)
      ?.rounds.flatMap((r) => r.tickets)
      .flatMap((ticket) => ticket.lines)
      .find((line) => line.id === id);

  it("cancels a line with its reason and puts it back, gives one on the house and takes it off", () => {
    const cancelled = cancelLine(evening, "l5", "mistake", READER, at);
    expect(lineOf(cancelled, "l5")).toMatchObject({
      cancelReason: "mistake",
      cancelledAt: new Date(at).toISOString(),
    });
    expect(lineOf(restoreLine(cancelled, "l5"), "l5")).toMatchObject({
      cancelledAt: null,
      cancelReason: null,
    });
    const comped = compLine(evening, "l8", "make_good", READER, at);
    expect(lineOf(comped, "l8")).toMatchObject({ compReason: "make_good" });
    expect(lineOf(uncompLine(comped, "l8"), "l8")?.compedAt).toBeNull();
    // A line cancelled isn't given on the house, as the database refuses it.
    expect(compLine(cancelled, "l5", "staff", READER, at)).toEqual(cancelled);
    // The kitchen strikes it, and the evening's fixes count it.
    const kitchen = twinPrep(cancelled, ["kitchen"], at).tickets.find(
      (ticket) => ticket.id === "t-4a-kitchen",
    );
    expect(kitchen?.lines.map((line) => line.state)).toEqual([
      "live",
      "cancelled",
    ]);
    expect(twinFloor(comped, at).fixes).toEqual({
      takenBack: 0,
      cancelled: 2,
      comped: 1,
    });
  });

  it("cancels an order whole, for good, under today's closed", () => {
    const gone = cancelOrder(evening, "order-4", "guest", READER, at);
    expect(gone.orders.some((o) => o.id === "order-4")).toBe(false);
    const floor = twinFloor(gone, at);
    expect(floor.closed[0]).toMatchObject({
      placeName: "4",
      status: "cancelled",
    });
    expect(twinDetail(gone, "order-4", at)).toMatchObject({
      status: "cancelled",
      cancelReason: "guest",
      cancelledBy: READER,
      closedAt: null,
    });
    // Off the prep screen, and no reopening it.
    expect(
      twinPrep(gone, ["kitchen"], at).tickets.some(
        (t) => t.order === "order-4",
      ),
    ).toBe(false);
    expect(reopenOrder(gone, "order-4", READER, at)).toBe(gone);
  });

  it("moves an order to a free table, never to a taken one or from a takeaway", () => {
    const moved = moveOrder(evening, "order-4", "table-6", READER, at);
    expect(twinOrderAt(moved, "table-6")?.id).toBe("order-4");
    expect(twinOrderAt(moved, "table-4")).toBeNull();
    expect(twinDetail(moved, "order-4", at)).toMatchObject({
      place: { id: "table-6", name: "6" },
      movedFrom: "4",
      movedBy: READER,
    });
    expect(moveOrder(evening, "order-4", "table-7", READER, at)).toBe(evening);
    expect(moveOrder(evening, "order-takeaway-1", "table-6", READER, at)).toBe(
      evening,
    );
  });

  it("closes by the order and opens it again while its table is free", () => {
    const closed = closeOrder(evening, "order-4", READER, at);
    expect(twinFloor(closed, at).closed[0]).toMatchObject({
      placeName: "4",
      status: "closed",
    });
    const again = reopenOrder(closed, "order-4", "yoav", at);
    expect(twinDetail(again, "order-4", at)).toMatchObject({
      status: "open",
      reopenedBy: "yoav",
    });
    // Table 3 sat again: its order closed today waits.
    const taken = scenario("reopenTaken");
    expect(reopenOrder(taken, "order-3", READER, at)).toBe(taken);
  });

  it("takes a close back as undo_close_order does: what it served goes back, by whoever closed it within 2 minutes", () => {
    const tickets = (data: ReturnType<typeof scenario>) =>
      data.orders
        .find((o) => o.id === "order-4")
        ?.rounds.flatMap((round) => round.tickets)
        .map((ticket) => `${ticket.id}:${ticket.state}`);
    // The kitchen's starters ready, the held block new, the bar's beer
    // served before the close.
    const before = changeTicket(evening, "t-4a-kitchen", {
      state: "ready",
      readyAt: at,
      readyBy: "noa",
    });
    const closed = closeOrder(before, "order-4", READER, at);
    expect(closed.closed[0]?.closeServed).toEqual({
      "t-4a-kitchen": "ready",
      "t-4a-held": "new",
    });
    const back = undoCloseOrder(closed, "order-4", READER, at + 30_000);
    expect(tickets(back)).toEqual([
      "t-4a-kitchen:ready",
      "t-4a-held:new",
      "t-4a-bar:served",
    ]);
    expect(twinDetail(back, "order-4", at + 30_000)).toMatchObject({
      status: "open",
      closedAt: null,
      reopenedBy: READER,
    });
    expect(back.closed.some((o) => o.id === "order-4")).toBe(false);
    // Someone else's close, or after the 2 minutes: nothing changes.
    expect(undoCloseOrder(closed, "order-4", "yoav", at)).toBe(closed);
    expect(
      undoCloseOrder(closed, "order-4", READER, at + 2 * MINUTE + 1000),
    ).toBe(closed);
    // A reopen leaves what the close served served.
    expect(tickets(reopenOrder(closed, "order-4", READER, at))).toEqual([
      "t-4a-kitchen:served",
      "t-4a-held:served",
      "t-4a-bar:served",
    ]);
  });

  it("rings table 4 up by item after its fixes, the cancelled hummus out and the beer marked", () => {
    const detail = twinDetail(scenario("fixed"), "order-4", at);
    const till = detail ? orderTill(detail) : null;
    expect(
      till?.byItem.map((row) => [row.name, row.quantity, row.comped]),
    ).toEqual([
      ["פוקאצ'ה", 1, false],
      ["שניצל", 1, false],
      ["המבורגר", 1, false],
      ["בירה מהחבית", 2, true],
    ]);
    // A takeaway cancelled whole, with who and why.
    expect(twinDetail(evening, "order-takeaway-2", at)).toMatchObject({
      status: "cancelled",
      cancelReason: "guest",
      takeaway: { number: 2 },
    });
  });
});

// The kitchen's screen and the till on the twin (waiter mode P8a): read as
// their stations read the database, and written as it decides a station's
// writes, each kept as the station's.
describe("the twin's stations", () => {
  const evening = scenario(null);
  const at = DEMO_START + MINUTE;
  const ids = (prep: { tickets: { id: string }[] }) =>
    prep.tickets.map((ticket) => ticket.id);

  it("read as the database's, shaped alike with the twin's ids", () => {
    const prep = twinStationPrep(evening, "kitchen", at);
    expect(Object.keys(prep).sort()).toEqual(
      Object.keys(stationPrepSchema.shape).sort(),
    );
    expect(prep.tickets.every((t) => t.department === "kitchen")).toBe(true);
    expect(ids(prep)).toContain("t-4a-held");
    const every = twinStationPrep(evening, null, at);
    expect(ids(every)).toContain("t-7a-bar");
    expect(every.department).toBeNull();
    const menu = twinStationMenu(evening, "kitchen");
    expect(Object.keys(menu).sort()).toEqual(
      Object.keys(stationMenuSchema.shape).sort(),
    );
    expect(menu.items.find((i) => i.id === "fish")?.available).toBe(false);
    expect(menu.items.some((i) => i.id === "lemonade")).toBe(false);
    const till = twinStationTill(evening, at);
    expect(Object.keys(till).sort()).toEqual(
      Object.keys(stationTillSchema.shape).sort(),
    );
    const table4 = till.orders.find((o) => o.id === "order-4");
    expect(table4).toMatchObject({ held: 1, closedHere: false });
    // No person, no label: a round has its time and lines only.
    expect(Object.keys(table4?.byRound[0] ?? {}).sort()).toEqual([
      "id",
      "lines",
      "sentAt",
    ]);
    expect(till.closed.find((o) => o.id === "order-takeaway-2")).toMatchObject({
      status: "cancelled",
      byItem: [],
      byRound: [],
    });
  });

  it("make a ticket ready and put it back, of their own department only, within 5 minutes", () => {
    const where = { department: "kitchen", now: at };
    const ready = stationWrite(
      evening,
      { do: "ready", ticket: "t-4a-kitchen", ready: true },
      where,
    );
    expect(ready.answer).toEqual({ ok: true });
    const t4 = ready.data.orders
      .flatMap((o) => o.rounds.flatMap((r) => r.tickets))
      .find((t) => t.id === "t-4a-kitchen");
    expect(t4).toMatchObject({ state: "ready", readyBy: null, readyAt: at });
    expect(
      stationWrite(
        ready.data,
        { do: "ready", ticket: "t-4a-kitchen", ready: false },
        { ...where, now: at + 6 * MINUTE },
      ).answer,
    ).toEqual({ ok: false, failure: "window" });
    expect(
      stationWrite(
        ready.data,
        { do: "ready", ticket: "t-4a-kitchen", ready: false },
        where,
      ).answer,
    ).toEqual({ ok: true });
    expect(
      stationWrite(
        evening,
        { do: "ready", ticket: "t-4a-held", ready: true },
        where,
      ).answer,
    ).toEqual({ ok: false, failure: "held" });
    expect(
      stationWrite(
        evening,
        { do: "ready", ticket: "t-7a-bar", ready: false },
        where,
      ).answer,
    ).toEqual({ ok: false, failure: "gone" });
  });

  it("mark an item sold out of their own department only", () => {
    const out = stationWrite(
      evening,
      { do: "available", item: "hummus", available: false },
      { department: "kitchen", now: at },
    );
    expect(out.data.soldOut).toContain("hummus");
    expect(
      stationWrite(
        evening,
        { do: "available", item: "lemonade", available: false },
        { department: "kitchen", now: at },
      ).answer,
    ).toEqual({ ok: false, failure: "notHere" });
    expect(
      stationWrite(
        evening,
        { do: "available", item: "no-such-item", available: false },
        { department: "kitchen", now: at },
      ).answer,
    ).toEqual({ ok: false, failure: "itemGone" });
  });

  it("close, take the close back and open again, as the till", () => {
    const till = { department: null, now: at };
    expect(
      stationWrite(evening, { do: "close", order: "order-4" }, till).answer,
    ).toEqual({ ok: false, failure: "held" });
    const closed = stationWrite(
      evening,
      { do: "close", order: "order-9" },
      till,
    );
    expect(closed.answer).toEqual({ ok: true });
    expect(
      twinStationTill(closed.data, at).closed.find((o) => o.id === "order-9"),
    ).toMatchObject({ status: "closed", closedHere: true });
    const back = stationWrite(
      closed.data,
      { do: "undoClose", order: "order-9" },
      till,
    );
    expect(back.answer).toEqual({ ok: true });
    expect(back.data.orders.some((o) => o.id === "order-9")).toBe(true);
    expect(
      stationWrite(
        closed.data,
        { do: "undoClose", order: "order-9" },
        { ...till, now: at + 3 * MINUTE },
      ).answer,
    ).toEqual({ ok: false, failure: "window" });
    const again = stationWrite(
      closed.data,
      { do: "reopen", order: "order-9" },
      till,
    );
    expect(again.data.orders.some((o) => o.id === "order-9")).toBe(true);
    expect(
      stationWrite(evening, { do: "reopen", order: "order-takeaway-2" }, till)
        .answer,
    ).toEqual({ ok: false, failure: "notClosed" });
  });
});
