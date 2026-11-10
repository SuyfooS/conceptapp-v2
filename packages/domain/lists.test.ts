import { describe, expect, it } from "vitest";
import {
  anyItemResult,
  boundOf,
  byUrgency,
  type DraftItem,
  draftItemsOf,
  dueAtOf,
  dueTimeFor,
  fromOffsets,
  holdsList,
  isOutOfRange,
  itemResult,
  itemsForSave,
  type ListTemplate,
  listHref,
  listItemSeed,
  listProgress,
  listState,
  listsTally,
  listTemplateInput,
  listTemplateProblem,
  listTemplateSeed,
  listTemplateSeeds,
  moved,
  numberRange,
  parseReading,
  readBound,
  recipientGone,
  type SendShift,
  scheduleInput,
  sendDefaults,
  sendInput,
  signed,
  suggestedDue,
  templateDraftProblem,
  templateForSave,
  templateInputOf,
  templateStuck,
  templatesByDepartment,
  toOffsets,
  typedBound,
  typedItems,
  undoDeadline,
  upcomingShifts,
} from "./lists";

const KITCHEN = "11111111-1111-4111-8111-111111111111";
const BAR = "22222222-2222-4222-8222-222222222222";
const NOA = "33333333-3333-4333-8333-333333333333";
const ITEM = "44444444-4444-4444-8444-444444444444";
const LIST = "55555555-5555-4555-8555-555555555555";

