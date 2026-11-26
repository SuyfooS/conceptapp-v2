import { addDays, instantIn } from "@domain/availability";
import { scheduledShift } from "@domain/schedule";
import { manifest as scheduling } from "@modules/scheduling/manifest";
import { manifest as timeClock } from "@modules/time_clock/manifest";
import { describe, expect, it } from "vitest";
import {
  businessNameOf,
  choice,
  FAKE_NAME,
  FICTIONAL_NUMBER,
  FIRST_NAMES,
  fictionalNumber,
  IMPORT_NUMBER,
  importNumber,
  nameOf,
  PREFIX,
  personId,
  rowId,
  SECOND_NAMES,
} from "./ids";
import {
  anchorRefusal,
  appHolds,
  type BusinessShape,
  CAPS,
  clockEditors,
  confirmLines,
  type Entry,
  NEIGHBOUR,
  SCALE,
  type Shape,
  SIZES,
  seedReads,
  shape,
  shapeHash,
  TEAMS,
  waits,
} from "./shape";

// A Tuesday at 11:20 in Israel, mid-month and mid-week: 09:20 UTC in winter.
const ANCHOR = new Date("2026-11-17T09:20:00Z");

const HOUR = 3_600_000;
const DAY = 86_400_000;
const ms = (instant: string) => Date.parse(instant);

/** Built once each: the 300 with its whole history is the slow one. */
const built = new Map<string, Shape>();
function of(
  people: (typeof SIZES)[number],
  depth: "people" | "history",
  months = 13,
) {
  const key = `${people}:${depth}:${months}`;
  let found = built.get(key);
  if (!found) {
    found = shape({ people, depth, months, anchor: ANCHOR });
    built.set(key, found);
  }
  return found;
}

const staffOf = (b: BusinessShape) =>
  b.people.filter((p) => p.kind === "staff");
const shiftsAWeek = (b: BusinessShape) =>
  b.patterns.reduce((sum, p) => sum + p.days.length, 0);

