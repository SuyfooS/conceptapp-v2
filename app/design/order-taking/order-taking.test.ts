import { afterEach, describe, expect, it, vi } from "vitest";
import { addLine, closeOrder, newTakeaway, reopenOrder, send } from "./changes";
import {
  DEMO_START,
  demoJustSent,
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
import { importCount, imported, readPaste } from "./paste";
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
    // The paste's own "+ גבינה בולגרית" under its shakshuka.
    const item = imported(
      readPaste("ארוחות\nשקשוקה 54\n+ גבינה 6"),
      () => "kitchen",
    ).items[0];
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

describe("the paste's preview", () => {
  it("counts only what the import keeps", () => {
    // No line without a price above them: nothing to put them under.
    const lines = readPaste("שקשוקה 54\nטוסט 42");
    expect(lines.map((line) => line.problem)).toEqual([
      "noCategory",
      "noCategory",
    ]);
    expect(importCount(lines)).toBe(0);
    expect(imported(lines, () => "kitchen").items).toEqual([]);
  });

  it("agrees with the import on the demo's paste", () => {
    const lines = readPaste(
      "ארוחות בוקר\nשקשוקה 54\n+ גבינה 6\nטוסט 42\nטוסט 42\nשתייה\nקפה 14/17",
    );
    expect(importCount(lines)).toBe(
      imported(lines, () => "kitchen").items.length,
    );
    expect(importCount(lines)).toBe(3);
  });
});
