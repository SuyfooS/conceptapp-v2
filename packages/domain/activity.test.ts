import { describe, expect, it } from "vitest";
import {
  type ActivityLookups,
  type ActivityRow,
  activityByDay,
  activityRefs,
  buildActivity,
  parseActivityCursor,
} from "./activity";

const NOA = "11111111-1111-4111-8111-111111111111";
const YOAV = "22222222-2222-4222-8222-222222222222";
const LEFT = "33333333-3333-4333-8333-333333333333";
const NAMELESS = "44444444-4444-4444-8444-444444444444";
const STAFF = "55555555-5555-4555-8555-555555555555";
const INVITE = "66666666-6666-4666-8666-666666666666";
const SHIFT = "77777777-7777-4777-8777-777777777777";
const SWAP = "88888888-8888-4888-8888-888888888888";
const GONE = "99999999-9999-4999-8999-999999999999";

const lookups: ActivityLookups = {
  members: new Map([
    [NOA, { active: true, name: "Noa" }],
    [YOAV, { active: true, name: "Yoav" }],
    [LEFT, { active: false, name: null }],
    [NAMELESS, { active: true, name: null }],
  ]),
  invites: new Map([[INVITE, { name: "Dana", role: "worker" }]]),
  shifts: new Map([
    [
      SHIFT,
      { day: "2026-11-05", name: "Evening", start: "16:00", end: "23:00" },
    ],
  ]),
  swaps: new Map([[SWAP, { shiftId: SHIFT, requestedBy: NOA, takenBy: YOAV }]]),
};

let nextId = 1000;
function row(
  action: string,
  details: unknown,
  actorId: string | null = NOA,
  createdAt = "2026-11-04T10:00:00+00:00",
): ActivityRow {
  nextId -= 1;
  return { id: nextId, action, details, createdAt, actorId };
}

const lineOf = (r: ActivityRow) => buildActivity([r], lookups)[0]?.line;