describe("the shape of each size", () => {
  it.each(SIZES)(
    "%i people: the team, departments and shifts of the plan's 1.3",
    (size) => {
      const s = of(size, "people");
      const team = TEAMS[size];
      const staff = staffOf(s.scale);
      expect(staff).toHaveLength(size);
      expect(staff.filter((p) => p.role === "owner")).toHaveLength(1);
      expect(staff.filter((p) => p.role === "manager")).toHaveLength(
        team.managers,
      );
      expect(staff.filter((p) => p.lead)).toHaveLength(team.leads);
      expect(s.scale.people.filter((p) => p.kind === "left")).toHaveLength(
        team.left,
      );
      expect(
        s.scale.people.filter((p) => p.kind === "accountant"),
      ).toHaveLength(1);
      expect(s.scale.departments).toHaveLength(team.departments);
      expect(s.scale.patterns).toHaveLength(3 * team.departments);

      const expected = { 30: 17, 100: 68, 300: 200, 600: 200 }[size];
      expect(shiftsAWeek(s.scale)).toBe(expected);
      const next = s.scale.weeks.find((w) => w.kind === "next");
      expect(next?.shifts).toHaveLength(expected);
    },
  );

  it.each(SIZES)("%i people: within every cap the app has", (size) => {
    const s = of(size, "people");
    expect(shiftsAWeek(s.scale)).toBeLessThanOrEqual(CAPS.shiftsAWeek);
    expect(s.scale.patterns.length).toBeLessThanOrEqual(CAPS.patterns);
    expect(s.scale.departments.length).toBeLessThanOrEqual(CAPS.departments);
    for (const p of s.scale.patterns) {
      expect(p.needed).toBeGreaterThanOrEqual(1);
      expect(p.needed).toBeLessThanOrEqual(CAPS.needed);
    }
    for (const week of s.scale.weeks) {
      for (const shift of week.shifts) {
        expect(shift.assignees.length).toBeLessThanOrEqual(shift.needed);
      }
    }
    const waiting = s.scale.invites.filter(
      (i) => ms(i.expiresAt) > ANCHOR.getTime(),
    );
    expect(waiting.length + CAPS.importAtOnce).toBeLessThanOrEqual(
      CAPS.invitesWaiting,
    );
  });

  it("300: the big department's morning needs 50, and next week's draft fills it", () => {
    const s = of(300, "people");
    const biggest = [...s.scale.patterns].sort(
      (a, b) => b.needed - a.needed,
    )[0];
    expect(biggest?.key).toBe("d-01-m");
    expect(biggest?.needed).toBe(50);
    const next = s.scale.weeks.find((w) => w.kind === "next");
    const full = next?.shifts.find((x) => x.pattern === "d-01-m");
    expect(full?.assignees).toHaveLength(50);
    const placed =
      next?.shifts.reduce((sum, x) => sum + x.assignees.length, 0) ?? 0;
    const needed = next?.shifts.reduce((sum, x) => sum + x.needed, 0) ?? 0;
    // Six in ten of a week placed at nine in ten of what it needs, and the full shift.
    expect(placed / needed).toBeGreaterThan(0.45);
    expect(placed / needed).toBeLessThan(0.7);
  });

  it("300: a big department of about 100, nine of about 22, 30 in two", () => {
    const s = of(300, "people");
    const staff = staffOf(s.scale).filter((p) => p.role !== "owner");
    const sizes = s.scale.departments.map(
      (_, d) => staff.filter((p) => p.department === d).length,
    );
    expect(sizes[0]).toBeGreaterThan(85);
    expect(sizes[0]).toBeLessThan(115);
    for (const n of sizes.slice(1)) {
      expect(n).toBeGreaterThan(12);
      expect(n).toBeLessThan(34);
    }
    expect(staff.filter((p) => p.second !== null)).toHaveLength(30);
    for (const p of staff) expect(p.second).not.toBe(p.department);
  });

  it("the settings are ones the app's own manifests take", () => {
    for (const size of SIZES) {
      const s = of(size, "people");
      for (const business of [s.scale, s.neighbour]) {
        expect(() =>
          scheduling.settings.parse(business.settings.scheduling),
        ).not.toThrow();
        expect(() =>
          timeClock.settings.parse(business.settings.time_clock),
        ).not.toThrow();
        expect(business.settings.time_clock.requirePunchCode).toBe(true);
      }
    }
    expect(of(30, "people").scale.settings.scheduling.closedOnShabbat).toBe(
      true,
    );
    expect(of(300, "people").scale.settings.scheduling.closedOnShabbat).toBe(
      false,
    );
  });

  it("51 people on one shift are refused by the domain, 50 are not", () => {
    const people = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        user: personId(i + 1),
        position: null,
      }));
    const shift = {
      day: "2026-11-22",
      name: "בוקר 01",
      start: "07:00",
      end: "15:00",
      needed: 50,
      pattern: "d-01-m",
    };
    expect(
      scheduledShift.safeParse({ ...shift, assignees: people(50) }).success,
    ).toBe(true);
    expect(
      scheduledShift.safeParse({ ...shift, assignees: people(51) }).success,
    ).toBe(false);
  });
});

/** Every placement of a person, by when it starts. */
function placementsOf(b: BusinessShape) {
  const byPerson = new Map<
    string,
    { start: number; end: number; week: string }[]
  >();
  for (const week of b.weeks) {
    for (const shift of week.shifts) {
      for (const a of shift.assignees) {
        const list = byPerson.get(a.user) ?? [];
        list.push({
          start: ms(shift.startsAt),
          end: ms(shift.endsAt),
          week: week.startsOn,
        });
        byPerson.set(a.user, list);
      }
    }
  }
  for (const list of byPerson.values()) list.sort((x, y) => x.start - y.start);
  return byPerson;
}

