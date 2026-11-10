import { describe, expect, it } from "vitest";
import {
  buildInbox,
  groupsFor,
  INBOX_PAGE_SIZE,
  inboxCursor,
  inboxPage,
  isAppPath,
  linkFor,
  NOTIFICATION_KIND_KEYS,
  NOTIFICATION_KINDS,
  type NotificationLookups,
  type NotificationRow,
  needsAction,
  notificationKindOf,
  notificationRefs,
  parseInboxCursor,
  unreadCounts,
} from "./notifications";

const NOA = "11111111-1111-4111-8111-111111111111";
const YOAV = "22222222-2222-4222-8222-222222222222";
const LEFT = "33333333-3333-4333-8333-333333333333";
const MANAGER = "44444444-4444-4444-8444-444444444444";
const LINE = "55555555-5555-4555-8555-555555555555";
const GONE = "99999999-9999-4999-8999-999999999999";

const lookups: NotificationLookups = {
  members: new Map([
    [NOA, { active: true, name: "Noa" }],
    [YOAV, { active: true, name: "Yoav" }],
    [LEFT, { active: false, name: "Left" }],
    [MANAGER, { active: true, name: null }],
  ]),
};

const SHIFT = {
  day: "2026-11-18",
  name: "Evening",
  start: "16:00",
  end: "23:00",
};

function row(
  kind: string,
  params: unknown,
  extra: Partial<NotificationRow> = {},
): NotificationRow {
  return {
    id: LINE,
    kind,
    params,
    actorId: MANAGER,
    createdAt: "2026-11-09T10:00:00.123456+00:00",
    readAt: null,
    resolvedAt: null,
    ...extra,
  };
}

const lineOf = (r: NotificationRow, reader = NOA) =>
  buildInbox([r], lookups, reader)[0];

describe("the kinds", () => {
  it("each lead somewhere inside the app", () => {
    for (const kind of NOTIFICATION_KIND_KEYS) {
      expect(isAppPath(linkFor(kind)), kind).toBe(true);
    }
  });

  it("send what a manager approves to where it is approved", () => {
    expect(linkFor("swap.waiting")).toBe("/schedule/swaps");
    expect(linkFor("clock.confirm")).toBe("/clock/team");
    expect(linkFor("schedule.published")).toBe("/schedule/shifts");
    expect(linkFor("team.joined")).toBe("/team");
  });

  it("send a line about a list to that list, and only by a real id", () => {
    expect(linkFor("lists.sent", { list: LINE })).toBe(`/lists/${LINE}`);
    expect(linkFor("lists.finished", { list: LINE.toUpperCase() })).toBe(
      `/lists/${LINE}`,
    );
    for (const params of [{ list: "../admin" }, { list: 7 }, null, "x"]) {
      expect(linkFor("lists.sent", params), String(params)).toBe("/lists");
    }
    expect(linkFor("lists.sent")).toBe("/lists");
    // Kinds that lead to one place ignore what their params say.
    expect(linkFor("team.joined", { list: LINE })).toBe("/team");
  });

  it("send an unknown kind to the inbox", () => {
    expect(linkFor("chat.message", { list: LINE })).toBe("/notifications");
    expect(notificationKindOf("chat.message")).toBeNull();
    expect(notificationKindOf("swap.taken")).toBe("swap.taken");
  });

  it("count as needing action only what asks the reader to act", () => {
    expect(
      NOTIFICATION_KIND_KEYS.filter((kind) => needsAction(kind)).sort(),
    ).toEqual([
      "clock.confirm",
      "lists.late_team",
      "lists.out_of_range",
      "pay.month_due",
      "swap.offered",
      "swap.waiting",
    ]);
    expect(needsAction("something.else")).toBe(false);
  });

  it("give the manager-only kinds to managers", () => {
    for (const kind of ["swap.waiting", "clock.confirm", "team.joined"]) {
      expect(
        NOTIFICATION_KINDS[kind as keyof typeof NOTIFICATION_KINDS].minRole,
      ).toBe("manager");
    }
  });
});

describe("isAppPath", () => {
  it("takes a path inside the app", () => {
    expect(isAppPath("/schedule/shifts")).toBe(true);
    expect(isAppPath("/clock/team?month=2026-11")).toBe(true);
  });

  it("refuses anything that could leave it", () => {
    for (const url of [
      "//evil.example",
      "https://evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "schedule",
      "/\tschedule",
      "",
      null,
      42,
    ]) {
      expect(isAppPath(url), String(url)).toBe(false);
    }
  });
});