describe("buildActivity: each action", () => {
  it("reads the business being opened, with or without invites", () => {
    expect(lineOf(row("business.create", { template: "cafe-bar" }))).toEqual({
      action: "business.create",
      invites: 0,
    });
    expect(lineOf(row("business.create", { invites: 3 }))).toEqual({
      action: "business.create",
      invites: 3,
    });
  });

  it("reads the business's own details, empty values as null", () => {
    expect(
      lineOf(
        row("business.details", {
          from: { name: "Old", address: "Herzl 5", shabbat_city: null },
          to: { name: "New", address: null, shabbat_city: "haifa" },
        }),
      ),
    ).toEqual({
      action: "business.details",
      changes: [
        { key: "name", from: "Old", to: "New" },
        { key: "address", from: "Herzl 5", to: null },
        { key: "shabbatCity", from: null, to: "haifa" },
      ],
    });
  });

  it("drops a city it doesn't know", () => {
    expect(
      lineOf(
        row("business.details", {
          from: { shabbat_city: "atlantis" },
          to: { shabbat_city: "eilat" },
        }),
      ),
    ).toEqual({
      action: "business.details",
      changes: [{ key: "shabbatCity", from: null, to: "eilat" }],
    });
  });

  it("reads a module's settings, a field never set as null", () => {
    expect(
      lineOf(
        row("module.settings", {
          module: "time_clock",
          from: { roundToMinutes: null, unpaidBreaks: false },
          to: { roundToMinutes: 15, unpaidBreaks: true },
        }),
      ),
    ).toEqual({
      action: "module.settings",
      module: "time_clock",
      changes: [
        { key: "roundToMinutes", from: null, to: 15 },
        { key: "unpaidBreaks", from: false, to: true },
      ],
    });
  });

  it("reads the clock's old one-setting rows as its settings, before unknown", () => {
    expect(lineOf(row("clock.settings", { unpaid_breaks: true }))).toEqual({
      action: "module.settings",
      module: "time_clock",
      changes: [{ key: "unpaidBreaks", from: undefined, to: true }],
    });
  });

  it("reads a module switched on or off", () => {
    expect(
      lineOf(row("module.enabled", { module: "scheduling", enabled: false })),
    ).toEqual({
      action: "module.enabled",
      module: "scheduling",
      enabled: false,
    });
  });

  it("reads hours added and corrected, with whose they are", () => {
    expect(
      lineOf(
        row("clock.add", {
          entry: GONE,
          person: YOAV,
          clock_in: "2026-11-03T06:00:00+00:00",
          clock_out: "2026-11-03T14:00:00+00:00",
        }),
      ),
    ).toEqual({
      action: "clock.add",
      person: { kind: "member", name: "Yoav" },
      times: {
        clockIn: "2026-11-03T06:00:00+00:00",
        clockOut: "2026-11-03T14:00:00+00:00",
      },
    });
    expect(
      lineOf(
        row("clock.correct", {
          entry: GONE,
          person: LEFT,
          from: { clock_in: "2026-11-03T14:00:00+00:00", clock_out: null },
          to: {
            clock_in: "2026-11-03T14:00:00+00:00",
            clock_out: "2026-11-03T21:30:00+00:00",
          },
        }),
      ),
    ).toEqual({
      action: "clock.correct",
      person: { kind: "former" },
      from: { clockIn: "2026-11-03T14:00:00+00:00", clockOut: null },
      to: {
        clockIn: "2026-11-03T14:00:00+00:00",
        clockOut: "2026-11-03T21:30:00+00:00",
      },
    });
  });

  it("reads invites with the invited name, the row's role first", () => {
    expect(
      lineOf(row("invite.create", { invite: INVITE, role: "manager" })),
    ).toEqual({ action: "invite.create", name: "Dana", role: "manager" });
    expect(lineOf(row("invite.send", { invite: INVITE }))).toEqual({
      action: "invite.send",
      name: "Dana",
      role: "worker",
    });
    expect(lineOf(row("invite.send", { invite: GONE }))).toEqual({
      action: "invite.send",
      name: null,
      role: null,
    });
    expect(
      lineOf(row("invite.claim", { invite: INVITE, role: "worker" })),
    ).toEqual({ action: "invite.claim", role: "worker" });
  });

  it("reads a view by the team, with its role", () => {
    expect(
      lineOf(row("view_as.start", { session: GONE, role: "manager" }, STAFF)),
    ).toEqual({ action: "view_as.start", role: "manager" });
    expect(
      lineOf(row("view_as.end", { session: GONE, role: "boss" }, STAFF)),
    ).toEqual({ action: "view_as.end", role: null });
  });

  it("reads swaps through the request and its shift, while they're there", () => {
    const shift = lookups.shifts.get(SHIFT);
    expect(lineOf(row("swap.request", { swap: SWAP, shift: SHIFT }))).toEqual({
      action: "swap.request",
      shift,
    });
    expect(lineOf(row("swap.take", { swap: SWAP }, YOAV))).toEqual({
      action: "swap.take",
      shift,
      from: { kind: "member", name: "Noa" },
    });
    expect(lineOf(row("swap.cancel", { swap: SWAP }))).toEqual({
      action: "swap.cancel",
      shift,
    });
    expect(
      lineOf(
        row("swap.approve", { swap: SWAP, shift: SHIFT, from: NOA, to: YOAV }),
      ),
    ).toEqual({
      action: "swap.approve",
      shift,
      from: { kind: "member", name: "Noa" },
      to: { kind: "member", name: "Yoav" },
    });
  });

  it("reads a swap whose shift was replaced by publishing again", () => {
    expect(lineOf(row("swap.take", { swap: GONE }, YOAV))).toEqual({
      action: "swap.take",
      shift: null,
      from: null,
    });
    expect(
      lineOf(row("swap.decline", { swap: GONE, shift: GONE, from: NOA })),
    ).toEqual({
      action: "swap.decline",
      shift: null,
      from: { kind: "member", name: "Noa" },
      to: null,
    });
  });

  it("reads a publish", () => {
    expect(
      lineOf(
        row("schedule.publish", {
          week: GONE,
          starts_on: "2026-11-08",
          shifts: 12,
          first: false,
          swaps_removed: 2,
        }),
      ),
    ).toEqual({
      action: "schedule.publish",
      startsOn: "2026-11-08",
      shifts: 12,
      first: false,
      swapsRemoved: 2,
    });
  });

  it("turns anything it can't read into a plain line", () => {
    for (const r of [
      row("something.new", { anything: 1 }),
      row("clock.add", { person: YOAV, clock_in: "yesterday" }),
      row("schedule.publish", { shifts: -1 }),
      row("business.details", "not an object"),
      row("module.enabled", null),
    ]) {
      expect(lineOf(r)).toEqual({ action: "other" });
    }
  });
});

