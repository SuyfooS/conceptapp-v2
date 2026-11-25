import { describe, expect, it } from "vitest";
import {
  type CopySource,
  copiedOver,
  copyLastWeek,
  copySourceOf,
  type WeekCopy,
} from "./copy-week";
import { type ScheduledShift, weekSchedule } from "./schedule";
import { ISRAEL_TIME_ZONE } from "./shabbat";
import { MAX_SHIFTS_IN_A_WEEK } from "./staffing";

const zone = ISRAEL_TIME_ZONE;
// Last week: Sunday 15 November 2026 to Saturday 21 November; the week on
// the screen: Sunday 22 to Saturday 28. Winter time (UTC+2).
const LAST = "2026-11-15";
const THIS = "2026-11-22";
const KEYS = ["cashier", "sales", "stock"];

const tamar = "65000000-0000-4000-a000-000000000010";
const itai = "65000000-0000-4000-a000-000000000011";
const roni = "65000000-0000-4000-a000-000000000012";
const liya = "65000000-0000-4000-a000-000000000013";
const michal = "65000000-0000-4000-a000-000000000014";
const STAFF = [tamar, itai, roni];
// Michal is the accountant now: on the team, off the staff. Liya left.
const PEOPLE = [...STAFF, michal];
const ID = (n: number) =>
  `7a000000-0000-4000-a000-0000000000${`${n}`.padStart(2, "0")}`;

type Person = string | [string, string | null];

const shift = (
  day: string,
  start: string,
  end: string,
  people: Person[] = [],
  extra: Partial<ScheduledShift> = {},
): ScheduledShift => ({
  day,
  name: start < "12:00" ? "בוקר" : start < "20:00" ? "ערב" : "לילה",
  start,
  end,
  needed: 2,
  pattern: start < "12:00" ? "morning" : start < "20:00" ? "evening" : null,
  assignees: people.map((p) =>
    typeof p === "string"
      ? { user: p, position: null }
      : { user: p[0], position: p[1] },
  ),
  ...extra,
});

const sourceOf = (
  shifts: ScheduledShift[],
  start = LAST,
  published = true,
): CopySource => ({ start, published, shifts });

const copyOf = (
  input: Partial<Parameters<typeof copyLastWeek>[0]> & {
    source: CopySource;
  },
): WeekCopy =>
  copyLastWeek({
    weekStart: THIS,
    screen: [],
    staff: STAFF,
    people: PEOPLE,
    answers: [],
    away: [],
    replace: false,
    now: null,
    timeZone: zone,
    ...input,
  });

/** The week as the copy leaves it, as the builder puts it on the screen. */
const standing = (copy: WeekCopy, screen: readonly ScheduledShift[] = []) =>
  copy.week.map((place) =>
    "kept" in place ? screen[place.kept] : place.copied,
  ) as ScheduledShift[];

const who = (s: ScheduledShift | undefined) =>
  (s?.assignees ?? []).map((a) => a.user);

describe("copySourceOf", () => {
  const built = {
    start: LAST,
    savedAt: "2026-11-12T14:05:00.000Z",
    publishedAt: "2026-11-12T14:05:00.000Z",
  };

  it("is nothing for a week nobody built, or one with no shifts in it", () => {
    const shifts = [shift("2026-11-15", "08:00", "15:00", [tamar])];
    expect(
      copySourceOf(
        { ...built, savedAt: null, publishedAt: null, shifts },
        KEYS,
      ),
    ).toBeNull();
    expect(copySourceOf({ ...built, shifts: [] }, KEYS)).toBeNull();
    // A shift outside the week doesn't count.
    expect(
      copySourceOf(
        { ...built, shifts: [shift("2026-11-22", "08:00", "15:00")] },
        KEYS,
      ),
    ).toBeNull();
  });

  it("drops the ids and what was seen, and positions the business no longer has", () => {
    const stored = [
      {
        ...shift("2026-11-15", "08:00", "15:00", [
          [tamar, "cashier"],
          [itai, "waiter"],
        ]),
        id: ID(1),
        seen: "0".repeat(32),
      },
    ];
    expect(copySourceOf({ ...built, shifts: stored }, KEYS)).toEqual({
      start: LAST,
      published: true,
      shifts: [
        shift("2026-11-15", "08:00", "15:00", [
          [tamar, "cashier"],
          [itai, null],
        ]),
      ],
    });
  });

  it("says when last week is a draft only saved", () => {
    const source = copySourceOf(
      {
        ...built,
        publishedAt: null,
        shifts: [shift("2026-11-15", "08:00", "15:00")],
      },
      KEYS,
    );
    expect(source?.published).toBe(false);
  });
});