describe("unreadCounts", () => {
  it("counts one business's lines, and apart what needs action", () => {
    const rows = [
      { business_id: "a", kind: "schedule.published" },
      { business_id: "a", kind: "swap.offered" },
      { business_id: "a", kind: "clock.confirm" },
      { business_id: "b", kind: "swap.waiting" },
      { business_id: "a", kind: "lists.sent" },
    ];
    expect(unreadCounts(rows, "a")).toEqual({ all: 4, action: 2 });
    expect(unreadCounts(rows, "b")).toEqual({ all: 1, action: 1 });
    expect(unreadCounts(rows, "c")).toEqual({ all: 0, action: 0 });
  });
});

describe("groupsFor", () => {
  it("gives a worker the schedule and swaps", () => {
    expect(groupsFor("worker", ["scheduling", "time_clock"])).toEqual([
      "schedule",
      "swaps",
    ]);
  });

  it("gives a manager approvals and the team too", () => {
    expect(groupsFor("manager", ["scheduling", "time_clock"])).toEqual([
      "schedule",
      "swaps",
      "approvals",
      "team",
    ]);
  });

  it("follows the modules that are on", () => {
    expect(groupsFor("owner", ["time_clock"])).toEqual(["approvals", "team"]);
    expect(groupsFor("worker", [])).toEqual([]);
  });
});

describe("the inbox cursor", () => {
  const at = "2026-11-09T10:00:00.123456+00:00";

  it("reads back what it wrote, in either part", () => {
    for (const cursor of [
      { part: "unread", after: { at, id: LINE } },
      { part: "read", after: { at, id: LINE } },
      { part: "read", after: null },
    ] as const) {
      expect(parseInboxCursor(inboxCursor(cursor))).toEqual(cursor);
    }
  });

  it("takes a plus that came back as a space", () => {
    expect(
      parseInboxCursor(`r~2026-11-09T10:00:00.123456 00:00~${LINE}`),
    ).toEqual({ part: "read", after: { at, id: LINE } });
  });

  it("refuses anything else", () => {
    for (const value of [
      undefined,
      "",
      "u",
      "x",
      "2026-11-09",
      `${at}~${LINE}`,
      `x~${at}~${LINE}`,
      `r~yesterday~${LINE}`,
      "r~2026-11-09T10:00:00Z~not-an-id",
      `r~2026-11-09T10:00:00Z~${LINE}~more`,
      `u~2026-13-45T10:00:00Z~${LINE}`,
      `r~2026-11-09T10:00:00Z`,
      ["r", "2026-11-09T10:00:00Z", LINE],
    ]) {
      expect(parseInboxCursor(value), String(value)).toBeNull();
    }
  });
});

describe("inboxPage", () => {
  const lines = (count: number, from = 0) =>
    Array.from({ length: count }, (_, index) => ({
      id: `line-${from + index}`,
      createdAt: `2026-11-09T10:00:${String(59 - ((from + index) % 60)).padStart(2, "0")}Z`,
    }));
  const PAGE = INBOX_PAGE_SIZE;

  it("fills the newest page with unread lines first, then read ones", () => {
    const page = inboxPage(null, lines(3), lines(PAGE + 1, 100));
    expect(page.unread).toHaveLength(3);
    expect(page.earlier).toHaveLength(PAGE - 3);
    expect(page.older).toEqual({
      part: "read",
      after: {
        at: page.earlier.at(-1)?.createdAt,
        id: page.earlier.at(-1)?.id,
      },
    });
  });

  it("pages on through unread lines past one page, never leaving one out", () => {
    const unread = lines(PAGE + 1);
    const first = inboxPage(null, unread, lines(5, 100));
    expect(first.unread).toEqual(unread.slice(0, PAGE));
    expect(first.earlier).toEqual([]);
    expect(first.older).toEqual({
      part: "unread",
      after: { at: unread[PAGE - 1]?.createdAt, id: unread[PAGE - 1]?.id },
    });
    // The next page: the one unread line left, then read lines from the start.
    const next = inboxPage(first.older, unread.slice(PAGE), lines(5, 100));
    expect(next.unread).toEqual(unread.slice(PAGE));
    expect(next.earlier).toHaveLength(5);
    expect(next.older).toBeNull();
  });

  it("starts the read lines on their own page when unread ones fill one", () => {
    const page = inboxPage(null, lines(PAGE), lines(2, 100));
    expect(page.earlier).toEqual([]);
    expect(page.older).toEqual({ part: "read", after: null });
  });

  it("reads only read lines among them", () => {
    const page = inboxPage(
      { part: "read", after: null },
      lines(3),
      lines(2, 100),
    );
    expect(page.unread).toEqual([]);
    expect(page.earlier).toHaveLength(2);
    expect(page.older).toBeNull();
  });
});