describe("buildActivity: who did it", () => {
  it("names a member, says when they left, and tells the team from nobody", () => {
    const actors = buildActivity(
      [
        row("invite.claim", { role: "worker" }, NOA),
        row("invite.claim", { role: "worker" }, NAMELESS),
        row("invite.claim", { role: "worker" }, LEFT),
        row("view_as.start", { role: "owner" }, STAFF),
        row("invite.claim", { role: "worker" }, null),
      ],
      lookups,
    ).map((entry) => entry.actor);
    expect(actors).toEqual([
      { kind: "member", name: "Noa" },
      { kind: "member", name: null },
      { kind: "former" },
      { kind: "team" },
      { kind: "unknown" },
    ]);
  });

  it("holds no ids", () => {
    const [entry] = buildActivity(
      [row("swap.approve", { swap: SWAP, shift: SHIFT, from: NOA, to: YOAV })],
      lookups,
    );
    expect(JSON.stringify(entry)).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/,
    );
  });
});

describe("buildActivity: a run of edits reads as one", () => {
  const at = (minute: number) =>
    `2026-11-04T10:${String(minute).padStart(2, "0")}:00+00:00`;
  const rounding = (
    from: number | null,
    to: number,
    minute: number,
    actor: string | null = NOA,
  ) =>
    row(
      "module.settings",
      {
        module: "time_clock",
        from: { roundToMinutes: from },
        to: { roundToMinutes: to },
      },
      actor,
      at(minute),
    );

  it("folds one person's edits to the same module, newest first", () => {
    const rows = [rounding(5, 15, 9), rounding(0, 5, 4), rounding(null, 0, 1)];
    const entries = buildActivity(rows, lookups);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: rows[0]?.id,
      at: at(9),
      line: {
        module: "time_clock",
        changes: [{ key: "roundToMinutes", from: null, to: 15 }],
      },
    });
  });

  it("measures each gap from the edit before it, not from the first", () => {
    const rows = [rounding(5, 15, 18), rounding(0, 5, 9), rounding(null, 0, 0)];
    expect(buildActivity(rows, lookups)).toHaveLength(1);
  });

  it("keeps edits apart across a long pause, another person or another module", () => {
    expect(
      buildActivity([rounding(5, 15, 30), rounding(0, 5, 10)], lookups),
    ).toHaveLength(2);
    expect(
      buildActivity([rounding(5, 15, 3), rounding(0, 5, 1, YOAV)], lookups),
    ).toHaveLength(2);
    expect(
      buildActivity(
        [
          rounding(5, 15, 3),
          row(
            "module.settings",
            { module: "scheduling", from: {}, to: { closedOnShabbat: false } },
            NOA,
            at(2),
          ),
        ],
        lookups,
      ),
    ).toHaveLength(2);
    expect(
      buildActivity(
        [
          rounding(5, 15, 3),
          row("invite.claim", { role: "worker" }, YOAV, at(2)),
          rounding(0, 5, 1),
        ],
        lookups,
      ),
    ).toHaveLength(3);
  });

  it("joins the fields of the edits, each from its first value to its last", () => {
    const [entry] = buildActivity(
      [
        row(
          "module.settings",
          {
            module: "time_clock",
            from: { unpaidBreaks: false },
            to: { unpaidBreaks: true },
          },
          NOA,
          at(2),
        ),
        rounding(0, 5, 1),
      ],
      lookups,
    );
    expect(entry?.line).toEqual({
      action: "module.settings",
      module: "time_clock",
      changes: [
        { key: "unpaidBreaks", from: false, to: true },
        { key: "roundToMinutes", from: 0, to: 5 },
      ],
    });
  });

  it("leaves out a run that ended where it began", () => {
    const rows = [rounding(5, 0, 2), rounding(0, 5, 1)];
    expect(buildActivity(rows, lookups)).toEqual([]);
  });

  it("leaves out a save that changed nothing, and keeps what did", () => {
    const [entry] = buildActivity(
      [
        row("module.settings", {
          module: "time_clock",
          from: { roundToMinutes: 5, unpaidBreaks: true },
          to: { roundToMinutes: 5, unpaidBreaks: false },
        }),
      ],
      lookups,
    );
    expect(entry?.line).toMatchObject({
      changes: [{ key: "unpaidBreaks", from: true, to: false }],
    });
  });

  it("folds the business's details too", () => {
    const name = (from: string, to: string, minute: number) =>
      row(
        "business.details",
        { from: { name: from }, to: { name: to } },
        NOA,
        at(minute),
      );
    const entries = buildActivity(
      [name("Cafe No", "Cafe Noa", 3), name("Cafe", "Cafe No", 2)],
      lookups,
    );
    expect(entries.map((entry) => entry.line)).toEqual([
      {
        action: "business.details",
        changes: [{ key: "name", from: "Cafe", to: "Cafe Noa" }],
      },
    ]);
  });

  it("lists folded details in the screen's order, whatever order they changed in", () => {
    const detail = (
      column: string,
      from: string | null,
      to: string,
      minute: number,
    ) =>
      row(
        "business.details",
        { from: { [column]: from }, to: { [column]: to } },
        NOA,
        at(minute),
      );
    const [entry] = buildActivity(
      [
        detail("shabbat_city", null, "jerusalem", 3),
        detail("accent", "#2563eb", "#0f766e", 2),
        detail("name", "Cafe", "Cafe Noa", 1),
      ],
      lookups,
    );
    expect(
      entry?.line.action === "business.details" &&
        entry.line.changes.map((change) => change.key),
    ).toEqual(["name", "accent", "shabbatCity"]);
  });

  it("never folds what nobody is known to have done", () => {
    expect(
      buildActivity(
        [rounding(5, 15, 3, null), rounding(0, 5, 1, null)],
        lookups,
      ),
    ).toHaveLength(2);
  });
});

