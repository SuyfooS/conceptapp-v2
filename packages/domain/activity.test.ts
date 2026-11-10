import { describe, expect, it } from "vitest";
import {
  type ActivityLookups,
  type ActivityRow,
  activityByDay,
  activityRefs,
  breakFitKind,
  buildActivity,
  parseActivityCursor,
} from "./activity";
import { dateIn } from "./availability";

const NOA = "11111111-1111-4111-8111-111111111111";
const YOAV = "22222222-2222-4222-8222-222222222222";
const LEFT = "33333333-3333-4333-8333-333333333333";
const NAMELESS = "44444444-4444-4444-8444-444444444444";
const STAFF = "55555555-5555-4555-8555-555555555555";
const INVITE = "66666666-6666-4666-8666-666666666666";
const SHIFT = "77777777-7777-4777-8777-777777777777";
const SWAP = "88888888-8888-4888-8888-888888888888";
const GONE = "99999999-9999-4999-8999-999999999999";
const KITCHEN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LIST = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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
  departments: new Map([[KITCHEN, "Kitchen"]]),
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

  it("reads a sentence replaced for the business, and one brought back", () => {
    expect(
      lineOf(
        row("wording.change", {
          key: "app.team.title",
          from: null,
          to: "הצוות של החנות",
        }),
      ),
    ).toEqual({ action: "wording.change", from: null, to: "הצוות של החנות" });
    expect(
      lineOf(
        row("wording.change", {
          key: "app.team.title",
          from: "הצוות של החנות",
          to: null,
        }),
      ),
    ).toEqual({ action: "wording.change", from: "הצוות של החנות", to: null });
    expect(lineOf(row("wording.change", { from: "x" }))).toEqual({
      action: "other",
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
      note: null,
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
      note: null,
    });
  });

  it("reads why hours were added or corrected", () => {
    const times = {
      from: { clock_in: "2026-11-03T14:00:00+00:00", clock_out: null },
      to: {
        clock_in: "2026-11-03T14:00:00+00:00",
        clock_out: "2026-11-03T21:30:00+00:00",
      },
    };
    expect(
      lineOf(
        row("clock.correct", {
          entry: GONE,
          person: NOA,
          ...times,
          note: " Forgot to clock out ",
        }),
      ),
    ).toMatchObject({ action: "clock.correct", note: "Forgot to clock out" });
    expect(
      lineOf(
        row("clock.add", {
          entry: GONE,
          person: NOA,
          clock_in: "2026-11-03T06:00:00+00:00",
          clock_out: "2026-11-03T14:00:00+00:00",
          note: "Forgot to punch",
        }),
      ),
    ).toMatchObject({ action: "clock.add", note: "Forgot to punch" });
    // A reason that isn't text is left out, never the line.
    for (const note of [5, "  ", null]) {
      expect(
        lineOf(
          row("clock.correct", { entry: GONE, person: NOA, ...times, note }),
        ),
      ).toMatchObject({ action: "clock.correct", note: null });
    }
  });

  it("reads the breaks a correction cut or removed", () => {
    expect(
      lineOf(
        row(
          "clock.break_fit",
          {
            entry: GONE,
            person: NOA,
            breaks: [
              {
                break: GONE,
                from: {
                  start: "2026-11-05T12:00:00+00:00",
                  end: "2026-11-05T12:45:00+00:00",
                },
                to: {
                  start: "2026-11-05T12:00:00+00:00",
                  end: "2026-11-05T12:30:00+00:00",
                },
              },
              {
                break: GONE,
                from: { start: "2026-11-05T13:30:00+00:00", end: null },
                to: null,
              },
            ],
          },
          YOAV,
        ),
      ),
    ).toEqual({
      action: "clock.break_fit",
      person: { kind: "member", name: "Noa" },
      // A row from before the shift's start was logged.
      clockIn: null,
      breaks: [
        {
          from: {
            clockIn: "2026-11-05T12:00:00+00:00",
            clockOut: "2026-11-05T12:45:00+00:00",
          },
          to: {
            clockIn: "2026-11-05T12:00:00+00:00",
            clockOut: "2026-11-05T12:30:00+00:00",
          },
        },
        {
          from: { clockIn: "2026-11-05T13:30:00+00:00", clockOut: null },
          to: null,
        },
      ],
    });
    for (const details of [
      { entry: GONE, person: NOA, breaks: [] },
      { entry: GONE, person: NOA },
      { person: NOA, breaks: [{ from: { start: "x", end: null }, to: null }] },
    ]) {
      expect(lineOf(row("clock.break_fit", details))).toEqual({
        action: "other",
      });
    }
  });

  it("names a night shift's break fit by the day the shift starts", () => {
    // In at 22:00 on 3 November (Israel), the break cut after midnight.
    const line = lineOf(
      row("clock.break_fit", {
        entry: GONE,
        person: NOA,
        clock_in: "2026-11-03T20:00:00+00:00",
        breaks: [
          {
            break: GONE,
            from: {
              start: "2026-11-03T23:30:00+00:00",
              end: "2026-11-04T00:15:00+00:00",
            },
            to: {
              start: "2026-11-03T23:30:00+00:00",
              end: "2026-11-04T00:00:00+00:00",
            },
          },
        ],
      }),
    );
    expect(line).toMatchObject({
      action: "clock.break_fit",
      clockIn: "2026-11-03T20:00:00+00:00",
    });
    if (line?.action !== "clock.break_fit" || line.clockIn === null) {
      throw new Error("expected a break fit with the shift's start");
    }
    expect(dateIn(new Date(line.clockIn), "Asia/Jerusalem")).toBe("2026-11-03");
    expect(
      dateIn(new Date(line.breaks[0].from.clockIn), "Asia/Jerusalem"),
    ).toBe("2026-11-04");
    // A start that isn't a time is no line at all.
    expect(
      lineOf(
        row("clock.break_fit", {
          entry: GONE,
          person: NOA,
          clock_in: "x",
          breaks: [
            {
              from: { start: "2026-11-03T23:30:00+00:00", end: null },
              to: null,
            },
          ],
        }),
      ),
    ).toEqual({ action: "other" });
  });

  it("says what a correction did to the breaks", () => {
    const at = (time: string) => `2026-11-05T${time}:00+00:00`;
    const closed = { clockIn: at("12:00"), clockOut: at("12:45") };
    const open = { clockIn: at("12:00"), clockOut: null };
    const cut = { from: closed, to: { ...closed, clockOut: at("12:30") } };
    const removed = { from: closed, to: null };
    const ended = { from: open, to: { ...open, clockOut: at("12:30") } };
    // An open break whose start moved stays open: it was cut, not ended.
    const startMoved = { from: open, to: { ...open, clockIn: at("12:10") } };
    expect(breakFitKind([cut])).toBe("cut");
    expect(breakFitKind([cut, startMoved])).toBe("cut");
    expect(breakFitKind([removed, removed])).toBe("removed");
    expect(breakFitKind([ended])).toBe("ended");
    // An open break that went is removed, as any other.
    expect(breakFitKind([{ from: open, to: null }])).toBe("removed");
    expect(breakFitKind([cut, removed])).toBe("other");
    expect(breakFitKind([ended, cut])).toBe("other");
    expect(breakFitKind([])).toBe("other");
  });

  it("reads an approval of someone's hours", () => {
    expect(
      lineOf(row("clock.confirm", { entry: GONE, person: NOA }, YOAV)),
    ).toEqual({
      action: "clock.confirm",
      person: { kind: "member", name: "Noa" },
    });
    expect(lineOf(row("clock.confirm", { entry: GONE, person: LEFT }))).toEqual(
      { action: "clock.confirm", person: { kind: "former" } },
    );
    for (const details of [{ entry: GONE }, { person: 5 }, "x", null]) {
      expect(lineOf(row("clock.confirm", details))).toEqual({
        action: "other",
      });
    }
  });

  it("reads a cleared line about someone, which never holds its text", () => {
    expect(lineOf(row("profile.bio_cleared", { person: NOA }, YOAV))).toEqual({
      action: "profile.bio_cleared",
      person: { kind: "member", name: "Noa" },
    });
    expect(lineOf(row("profile.bio_cleared", { person: LEFT }))).toEqual({
      action: "profile.bio_cleared",
      person: { kind: "former" },
    });
    expect(lineOf(row("profile.bio_cleared", { person: GONE }))).toEqual({
      action: "profile.bio_cleared",
      person: { kind: "unknown" },
    });
    for (const details of [{}, { person: 5 }, "x", null]) {
      expect(lineOf(row("profile.bio_cleared", details))).toEqual({
        action: "other",
      });
    }
  });

  it("reads a typing block", () => {
    expect(lineOf(row("clock.code.locked", { person: NOA }))).toEqual({
      action: "clock.code.locked",
    });
    expect(lineOf(row("clock.code.locked", {}))).toEqual({
      action: "clock.code.locked",
    });
    for (const details of [{ person: 5 }, "x", null]) {
      expect(lineOf(row("clock.code.locked", details))).toEqual({
        action: "other",
      });
    }
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

  it("reads the departments added, removed, renamed or put in order", () => {
    const kitchen = { key: "kitchen", name: "Kitchen" };
    const bar = { key: "bar", name: "Bar" };
    expect(
      lineOf(
        row("departments.change", {
          from: [kitchen, bar],
          to: [
            { key: "kitchen", name: "Cold kitchen" },
            { key: "d-1", name: "Storeroom" },
          ],
        }),
      ),
    ).toEqual({
      action: "departments.change",
      added: ["Storeroom"],
      removed: ["Bar"],
      renamed: [{ from: "Kitchen", to: "Cold kitchen" }],
      reordered: false,
    });
    expect(
      lineOf(
        row("departments.change", { from: [kitchen, bar], to: [bar, kitchen] }),
      ),
    ).toEqual({
      action: "departments.change",
      added: [],
      removed: [],
      renamed: [],
      reordered: true,
    });
  });

  it("reads who joined or left a department", () => {
    expect(
      lineOf(
        row("departments.members", {
          department: KITCHEN,
          added: [YOAV],
          removed: [LEFT],
        }),
      ),
    ).toEqual({
      action: "departments.members",
      department: "Kitchen",
      added: [{ kind: "member", name: "Yoav" }],
      removed: [{ kind: "former" }],
    });
    expect(
      lineOf(row("departments.members", { department: GONE, added: [NOA] })),
    ).toEqual({
      action: "departments.members",
      department: null,
      added: [{ kind: "member", name: "Noa" }],
      removed: [],
    });
  });

  it("reads lists sent, finished, cancelled and opened again", () => {
    expect(
      lineOf(
        row("lists.send", {
          list: LIST,
          name: "Opening",
          recipient: { kind: "department", id: KITCHEN },
        }),
      ),
    ).toEqual({
      action: "lists.send",
      name: "Opening",
      to: { kind: "department", name: "Kitchen" },
    });
    expect(
      lineOf(
        row("lists.send", {
          list: LIST,
          name: "Opening",
          recipient: { kind: "person", id: YOAV },
        }),
      ),
    ).toEqual({
      action: "lists.send",
      name: "Opening",
      to: { kind: "person", person: { kind: "member", name: "Yoav" } },
    });
    expect(
      lineOf(
        row("lists.send", {
          name: "Closing",
          recipient: { kind: "role", role: "worker" },
        }),
      ),
    ).toEqual({
      action: "lists.send",
      name: "Closing",
      to: { kind: "role", role: "worker" },
    });
    expect(
      lineOf(
        row("lists.finish", {
          list: LIST,
          name: "Opening",
          late: true,
          left_optional: 1,
        }),
      ),
    ).toEqual({
      action: "lists.finish",
      name: "Opening",
      late: true,
      leftOptional: 1,
    });
    expect(
      lineOf(row("lists.cancel", { list: LIST, name: "Opening" })),
    ).toEqual({ action: "lists.cancel", name: "Opening" });
    expect(
      lineOf(
        row("lists.reopen", { list: LIST, name: "Opening", was: "finished" }),
      ),
    ).toEqual({ action: "lists.reopen", name: "Opening", was: "finished" });
    expect(
      lineOf(row("lists.reopen", { list: LIST, name: "Opening", was: "open" })),
    ).toEqual({ action: "lists.reopen", name: "Opening", was: null });
  });

  it("reads a template saved, removed and brought back", () => {
    expect(
      lineOf(
        row("lists.template.save", {
          template: LIST,
          name: "Weekly cleaning",
          created: true,
          items: 3,
          schedules: 0,
        }),
      ),
    ).toEqual({
      action: "lists.template.save",
      name: "Weekly cleaning",
      created: true,
    });
    expect(
      lineOf(row("lists.template.archive", { template: LIST, name: "Old" })),
    ).toEqual({ action: "lists.template.archive", name: "Old" });
    expect(
      lineOf(row("lists.template.restore", { template: LIST, name: "Old" })),
    ).toEqual({ action: "lists.template.restore", name: "Old" });
  });

  it("reads pay access given and taken back, to a role or a person", () => {
    expect(
      lineOf(
        row("permission.grant", { role: "manager", perm: "clock.payroll" }),
      ),
    ).toEqual({
      action: "permission.grant",
      perm: "clock.payroll",
      to: { kind: "role", role: "manager" },
    });
    expect(
      lineOf(row("permission.revoke", { person: YOAV, perm: "clock.payroll" })),
    ).toEqual({
      action: "permission.revoke",
      perm: "clock.payroll",
      to: { kind: "person", person: { kind: "member", name: "Yoav" } },
    });
    expect(
      lineOf(row("permission.grant", { role: "boss", perm: "clock.payroll" })),
    ).toEqual({
      action: "permission.grant",
      perm: "clock.payroll",
      to: { kind: "role", role: null },
    });
    expect(lineOf(row("permission.grant", { perm: "clock.payroll" }))).toEqual({
      action: "other",
    });
  });

  it("reads a wage set from a day, with what it was and the minimum then", () => {
    expect(
      lineOf(
        row("wage.set", {
          person: YOAV,
          wage: SHIFT,
          from_agorot: 3600,
          to_agorot: 3800,
          effective_from: "2026-11-01",
          minimum_agorot: 3540,
          note: " A raise ",
        }),
      ),
    ).toEqual({
      action: "wage.set",
      person: { kind: "member", name: "Yoav" },
      agorot: 3800,
      previous: 3600,
      from: "2026-11-01",
      minimum: 3540,
      note: "A raise",
    });
    expect(
      lineOf(
        row("wage.set", {
          person: LEFT,
          from_agorot: null,
          to_agorot: 3000,
          effective_from: "2026-10-01",
          note: null,
        }),
      ),
    ).toEqual({
      action: "wage.set",
      person: { kind: "former" },
      agorot: 3000,
      previous: null,
      from: "2026-10-01",
      minimum: null,
      note: null,
    });
    for (const details of [
      { person: YOAV, to_agorot: 0, effective_from: "2026-11-01" },
      { person: YOAV, to_agorot: 38.5, effective_from: "2026-11-01" },
      { person: YOAV, to_agorot: 3800, effective_from: "1.11.2026" },
      { to_agorot: 3800, effective_from: "2026-11-01" },
    ]) {
      expect(lineOf(row("wage.set", details))).toEqual({ action: "other" });
    }
  });

  it("reads which payroll details changed, in their order, never a value", () => {
    expect(
      lineOf(
        row("payroll.details", {
          person: YOAV,
          fields: ["youth_until", "payroll_number", "salary"],
        }),
      ),
    ).toEqual({
      action: "payroll.details",
      person: { kind: "member", name: "Yoav" },
      fields: ["payroll_number", "youth_until"],
    });
    expect(lineOf(row("payroll.details", { person: YOAV }))).toEqual({
      action: "other",
    });
  });

  it("reads a period of work added, changed or checked", () => {
    expect(
      lineOf(
        row("payroll.period", {
          person: LEFT,
          period: SHIFT,
          added: true,
          confirmed: false,
          fields: ["started_on", "ended_on", "last_paid_on"],
        }),
      ),
    ).toEqual({
      action: "payroll.period",
      person: { kind: "former" },
      added: true,
      confirmed: false,
      fields: ["started_on", "ended_on", "last_paid_on"],
    });
    expect(
      lineOf(
        row("payroll.period", {
          person: YOAV,
          period: SHIFT,
          added: false,
          confirmed: true,
          fields: [],
        }),
      ),
    ).toEqual({
      action: "payroll.period",
      person: { kind: "member", name: "Yoav" },
      added: false,
      confirmed: true,
      fields: [],
    });
  });

  it("reads a file for payroll taken: its month, and how many people and shifts", () => {
    expect(
      lineOf(
        row("payroll.export", {
          month: "2026-10",
          format: "xlsx",
          people: 4,
          shifts: 120,
          ids: false,
          engine: "2026-11",
        }),
      ),
    ).toEqual({
      action: "payroll.export",
      month: "2026-10",
      people: 4,
      shifts: 120,
    });
    expect(lineOf(row("payroll.export", { month: "2026-10" }))).toEqual({
      action: "payroll.export",
      month: "2026-10",
      people: null,
      shifts: null,
    });
    for (const details of [
      { month: "10/2026" },
      { month: "2026-13" },
      { people: 4 },
      { month: "2026-10", people: -1 },
    ]) {
      expect(lineOf(row("payroll.export", details))).toEqual({
        action: "other",
      });
    }
  });

  it("reads a month closed for payroll, and reopened with its reason (payroll P9)", () => {
    expect(
      lineOf(row("payroll.close", { month: "2026-10", engine: "2026-11" })),
    ).toEqual({ action: "payroll.close", month: "2026-10" });
    expect(
      lineOf(
        row("payroll.reopen", {
          month: "2026-10",
          reason: " A shift was missing ",
        }),
      ),
    ).toEqual({
      action: "payroll.reopen",
      month: "2026-10",
      reason: "A shift was missing",
    });
    expect(lineOf(row("payroll.reopen", { month: "2026-10" }))).toEqual({
      action: "payroll.reopen",
      month: "2026-10",
      reason: null,
    });
    for (const action of ["payroll.close", "payroll.reopen"]) {
      expect(lineOf(row(action, { month: "10/2026" }))).toEqual({
        action: "other",
      });
    }
  });

  it("turns anything it can't read into a plain line", () => {
    for (const r of [
      row("something.new", { anything: 1 }),
      row("clock.add", { person: YOAV, clock_in: "yesterday" }),
      row("schedule.publish", { shifts: -1 }),
      row("business.details", "not an object"),
      row("module.enabled", null),
      row("lists.send", { name: "Opening", recipient: { kind: "team" } }),
      row("departments.members", { added: [NOA] }),
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

  it("knows a setting never set began at its default", () => {
    const breaks = (from: boolean | null, to: boolean, minute: number) =>
      row(
        "module.settings",
        {
          module: "time_clock",
          from: { unpaidBreaks: from },
          to: { unpaidBreaks: to },
        },
        NOA,
        at(minute),
      );
    const defaults = new Map([["time_clock", { unpaidBreaks: false }]]);
    // On and off again, from never set: nothing changed.
    expect(
      buildActivity(
        [breaks(true, false, 2), breaks(null, true, 1)],
        lookups,
        defaults,
      ),
    ).toEqual([]);
    // Saving the default it already had says nothing either.
    expect(buildActivity([breaks(null, false, 1)], lookups, defaults)).toEqual(
      [],
    );
    // Away from the default is a change, and still says it was never set.
    expect(
      buildActivity([breaks(null, true, 1)], lookups, defaults)[0]?.line,
    ).toMatchObject({
      changes: [{ key: "unpaidBreaks", from: null, to: true }],
    });
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

  it("folds saves of the same list template, keeping that it was new", () => {
    const save = (minute: number, created: boolean, name = "Cleaning") =>
      row(
        "lists.template.save",
        { template: LIST, name, created },
        NOA,
        `2026-11-04T10:${String(minute).padStart(2, "0")}:00+00:00`,
      );
    expect(
      buildActivity([save(5, false), save(2, false), save(0, true)], lookups),
    ).toEqual([
      expect.objectContaining({
        line: {
          action: "lists.template.save",
          name: "Cleaning",
          created: true,
        },
      }),
    ]);
    expect(
      buildActivity([save(5, false, "Opening"), save(0, true)], lookups),
    ).toHaveLength(2);
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
        row("departments.members", {
          department: KITCHEN.toUpperCase(),
          added: [GONE, "nobody"],
          removed: [YOAV],
        }),
        row("lists.send", {
          name: "Opening",
          recipient: { kind: "person", id: NAMELESS },
        }),
        row("lists.send", {
          name: "Opening",
          recipient: { kind: "department", id: KITCHEN },
        }),
      ]),
    ).toEqual({
      people: [NOA, YOAV, STAFF, LEFT, GONE, NAMELESS],
      invites: [INVITE],
      shifts: [SHIFT],
      swaps: [SWAP],
      departments: [KITCHEN],
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
