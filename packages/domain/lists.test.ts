import { describe, expect, it } from "vitest";
import {
  anyItemResult,
  byUrgency,
  fromOffsets,
  holdsList,
  isOutOfRange,
  itemResult,
  listHref,
  listItemSeed,
  listProgress,
  listState,
  listsTally,
  listTemplateInput,
  listTemplateProblem,
  listTemplateSeed,
  listTemplateSeeds,
  parseReading,
  scheduleInput,
  sendInput,
  templateForSave,
  toOffsets,
  undoDeadline,
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