function checkPlacements(b: BusinessShape) {
  for (const [person, list] of placementsOf(b)) {
    for (let i = 1; i < list.length; i++) {
      const gap = (list[i]?.start ?? 0) - (list[i - 1]?.end ?? 0);
      expect(
        gap,
        `${person} at ${new Date(list[i]?.start ?? 0).toISOString()}`,
      ).toBeGreaterThanOrEqual(8 * HOUR);
    }
    const perWeek = new Map<string, number>();
    for (const p of list) perWeek.set(p.week, (perWeek.get(p.week) ?? 0) + 1);
    for (const count of perWeek.values()) expect(count).toBeLessThanOrEqual(5);
  }
}

function checkEntries(s: Shape, b: BusinessShape) {
  const byPerson = new Map<string, Entry[]>();
  for (const e of b.entries) {
    const list = byPerson.get(e.user) ?? [];
    list.push(e);
    byPerson.set(e.user, list);
  }
  const anchor = ms(s.anchor);
  for (const [person, list] of byPerson) {
    const live = list
      .filter((e) => !e.cancelledAt)
      .sort((x, y) => ms(x.clockIn) - ms(y.clockIn));
    for (let i = 1; i < live.length; i++) {
      const before = live[i - 1];
      const after = live[i];
      if (!before || !after) continue;
      // An open entry runs to infinity: only the last may be open.
      expect(
        before.clockOut,
        `${person} open before ${after.clockIn}`,
      ).not.toBeNull();
      expect(ms(after.clockIn)).toBeGreaterThan(ms(before.clockOut ?? ""));
    }
    for (const e of list) {
      expect(ms(e.clockIn)).toBeLessThan(anchor);
      if (e.clockOut) {
        expect(ms(e.clockOut)).toBeGreaterThan(ms(e.clockIn));
        expect(ms(e.clockOut)).toBeLessThan(anchor);
        expect(ms(e.clockOut) - ms(e.clockIn)).toBeLessThanOrEqual(24 * HOUR);
      }
      for (const t of [e.confirmedAt, e.editedAt, e.cancelledAt]) {
        if (t) expect(ms(t)).toBeLessThan(anchor);
      }
      if (e.confirmedAt)
        expect(ms(e.confirmedAt)).toBeGreaterThan(ms(e.clockOut ?? e.clockIn));
    }
  }
  const entries = new Map(b.entries.map((e) => [e.id, e]));
  for (const br of b.breaks) {
    const e = entries.get(br.entry);
    expect(e?.clockOut).toBeTruthy();
    expect(ms(br.startedAt)).toBeGreaterThan(ms(e?.clockIn ?? ""));
    expect(ms(br.endedAt)).toBeLessThan(ms(e?.clockOut ?? ""));
  }
}

