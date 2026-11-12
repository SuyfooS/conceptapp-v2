import { describe, expect, it } from "vitest";
import {
  alwaysOnPhone,
  buildInbox,
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEFAULT_QUIET_HOURS,
  groupsFor,
  INBOX_PAGE_SIZE,
  inboxAgo,
  inboxCursor,
  inboxPage,
  inInbox,
  isAppPath,
  isNotificationGroup,
  linkFor,
  NOTIFICATION_GROUPS,
  NOTIFICATION_KIND_KEYS,
  NOTIFICATION_KINDS,
  type NotificationLookups,
  type NotificationRow,
  needsAction,
  notificationChats,
  notificationDocuments,
  notificationGroupOf,
  notificationKindOf,
  notificationPreferenceChange,
  notificationRefs,
  PHONE_ONLY_KINDS,
  parseInboxCursor,
  phoneTime,
  quietEnd,
  REMINDER_RULES,
  reachesPhone,
  readNotificationPreferences,
  SWITCHABLE_GROUPS,
  unreadCounts,
} from "./notifications";
import { MAX_ENTRY_HOURS } from "./time-clock-format";

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
      "availability.due",
      "availability.missing",
      "chat.announcement",
      "clock.confirm",
      "clock.open",
      "clock.overdue",
      "documents.received",
      "documents.to_confirm",
      "lists.late_team",
      "lists.out_of_range",
      "pay.month_due",
      "swap.offered",
      "swap.waiting",
    ]);
    expect(needsAction("something.else")).toBe(false);
  });

  it("give the manager-only kinds to managers", () => {
    for (const kind of [
      "swap.waiting",
      "clock.confirm",
      "team.joined",
      "availability.missing",
      "clock.overdue",
    ]) {
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

  it("leaves out a chat's own lines, which the Chat tab counts", () => {
    const rows = [
      { business_id: "a", kind: "chat.direct" },
      { business_id: "a", kind: "chat.group" },
      { business_id: "a", kind: "chat.announcement" },
      { business_id: "a", kind: "something.new" },
    ];
    // An announcement asks for "קראתי": the bell and Home count it.
    expect(unreadCounts(rows, "a")).toEqual({ all: 2, action: 1 });
  });
});

describe("chat's lines", () => {
  const CHAT = "66666666-6666-4666-8666-666666666666";
  const chatLookups: NotificationLookups = {
    ...lookups,
    chats: new Map([[CHAT, { kind: "department", name: "Kitchen" }]]),
  };

  it("reach the phone only, but for an announcement", () => {
    expect([...PHONE_ONLY_KINDS].sort()).toEqual(["chat.direct", "chat.group"]);
    expect(inInbox("chat.announcement")).toBe(true);
    expect(inInbox("lists.sent")).toBe(true);
    // An unknown kind shows, as a plain line.
    expect(inInbox("chat.message")).toBe(true);
  });

  it("lead to their chat, and only by a real id", () => {
    for (const kind of ["chat.direct", "chat.group", "chat.announcement"]) {
      expect(linkFor(kind, { conversation: CHAT.toUpperCase() })).toBe(
        `/chat/${CHAT}`,
      );
      expect(linkFor(kind, { conversation: "../admin" })).toBe("/chat");
      expect(linkFor(kind)).toBe("/chat");
    }
  });

  it("read who wrote and how many wait, never a word of the messages", () => {
    expect(
      buildInbox(
        [
          row("chat.direct", { conversation: CHAT, from: YOAV, count: 3 }),
          row("chat.group", { conversation: CHAT, from: LEFT, count: 120 }),
          row("chat.announcement", {
            conversation: CHAT,
            message: LINE,
            from: MANAGER,
          }),
        ],
        chatLookups,
        NOA,
      ).map((entry) => [entry.group, entry.href, entry.line]),
    ).toEqual([
      [
        "chat",
        `/chat/${CHAT}`,
        {
          kind: "chat.direct",
          from: { kind: "member", name: "Yoav" },
          count: 3,
        },
      ],
      [
        "chat",
        `/chat/${CHAT}`,
        {
          kind: "chat.group",
          from: { kind: "former" },
          // A count it can't read is one.
          count: 1,
          chat: { kind: "department", name: "Kitchen" },
        },
      ],
      [
        "chat",
        `/chat/${CHAT}`,
        {
          kind: "chat.announcement",
          from: { kind: "member", name: null },
          chat: { kind: "department", name: "Kitchen" },
        },
      ],
    ]);
  });

  it("still read without the group's name, and as a plain line without their chat", () => {
    expect(
      lineOf(row("chat.group", { conversation: CHAT, from: YOAV, count: 2 }))
        ?.line,
    ).toEqual({
      kind: "chat.group",
      from: { kind: "member", name: "Yoav" },
      count: 2,
      chat: null,
    });
    expect(lineOf(row("chat.direct", { from: YOAV }))?.line).toEqual({
      kind: "other",
    });
  });

  it("name the groups to look up, and only by a real id", () => {
    expect(
      notificationChats([
        row("chat.group", { conversation: CHAT.toUpperCase() }),
        row("chat.announcement", { conversation: CHAT }),
        row("chat.direct", { conversation: LINE }),
        row("chat.group", { conversation: "../admin" }),
      ]),
    ).toEqual([CHAT]);
  });

  it("reach the staff only: an accountant is in no chat, only in documents", () => {
    expect(groupsFor("worker", ["chat"])).toEqual(["chat", "documents"]);
    expect(groupsFor("accountant", ["chat"])).toEqual(["documents"]);
    expect(groupsFor("worker", [])).toEqual([]);
  });
});

describe("documents' lines", () => {
  const DOC = "77777777-7777-4777-8777-777777777777";
  const KINDS = [
    "documents.received",
    "documents.sent",
    "documents.to_confirm",
  ] as const;
  const withCategories: NotificationLookups = {
    ...lookups,
    documents: new Map([[DOC, "sick_note"]]),
  };

  it("are in the inbox and the bell, and ask for action when the reader has to act", () => {
    for (const kind of KINDS) {
      expect(inInbox(kind), kind).toBe(true);
      expect(NOTIFICATION_KINDS[kind].group, kind).toBe("documents");
    }
    expect(needsAction("documents.received")).toBe(true);
    expect(needsAction("documents.to_confirm")).toBe(true);
    expect(needsAction("documents.sent")).toBe(false);
  });

  it("lead to their document, and only by a real id", () => {
    for (const kind of KINDS) {
      expect(linkFor(kind, { document: DOC.toUpperCase() })).toBe(
        `/chat/documents/${DOC}`,
      );
      expect(linkFor(kind, { document: "../admin" })).toBe("/chat/documents");
      expect(linkFor(kind)).toBe("/chat/documents");
    }
  });

  it("lead a settled one to the inbox when the office's access may have gone", () => {
    expect(linkFor("documents.received", { document: DOC }, true)).toBe(
      "/notifications",
    );
    // A recipient's line settles when they opened or confirmed it.
    expect(linkFor("documents.to_confirm", { document: DOC }, true)).toBe(
      `/chat/documents/${DOC}`,
    );
  });

  it("read who sent it, and its category only from the document itself", () => {
    const params = { document: DOC, from: NOA, category: "payslip" };
    expect(
      buildInbox(
        KINDS.map((kind) => row(kind, params)),
        withCategories,
        YOAV,
      ).map((entry) => [entry.group, entry.href, entry.line]),
    ).toEqual(
      KINDS.map((kind) => [
        "documents",
        `/chat/documents/${DOC}`,
        // What params say of a category is never read: the document's is.
        {
          kind,
          from: { kind: "member", name: "Noa" },
          category: "sick_note",
        },
      ]),
    );
  });

  it("say nothing of a category the reader can't read, and read without who sent it", () => {
    expect(
      lineOf(row("documents.received", { document: DOC, from: LEFT }))?.line,
    ).toEqual({
      kind: "documents.received",
      from: { kind: "former" },
      category: null,
    });
    expect(
      buildInbox(
        [row("documents.sent", { document: DOC })],
        {
          ...lookups,
          documents: new Map([[DOC, "medical" as never]]),
        },
        NOA,
      )[0]?.line,
    ).toEqual({
      kind: "documents.sent",
      from: { kind: "unknown" },
      category: null,
    });
    expect(lineOf(row("documents.sent", { from: NOA }))?.line).toEqual({
      kind: "other",
    });
  });

  it("name the documents to look up, and only by a real id", () => {
    expect(
      notificationDocuments([
        row("documents.received", { document: DOC.toUpperCase() }),
        row("documents.sent", { document: DOC }),
        row("documents.to_confirm", { document: "../admin" }),
        row("lists.sent", { document: LINE }),
      ]),
    ).toEqual([DOC]);
  });

  it("reach the office and the staff: an accountant gets a document to the business", () => {
    expect(groupsFor("accountant", ["chat"])).toContain("documents");
    expect(NOTIFICATION_KINDS["documents.received"]).not.toHaveProperty(
      "staffOnly",
    );
    expect(NOTIFICATION_KINDS["documents.sent"].staffOnly).toBe(true);
  });
});

describe("the reminders' lines", () => {
  const DUE = "2026-11-25T16:00:00+00:00";

  it("lead to what they ask for", () => {
    expect(linkFor("availability.due")).toBe("/schedule/availability");
    expect(linkFor("availability.missing")).toBe("/schedule/availability/team");
    expect(linkFor("clock.open", { entry: LINE })).toBe("/clock");
    // An overdue entry opens its person's hours, by a real id only.
    expect(linkFor("clock.overdue", { entry: LINE, person: NOA })).toBe(
      `/clock/team/${NOA}`,
    );
    expect(linkFor("clock.overdue", { person: NOA.toUpperCase() }, true)).toBe(
      `/clock/team/${NOA}`,
    );
    for (const params of [{ person: "../pay" }, { person: 7 }, null]) {
      expect(linkFor("clock.overdue", params), String(params)).toBe(
        "/clock/team",
      );
    }
  });

  it("are in the groups the settings screen shows", () => {
    expect(notificationGroupOf("availability.due")).toBe("schedule");
    expect(notificationGroupOf("availability.missing")).toBe("approvals");
    expect(notificationGroupOf("clock.open")).toBe("clock");
    expect(notificationGroupOf("clock.overdue")).toBe("approvals");
    expect(NOTIFICATION_GROUPS.indexOf("clock")).toBe(
      NOTIFICATION_GROUPS.indexOf("swaps") + 1,
    );
  });

  it("are from the app, which wrote them, not from someone on the team", () => {
    // The desktop inbox's "who" says so: nobody on the team sent a reminder.
    for (const kind of [
      "availability.due",
      "availability.missing",
      "clock.open",
      "clock.overdue",
      "lists.due",
      "lists.late",
      "lists.late_team",
      "pay.month_due",
      "push.test",
    ]) {
      expect(lineOf(row(kind, {}, { actorId: null }))?.actor, kind).toEqual({
        kind: "app",
      });
    }
    // A line of what someone did, whose account is gone, still says nobody
    // knows who; and one the app wrote for what someone did names them.
    expect(
      lineOf(row("swap.offered", { from: NOA }, { actorId: null }))?.actor,
    ).toEqual({ kind: "unknown" });
    expect(lineOf(row("lists.due", {}))?.actor.kind).toBe("member");
  });

  it("read next week's availability reminder", () => {
    expect(
      lineOf(
        row(
          "availability.due",
          { startsOn: "2026-11-29", dueAt: DUE },
          { actorId: null },
        ),
      ),
    ).toMatchObject({
      actor: { kind: "app" },
      group: "schedule",
      href: "/schedule/availability",
      line: { kind: "availability.due", startsOn: "2026-11-29", dueAt: DUE },
    });
    // Without its due moment it still reads; without its week it doesn't.
    expect(
      lineOf(row("availability.due", { startsOn: "2026-11-29", dueAt: 7 }))
        ?.line,
    ).toEqual({
      kind: "availability.due",
      startsOn: "2026-11-29",
      dueAt: null,
    });
    expect(lineOf(row("availability.due", { dueAt: DUE }))?.line).toEqual({
      kind: "other",
    });
  });

  it("read how many haven't sent theirs, a count and never who", () => {
    expect(
      lineOf(
        row("availability.missing", {
          startsOn: "2026-11-29",
          dueAt: DUE,
          missing: 3,
        }),
        MANAGER,
      )?.line,
    ).toEqual({
      kind: "availability.missing",
      startsOn: "2026-11-29",
      dueAt: DUE,
      missing: 3,
    });
    expect(
      lineOf(
        row("availability.missing", { startsOn: "2026-11-29", missing: -1 }),
        MANAGER,
      )?.line,
    ).toMatchObject({ missing: 0, dueAt: null });
  });

  it("read a reminder to clock out, with the shift or without one", () => {
    const since = "2026-11-25T05:55:00+00:00";
    const shiftEnd = "2026-11-25T14:00:00+00:00";
    expect(
      lineOf(row("clock.open", { entry: LINE, since, shiftEnd }))?.line,
    ).toEqual({ kind: "clock.open", since, shiftEnd });
    expect(
      lineOf(row("clock.open", { entry: LINE, since, shiftEnd: null }))?.line,
    ).toEqual({ kind: "clock.open", since, shiftEnd: null });
    // Still a reminder when the line lost its times.
    expect(lineOf(row("clock.open", "not an object"))?.line).toEqual({
      kind: "clock.open",
      since: null,
      shiftEnd: null,
    });
  });

  it("read an overdue entry, and say when it is the reader's own", () => {
    const since = "2026-11-24T10:00:00+00:00";
    const overdue = row("clock.overdue", { entry: LINE, person: NOA, since });
    expect(lineOf(overdue, MANAGER)).toMatchObject({
      group: "approvals",
      href: `/clock/team/${NOA}`,
      line: {
        kind: "clock.overdue",
        person: { kind: "member", name: "Noa" },
        since,
        mine: false,
      },
    });
    expect(lineOf(overdue, NOA)?.line).toMatchObject({ mine: true });
    expect(lineOf(row("clock.overdue", { since }))?.line).toEqual({
      kind: "other",
    });
  });

  it("ask the reader to act, the Home tab counts them", () => {
    expect(
      unreadCounts(
        [
          { business_id: LINE, kind: "availability.due" },
          { business_id: LINE, kind: "clock.open" },
          { business_id: LINE, kind: "schedule.published" },
        ],
        LINE,
      ),
    ).toEqual({ all: 3, action: 2 });
  });

  it("keep their own times, a reminder to clock out lasting as long as an entry", () => {
    expect(REMINDER_RULES).toEqual({
      missingForHours: 6,
      openWithoutShiftHours: 12,
      openForHours: MAX_ENTRY_HOURS,
      earliestAt: "08:00",
    });
    expect(MAX_ENTRY_HOURS).toBe(24);
  });
});

describe("groupsFor", () => {
  it("gives a worker the schedule, swaps and the clock", () => {
    expect(groupsFor("worker", ["scheduling", "time_clock"])).toEqual([
      "schedule",
      "swaps",
      "clock",
    ]);
  });

  it("gives a manager approvals and the team too", () => {
    expect(groupsFor("manager", ["scheduling", "time_clock"])).toEqual([
      "schedule",
      "swaps",
      "clock",
      "approvals",
      "team",
    ]);
  });

  it("follows the modules that are on", () => {
    expect(groupsFor("owner", ["time_clock"])).toEqual([
      "clock",
      "approvals",
      "team",
    ]);
    expect(groupsFor("worker", ["time_clock"])).toEqual(["clock"]);
    expect(groupsFor("worker", [])).toEqual([]);
  });

  it("gives someone off the staff no reminder to clock out", () => {
    expect(groupsFor("accountant", ["scheduling", "time_clock"])).not.toContain(
      "clock",
    );
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

  it("reads a list passed to the reader's department, with its name and whether a note came", () => {
    expect(
      lineOf(
        row(
          "lists.passed",
          {
            list: LINE,
            name: "Bar order",
            department: GONE,
            fromDepartment: GONE,
            departmentName: "Bar",
            hasNote: true,
          },
          { actorId: MANAGER },
        ),
      ),
    ).toMatchObject({
      group: "lists",
      href: `/lists/${LINE}`,
      line: {
        kind: "lists.passed",
        name: "Bar order",
        department: "Bar",
        hasNote: true,
      },
    });
    // A line that lost the department's name still reads, with no note.
    expect(
      lineOf(row("lists.passed", { list: LINE, name: "Bar order" })),
    ).toMatchObject({
      line: { kind: "lists.passed", department: null, hasNote: false },
    });
    expect(needsAction("lists.passed")).toBe(false);
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
      actor: { kind: "app" },
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
      actor: { kind: "app" },
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

describe("inboxAgo", () => {
  const now = new Date("2026-11-12T10:00:00Z");
  const agoBy = (ms: number) => inboxAgo(new Date(now.getTime() - ms), now);
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;

  it("says now under a minute, and for a clock a little ahead", () => {
    expect(agoBy(0)).toEqual({ unit: "now" });
    expect(agoBy(59_999)).toEqual({ unit: "now" });
    expect(agoBy(-5_000)).toEqual({ unit: "now" });
  });

  it("counts whole minutes, hours and days, rounded down", () => {
    expect(agoBy(min)).toEqual({ unit: "minutes", count: 1 });
    expect(agoBy(59 * min + 59_000)).toEqual({ unit: "minutes", count: 59 });
    expect(agoBy(hour)).toEqual({ unit: "hours", count: 1 });
    expect(agoBy(2 * hour - 1)).toEqual({ unit: "hours", count: 1 });
    expect(agoBy(23 * hour + 59 * min)).toEqual({ unit: "hours", count: 23 });
    expect(agoBy(day)).toEqual({ unit: "days", count: 1 });
    expect(agoBy(2 * day)).toEqual({ unit: "days", count: 2 });
    expect(agoBy(7 * day - 1)).toEqual({ unit: "days", count: 6 });
  });

  it("gives way to the date from a week on, or for a time it can't read", () => {
    expect(agoBy(7 * day)).toBeNull();
    expect(agoBy(400 * day)).toBeNull();
    expect(inboxAgo(new Date("not a time"), now)).toBeNull();
  });
});

describe("each person's choices", () => {
  const ZONE = "Asia/Jerusalem";
  const at = (instant: string) => new Date(instant);
  const iso = (date: Date | null) => date?.toISOString() ?? null;
  const night = { from: "22:00", to: "07:00" };

  it("puts every kind in the group the database does, or in none", () => {
    expect(notificationGroupOf("swap.offered")).toBe("swaps");
    expect(notificationGroupOf("clock.confirm")).toBe("approvals");
    expect(notificationGroupOf("chat.direct")).toBe("chat");
    expect(notificationGroupOf("documents.to_confirm")).toBe("documents");
    expect(notificationGroupOf("push.test")).toBeNull();
    expect(notificationGroupOf("pay.month_due")).toBeNull();
    expect(notificationGroupOf("weather.rain")).toBeNull();
    for (const kind of NOTIFICATION_KIND_KEYS) {
      const group = notificationGroupOf(kind);
      expect(group === null || SWITCHABLE_GROUPS.includes(group), kind).toBe(
        true,
      );
    }
  });

  it("says which lines reach the phone whatever is switched off: pay's alone", () => {
    expect(alwaysOnPhone("worker", ["time_clock"])).toEqual([
      "access.pay_granted",
      "pay.wage_set",
      "pay.after_close",
      "pay.month_due",
    ]);
    expect(alwaysOnPhone("accountant", ["time_clock"])).toContain(
      "pay.after_close",
    );
    // With the time clock off, nothing about pay comes; the test never counts.
    expect(alwaysOnPhone("owner", ["scheduling", "chat"])).toEqual([]);
    // The settings say "pay always comes": a line in no group that isn't
    // about pay needs its own words there first.
    for (const kind of NOTIFICATION_KIND_KEYS) {
      if (kind === "push.test" || notificationGroupOf(kind) !== null) continue;
      expect(
        kind.startsWith("pay.") || kind === "access.pay_granted",
        kind,
      ).toBe(true);
    }
  });

  it("lets every group be kept off the phone, those that ask to act too", () => {
    expect([...SWITCHABLE_GROUPS]).toEqual([...NOTIFICATION_GROUPS]);
    expect(isNotificationGroup("approvals")).toBe(true);
    expect(isNotificationGroup("weather")).toBe(false);
  });

  it("starts with every group on, no quiet hours and the line on the lock screen", () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES).toEqual({
      pushOff: [],
      quiet: null,
      timeZone: ZONE,
      previews: true,
      askedAt: null,
    });
    expect(DEFAULT_QUIET_HOURS).toEqual(night);
  });

  it("reads stored choices leniently", () => {
    expect(
      readNotificationPreferences({
        pushOff: ["chat", "weather", "swaps"],
        quietFrom: "22:00:00",
        quietTo: "07:00:00",
        timeZone: ZONE,
        previews: false,
        askedAt: "2026-11-12T08:00:00+00:00",
      }),
    ).toEqual({
      pushOff: ["swaps", "chat"],
      quiet: night,
      timeZone: ZONE,
      previews: false,
      askedAt: "2026-11-12T08:00:00+00:00",
    });
    expect(
      readNotificationPreferences({
        pushOff: "chat",
        quietFrom: "22:00:00",
        quietTo: null,
        timeZone: "",
        previews: null,
        askedAt: "soon",
      }),
    ).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it("keeps a group off the phone, never a line with none", () => {
    const choices = { pushOff: ["swaps" as const, "chat" as const] };
    expect(reachesPhone("swap.offered", choices)).toBe(false);
    expect(reachesPhone("chat.group", choices)).toBe(false);
    expect(reachesPhone("swap.waiting", choices)).toBe(true);
    expect(reachesPhone("pay.month_due", choices)).toBe(true);
    expect(reachesPhone("push.test", choices)).toBe(true);
  });

  it("holds a line in quiet hours until they end, across midnight", () => {
    // Israel in November is two hours ahead of UTC.
    expect(iso(quietEnd(night, ZONE, at("2026-11-20T21:00:00Z")))).toBe(
      "2026-11-21T05:00:00.000Z",
    );
    expect(iso(quietEnd(night, ZONE, at("2026-11-21T01:30:00Z")))).toBe(
      "2026-11-21T05:00:00.000Z",
    );
    expect(iso(quietEnd(night, ZONE, at("2026-11-20T20:00:00Z")))).toBe(
      "2026-11-21T05:00:00.000Z",
    );
    expect(quietEnd(night, ZONE, at("2026-11-20T19:59:59Z"))).toBeNull();
    expect(quietEnd(night, ZONE, at("2026-11-21T05:00:00Z"))).toBeNull();
    expect(quietEnd(night, ZONE, at("2026-11-20T10:00:00Z"))).toBeNull();
    expect(quietEnd(null, ZONE, at("2026-11-20T21:00:00Z"))).toBeNull();
  });

  it("ends them on the clock of the day they end, across the clock changes", () => {
    // Back on 25 October 2026 at 02:00, forward on 26 March 2027 at 02:00.
    expect(iso(quietEnd(night, ZONE, at("2026-10-24T20:00:00Z")))).toBe(
      "2026-10-25T05:00:00.000Z",
    );
    expect(iso(quietEnd(night, ZONE, at("2026-10-24T23:30:00Z")))).toBe(
      "2026-10-25T05:00:00.000Z",
    );
    expect(iso(quietEnd(night, ZONE, at("2027-03-25T21:00:00Z")))).toBe(
      "2027-03-26T04:00:00.000Z",
    );
    expect(iso(quietEnd(night, ZONE, at("2027-03-26T01:30:00Z")))).toBe(
      "2027-03-26T04:00:00.000Z",
    );
  });

  it("holds within a day too", () => {
    const noon = { from: "13:00", to: "15:00" };
    expect(iso(quietEnd(noon, ZONE, at("2026-11-20T11:30:00Z")))).toBe(
      "2026-11-20T13:00:00.000Z",
    );
    expect(quietEnd(noon, ZONE, at("2026-11-20T13:30:00Z"))).toBeNull();
    expect(quietEnd(noon, ZONE, at("2026-11-20T21:00:00Z"))).toBeNull();
  });

  it("says when a line goes to the phone, and never holds the test", () => {
    const choices = {
      pushOff: ["swaps" as const],
      quiet: night,
      timeZone: ZONE,
    };
    const late = at("2026-11-20T21:00:00Z");
    expect(phoneTime("swap.offered", choices, late)).toBeNull();
    expect(iso(phoneTime("schedule.published", choices, late))).toBe(
      "2026-11-21T05:00:00.000Z",
    );
    expect(phoneTime("push.test", choices, late)).toEqual(late);
    const noon = at("2026-11-20T10:00:00Z");
    expect(phoneTime("schedule.published", choices, noon)).toEqual(noon);
  });

  it("takes one change at a time from the settings screen", () => {
    const ok = (change: unknown) =>
      notificationPreferenceChange.safeParse(change).success;
    expect(ok({ kind: "group", group: "chat", on: false })).toBe(true);
    expect(ok({ kind: "quiet", hours: { from: "22:00", to: "07:00" } })).toBe(
      true,
    );
    expect(ok({ kind: "quiet", hours: null })).toBe(true);
    expect(ok({ kind: "previews", on: false })).toBe(true);
    expect(ok({ kind: "group", group: "weather", on: false })).toBe(false);
    expect(ok({ kind: "quiet", hours: { from: "07:00", to: "07:00" } })).toBe(
      false,
    );
    expect(ok({ kind: "quiet", hours: { from: "7:00", to: "22:00" } })).toBe(
      false,
    );
    expect(ok({ kind: "quiet" })).toBe(false);
    expect(ok({ kind: "everything", on: false })).toBe(false);
  });
});