describe("activityRefs", () => {
  it("collects the ids to look up, and nothing that isn't one", () => {
    expect(
      activityRefs([
        row("swap.approve", { swap: SWAP, shift: SHIFT, from: NOA, to: YOAV }),
        row("invite.send", { invite: INVITE.toUpperCase() }, STAFF),
        row("clock.correct", { person: "'; drop table --", entry: 5 }, null),
        row("business.details", "not an object", LEFT),
      ]),
    ).toEqual({
      people: [NOA, YOAV, STAFF, LEFT],
      invites: [INVITE],
      shifts: [SHIFT],
      swaps: [SWAP],
    });
  });
});

describe("activityByDay", () => {
  const entry = (at: string) =>
    buildActivity([row("invite.claim", { role: "worker" }, NOA, at)], lookups);

  it("groups by the business's own day, with today and yesterday", () => {
    // Winter time: 22:30 UTC is already the next day in Israel, 21:59 isn't.
    const entries = [
      ...entry("2026-11-04T22:30:00+00:00"),
      ...entry("2026-11-04T21:30:00+00:00"),
      ...entry("2026-11-04T08:00:00+00:00"),
      ...entry("2026-11-03T21:59:00+00:00"),
      ...entry("2026-11-01T10:00:00+00:00"),
    ];
    const days = activityByDay(
      entries,
      "Asia/Jerusalem",
      new Date("2026-11-04T23:00:00+00:00"),
    );
    expect(
      days.map((day) => [day.date, day.relative, day.entries.length]),
    ).toEqual([
      ["2026-11-05", "today", 1],
      ["2026-11-04", "yesterday", 2],
      ["2026-11-03", null, 1],
      ["2026-11-01", null, 1],
    ]);
  });

  it("follows the clock change", () => {
    // Summer time: 21:30 UTC is already the next day in Israel.
    const days = activityByDay(
      [
        ...entry("2026-10-24T21:30:00+00:00"),
        ...entry("2026-10-24T20:30:00+00:00"),
      ],
      "Asia/Jerusalem",
      new Date("2026-11-04T10:00:00+00:00"),
    );
    expect(days.map((day) => day.date)).toEqual(["2026-10-25", "2026-10-24"]);
  });
});

describe("parseActivityCursor", () => {
  it("takes a row id and nothing else", () => {
    expect(parseActivityCursor("120")).toBe(120);
    for (const value of [
      "0",
      "-3",
      "1.5",
      "12abc",
      "",
      " 7",
      undefined,
      ["7"],
    ]) {
      expect(parseActivityCursor(value)).toBeNull();
    }
    expect(parseActivityCursor("99999999999999999")).toBeNull();
  });
});