describe("people's shifts and hours", () => {
  it("nobody works two shifts less than 8 hours apart, or more than 5 a week (30, 13 months)", () => {
    const s = of(30, "history");
    checkPlacements(s.scale);
    checkPlacements(s.neighbour);
  });

  it("nor at 300 with its whole history", () => {
    const s = of(300, "history");
    checkPlacements(s.scale);
  }, 60_000);

  it("entries never overlap, the jitter at its limits included, and nothing is after the anchor", () => {
    for (const s of [of(30, "history"), of(300, "history")]) {
      checkEntries(s, s.scale);
      checkEntries(s, s.neighbour);
    }
  }, 60_000);

  it("the open entries are those on the clock now, each in a shift with 2 hours or more left", () => {
    const s = of(300, "history");
    const open = s.scale.entries.filter((e) => e.clockOut === null);
    expect(open).toHaveLength(15);
    expect(open.every((e) => e.kind === "open")).toBe(true);
    const anchor = ms(s.anchor);
    for (const e of open) {
      const shift = s.scale.weeks
        .flatMap((w) => w.shifts)
        .find(
          (x) => x.day === e.day && x.assignees.some((a) => a.user === e.user),
        );
      expect(shift).toBeDefined();
      expect(ms(shift?.endsAt ?? "") - anchor).toBeGreaterThanOrEqual(2 * HOUR);
      expect(ms(shift?.startsAt ?? "")).toBeLessThan(anchor);
    }
  }, 60_000);

  it("the 100 punchers have no shift today, none running and no open entry", () => {
    const s = of(300, "history");
    expect(s.scale.punchers).toHaveLength(100);
    const anchor = ms(s.anchor);
    const busy = new Set<string>();
    for (const w of s.scale.weeks) {
      for (const x of w.shifts) {
        if (
          x.day === s.today ||
          (ms(x.startsAt) <= anchor && ms(x.endsAt) > anchor)
        ) {
          for (const a of x.assignees) busy.add(a.user);
        }
      }
    }
    const open = new Set(
      s.scale.entries.filter((e) => !e.clockOut).map((e) => e.user),
    );
    for (const p of s.scale.punchers) {
      expect(busy.has(p)).toBe(false);
      expect(open.has(p)).toBe(false);
    }
  }, 60_000);

  it("at every anchor a run takes, 300 has its 15 on the clock and 100 punchers, and 20 live swaps until the week's last hours", () => {
    // Four-hourly through a week, at the minutes when most shifts are about
    // to end (05:50 and 21:50 in Israel among them), and the hours that fell
    // short before: past midnight into Wednesday, and Saturday evening.
    const anchors = [
      ...Array.from(
        { length: 42 },
        (_, i) => Date.parse("2026-11-21T23:50:00Z") + i * 4 * HOUR,
      ),
      Date.parse("2026-11-22T20:30:00Z"),
      Date.parse("2026-11-24T22:30:00Z"),
      Date.parse("2026-11-25T12:00:00Z"),
      Date.parse("2026-11-28T18:45:00Z"),
      Date.parse("2026-11-28T19:15:00Z"),
      Date.parse("2026-11-28T20:00:00Z"),
    ]
      .map((t) => new Date(t))
      .filter((anchor) => anchorRefusal(anchor, 120) === null);
    expect(anchors.length).toBeGreaterThan(40);
    for (const anchor of anchors) {
      const at = anchor.toISOString();
      const t = anchor.getTime();
      const s = shape({
        people: 300,
        depth: "history",
        months: 1,
        chat: "ci",
        anchor,
      });
      const b = s.scale;
      const shifts = b.weeks
        .filter((w) => w.kind !== "next")
        .flatMap((w) => w.shifts);
      const shiftOf = (user: string, day: string) =>
        shifts.find(
          (x) => x.day === day && x.assignees.some((a) => a.user === user),
        );

      // On the clock: 15, each arrived and in a shift still running; one
      // with under 2 hours left only once everyone with 2 or more is on.
      const open = b.entries.filter((e) => e.clockOut === null);
      expect(open, at).toHaveLength(15);
      const onClock = new Set(open.map((e) => e.user));
      let short = false;
      for (const e of open) {
        const shift = shiftOf(e.user, e.day);
        expect(shift, at).toBeDefined();
        expect(ms(e.clockIn), at).toBeLessThan(t);
        expect(ms(shift?.endsAt ?? ""), at).toBeGreaterThan(t);
        if (ms(shift?.endsAt ?? "") - t < 2 * HOUR) short = true;
      }
      if (short) {
        for (const x of shifts) {
          if (ms(x.startsAt) > t - 10 * 60_000) continue;
          if (ms(x.endsAt) - t < 2 * HOUR) continue;
          for (const a of x.assignees)
            expect(onClock.has(a.user), `${at} ${a.user}`).toBe(true);
        }
      }

      // The punchers: 100, none with a shift today, running or about to
      // start, none on the clock.
      expect(new Set(b.punchers).size, at).toBe(100);
      const busy = new Set(
        shifts
          .filter(
            (x) =>
              x.day === s.today ||
              (ms(x.startsAt) <= t + 10 * 60_000 && ms(x.endsAt) > t),
          )
          .flatMap((x) => x.assignees.map((a) => a.user)),
      );
      for (const p of b.punchers) {
        expect(busy.has(p), `${at} ${p}`).toBe(false);
        expect(onClock.has(p), `${at} ${p}`).toBe(false);
      }

      // Live swaps: on this week's shifts more than an hour ahead, 20 but
      // in the week's last three hours, when fewer places are left to ask.
      const ahead = (b.weeks.find((w) => w.kind === "this")?.shifts ?? [])
        .filter((x) => ms(x.startsAt) > t + HOUR)
        .reduce((sum, x) => sum + x.assignees.length, 0);
      const live = b.swaps.filter(
        (w) => w.status === "open" && w.weekStart === s.weekStart,
      ).length;
      expect(live, at).toBe(Math.min(20, ahead));
      const weekEnds = instantIn(
        addDays(s.weekStart, 7),
        "00:00",
        "Asia/Jerusalem",
      ).getTime();
      if (t <= weekEnds - 3 * HOUR) expect(live, at).toBe(20);
    }
  }, 120_000);

  it("the proofs follow the stated mix, and what waits is as planned", () => {
    const s = of(300, "history");
    const ended = s.scale.entries.filter(
      (e) => e.clockOut && !e.kind.startsWith("waiting"),
    );
    const share = (kind: Entry["kind"]) =>
      ended.filter((e) => e.kind === kind).length / ended.length;
    expect(share("scan")).toBeGreaterThan(0.74);
    expect(share("scan")).toBeLessThan(0.82);
    expect(share("none")).toBeGreaterThan(0.15);
    expect(share("none")).toBeLessThan(0.21);
    expect(share("missed") + share("corrected")).toBeGreaterThan(0.03);
    expect(share("missed") + share("corrected")).toBeLessThan(0.05);
    expect(share("cancelled")).toBeLessThan(0.01);

    const waiting = s.scale.entries.filter(waits);
    expect(waiting.filter((e) => e.inProof === "none")).toHaveLength(600);
    expect(waiting.filter((e) => e.inProof === "self")).toHaveLength(20);
    const editors = new Set(clockEditors(s.scale).map((p) => p.id));
    const managers = new Set(
      s.scale.people.filter((p) => p.role === "manager").map((p) => p.id),
    );
    for (const e of waiting) {
      if (e.inProof === "self") {
        expect(managers.has(e.user)).toBe(true);
        expect(editors.has(e.user)).toBe(true);
      }
      expect(ms(e.clockIn)).toBeGreaterThan(ms(s.anchor) - 15 * 86_400_000);
    }
    // Every editor but the person, for each entry without a code; the owner for each of a manager's own.
    const holders = clockEditors(s.scale).length;
    expect(holders).toBe(15);
    const own = waiting.filter(
      (e) => e.inProof === "none" && editors.has(e.user),
    ).length;
    expect(confirmLines(s.scale)).toBe(600 * holders - own + 20);
  }, 60_000);

  it("30 with 2 months, as the database job seeds it: something waits, and someone joined after the chat began", () => {
    const s = shape({
      people: 30,
      depth: "history",
      months: 2,
      chat: "ci",
      anchor: ANCHOR,
    });
    expect(
      s.scale.weeks.filter((w) => w.kind === "history").length,
    ).toBeGreaterThanOrEqual(6);
    expect(s.scale.entries.filter(waits).length).toBe(62);
    const team = s.scale.chat.messages.filter((m) => m.conversation === "team");
    expect(team).toHaveLength(300);
    const oldest = team[0]?.createdAt ?? "";
    const staff = staffOf(s.scale).filter(
      (p) => p.role === "worker" && !p.lead,
    );
    expect(staff.some((p) => p.joinedAt > oldest)).toBe(true);
    expect(
      staff.some((p) => ms(p.joinedAt) < ms(s.anchor) - 700 * 86_400_000),
    ).toBe(true);
    checkPlacements(s.scale);
    checkEntries(s, s.scale);
  });
});