describe("copyLastWeek", () => {
  // Rule 1.
  it("copies each shift to the same weekday, and ignores one outside last week", () => {
    const sunday = shift("2026-11-15", "08:00", "15:00", [[tamar, "cashier"]], {
      needed: 3,
    });
    // Tamar on a shift outside last week, at the copy's hours: neither copied
    // nor read as last week's night into this week.
    const copy = copyOf({
      source: sourceOf([
        sunday,
        shift("2026-11-22", "07:00", "22:00", [tamar], { pattern: null }),
      ]),
    });
    expect(copy.week).toEqual([{ copied: { ...sunday, day: "2026-11-22" } }]);
    expect(copy.skipped).toEqual([]);
    expect(copy.days.map((d) => d.state)).toEqual([
      "copied",
      "none",
      "none",
      "none",
      "none",
      "none",
      "none",
    ]);
    expect(copy.shifts).toBe(1);
  });

  // Rules 2 and 4: the week running now, on Tuesday 17 November at 11:20.
  describe("in the week running now", () => {
    const now = new Date("2026-11-17T09:20:00.000Z");
    const running = {
      weekStart: "2026-11-15",
      now,
    };
    const source = sourceOf(
      [
        shift("2026-11-09", "08:00", "15:00", [tamar]),
        shift("2026-11-10", "08:00", "15:00", [tamar]),
        shift("2026-11-10", "15:00", "22:00", [itai]),
        shift("2026-11-11", "08:00", "15:00", [roni]),
      ],
      "2026-11-08",
    );

    it("never copies a shift into the past", () => {
      const copy = copyOf({ ...running, source });
      expect(copy.days.slice(1, 4)).toEqual([
        { date: "2026-11-16", state: "past", copied: 0, replaced: 0 },
        { date: "2026-11-17", state: "copied", copied: 1, replaced: 0 },
        { date: "2026-11-18", state: "copied", copied: 1, replaced: 0 },
      ]);
      expect(
        standing(copy).map((s) => `${s.day} ${s.start} ${who(s)}`),
      ).toEqual([`2026-11-17 15:00 ${itai}`, `2026-11-18 08:00 ${roni}`]);
    });

    it("never touches a shift that has begun, which doesn't keep its day", () => {
      const screen = [
        shift("2026-11-17", "08:00", "15:00", [tamar], { id: ID(1) }),
        shift("2026-11-17", "15:00", "22:00", [], { id: ID(2) }),
      ];
      const copy = copyOf({ ...running, source, screen });
      expect(copy.days[2]).toEqual({
        date: "2026-11-17",
        state: "copied",
        copied: 1,
        replaced: 1,
      });
      expect(copy.staffedDays).toBe(0);
      expect(copy.week).toEqual([
        { kept: 0 },
        { copied: shift("2026-11-17", "15:00", "22:00", [itai]) },
        { copied: shift("2026-11-18", "08:00", "15:00", [roni]) },
      ]);
    });
  });

  // Rule 3.
  it("leaves a day last week had nothing on as it is", () => {
    const screen = [shift("2026-11-24", "08:00", "15:00")];
    const copy = copyOf({
      source: sourceOf([shift("2026-11-15", "08:00", "15:00", [tamar])]),
      screen,
    });
    expect(copy.days[2]).toEqual({
      date: "2026-11-24",
      state: "none",
      copied: 0,
      replaced: 0,
    });
    expect(copy.week).toEqual([
      { copied: shift("2026-11-22", "08:00", "15:00", [tamar]) },
      { kept: 0 },
    ]);
  });

  // Rules 5 and 6.
  describe("a day with shifts of its own", () => {
    const source = sourceOf([
      shift("2026-11-15", "08:00", "15:00", [tamar, itai]),
      shift("2026-11-15", "15:00", "22:00", [roni]),
      shift("2026-11-16", "08:00", "15:00", [tamar]),
    ]);
    const screen = [
      shift("2026-11-22", "08:00", "15:00", [itai], { id: ID(1) }),
      shift("2026-11-22", "15:00", "22:00", [], { id: ID(2) }),
      shift("2026-11-23", "08:00", "15:00", [], { id: ID(3) }),
      shift("2026-11-23", "15:00", "22:00", [], { id: ID(4) }),
    ];

    it("stays as it is while someone is on it", () => {
      const copy = copyOf({ source, screen });
      expect(copy.days.slice(0, 2)).toEqual([
        { date: "2026-11-22", state: "kept", copied: 0, replaced: 0 },
        { date: "2026-11-23", state: "copied", copied: 1, replaced: 2 },
      ]);
      expect(copy.staffedDays).toBe(1);
      expect(copy.week).toEqual([
        { kept: 0 },
        { kept: 1 },
        { copied: shift("2026-11-23", "08:00", "15:00", [tamar]) },
      ]);
    });

    it("takes last week's shifts in place of its own when asked to", () => {
      const copy = copyOf({ source, screen, replace: true });
      expect(copy.days[0]).toEqual({
        date: "2026-11-22",
        state: "copied",
        copied: 2,
        replaced: 2,
      });
      // Counted the same with the switch on.
      expect(copy.staffedDays).toBe(1);
      expect(standing(copy, screen).map(who)).toEqual([
        [tamar, itai],
        [roni],
        [tamar],
      ]);
    });
  });

  // Rule 7.
  it("leaves out who left, who is off the staff and whose answer doesn't fit", () => {
    const copy = copyOf({
      source: sourceOf([
        shift("2026-11-15", "08:00", "15:00", [tamar, liya, michal]),
        shift("2026-11-19", "15:00", "22:00", [tamar, itai, roni]),
      ]),
      // Tamar can only do mornings this week; Itai is free on Thursday
      // evening; Roni sent nothing.
      answers: [
        {
          userId: tamar,
          ranges: [
            { day: "2026-11-22", start: "08:00", end: "15:00" },
            { day: "2026-11-26", start: "08:00", end: "15:00" },
          ],
        },
        {
          userId: itai,
          ranges: [{ day: "2026-11-26", start: "14:00", end: "23:00" }],
        },
      ],
    });
    expect(standing(copy).map(who)).toEqual([[tamar], [itai, roni]]);
    expect(copy.skipped).toEqual([
      {
        reason: "gone",
        user: liya,
        shift: {
          day: "2026-11-22",
          name: "בוקר",
          start: "08:00",
          end: "15:00",
        },
      },
      {
        reason: "offStaff",
        user: michal,
        shift: {
          day: "2026-11-22",
          name: "בוקר",
          start: "08:00",
          end: "15:00",
        },
      },
      {
        reason: "unavailable",
        user: tamar,
        shift: { day: "2026-11-26", name: "ערב", start: "15:00", end: "22:00" },
      },
    ]);
    // The shift itself is copied, its places open.
    expect(standing(copy)[0]?.needed).toBe(2);
  });

  it("skips someone away on the shift's day, before their answer is read, and copies them on other days", () => {
    const copy = copyOf({
      source: sourceOf([
        shift("2026-11-15", "08:00", "15:00", [tamar, itai]),
        shift("2026-11-16", "08:00", "15:00", [tamar]),
      ]),
      // Away on Sunday: an answer that covers it doesn't change that.
      away: [{ userId: tamar, from: "2026-11-21", to: "2026-11-22" }],
      answers: [
        {
          userId: tamar,
          ranges: [
            { day: "2026-11-22", start: "08:00", end: "15:00" },
            { day: "2026-11-23", start: "08:00", end: "15:00" },
          ],
        },
      ],
    });
    expect(standing(copy).map(who)).toEqual([[itai], [tamar]]);
    expect(copy.skipped).toEqual([
      {
        reason: "away",
        user: tamar,
        shift: {
          day: "2026-11-22",
          name: "בוקר",
          start: "08:00",
          end: "15:00",
        },
      },
    ]);
    // Their place stays open, and they count once among those copied.
    expect(standing(copy)[0]?.needed).toBe(2);
    expect(copy.people).toBe(2);
  });

  it("names someone off the staff before saying they are away", () => {
    const copy = copyOf({
      source: sourceOf([shift("2026-11-15", "08:00", "15:00", [michal])]),
      away: [{ userId: michal, from: "2026-11-22", to: "2026-11-22" }],
    });
    expect(copy.skipped.map((one) => one.reason)).toEqual(["offStaff"]);
  });

  it("skips someone away the day after a night past midnight, as away", () => {
    const copy = copyOf({
      source: sourceOf([
        shift("2026-11-21", "19:30", "00:00", [roni]),
        shift("2026-11-21", "20:00", "02:00", [tamar, itai]),
      ]),
      // Away on Sunday 29, the day after the week: Saturday's night runs
      // into it, the shift until 00:00 doesn't. An answer that covers the
      // night doesn't change that.
      away: [
        { userId: tamar, from: "2026-11-29", to: "2026-11-30" },
        { userId: roni, from: "2026-11-29", to: "2026-11-29" },
      ],
      answers: [
        {
          userId: tamar,
          ranges: [{ day: "2026-11-28", start: "18:00", end: "03:00" }],
        },
      ],
    });
    expect(standing(copy).map(who)).toEqual([[roni], [itai]]);
    expect(copy.skipped).toEqual([
      {
        reason: "away",
        user: tamar,
        shift: {
          day: "2026-11-28",
          name: "לילה",
          start: "20:00",
          end: "02:00",
        },
      },
    ]);
    // Away on the night's own day, it is away too; a week starting on
    // Monday has its night into the next Monday the same way.
    expect(
      copyOf({
        source: sourceOf([shift("2026-11-21", "20:00", "02:00", [itai])]),
        away: [{ userId: itai, from: "2026-11-28", to: "2026-11-28" }],
      }).skipped.map((one) => one.reason),
    ).toEqual(["away"]);
    expect(
      copyOf({
        weekStart: "2026-11-23",
        source: sourceOf(
          [shift("2026-11-22", "22:00", "06:00", [itai])],
          "2026-11-16",
        ),
        away: [{ userId: itai, from: "2026-11-30", to: "2026-11-30" }],
      }).skipped,
    ).toEqual([
      {
        reason: "away",
        user: itai,
        shift: {
          day: "2026-11-29",
          name: "לילה",
          start: "22:00",
          end: "06:00",
        },
      },
    ]);
  });

  it("joins answers that touch, as the shift's sheet does", () => {
    const copy = copyOf({
      source: sourceOf([shift("2026-11-15", "08:00", "15:00", [tamar])]),
      answers: [
        {
          userId: tamar,
          ranges: [
            { day: "2026-11-22", start: "08:00", end: "12:00" },
            { day: "2026-11-22", start: "12:00", end: "15:00" },
          ],
        },
      ],
    });
    expect(standing(copy).map(who)).toEqual([[tamar]]);
    expect(copy.skipped).toEqual([]);
  });

  // Rule 8.
  describe("someone who would work two shifts at once", () => {
    it("comes off the copy, never off a shift that stays", () => {
      // Sunday's night on the screen, with Roni until 06:00 on Monday, stays:
      // last week had nothing on Sunday. Monday's empty evening makes way.
      const screen = [
        shift("2026-11-22", "22:00", "06:00", [roni], { id: ID(1) }),
        shift("2026-11-23", "15:00", "22:00", [], { id: ID(2) }),
      ];
      const copy = copyOf({
        source: sourceOf([
          shift("2026-11-16", "05:00", "12:00", [roni, tamar]),
        ]),
        screen,
      });
      expect(copy.days[0]?.state).toBe("none");
      expect(standing(copy, screen).map(who)).toEqual([[roni], [tamar]]);
      expect(copy.skipped).toEqual([
        {
          reason: "busy",
          user: roni,
          shift: {
            day: "2026-11-23",
            name: "בוקר",
            start: "05:00",
            end: "12:00",
          },
        },
      ]);
    });

    it("includes last week's night that runs into this week's first day", () => {
      const copy = copyOf({
        source: sourceOf([
          shift("2026-11-15", "05:00", "12:00", [roni, tamar]),
          // Saturday 21 at 22:00 until Sunday 22 at 06:00.
          shift("2026-11-21", "22:00", "06:00", [roni]),
        ]),
      });
      expect(copy.skipped).toEqual([
        {
          reason: "busy",
          user: roni,
          shift: {
            day: "2026-11-22",
            name: "בוקר",
            start: "05:00",
            end: "12:00",
          },
        },
      ]);
      // Saturday's night is copied too, with Roni on it.
      expect(standing(copy).map(who)).toEqual([[tamar], [roni]]);
    });

    it("sees the shifts copied before it", () => {
      // Two shifts of last week at the same time, which the database never
      // keeps, copy one person once.
      const copy = copyOf({
        source: sourceOf([
          shift("2026-11-15", "08:00", "15:00", [tamar]),
          shift("2026-11-15", "09:00", "12:00", [tamar], { name: "אמצע" }),
        ]),
      });
      expect(standing(copy).map(who)).toEqual([[tamar], []]);
      expect(copy.skipped.map((s) => s.reason)).toEqual(["busy"]);
    });
  });

  // Rules 9 and 10.
  it("keeps the screen's order, positions and the pattern, and slots each copy in its day", () => {
    const screen = [
      shift("2026-11-24", "08:00", "15:00", [], { id: ID(1) }),
      shift("2026-11-25", "08:00", "15:00", [itai], { id: ID(2) }),
    ];
    const morning = shift("2026-11-17", "07:00", "13:00", [[tamar, "cashier"]]);
    const evening = shift("2026-11-17", "15:00", "22:00", [[roni, "stock"]]);
    const friday = shift("2026-11-20", "08:00", "14:00", [itai, roni], {
      name: "שישי",
      pattern: "friday",
      needed: 3,
    });
    const copy = copyOf({
      source: sourceOf([friday, evening, morning]),
      screen,
    });
    expect(copy.week).toEqual([
      { copied: { ...morning, day: "2026-11-24" } },
      { copied: { ...evening, day: "2026-11-24" } },
      { kept: 1 },
      { copied: { ...friday, day: "2026-11-27" } },
    ]);
    expect(copy.days[2]).toEqual({
      date: "2026-11-24",
      state: "copied",
      copied: 2,
      replaced: 1,
    });
  });

  it("lists who wasn't copied day by day, then by start, then by person", () => {
    const copy = copyOf({
      source: sourceOf([
        shift("2026-11-16", "15:00", "22:00", [liya, michal]),
        shift("2026-11-16", "08:00", "15:00", [michal, liya]),
        shift("2026-11-15", "15:00", "22:00", [liya]),
      ]),
    });
    expect(
      copy.skipped.map((s) => `${s.shift.day} ${s.shift.start} ${s.user}`),
    ).toEqual([
      `2026-11-22 15:00 ${liya}`,
      `2026-11-23 08:00 ${liya}`,
      `2026-11-23 08:00 ${michal}`,
      `2026-11-23 15:00 ${liya}`,
      `2026-11-23 15:00 ${michal}`,
    ]);
  });

  it("counts the shifts, the different people and the places they fill", () => {
    const copy = copyOf({
      source: sourceOf([
        shift("2026-11-15", "08:00", "15:00", [tamar, itai]),
        shift("2026-11-15", "15:00", "22:00", [roni]),
        shift("2026-11-16", "08:00", "15:00", [tamar, liya]),
        shift("2026-11-17", "08:00", "15:00"),
      ]),
    });
    expect(copy.shifts).toBe(4);
    expect(copy.people).toBe(3);
    expect(copy.places).toBe(4);
  });

  // Rule 11.
  it("copies nothing that would pass the week's limit", () => {
    const screen = Array.from({ length: MAX_SHIFTS_IN_A_WEEK }, (_, i) =>
      shift("2026-11-24", "08:00", "15:00", [], { name: `${i}` }),
    );
    const copy = copyOf({
      source: sourceOf([shift("2026-11-15", "08:00", "15:00", [tamar])]),
      screen,
    });
    expect(copy.tooMany).toBe(true);
    expect(
      copyOf({
        source: sourceOf([shift("2026-11-15", "08:00", "15:00", [tamar])]),
        screen: screen.slice(1),
      }).tooMany,
    ).toBe(false);
  });

  describe("for every kind of business", () => {
    it("copies a template with no positions and shifts with no pattern", () => {
      const source = sourceOf([
        shift("2026-11-15", "10:00", "18:00", [tamar], { pattern: null }),
        // Two shifts the same day from the same pattern, both copied.
        shift("2026-11-16", "08:00", "12:00", [itai], { pattern: "open" }),
        shift("2026-11-16", "12:00", "16:00", [itai], { pattern: "open" }),
      ]);
      const copy = copyOf({ source });
      expect(standing(copy).map((s) => [s.day, s.pattern, who(s)])).toEqual([
        ["2026-11-22", null, [tamar]],
        ["2026-11-23", "open", [itai]],
        ["2026-11-23", "open", [itai]],
      ]);
      expect(weekSchedule(THIS, []).safeParse(standing(copy)).success).toBe(
        true,
      );
    });

    it("copies a week that starts on Monday", () => {
      // Monday 16 to Sunday 22, onto Monday 23 to Sunday 29.
      const copy = copyOf({
        weekStart: "2026-11-23",
        source: sourceOf(
          [
            shift("2026-11-16", "08:00", "15:00", [tamar]),
            shift("2026-11-22", "08:00", "15:00", [itai]),
          ],
          "2026-11-16",
        ),
      });
      expect(standing(copy).map((s) => s.day)).toEqual([
        "2026-11-23",
        "2026-11-29",
      ]);
      expect(copy.days.map((d) => d.date)).toEqual([
        "2026-11-23",
        "2026-11-24",
        "2026-11-25",
        "2026-11-26",
        "2026-11-27",
        "2026-11-28",
        "2026-11-29",
      ]);
    });

    it("copies a night on the week's last day", () => {
      const copy = copyOf({
        source: sourceOf([shift("2026-11-21", "22:00", "06:00", [roni])]),
      });
      expect(standing(copy)).toEqual([
        shift("2026-11-28", "22:00", "06:00", [roni]),
      ]);
    });
  });

  it("never leaves a week the schedule's own rules refuse", () => {
    const screen = [
      shift("2026-11-22", "08:00", "15:00", [[itai, "sales"]], { id: ID(1) }),
      shift("2026-11-22", "15:00", "22:00", [], { id: ID(2) }),
      shift("2026-11-23", "08:00", "15:00", [], { id: ID(3) }),
      shift("2026-11-23", "15:00", "22:00", [[roni, "stock"]], { id: ID(4) }),
    ];
    const source = sourceOf([
      shift("2026-11-15", "08:00", "15:00", [
        [tamar, "cashier"],
        [itai, "sales"],
      ]),
      shift("2026-11-15", "14:00", "23:00", [[itai, "sales"]]),
      shift("2026-11-16", "08:00", "16:00", [[roni, "stock"]]),
      shift("2026-11-16", "16:00", "23:00", [[tamar, "cashier"]]),
      shift("2026-11-21", "22:00", "06:00", [[tamar, null]]),
    ]);
    for (const replace of [false, true]) {
      const copy = copyOf({ source, screen, replace });
      expect(
        weekSchedule(THIS, KEYS).safeParse(standing(copy, screen)).success,
      ).toBe(true);
    }
  });
});

// Rule 12.
describe("copiedOver", () => {
  it("is false while the week is saved as the screen read it", () => {
    expect(copiedOver("", null)).toBe(false);
    expect(
      copiedOver(
        "2026-11-23T10:00:00.123456+00:00",
        "2026-11-23T10:00:00.123456+00:00",
      ),
    ).toBe(false);
  });

  it("is true once someone saved it since", () => {
    expect(copiedOver("", "2026-11-23T10:00:00.123456+00:00")).toBe(true);
    expect(
      copiedOver(
        "2026-11-23T10:00:00.123456+00:00",
        "2026-11-23T10:05:00.000000+00:00",
      ),
    ).toBe(true);
  });
});