describe("buildInbox", () => {
  it("reads a published week, with the reader's own shifts", () => {
    const entry = lineOf(
      row("schedule.published", {
        week: GONE,
        startsOn: "2026-11-15",
        mine: 3,
      }),
    );
    expect(entry).toEqual({
      id: LINE,
      at: "2026-11-09T10:00:00.123456+00:00",
      read: false,
      settled: false,
      actor: { kind: "member", name: null },
      group: "schedule",
      href: "/schedule/shifts",
      line: { kind: "schedule.published", startsOn: "2026-11-15", mine: 3 },
    });
  });

  it("reads an offer with its shift and who gives it", () => {
    expect(
      lineOf(row("swap.offered", { swap: GONE, shift: SHIFT, from: YOAV }))
        ?.line,
    ).toEqual({
      kind: "swap.offered",
      shift: SHIFT,
      from: { kind: "member", name: "Yoav" },
    });
  });

  it("still reads a line whose shift is gone", () => {
    expect(
      lineOf(row("swap.removed", { swap: GONE, shift: null }))?.line,
    ).toEqual({ kind: "swap.removed", shift: null });
    expect(lineOf(row("swap.taken", { by: NOA }))?.line).toEqual({
      kind: "swap.taken",
      shift: null,
      by: { kind: "member", name: "Noa" },
    });
  });

  it("says whose side of a decided swap the reader is on", () => {
    const decided = { swap: GONE, shift: SHIFT, from: NOA, to: YOAV };
    expect(lineOf(row("swap.approved", decided), NOA)?.line).toMatchObject({
      kind: "swap.approved",
      side: "from",
      to: { kind: "member", name: "Yoav" },
    });
    expect(lineOf(row("swap.declined", decided), YOAV)?.line).toMatchObject({
      kind: "swap.declined",
      side: "to",
      from: { kind: "member", name: "Noa" },
    });
    expect(lineOf(row("swap.approved", decided), MANAGER)?.line).toMatchObject({
      side: null,
    });
  });

  it("reads a request waiting for a manager", () => {
    expect(
      lineOf(
        row("swap.waiting", { swap: GONE, shift: SHIFT, from: NOA, to: LEFT }),
        MANAGER,
      )?.line,
    ).toEqual({
      kind: "swap.waiting",
      shift: SHIFT,
      from: { kind: "member", name: "Noa" },
      to: { kind: "former" },
    });
  });

  it("reads hours that wait", () => {
    expect(
      lineOf(
        row("clock.confirm", {
          entry: GONE,
          person: YOAV,
          proof: "none",
          direction: "out",
          at: "2026-11-09T14:00:00+00:00",
        }),
        MANAGER,
      ),
    ).toMatchObject({
      group: "approvals",
      href: "/clock/team",
      line: {
        kind: "clock.confirm",
        person: { kind: "member", name: "Yoav" },
        proof: "none",
        direction: "out",
        at: "2026-11-09T14:00:00+00:00",
      },
    });
  });

  it("reads a list sent, and where it leads", () => {
    expect(
      lineOf(
        row(
          "lists.sent",
          { list: LINE, name: "Opening", due: null, department: GONE },
          { actorId: MANAGER },
        ),
      ),
    ).toMatchObject({
      group: "lists",
      href: `/lists/${LINE}`,
      line: { kind: "lists.sent", name: "Opening" },
    });
    expect(
      lineOf(row("lists.finished", { list: LINE, name: "Bar order" }), MANAGER),
    ).toMatchObject({ line: { kind: "lists.finished", name: "Bar order" } });
  });

  it("reads a list due soon or late, with its due time if it kept it", () => {
    const due = "2026-11-16T07:15:00.000Z";
    for (const kind of ["lists.due", "lists.late", "lists.late_team"]) {
      expect(
        lineOf(row(kind, { list: LINE, name: "Opening", due })),
        kind,
      ).toMatchObject({
        group: "lists",
        href: `/lists/${LINE}`,
        line: { kind, name: "Opening", due },
      });
      expect(
        lineOf(row(kind, { list: LINE, name: "Opening", due: "soon" })),
        kind,
      ).toMatchObject({ line: { kind, due: null } });
    }
    // Late, for its managers, leads to the business's day when it lost the list.
    expect(linkFor("lists.late_team")).toBe("/lists/today");
  });

  it("reads a reading outside its range, with the item's label", () => {
    expect(
      lineOf(
        row("lists.out_of_range", {
          list: LINE,
          name: "Opening",
          item: LINE,
          label: "Fridge",
        }),
        MANAGER,
      ),
    ).toMatchObject({
      href: `/lists/${LINE}`,
      line: {
        kind: "lists.out_of_range",
        name: "Opening",
        label: "Fridge",
        reading: null,
      },
    });
    expect(
      lineOf(row("lists.out_of_range", { list: LINE, name: "Opening" })),
    ).toMatchObject({ line: { label: null, reading: null } });
    // With the reading, its range and its unit, as the database now sends.
    expect(
      lineOf(
        row("lists.out_of_range", {
          list: LINE,
          name: "Opening",
          item: LINE,
          label: "Fridge",
          reading: 7,
          min: 0,
          max: 5,
          unit: "°C",
        }),
        MANAGER,
      ),
    ).toMatchObject({
      line: { reading: { value: 7, min: 0, max: 5, unit: "°C" } },
    });
    expect(
      lineOf(
        row("lists.out_of_range", {
          list: LINE,
          name: "Opening",
          reading: -17,
          min: -25,
          max: -18,
          unit: null,
        }),
      ),
    ).toMatchObject({
      line: { reading: { value: -17, min: -25, max: -18, unit: null } },
    });
  });

  it("reads someone joining", () => {
    expect(
      lineOf(row("team.joined", { person: NOA }, { actorId: NOA }), MANAGER),
    ).toMatchObject({
      actor: { kind: "member", name: "Noa" },
      group: "team",
      line: { kind: "team.joined", person: { kind: "member", name: "Noa" } },
    });
  });

  it("turns what it cannot read into a plain line", () => {
    for (const [kind, params] of [
      ["schedule.published", { startsOn: "soon" }],
      ["swap.offered", { from: "someone" }],
      ["clock.confirm", { person: NOA, proof: "scan" }],
      ["chat.message", { list: GONE }],
      ["lists.sent", { list: GONE }],
      ["team.joined", "not an object"],
    ] as const) {
      const entry = lineOf(row(kind, params));
      expect(entry?.line, kind).toEqual({ kind: "other" });
    }
    expect(lineOf(row("chat.message", {}))).toMatchObject({
      group: null,
      href: "/notifications",
    });
  });

  it("reads pay access given, by whom, leading to the hours for payroll", () => {
    expect(
      lineOf(row("access.pay_granted", {}, { actorId: MANAGER }), NOA),
    ).toMatchObject({
      group: null,
      href: "/clock/pay",
      line: { kind: "access.pay_granted" },
    });
    expect(needsAction("access.pay_granted")).toBe(false);
  });

  it("keeps pay access taken back in the inbox, where the hours are closed", () => {
    expect(
      lineOf(
        row(
          "access.pay_granted",
          {},
          { actorId: MANAGER, resolvedAt: "2026-11-10T09:00:00Z" },
        ),
        NOA,
      ),
    ).toMatchObject({ settled: true, href: "/notifications" });
    expect(linkFor("access.pay_granted", {}, true)).toBe("/notifications");
    expect(linkFor("access.pay_granted", {}, false)).toBe("/clock/pay");
    // Settling leaves other kinds where they lead.
    expect(linkFor("clock.confirm", {}, true)).toBe("/clock/team");
    expect(linkFor("lists.sent", { list: LINE }, true)).toBe(`/lists/${LINE}`);
  });

  it("reads a wage set for the reader, with its day and never an amount", () => {
    expect(
      lineOf(
        row("pay.wage_set", { since: "2026-11-01" }, { actorId: MANAGER }),
      ),
    ).toMatchObject({
      group: null,
      href: "/clock",
      line: { kind: "pay.wage_set", since: "2026-11-01" },
    });
    // A line that lost its day still says the wage changed.
    expect(
      lineOf(row("pay.wage_set", { since: "1.11" }, { actorId: MANAGER })),
    ).toMatchObject({ line: { kind: "pay.wage_set", since: null } });
    expect(needsAction("pay.wage_set")).toBe(false);
    expect(linkFor("pay.wage_set", { since: "2026-11-01" }, true)).toBe(
      "/clock",
    );
  });

  it("reads a closed month corrected since, leading to that month's hours (payroll P9)", () => {
    expect(
      lineOf(
        row("pay.after_close", { month: "2026-10" }, { actorId: MANAGER }),
      ),
    ).toMatchObject({
      group: null,
      href: "/clock/pay?month=2026-10",
      line: { kind: "pay.after_close", month: "2026-10" },
    });
    // Without its month, to the hours for payroll as they open.
    expect(lineOf(row("pay.after_close", { month: "10/2026" }))).toMatchObject({
      href: "/clock/pay",
      line: { kind: "pay.after_close", month: null },
    });
    expect(needsAction("pay.after_close")).toBe(false);
  });

  it("reads last month waiting to be closed, with its counts only", () => {
    expect(
      lineOf(
        row(
          "pay.month_due",
          { month: "2026-10", waiting: 2, open: 1 },
          { actorId: null },
        ),
      ),
    ).toMatchObject({
      group: null,
      href: "/clock/pay?month=2026-10",
      actor: { kind: "unknown" },
      line: { kind: "pay.month_due", month: "2026-10", waiting: 2, open: 1 },
    });
    // Counts it can't read are none.
    expect(
      lineOf(row("pay.month_due", { month: "2026-10", waiting: "two" })),
    ).toMatchObject({
      line: { kind: "pay.month_due", month: "2026-10", waiting: 0, open: 0 },
    });
    // Closing the month settles it, and it still leads to that month.
    expect(linkFor("pay.month_due", { month: "2026-10" }, true)).toBe(
      "/clock/pay?month=2026-10",
    );
    // Nobody switches either off: they are in none of the groups.
    expect(groupsFor("accountant", ["time_clock"])).toEqual([]);
  });

  it("reads the phone switch's test as a line of its own, in no group", () => {
    expect(lineOf(row("push.test", {}, { actorId: null }))).toMatchObject({
      group: null,
      href: "/notifications",
      actor: { kind: "unknown" },
      line: { kind: "push.test" },
    });
    expect(needsAction("push.test")).toBe(false);
    // Nobody switches it off: it is in none of the groups a person sees.
    expect(groupsFor("worker", [])).toEqual([]);
  });

  it("knows a line whose request was handled", () => {
    expect(
      lineOf(
        row(
          "swap.waiting",
          { swap: GONE, shift: SHIFT, from: NOA, to: YOAV },
          {
            readAt: "2026-11-09T11:00:00Z",
            resolvedAt: "2026-11-09T11:00:00Z",
          },
        ),
        MANAGER,
      ),
    ).toMatchObject({ read: true, settled: true });
    expect(lineOf(row("swap.offered", { from: YOAV }))?.settled).toBe(false);
  });

  it("knows read lines and people it can't find", () => {
    expect(
      lineOf(
        row(
          "team.joined",
          { person: GONE },
          { actorId: null, readAt: "2026-11-09T11:00:00Z" },
        ),
        MANAGER,
      ),
    ).toMatchObject({
      read: true,
      actor: { kind: "unknown" },
      line: { person: { kind: "unknown" } },
    });
  });
});

describe("notificationRefs", () => {
  it("lists the people lines name, once, and only real ids", () => {
    expect(
      notificationRefs([
        row("swap.waiting", { from: NOA, to: YOAV, shift: SHIFT }),
        row("swap.taken", { by: NOA.toUpperCase() }, { actorId: null }),
        row("team.joined", { person: "<script>" }),
        row("other.thing", "text"),
      ]).sort(),
    ).toEqual([NOA, YOAV, MANAGER].sort());
  });
});