describe("the bell's history", () => {
  it("who joined goes to the owner and managers there by then, and every line is one the app would still hold", () => {
    const ci = shape({
      people: 30,
      depth: "history",
      months: 2,
      chat: "ci",
      anchor: ANCHOR,
    });
    for (const s of [ci, of(300, "history")]) {
      const b = s.scale;
      const anchor = ms(s.anchor);
      const joinedAt = new Map(b.people.map((p) => [p.id, p.joinedAt]));
      const viewers = new Set(
        staffOf(b)
          .filter((p) => p.role === "owner" || p.role === "manager")
          .map((p) => p.id),
      );
      expect(b.joined.length).toBeGreaterThan(0);
      for (const line of b.joined) {
        expect(line.recipients.length).toBeGreaterThan(0);
        for (const user of line.recipients) {
          expect(viewers.has(user)).toBe(true);
          expect(user).not.toBe(line.person);
          expect((joinedAt.get(user) ?? "") <= line.at).toBe(true);
        }
      }
      // private.clean_notifications keeps nothing past 180 days, and no
      // read line past 90: the seed writes neither.
      const lines = [
        ...b.joined.flatMap((l) =>
          l.recipients.map((user) => ({ user, at: l.at })),
        ),
        ...b.published.map((l) => ({ user: l.user, at: l.at })),
      ];
      expect(b.published.length).toBeGreaterThan(0);
      for (const { user, at } of lines) {
        const age = anchor - ms(at);
        expect(age).toBeLessThan(180 * DAY);
        if (age >= 90 * DAY)
          expect(seedReads(user, at, s.weekStart)).toBe(false);
        expect(appHolds(user, at, anchor, s.weekStart)).toBe(true);
      }
    }
    // At 300 some lines are past 90 days, the unread ones.
    const full = of(300, "history");
    expect(
      full.scale.published.some((l) => ms(full.anchor) - ms(l.at) >= 90 * DAY),
    ).toBe(true);
  }, 60_000);
});