describe("an item", () => {
  it("is required unless it says otherwise, its label trimmed", () => {
    expect(listItemSeed.parse({ kind: "check", label: " Clean " })).toEqual({
      kind: "check",
      label: "Clean",
      required: true,
    });
    expect(
      listItemSeed.parse({
        kind: "number",
        label: "Fridge",
        unit: "°C",
        min: 0,
        max: 5,
        required: false,
      }),
    ).toMatchObject({ unit: "°C", min: 0, max: 5, required: false });
  });

  it("keeps a unit and a range for numbers, and a usual count for checks", () => {
    for (const bad of [
      { kind: "check", label: "Clean", unit: "°C" },
      { kind: "note", label: "Missing", max: 5 },
      { kind: "number", label: "Fridge", min: 5, max: 0 },
      { kind: "number", label: "Fridge", defaultQuantity: 2 },
      { kind: "number", label: "Fridge", min: -100001 },
      { kind: "check", label: "Ice", defaultQuantity: 0 },
      { kind: "check", label: "" },
      { kind: "check", label: "Clean", colour: "red" },
    ]) {
      expect(listItemSeed.safeParse(bad).success, JSON.stringify(bad)).toBe(
        false,
      );
    }
    expect(
      listItemSeed.safeParse({
        kind: "check",
        label: "Ice",
        defaultQuantity: 2,
      }).success,
    ).toBe(true);
  });

  it("is not a photo yet", () => {
    const result = listItemSeed.safeParse({ kind: "photo", label: "Picture" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Photo items come later");
  });
});

describe("a schedule's times", () => {
  it("are minutes from local midnight for the day", () => {
    expect(toOffsets({ opens: "08:30", dueAfterMinutes: 45 })).toEqual({
      opensOffset: 510,
      dueOffset: 555,
    });
    expect(fromOffsets("day", 510, 555)).toEqual({
      opens: "08:30",
      dueAfterMinutes: 45,
    });
    // Due past midnight: the next day's minutes.
    expect(toOffsets({ opens: "23:30", dueAfterMinutes: 45 })).toEqual({
      opensOffset: 1410,
      dueOffset: 1455,
    });
    expect(fromOffsets("day", 0, 30)).toEqual({
      opens: "00:00",
      dueAfterMinutes: 30,
    });
  });

  it("are minutes around the shift for a shift", () => {
    expect(toOffsets({ opens: -30, dueAfterMinutes: 30 })).toEqual({
      opensOffset: -30,
      dueOffset: 0,
    });
    expect(fromOffsets("shift_start", -30, 0)).toEqual({
      opens: -30,
      dueAfterMinutes: 30,
    });
  });

  it("follow the day, or a shift they name", () => {
    const base = {
      days: [0, 1, 2],
      dueAfterMinutes: 45,
      recipient: { kind: "role", role: "worker" },
    };
    expect(scheduleInput.parse({ ...base, opens: "08:30" })).toMatchObject({
      anchor: "day",
      active: true,
    });
    for (const bad of [
      { ...base, opens: "08:30", shift: "evening" },
      { ...base, anchor: "shift_start", opens: -30 },
      { ...base, anchor: "shift_end", shift: "evening", opens: "22:30" },
      { ...base, opens: 30 },
      { ...base, opens: "08:30", days: [1, 1] },
      { ...base, opens: "08:30", days: [] },
      { ...base, opens: "08:30", days: [7] },
      { ...base, opens: "08:30", dueAfterMinutes: 0 },
      { ...base, opens: "08:30", dueAfterMinutes: 1441 },
      { ...base, anchor: "shift_start", shift: "evening", opens: -721 },
    ]) {
      expect(scheduleInput.safeParse(bad).success, JSON.stringify(bad)).toBe(
        false,
      );
    }
    expect(
      scheduleInput.safeParse({
        ...base,
        anchor: "shift_end",
        shift: "evening",
        opens: -30,
      }).success,
    ).toBe(true);
  });
});

const seed = (overrides: Record<string, unknown> = {}) => ({
  key: "kitchen-opening",
  name: "Kitchen opening",
  recipient: { kind: "department", department: "kitchen" },
  items: [{ kind: "check", label: "Clean" }],
  ...overrides,
});

describe("a template's lists", () => {
  it("send a schedule without its own recipient to the template's", () => {
    const parsed = listTemplateSeed.parse(
      seed({
        schedules: [
          { days: [0], opens: "08:30", dueAfterMinutes: 45 },
          {
            days: [6],
            opens: "20:00",
            dueAfterMinutes: 30,
            recipient: { kind: "role", role: "manager" },
          },
        ],
      }),
    );
    expect(parsed.schedules.map((s) => s.recipient)).toEqual([
      { kind: "department", department: "kitchen" },
      { kind: "role", role: "manager" },
    ]);
    expect(parsed).toMatchObject({
      fromDepartment: null,
      asksQuantities: false,
    });
    expect(listTemplateSeed.parse(seed()).schedules).toEqual([]);
  });

  it("refuse a schedule that goes to nobody", () => {
    expect(
      listTemplateSeed.safeParse(
        seed({
          recipient: null,
          schedules: [{ days: [0], opens: "08:30", dueAfterMinutes: 45 }],
        }),
      ).success,
    ).toBe(false);
  });

  it("have each key once, and from 1 to 60 items", () => {
    expect(listTemplateSeeds.safeParse([seed(), seed()]).success).toBe(false);
    expect(listTemplateSeed.safeParse(seed({ items: [] })).success).toBe(false);
    const many = Array.from({ length: 61 }, (_, i) => ({
      kind: "check",
      label: `Item ${i}`,
    }));
    expect(listTemplateSeed.safeParse(seed({ items: many })).success).toBe(
      false,
    );
  });

  it("point only at the template's own departments and shifts", () => {
    const check = (overrides: Record<string, unknown>) =>
      listTemplateProblem(
        [listTemplateSeed.parse(seed(overrides))],
        ["kitchen", "bar", "storeroom"],
        ["evening"],
      );
    expect(check({})).toBeNull();
    expect(
      check({ recipient: { kind: "department", department: "garden" } }),
    ).toMatch(/unknown department: garden/);
    expect(check({ recipient: { kind: "shift", shift: "night" } })).toMatch(
      /unknown shift: night/,
    );
    expect(
      check({ recipient: { kind: "shift", shift: "evening" } }),
    ).toBeNull();
    expect(
      check({
        schedules: [
          {
            days: [0],
            anchor: "shift_start",
            shift: "morning",
            opens: -30,
            dueAfterMinutes: 30,
          },
        ],
      }),
    ).toMatch(/unknown shift: morning/);
    expect(
      check({
        schedules: [
          {
            days: [0],
            opens: "08:30",
            dueAfterMinutes: 45,
            recipient: { kind: "department", department: "garden" },
          },
        ],
      }),
    ).toMatch(/unknown department: garden/);
  });

  it("send an order from its department to another one", () => {
    const check = (overrides: Record<string, unknown>) =>
      listTemplateProblem(
        [listTemplateSeed.parse(seed(overrides))],
        ["kitchen", "bar", "storeroom"],
        [],
      );
    const order = {
      recipient: { kind: "department", department: "storeroom" },
      fromDepartment: "bar",
      asksQuantities: true,
    };
    expect(check(order)).toBeNull();
    expect(check({ ...order, fromDepartment: "garden" })).toMatch(
      /unknown department: garden/,
    );
    expect(check({ ...order, fromDepartment: "storeroom" })).toMatch(
      /another department/,
    );
    expect(
      check({ ...order, recipient: { kind: "role", role: "worker" } }),
    ).toMatch(/another department/);
  });
});

describe("the template editor's save", () => {
  const input = {
    name: "Opening",
    recipient: { kind: "department" as const, department: KITCHEN },
    items: [{ id: ITEM, kind: "check" as const, label: "Clean" }],
    schedules: [
      {
        days: [0, 1, 2, 3, 4],
        opens: "08:30",
        dueAfterMinutes: 45,
        recipient: { kind: "department" as const, department: KITCHEN },
      },
    ],
  };

  it("sends the database its minutes", () => {
    expect(templateForSave(input)).toMatchObject({
      name: "Opening",
      fromDepartment: null,
      asksQuantities: false,
      schedules: [
        {
          days: [0, 1, 2, 3, 4],
          anchor: "day",
          opensOffset: 510,
          dueOffset: 555,
          active: true,
        },
      ],
    });
    expect(templateForSave(input).schedules[0]).not.toHaveProperty("opens");
  });

  it("refuses an item twice and an order to the department that asks", () => {
    expect(
      listTemplateInput.safeParse({
        ...input,
        items: [input.items[0], input.items[0]],
      }).success,
    ).toBe(false);
    expect(
      listTemplateInput.safeParse({ ...input, fromDepartment: KITCHEN })
        .success,
    ).toBe(false);
    expect(
      listTemplateInput.safeParse({ ...input, fromDepartment: BAR }).success,
    ).toBe(true);
    expect(
      listTemplateInput.safeParse({
        ...input,
        recipient: { kind: "person", user: NOA },
      }).success,
    ).toBe(false);
  });
});

describe("sending", () => {
  const toKitchen = { kind: "department", department: KITCHEN };

  it("takes a template, or a name with its items", () => {
    expect(
      sendInput.safeParse({ template: LIST, recipient: toKitchen }).success,
    ).toBe(true);
    expect(
      sendInput.safeParse({
        name: "Fix the door",
        items: [{ kind: "check", label: "Door" }],
        recipient: { kind: "person", user: NOA },
      }).success,
    ).toBe(true);
    for (const bad of [
      { recipient: toKitchen },
      { template: LIST, name: "Mine", recipient: toKitchen },
      {
        template: LIST,
        items: [{ kind: "check", label: "A" }],
        recipient: toKitchen,
      },
      { name: "No items", recipient: toKitchen },
      {
        name: "Typed",
        items: [{ id: ITEM, kind: "check", label: "A" }],
        recipient: toKitchen,
      },
    ]) {
      expect(sendInput.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("goes to a role on the staff, never to the accountants", () => {
    const send = (role: string) =>
      sendInput.safeParse({ template: LIST, recipient: { kind: "role", role } })
        .success;
    expect(send("worker")).toBe(true);
    expect(send("manager")).toBe(true);
    expect(send("accountant")).toBe(false);
    const times = {
      days: [1],
      opens: "08:30",
      dueAfterMinutes: 45,
      recipient: { kind: "role", role: "accountant" },
    };
    expect(scheduleInput.safeParse(times).success).toBe(false);
    const template = (role: string) =>
      listTemplateSeed.safeParse(seed({ recipient: { kind: "role", role } }))
        .success;
    expect(template("worker")).toBe(true);
    expect(template("accountant")).toBe(false);
  });

  it("names a shift by its id, and a due time with its offset", () => {
    expect(
      sendInput.safeParse({
        template: LIST,
        recipient: { kind: "shift", shift: ITEM },
        dueAt: "2026-11-11T10:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(
      sendInput.safeParse({
        template: LIST,
        recipient: { kind: "shift", shift: "evening" },
      }).success,
    ).toBe(false);
    expect(
      sendInput.safeParse({
        template: LIST,
        recipient: toKitchen,
        dueAt: "2026-11-11T10:00:00",
      }).success,
    ).toBe(false);
  });

  it("takes counts by item id, for a template only", () => {
    expect(
      sendInput.safeParse({
        template: LIST,
        recipient: toKitchen,
        quantities: { [ITEM]: 3 },
      }).success,
    ).toBe(true);
    expect(
      sendInput.safeParse({
        template: LIST,
        recipient: toKitchen,
        quantities: { ice: 3 },
      }).success,
    ).toBe(false);
    expect(
      sendInput.safeParse({
        template: LIST,
        recipient: toKitchen,
        quantities: { [ITEM]: 10000 },
      }).success,
    ).toBe(false);
    expect(
      sendInput.safeParse({
        name: "Typed",
        items: [{ kind: "check", label: "A" }],
        recipient: toKitchen,
        quantities: { [ITEM]: 3 },
      }).success,
    ).toBe(false);
  });
});

describe("an item's result", () => {
  it("is a tick, a reading or an answer, each with a comment, or null", () => {
    expect(itemResult("check", false).parse({ checked: true })).toEqual({
      checked: true,
    });
    expect(itemResult("check", false).parse(null)).toBeNull();
    expect(
      itemResult("number", false).parse({ reading: -18.5, comment: " Cold " }),
    ).toEqual({ reading: -18.5, comment: "Cold" });
    expect(itemResult("note", false).parse({ answer: "Milk" })).toEqual({
      answer: "Milk",
    });
    expect(itemResult("photo", false).parse({ comment: "Later" })).toEqual({
      comment: "Later",
    });
  });

  it("says how many were given only on an order", () => {
    expect(itemResult("check", false).safeParse({ given: 2 }).success).toBe(
      false,
    );
    expect(itemResult("check", true).parse({ given: 2 })).toEqual({ given: 2 });
  });

  it("refuses what isn't its kind's", () => {
    expect(itemResult("check", false).safeParse({ reading: 4 }).success).toBe(
      false,
    );
    expect(
      itemResult("number", false).safeParse({ checked: true }).success,
    ).toBe(false);
    expect(
      itemResult("number", false).safeParse({ reading: 100001 }).success,
    ).toBe(false);
    expect(
      itemResult("note", false).safeParse({ answer: "x".repeat(501) }).success,
    ).toBe(false);
    expect(itemResult("photo", false).safeParse({ answer: "x" }).success).toBe(
      false,
    );
  });
});

describe("listProgress", () => {
  it("counts what is done, and the required items left", () => {
    expect(
      listProgress([
        { required: true, done: true },
        { required: true, done: false },
        { required: false, done: false },
        { required: false, done: true },
      ]),
    ).toEqual({ done: 2, total: 4, required: 2, requiredLeft: 1 });
    expect(listProgress([])).toEqual({
      done: 0,
      total: 0,
      required: 0,
      requiredLeft: 0,
    });
  });
});

describe("isOutOfRange", () => {
  it("flags a reading outside its range, at either end", () => {
    const fridge = { min: 0, max: 5 };
    expect(isOutOfRange({ ...fridge, reading: 7 })).toBe(true);
    expect(isOutOfRange({ ...fridge, reading: -1 })).toBe(true);
    expect(isOutOfRange({ ...fridge, reading: 5 })).toBe(false);
    expect(isOutOfRange({ ...fridge, reading: null })).toBe(false);
    expect(isOutOfRange({ min: -25, max: null, reading: -30 })).toBe(true);
    expect(isOutOfRange({ min: null, max: null, reading: 999 })).toBe(false);
  });
});

describe("listState", () => {
  const settings = { remindBeforeMinutes: 30, lateAfterMinutes: 15 };
  const due = { status: "open" as const, dueAt: "2026-11-11T10:00:00Z" };
  const at = (time: string) => new Date(`2026-11-11T${time}:00Z`);

  it("is open until it is nearly due, then due soon, then late", () => {
    expect(listState(due, at("09:29"), settings)).toBe("open");
    expect(listState(due, at("09:30"), settings)).toBe("dueSoon");
    expect(listState(due, at("10:14"), settings)).toBe("dueSoon");
    expect(listState(due, at("10:15"), settings)).toBe("late");
  });

  it("is late at its time with no grace, and never late with no due time", () => {
    const none = { remindBeforeMinutes: 0, lateAfterMinutes: 0 };
    expect(listState(due, at("09:59"), none)).toBe("open");
    expect(listState(due, at("10:00"), none)).toBe("late");
    expect(
      listState({ status: "open", dueAt: null }, at("23:00"), settings),
    ).toBe("open");
  });

  it("says how a closed list ended", () => {
    for (const status of ["finished", "missed", "cancelled"] as const) {
      expect(listState({ ...due, status }, at("12:00"), settings)).toBe(status);
    }
  });
});

describe("listHref and holdsList", () => {
  it("leads to a list by its id, and to the lists otherwise", () => {
    expect(listHref(LIST)).toBe(`/lists/${LIST}`);
    expect(listHref(LIST.toUpperCase())).toBe(`/lists/${LIST}`);
    expect(listHref("../admin")).toBe("/lists");
  });

  it("knows whom a list is for now", () => {
    const noa = {
      userId: NOA,
      role: "worker" as const,
      departments: [KITCHEN],
    };
    expect(holdsList({ kind: "person", people: [NOA] }, noa)).toBe(true);
    expect(holdsList({ kind: "shift", people: [] }, noa)).toBe(false);
    expect(holdsList({ kind: "department", department: KITCHEN }, noa)).toBe(
      true,
    );
    expect(holdsList({ kind: "department", department: BAR }, noa)).toBe(false);
    expect(holdsList({ kind: "role", role: "worker" }, noa)).toBe(true);
    // A list for the managers is not an owner's to hold, though they read it.
    expect(
      holdsList({ kind: "role", role: "manager" }, { ...noa, role: "owner" }),
    ).toBe(false);
  });
});

describe("byUrgency and listsTally", () => {
  const settings = { remindBeforeMinutes: 30, lateAfterMinutes: 15 };
  const now = new Date("2026-11-10T08:00:00.000Z");
  const list = (
    id: string,
    status: "open" | "finished" | "missed" | "cancelled",
    dueAt: string | null,
    opensAt = "2026-11-10T06:00:00.000Z",
  ) => ({ id, status, dueAt, opensAt });
  const lists = [
    list("no-due", "open", null),
    list("later", "open", "2026-11-10T11:00:00.000Z"),
    list("soon", "open", "2026-11-10T08:20:00.000Z"),
    list("late", "open", "2026-11-10T07:30:00.000Z"),
    list("done", "finished", "2026-11-10T07:00:00.000Z"),
    list("no-due-earlier", "open", null, "2026-11-10T05:00:00.000Z"),
  ];

  it("puts late first, then due soon, then by due time, none last", () => {
    expect(byUrgency(lists, now, settings).map((l) => l.id)).toEqual([
      "late",
      "soon",
      "later",
      "no-due-earlier",
      "no-due",
      "done",
    ]);
  });

  it("counts a day's lists for the managers", () => {
    expect(listsTally(lists, now, settings)).toEqual({
      total: 6,
      open: 5,
      finished: 1,
      late: 1,
    });
    expect(listsTally([], now, settings)).toEqual({
      total: 0,
      open: 0,
      finished: 0,
      late: 0,
    });
  });
});

describe("undoDeadline", () => {
  const finished = {
    status: "finished" as const,
    finishedAt: "2026-11-10T08:00:00.000Z",
    finishedBy: NOA,
    closedAt: null,
    closedBy: null,
  };

  it("gives whoever finished a list five minutes to take it back", () => {
    expect(
      undoDeadline(finished, NOA, new Date("2026-11-10T08:03:00.000Z")),
    ).toBe("2026-11-10T08:05:00.000Z");
    expect(
      undoDeadline(finished, NOA, new Date("2026-11-10T08:05:00.000Z")),
    ).toBeNull();
    expect(
      undoDeadline(finished, KITCHEN, new Date("2026-11-10T08:01:00.000Z")),
    ).toBeNull();
  });

  it("reads a cancel the same way, and nothing for an open list", () => {
    expect(
      undoDeadline(
        {
          status: "cancelled",
          finishedAt: null,
          finishedBy: null,
          closedAt: "2026-11-10T08:00:00.000Z",
          closedBy: NOA,
        },
        NOA,
        new Date("2026-11-10T08:01:00.000Z"),
      ),
    ).toBe("2026-11-10T08:05:00.000Z");
    expect(
      undoDeadline(
        { ...finished, status: "open" },
        NOA,
        new Date("2026-11-10T08:01:00.000Z"),
      ),
    ).toBeNull();
  });
});

describe("anyItemResult and parseReading", () => {
  it("takes each field in its bounds, or null to clear", () => {
    expect(anyItemResult.parse({ checked: true, comment: " ok " })).toEqual({
      checked: true,
      comment: "ok",
    });
    expect(anyItemResult.parse(null)).toBeNull();
    expect(anyItemResult.safeParse({ checked: false }).success).toBe(false);
    expect(anyItemResult.safeParse({ reading: 100001 }).success).toBe(false);
    expect(anyItemResult.safeParse({ other: 1 }).success).toBe(false);
  });

  it("reads a typed number, a comma or a minus sign in it", () => {
    expect(parseReading("4.5")).toBe(4.5);
    expect(parseReading(" 4,5 ")).toBe(4.5);
    expect(parseReading("-18")).toBe(-18);
    expect(parseReading("−18")).toBe(-18);
    expect(parseReading("")).toBeNull();
    expect(parseReading("abc")).toBeNull();
    expect(parseReading("1e3")).toBeNull();
    expect(parseReading("200000")).toBeNull();
  });
});

describe("a number item's range", () => {
  it("reads with a real minus sign, spaced once one is in it", () => {
    expect(signed(-18)).toBe("−18");
    expect(signed(4.5)).toBe("4.5");
    expect(numberRange({ min: 0, max: 5, unit: "°C" })).toEqual({
      kind: "between",
      range: "0–5 °C",
    });
    expect(numberRange({ min: -25, max: -18, unit: "°C" })).toEqual({
      kind: "between",
      range: "−25 – −18 °C",
    });
    expect(numberRange({ min: 0, max: null, unit: null })).toEqual({
      kind: "atLeast",
      range: "0",
    });
    expect(numberRange({ min: null, max: 9, unit: "₪" })).toEqual({
      kind: "atMost",
      range: "9 ₪",
    });
    expect(numberRange({ min: null, max: null, unit: "°C" })).toBeNull();
  });

  it("keeps a bound's minus, from the toggle or typed with its digits", () => {
    expect(boundOf(-18)).toEqual({ text: "18", minus: true });
    expect(boundOf(5)).toEqual({ text: "5", minus: false });
    expect(boundOf(null)).toEqual({ text: "", minus: false });
    expect(readBound({ text: "18", minus: true })).toBe(-18);
    expect(readBound({ text: "4.5", minus: false })).toBe(4.5);
    // Typed with the toggle off: kept, never dropped.
    expect(readBound({ text: "-5", minus: false })).toBe(-5);
    expect(readBound({ text: "−18", minus: false })).toBe(-18);
    expect(readBound({ text: "-18", minus: true })).toBe(-18);
    expect(readBound({ text: " ", minus: true })).toBeNull();
    expect(readBound({ text: "abc", minus: false })).toBe("number");
    // A minus typed before the digits turns the toggle on.
    expect(typedBound(false, "-18")).toEqual({ text: "18", minus: true });
    expect(typedBound(false, "−5")).toEqual({ text: "5", minus: true });
    expect(typedBound(false, "-")).toEqual({ text: "", minus: true });
    expect(typedBound(true, "18")).toEqual({ text: "18", minus: true });
    expect(typedBound(false, "4,5")).toEqual({ text: "4,5", minus: false });
    expect(readBound(typedBound(false, "-18"))).toBe(-18);
  });
});

const TEMPLATE = "66666666-6666-4666-8666-666666666666";
const SCHEDULE = "77777777-7777-4777-8777-777777777777";
const ITEM_2 = "88888888-8888-4888-8888-888888888888";

const template: ListTemplate = {
  id: TEMPLATE,
  key: "kitchen-opening",
  name: "Kitchen opening",
  note: null,
  recipient: { kind: "department", department: KITCHEN },
  fromDepartment: null,
  asksQuantities: false,
  version: 3,
  archivedAt: null,
  items: [
    {
      id: ITEM,
      kind: "number",
      label: "Fridge",
      hint: null,
      required: true,
      unit: "°C",
      min: 0,
      max: 5,
      defaultQuantity: null,
    },
    {
      id: ITEM_2,
      kind: "check",
      label: "Surfaces",
      hint: "With the blue cloth",
      required: false,
      unit: null,
      min: null,
      max: null,
      defaultQuantity: null,
    },
  ],
  schedules: [
    {
      id: SCHEDULE,
      days: [0, 1, 2, 3, 4],
      anchor: "day",
      shift: null,
      opensOffset: 510,
      dueOffset: 555,
      recipient: { kind: "department", department: KITCHEN },
      active: true,
      startsOn: "2026-11-09",
    },
  ],
};

describe("the template editor's save", () => {
  it("saves a template as it was read, its times untouched", () => {
    const drafts = draftItemsOf(template.items);
    expect(drafts.map((d) => d.key)).toEqual([ITEM, ITEM_2]);
    const input = templateInputOf(template, {
      name: " Kitchen opening ",
      note: "  ",
      recipient: template.recipient,
      items: itemsForSave(drafts, new Set([ITEM, ITEM_2])),
    });
    const saved = templateForSave(input);
    expect(saved).toMatchObject({
      id: TEMPLATE,
      name: "Kitchen opening",
      recipient: { kind: "department", department: KITCHEN },
      fromDepartment: null,
      asksQuantities: false,
    });
    expect(saved.note).toBeUndefined();
    expect(saved.items).toEqual([
      {
        id: ITEM,
        kind: "number",
        label: "Fridge",
        required: true,
        unit: "°C",
        min: 0,
        max: 5,
      },
      {
        id: ITEM_2,
        kind: "check",
        label: "Surfaces",
        hint: "With the blue cloth",
        required: false,
      },
    ]);
    expect(saved.schedules).toEqual([
      {
        id: SCHEDULE,
        days: [0, 1, 2, 3, 4],
        anchor: "day",
        recipient: { kind: "department", department: KITCHEN },
        active: true,
        opensOffset: 510,
        dueOffset: 555,
      },
    ]);
  });

  it("adds again an item the database no longer has, and keeps a new one's id out", () => {
    const drafts: DraftItem[] = [
      ...draftItemsOf(template.items),
      {
        key: "i-1",
        id: null,
        kind: "note",
        label: "What is missing",
        hint: null,
        required: false,
        unit: null,
        min: null,
        max: null,
        defaultQuantity: null,
      },
    ];
    const items = itemsForSave(drafts, new Set([ITEM]));
    expect(items.map((item) => item.id)).toEqual([ITEM, undefined, undefined]);
    expect(typedItems(drafts).every((item) => item.id === undefined)).toBe(
      true,
    );
    expect(
      sendInput.safeParse({
        name: "Typed",
        items: typedItems(drafts),
        recipient: { kind: "role", role: "worker" },
      }).success,
    ).toBe(true);
  });

  it("is a new template without an id", () => {
    const input = templateInputOf(
      { ...template, id: null, schedules: [] },
      {
        name: "Weekly cleaning",
        note: "Before Shabbat",
        recipient: null,
        items: typedItems(draftItemsOf(template.items)),
      },
    );
    expect(listTemplateInput.parse(input)).toMatchObject({
      name: "Weekly cleaning",
      note: "Before Shabbat",
      recipient: null,
    });
    expect(input.id).toBeUndefined();
  });

  it("says what keeps a draft from saving", () => {
    const items = draftItemsOf(template.items);
    const draft = {
      name: "Kitchen opening",
      note: "",
      recipient: template.recipient,
      items,
    };
    expect(templateDraftProblem(draft, null)).toBeNull();
    expect(templateDraftProblem({ ...draft, name: "  " }, null)).toBe("name");
    expect(templateDraftProblem({ ...draft, items: [] }, null)).toBe("items");
    expect(
      templateDraftProblem(
        { ...draft, items: [{ ...items[0], key: "x", min: 9 } as DraftItem] },
        null,
      ),
    ).toBe("item");
    // An order goes from its department to another one.
    expect(templateDraftProblem(draft, KITCHEN)).toBe("recipient");
    expect(templateDraftProblem({ ...draft, recipient: null }, BAR)).toBe(
      "recipient",
    );
    expect(templateDraftProblem(draft, BAR)).toBeNull();
    // Whatever its ids: the demo's aren't the database's.
    expect(
      templateDraftProblem(
        {
          ...draft,
          recipient: { kind: "department", department: "dep-kitchen" },
          items: items.map((item) => ({ ...item, id: "ti-1" })),
        },
        null,
      ),
    ).toBeNull();
  });

  it("moves an item one place, and nowhere past the ends", () => {
    expect(moved(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(moved(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(moved(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(moved(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });

  it("knows a recipient that is gone", () => {
    const department = { kind: "department", department: KITCHEN } as const;
    expect(recipientGone(department, [KITCHEN], [])).toBe(false);
    expect(recipientGone(department, [BAR], [])).toBe(true);
    expect(recipientGone({ kind: "shift", shift: "evening" }, [], [])).toBe(
      true,
    );
    expect(
      recipientGone({ kind: "shift", shift: "evening" }, [], ["evening"]),
    ).toBe(false);
    expect(recipientGone({ kind: "role", role: "worker" }, [], [])).toBe(false);
    expect(recipientGone(null, [], [])).toBe(false);
  });

  it("knows a template no save can pass: an order or a time pointing at something gone", () => {
    const [schedule] = template.schedules;
    if (!schedule) throw new Error("The template has a time");
    expect(templateStuck(template, [KITCHEN, BAR], [])).toBeNull();
    // An order whose asking department was removed.
    expect(
      templateStuck({ ...template, fromDepartment: BAR }, [KITCHEN], []),
    ).toBe("order");
    expect(
      templateStuck({ ...template, fromDepartment: BAR }, [KITCHEN, BAR], []),
    ).toBeNull();
    // A time that goes to a removed department, or to a shift gone.
    expect(templateStuck(template, [BAR], [])).toBe("schedule");
    const toShift = {
      ...template,
      schedules: [
        {
          ...schedule,
          recipient: { kind: "shift", shift: "evening" } as const,
        },
      ],
    };
    expect(templateStuck(toShift, [], ["evening"])).toBeNull();
    expect(templateStuck(toShift, [], ["morning"])).toBe("schedule");
    // A time that follows a shift gone.
    const followsShift = {
      ...template,
      schedules: [
        {
          ...schedule,
          anchor: "shift_start" as const,
          shift: "morning",
          recipient: { kind: "role", role: "worker" } as const,
        },
      ],
    };
    expect(templateStuck(followsShift, [], ["morning"])).toBeNull();
    expect(templateStuck(followsShift, [], [])).toBe("schedule");
    // A person is the database's to check.
    expect(
      templateStuck(
        {
          ...template,
          schedules: [
            { ...schedule, recipient: { kind: "person", user: NOA } as const },
          ],
        },
        [],
        [],
      ),
    ).toBeNull();
  });
});

describe("templates by department", () => {
  it("follows the departments' order, then the rest", () => {
    const of = (name: string, recipient: ListTemplate["recipient"]) => ({
      name,
      recipient,
    });
    const groups = templatesByDepartment(
      [
        of("bar closing", { kind: "department", department: BAR }),
        of("anyone", null),
        of("kitchen opening", { kind: "department", department: KITCHEN }),
        of("workers", { kind: "role", role: "worker" }),
        of("removed", {
          kind: "department",
          department: "99999999-9999-4999-8999-999999999999",
        }),
        of("bar order", { kind: "department", department: BAR }),
      ],
      [{ id: KITCHEN }, { id: BAR }, { id: "empty" }],
    );
    expect(
      groups.map((g) => [g.department, g.templates.map((t) => t.name)]),
    ).toEqual([
      [KITCHEN, ["kitchen opening"]],
      [BAR, ["bar closing", "bar order"]],
      [null, ["anyone", "workers", "removed"]],
    ]);
    expect(templatesByDepartment([], [{ id: KITCHEN }])).toEqual([]);
  });
});

describe("a due time when sending", () => {
  const zone = "Asia/Jerusalem";
  // Tuesday 10 November 2026, 08:12 in Israel (winter, UTC+2).
  const now = new Date("2026-11-10T06:12:00.000Z");

  it("is today or tomorrow in the business's zone, and never gone by", () => {
    expect(dueAtOf("today", "09:30", now, zone)).toEqual({
      ok: true,
      dueAt: "2026-11-10T07:30:00.000Z",
    });
    expect(dueAtOf("tomorrow", "07:00", now, zone)).toEqual({
      ok: true,
      dueAt: "2026-11-11T05:00:00.000Z",
    });
    expect(dueAtOf("today", "08:12", now, zone)).toEqual({
      ok: false,
      problem: "past",
    });
    expect(dueAtOf("today", "7:00", now, zone)).toEqual({
      ok: false,
      problem: "time",
    });
    expect(dueAtOf("tomorrow", "23:59", now, zone)).toEqual({
      ok: true,
      dueAt: "2026-11-11T21:59:00.000Z",
    });
  });

  it("starts an hour ahead, on the half hour, tomorrow after midnight", () => {
    expect(suggestedDue(now, zone)).toEqual({ day: "today", time: "09:30" });
    expect(suggestedDue(new Date("2026-11-10T07:00:00.000Z"), zone)).toEqual({
      day: "today",
      time: "10:00",
    });
    expect(suggestedDue(new Date("2026-11-10T21:40:00.000Z"), zone)).toEqual({
      day: "tomorrow",
      time: "01:00",
    });
  });

  it("starts today late in the evening at a time still to come", () => {
    // 08:12: the suggestion, either day.
    expect(dueTimeFor("today", now, zone)).toBe("09:30");
    expect(dueTimeFor("tomorrow", now, zone)).toBe("09:30");
    // 23:10: an hour ahead is tomorrow; today is the next half hour.
    const late = new Date("2026-11-10T21:10:00.000Z");
    expect(dueTimeFor("tomorrow", late, zone)).toBe("00:30");
    expect(dueTimeFor("today", late, zone)).toBe("23:30");
    expect(
      dueAtOf("today", dueTimeFor("today", late, zone), late, zone).ok,
    ).toBe(true);
    // 23:40, in the last half hour: a minute before midnight.
    const later = new Date("2026-11-10T21:40:00.000Z");
    expect(dueTimeFor("today", later, zone)).toBe("23:59");
    expect(
      dueAtOf("today", dueTimeFor("today", later, zone), later, zone).ok,
    ).toBe(true);
    // 23:00 on the dot: the half hour after it.
    expect(
      dueTimeFor("today", new Date("2026-11-10T21:00:00.000Z"), zone),
    ).toBe("23:30");
  });
});

describe("where a template is sent from the send screen", () => {
  const shifts: SendShift[] = [
    {
      id: "s-1",
      day: "2026-11-10",
      name: "Evening",
      start: "16:00",
      end: "23:00",
      pattern: "evening",
      people: [],
    },
    {
      id: "s-2",
      day: "2026-11-11",
      name: "Evening",
      start: "16:00",
      end: "23:00",
      pattern: "evening",
      people: [NOA],
    },
  ];

  it("starts at its own recipient, and at nobody once its department is gone", () => {
    const kitchen = { kind: "department", department: KITCHEN } as const;
    expect(sendDefaults(kitchen, shifts, [KITCHEN, BAR])).toEqual({
      kind: "department",
      department: KITCHEN,
      shift: null,
      role: null,
      gone: false,
    });
    expect(sendDefaults(kitchen, shifts, [BAR])).toEqual({
      kind: "department",
      department: null,
      shift: null,
      role: null,
      gone: true,
    });
    expect(
      sendDefaults({ kind: "role", role: "manager" }, shifts, []),
    ).toMatchObject({ kind: "role", role: "manager", gone: false });
    // The next of its shift with people on it.
    expect(
      sendDefaults({ kind: "shift", shift: "evening" }, shifts, []),
    ).toMatchObject({ kind: "shift", shift: "s-2" });
    expect(
      sendDefaults({ kind: "shift", shift: "evening" }, null, []),
    ).toMatchObject({ kind: "person", shift: null });
    expect(sendDefaults(null, shifts, [KITCHEN])).toMatchObject({
      kind: "person",
      gone: false,
    });
    expect(sendDefaults(undefined, shifts, [KITCHEN]).kind).toBe("person");
  });
});

describe("the shifts a list can go to", () => {
  const zone = "Asia/Jerusalem";
  const now = new Date("2026-11-10T14:30:00.000Z"); // 16:30 in Israel
  const shift = (day: string, name: string, start: string, end: string) => ({
    day,
    name,
    start,
    end,
  });

  it("are from today to a week ahead, and not over yet", () => {
    const shown = upcomingShifts(
      [
        shift("2026-11-18", "Evening", "16:00", "23:30"),
        shift("2026-11-10", "Morning", "09:00", "16:00"),
        shift("2026-11-11", "Morning", "09:00", "16:00"),
        shift("2026-11-10", "Evening", "16:00", "23:30"),
        shift("2026-11-09", "Night", "22:00", "06:00"),
        shift("2026-11-17", "Evening", "16:00", "23:30"),
      ],
      now,
      zone,
    );
    expect(shown.map((s) => `${s.day} ${s.name}`)).toEqual([
      "2026-11-10 Evening",
      "2026-11-11 Morning",
      "2026-11-17 Evening",
    ]);
  });

  it("keeps a shift that ends after midnight until its day is over", () => {
    const night = shift("2026-11-10", "Night", "22:00", "02:00");
    // 23:30 in Israel: it has started, and goes on.
    expect(
      upcomingShifts([night], new Date("2026-11-10T21:30:00.000Z"), zone),
    ).toEqual([night]);
    // 01:00 the next day: still on, but `send_list` takes shifts from
    // today on, so it is gone here too.
    expect(
      upcomingShifts([night], new Date("2026-11-10T23:00:00.000Z"), zone),
    ).toEqual([]);
  });
});