describe("the anchor and determinism", () => {
  it("refuses an anchor within 2 hours of a week's or a month's start", () => {
    // Sunday 22 November 2026, 01:00 in Israel: an hour into the week.
    expect(anchorRefusal(new Date("2026-11-21T23:00:00Z"), 120)).toMatch(
      /this week's start/,
    );
    // Saturday 21 November, 23:00: an hour before the next one.
    expect(anchorRefusal(new Date("2026-11-21T21:00:00Z"), 120)).toMatch(
      /next week's start/,
    );
    // Tuesday 1 December, 00:30.
    expect(anchorRefusal(new Date("2026-11-30T22:30:00Z"), 120)).toMatch(
      /this month's start/,
    );
    expect(anchorRefusal(ANCHOR, 120)).toBeNull();
    expect(anchorRefusal(new Date("2026-11-21T23:00:00Z"), 0)).toBeNull();
    expect(() =>
      shape({
        people: 30,
        depth: "people",
        anchor: new Date("2026-11-21T23:00:00Z"),
      }),
    ).toThrow(/minutes from this week's start/);
  });

  it("the same version and anchor give the same shape; another day does not", () => {
    const a = shape({
      people: 30,
      depth: "history",
      months: 2,
      anchor: ANCHOR,
    });
    const b = shape({
      people: 30,
      depth: "history",
      months: 2,
      anchor: ANCHOR,
    });
    const c = shape({
      people: 30,
      depth: "history",
      months: 2,
      anchor: new Date(ANCHOR.getTime() + 86_400_000),
    });
    expect(shapeHash(a)).toBe(shapeHash(b));
    expect(shapeHash(a)).not.toBe(shapeHash(c));
  });

  it("a choice is md5's first 8 hex digits over 2³²", () => {
    // md5("1:test:x:2026-11-17") = ed0c04c4bf25ce62fdc142ebdf638a00
    // (node:crypto and md5sum agree): its first 8 hex digits over 2³².
    const u = choice("test", "x", "2026-11-17");
    expect(u).toBe(0xed0c04c4 / 2 ** 32);
    expect(u).toBeGreaterThanOrEqual(0);
    expect(u).toBeLessThan(1);
    expect(choice("test", "x", "2026-11-17")).toBe(u);
    expect(choice("test", "y", "2026-11-17")).not.toBe(u);
  });
});

describe("what can never reach anyone", () => {
  it("names are fake by their pattern, every 25th long", () => {
    const s = of(300, "people");
    for (const p of [...s.scale.people, ...s.neighbour.people, s.admin]) {
      expect(p.name).toMatch(FAKE_NAME);
      expect(p.name.length).toBeLessThanOrEqual(80);
    }
    expect(s.scale.people.find((p) => p.n === 25)?.name).toMatch(/בדיקה-ארוכה/);
    const named = s.scale.people.filter((p) => p.businessName);
    expect(named).toHaveLength(100);
    expect(named.some((p) => p.role === "owner")).toBe(false);
    for (const p of named) expect(p.businessName).not.toBe(p.name);
  });

  it("the names docs/measure.md gives are the ones made, and a double name keeps one form", () => {
    const s = of(300, "people");
    const person = (n: number) => s.scale.people.find((p) => p.n === n);
    expect(nameOf(17).name).toBe("נועם בדיקה 017");
    expect(person(17)?.businessName).toBeNull();
    expect(person(18)?.name).toBe("סמאח בדיקה 018");
    expect(person(18)?.businessName).toBe(businessNameOf(18));
    expect(businessNameOf(18)).toBe("סמאח ב׳ 018");
    expect(nameOf(25).name).toBe("יוסף-אליעזר בדיקה-ארוכה 025");
    const forms = new Map(FIRST_NAMES);
    for (let n = 25; n <= 1000; n += 25) {
      const { name, addressForm } = nameOf(n);
      const [first = "", second = ""] = (name.split(" ")[0] ?? "").split("-");
      expect(forms.get(first), name).toBe(addressForm);
      expect(SECOND_NAMES[addressForm], name).toContain(second);
    }
  });

  it("display numbers are fictional and unique; the import's are its block alone", () => {
    const s = of(600, "people");
    const people = [...s.scale.people, ...s.neighbour.people].map(
      (p) => p.phone,
    );
    const invites = s.scale.invites.map((i) => i.phone);
    const all = [...people, ...invites];
    for (const phone of all) expect(phone).toMatch(FICTIONAL_NUMBER);
    expect(new Set(all).size).toBe(all.length);
    expect(s.admin.phone).toBeNull();
    const imports = Array.from({ length: 300 }, (_, i) => importNumber(i));
    for (const phone of imports) expect(phone).toMatch(IMPORT_NUMBER);
    expect(new Set(imports).size).toBe(300);
    expect(() => importNumber(300)).toThrow();
    expect(() => fictionalNumber(1000, "people")).toThrow();
    expect(JSON.stringify(of(300, "history"))).not.toMatch(/\+9725/);
  }, 60_000);

  it("every login is an email that can't be delivered, and every id carries the prefix", () => {
    const s = of(30, "history", 2);
    for (const p of [...s.scale.people, ...s.neighbour.people, s.admin]) {
      expect(p.email).toMatch(/^p\d{6}@scale\.conceptapp\.invalid$/);
      expect(p.id.startsWith(`${PREFIX}-`)).toBe(true);
    }
    expect(s.scale.id).toBe(SCALE.id);
    expect(s.neighbour.id).toBe(NEIGHBOUR.id);
    const ids =
      JSON.stringify(s).match(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
      ) ?? [];
    expect(ids.length).toBeGreaterThan(1000);
    for (const id of ids) expect(id.startsWith(PREFIX)).toBe(true);
    expect(rowId("entry", 1)).toMatch(/^5ca1e300-0003-4000-8000-000000000001$/);
  });
});
