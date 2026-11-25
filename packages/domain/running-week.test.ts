import { describe, expect, it } from "vitest";
import {
  begunShifts,
  boardDraft,
  builderHref,
  builderWeekOf,
  draftAhead,
  edgeWeek,
  gapsAhead,
  joinedOn,
  lockBegun,
  nextWeekEdge,
  runningFirst,
  runningGaps,
  shiftEnded,
  shiftJoins,
  shiftStage,
  touchesSoon,
  weekBuilt,
  weekWrite,
} from "./running-week";
import type { ScheduledShift } from "./schedule";
import { ISRAEL_TIME_ZONE } from "./shabbat";
import type { ShiftPattern } from "./staffing";

const zone = ISRAEL_TIME_ZONE;
// Sunday 15 November 2026 to Saturday 21 November; winter time (UTC+2).
const WEEKS = { thisWeek: "2026-11-15", nextWeek: "2026-11-22" };
// Tuesday 17 November, 11:20 in Israel.
const NOW = new Date("2026-11-17T09:20:00.000Z");

const tamar = "65000000-0000-4000-a000-000000000010";
const itai = "65000000-0000-4000-a000-000000000011";
const roni = "65000000-0000-4000-a000-000000000012";
const ID = (n: number) =>
  `7a000000-0000-4000-a000-0000000000${`${n}`.padStart(2, "0")}`;

const shift = (
  n: number,
  day: string,
  start: string,
  end: string,
  people: string[] = [],
  needed = 2,
): ScheduledShift => ({
  id: ID(n),
  day,
  name: start < "12:00" ? "בוקר" : "ערב",
  start,
  end,
  needed,
  pattern: start < "12:00" ? "morning" : "evening",
  assignees: people.map((user) => ({ user, position: null })),
});

// Monday's two shifts are over, Tuesday's morning is under way, Tuesday's
// evening and Wednesday's morning are still to start.
const monMorning = shift(1, "2026-11-16", "08:00", "15:00", [tamar, roni]);
const monEvening = shift(2, "2026-11-16", "15:00", "22:00", [itai]);
const tueMorning = shift(3, "2026-11-17", "08:00", "15:00", [tamar, itai]);
const tueEvening = shift(4, "2026-11-17", "15:00", "22:00", [roni]);
const wedMorning = shift(5, "2026-11-18", "08:00", "15:00", [tamar]);
const week = [monMorning, monEvening, tueMorning, tueEvening, wedMorning];
const basis = Object.fromEntries(
  week.map((s, i) => [s.id, `${i}`.padStart(32, "0")]),
);

describe("builderWeekOf", () => {
  it("names this week and next week by their first day", () => {
    expect(builderWeekOf("2026-11-15", WEEKS)).toBe("this");
    expect(builderWeekOf("2026-11-22", WEEKS)).toBe("next");
  });

  it("knows a week already over", () => {
    expect(builderWeekOf("2026-11-08", WEEKS)).toBe("over");
    // Any day before this week's first.
    expect(builderWeekOf("2026-11-14", WEEKS)).toBe("over");
  });

  it("is neither for anything else", () => {
    expect(builderWeekOf(undefined, WEEKS)).toBeNull();
    expect(builderWeekOf(null, WEEKS)).toBeNull();
    expect(builderWeekOf("", WEEKS)).toBeNull();
    expect(builderWeekOf("next", WEEKS)).toBeNull();
    expect(builderWeekOf("2026-11-29", WEEKS)).toBeNull();
    // Inside this week, but not its first day.
    expect(builderWeekOf("2026-11-17", WEEKS)).toBeNull();
    expect(builderWeekOf("2026-02-30", WEEKS)).toBeNull();
  });

  it("follows a week starting on Monday", () => {
    const monday = { thisWeek: "2026-11-16", nextWeek: "2026-11-23" };
    expect(builderWeekOf("2026-11-16", monday)).toBe("this");
    expect(builderWeekOf("2026-11-15", monday)).toBe("over");
    expect(builderWeekOf("2026-11-22", monday)).toBeNull();
  });
});

describe("shiftEnded and shiftStage", () => {
  it("ends at its end, on the same day", () => {
    // 15:00 is 13:00 UTC.
    expect(shiftEnded(tueMorning, new Date("2026-11-17T12:59:00Z"), zone)).toBe(
      false,
    );
    expect(shiftEnded(tueMorning, new Date("2026-11-17T13:00:00Z"), zone)).toBe(
      true,
    );
  });

  it("ends the next day when it ends at or before its start", () => {
    const night = { day: "2026-11-21", start: "22:00", end: "02:00" };
    // Sunday 22 November, 02:00 is 00:00 UTC.
    expect(shiftEnded(night, new Date("2026-11-21T23:59:00Z"), zone)).toBe(
      false,
    );
    expect(shiftEnded(night, new Date("2026-11-22T00:00:00Z"), zone)).toBe(
      true,
    );
    expect(shiftStage(night, new Date("2026-11-21T21:00:00Z"), zone)).toBe(
      "now",
    );
  });

  it("is ahead, under way or over", () => {
    expect(shiftStage(monMorning, NOW, zone)).toBe("over");
    expect(shiftStage(tueMorning, NOW, zone)).toBe("now");
    expect(shiftStage(tueEvening, NOW, zone)).toBe("ahead");
  });
});

describe("begunShifts", () => {
  it("is every stored shift of a published week begun at the moment", () => {
    expect([...begunShifts(week, true, NOW, zone)].sort()).toEqual([
      ID(1),
      ID(2),
      ID(3),
    ]);
  });

  it("is nothing in a week never published", () => {
    expect(begunShifts(week, false, NOW, zone).size).toBe(0);
  });

  it("leaves out a shift with no id", () => {
    const { id: _, ...unsaved } = monMorning;
    expect(begunShifts([unsaved], true, NOW, zone).size).toBe(0);
  });
});

describe("joinedOn", () => {
  it("is the people added, when nothing else changed", () => {
    const added = {
      ...tueMorning,
      assignees: [...tueMorning.assignees, { user: roni, position: "sales" }],
    };
    expect(joinedOn(tueMorning, added)).toEqual([
      { user: roni, position: "sales" },
    ]);
    expect(joinedOn(tueMorning, tueMorning)).toEqual([]);
  });

  it("is null for any other change", () => {
    expect(joinedOn(tueMorning, { ...tueMorning, end: "16:00" })).toBeNull();
    expect(joinedOn(tueMorning, { ...tueMorning, needed: 3 })).toBeNull();
    expect(joinedOn(tueMorning, { ...tueMorning, name: "אמצע" })).toBeNull();
    // Someone taken off, even with someone else added.
    expect(
      joinedOn(tueMorning, {
        ...tueMorning,
        assignees: [
          { user: tamar, position: null },
          { user: roni, position: null },
        ],
      }),
    ).toBeNull();
    // Someone already on it in a new position.
    expect(
      joinedOn(tueMorning, {
        ...tueMorning,
        assignees: tueMorning.assignees.map((a) =>
          a.user === tamar ? { ...a, position: "cashier" } : a,
        ),
      }),
    ).toBeNull();
  });
});

describe("weekWrite", () => {
  const begun = begunShifts(week, true, NOW, zone);

  it("leaves out what has begun, with what was read of it", () => {
    const filled = {
      ...tueEvening,
      assignees: [...tueEvening.assignees, { user: itai, position: null }],
    };
    const screen = [monMorning, monEvening, tueMorning, filled, wedMorning];
    const write = weekWrite(screen, week, basis, begun);
    expect(write.shifts).toEqual([filled, wedMorning]);
    expect(Object.keys(write.basis ?? {}).sort()).toEqual([ID(4), ID(5)]);
    expect(write.joins).toEqual([]);
  });

  it("sends the people put on a shift under way as joins", () => {
    const joined = {
      ...tueMorning,
      assignees: [...tueMorning.assignees, { user: roni, position: "stock" }],
    };
    const screen = [monMorning, monEvening, joined, tueEvening, wedMorning];
    const write = weekWrite(screen, week, basis, begun);
    expect(write.shifts).toEqual([tueEvening, wedMorning]);
    expect(write.joins).toEqual([
      { shift: ID(3), user: roni, position: "stock" },
    ]);
    // Valid for the database's argument.
    expect(shiftJoins.parse(write.joins)).toEqual(write.joins);
  });

  it("sends a begun shift changed, or keeps it read when taken off, so the database refuses it", () => {
    const moved = { ...tueMorning, end: "16:00" };
    const screen = [monMorning, moved, tueEvening, wedMorning];
    const write = weekWrite(screen, week, basis, begun);
    expect(write.shifts).toEqual([moved, tueEvening, wedMorning]);
    // Monday's evening was taken off: still read, so it is not kept quietly.
    expect(Object.keys(write.basis ?? {}).sort()).toEqual([
      ID(2),
      ID(3),
      ID(4),
      ID(5),
    ]);
  });

  it("sends everything of a week never published", () => {
    const write = weekWrite(week, week, basis, new Set());
    expect(write.shifts).toEqual(week);
    expect(write.basis).toEqual(basis);
    expect(write.joins).toEqual([]);
  });

  it("keeps new shifts and a week drawn from the pattern", () => {
    const { id: _, ...fresh } = { ...tueEvening, day: "2026-11-19" };
    const write = weekWrite([fresh], [], null, new Set());
    expect(write).toEqual({ shifts: [fresh], basis: null, joins: [] });
  });
});

describe("draftAhead", () => {
  const patterns: ShiftPattern[] = [
    {
      key: "morning",
      name: "בוקר",
      days: [0, 1, 2, 3, 4],
      start: "08:00",
      end: "15:00",
      needed: 2,
    },
    {
      key: "evening",
      name: "ערב",
      days: [0, 1, 2, 3, 4],
      start: "15:00",
      end: "22:00",
      needed: 2,
    },
  ];

  it("draws only the shifts still to start", () => {
    const draft = draftAhead(WEEKS.thisWeek, patterns, NOW, zone);
    expect(draft.map((s) => `${s.day} ${s.start}`)).toEqual([
      "2026-11-17 15:00",
      "2026-11-18 08:00",
      "2026-11-18 15:00",
      "2026-11-19 08:00",
      "2026-11-19 15:00",
    ]);
    expect(draft.every((s) => s.assignees.length === 0)).toBe(true);
  });

  it("draws the whole of a week still to come", () => {
    expect(draftAhead(WEEKS.nextWeek, patterns, NOW, zone)).toHaveLength(10);
  });
});

describe("gapsAhead", () => {
  it("counts only the shifts still to start", () => {
    // Tuesday's morning is short of nobody; Monday's evening is short one,
    // but it is over. Tuesday's evening and Wednesday's morning are short.
    expect(gapsAhead(week, NOW, zone)).toEqual({
      shifts: [tueEvening, wedMorning],
      people: 2,
    });
    expect(gapsAhead([monEvening], NOW, zone)).toEqual({
      shifts: [],
      people: 0,
    });
  });
});

// The ways into the running week (R4, Orel's answer 6 of 15 November 2026):
// the board's row counts shifts, Today's tile places, and only for a week
// someone built.
describe("runningGaps and weekBuilt", () => {
  const published = {
    savedAt: "2026-11-14T18:00:00.000Z",
    publishedAt: "2026-11-14T18:00:00.000Z",
    shifts: week,
  };

  it("counts the shifts still to start lacking someone, and their places", () => {
    expect(runningGaps(published, NOW, zone)).toEqual({ shifts: 2, people: 2 });
    // Tuesday's evening needs two more once Roni is off it.
    expect(
      runningGaps(
        {
          ...published,
          shifts: [monEvening, { ...tueEvening, assignees: [] }, wedMorning],
        },
        NOW,
        zone,
      ),
    ).toEqual({ shifts: 2, people: 3 });
  });

  it("counts a draft saved and not published, the one that outlives the turn", () => {
    expect(runningGaps({ ...published, publishedAt: null }, NOW, zone)).toEqual(
      { shifts: 2, people: 2 },
    );
  });

  it("is nothing for a week nobody built, or none at all", () => {
    const fromPattern = { savedAt: null, publishedAt: null, shifts: week };
    expect(weekBuilt(fromPattern)).toBe(false);
    expect(runningGaps(fromPattern, NOW, zone)).toEqual({
      shifts: 0,
      people: 0,
    });
    expect(weekBuilt(null)).toBe(false);
    expect(runningGaps(null, NOW, zone)).toEqual({ shifts: 0, people: 0 });
    expect(weekBuilt(published)).toBe(true);
    expect(weekBuilt({ ...published, publishedAt: null })).toBe(true);
  });

  it("is nothing once every shift short of someone has begun", () => {
    // Wednesday 18 November at 16:00: the last of them began at 08:00.
    const later = new Date("2026-11-18T14:00:00.000Z");
    expect(runningGaps(published, later, zone)).toEqual({
      shifts: 0,
      people: 0,
    });
  });
});

describe("builderHref", () => {
  it("names the week it opens", () => {
    expect(builderHref(WEEKS.thisWeek)).toBe("/schedule/build?week=2026-11-15");
    expect(builderWeekOf("2026-11-15", WEEKS)).toBe("this");
  });
});

// Where Today's hero and the schedule tab's row lead: this week's builder
// while it lacks someone, or while it waits to be published.
describe("runningFirst", () => {
  const saved = "2026-11-14T18:00:00.000Z";
  const published = { savedAt: saved, publishedAt: saved, shifts: week };
  // Everything still to start is staffed; Monday's evening, over, is not.
  const staffed = [
    monEvening,
    tueMorning,
    {
      ...tueEvening,
      assignees: [roni, itai].map((user) => ({ user, position: null })),
    },
    {
      ...wedMorning,
      assignees: [tamar, roni].map((user) => ({ user, position: null })),
    },
  ];

  it("leads to a published week while a shift still to start lacks someone", () => {
    expect(runningFirst(published, NOW, zone)).toBe(true);
    expect(runningFirst({ ...published, shifts: staffed }, NOW, zone)).toBe(
      false,
    );
  });

  it("leads to a draft saved and not published, fully staffed or not", () => {
    expect(runningFirst({ ...published, publishedAt: null }, NOW, zone)).toBe(
      true,
    );
    expect(
      runningFirst(
        { savedAt: saved, publishedAt: null, shifts: staffed },
        NOW,
        zone,
      ),
    ).toBe(true);
    // Saved with nothing in it: nothing waits to be published.
    expect(
      runningFirst(
        { savedAt: saved, publishedAt: null, shifts: [] },
        NOW,
        zone,
      ),
    ).toBe(false);
  });

  it("never leads to a week nobody built", () => {
    expect(
      runningFirst(
        { savedAt: null, publishedAt: null, shifts: week },
        NOW,
        zone,
      ),
    ).toBe(false);
    expect(runningFirst(null, NOW, zone)).toBe(false);
  });
});

// What the schedule tab's "השבוע" and "השבוע הבא" show a manager of a week
// not yet out (R4: this week's saved draft too), and a worker never.
describe("boardDraft", () => {
  const thisWeek = { start: WEEKS.thisWeek, publishedAt: null };
  const built = { week: { start: WEEKS.thisWeek }, shifts: week };

  it("is the week as it is built while it is not published", () => {
    expect(boardDraft(thisWeek, built)).toBe(built);
  });

  it("is nothing once the week is published", () => {
    expect(
      boardDraft(
        { ...thisWeek, publishedAt: "2026-11-14T18:00:00.000Z" },
        built,
      ),
    ).toBeNull();
  });

  it("is nothing for another week's build, or one with no shifts", () => {
    expect(
      boardDraft({ start: WEEKS.nextWeek, publishedAt: null }, built),
    ).toBeNull();
    expect(boardDraft(thisWeek, { ...built, shifts: [] })).toBeNull();
  });

  it("is nothing without a build, as for a worker", () => {
    expect(boardDraft(thisWeek, null)).toBeNull();
  });
});

describe("touchesSoon", () => {
  it("is nothing while nothing changed", () => {
    expect(touchesSoon(week, week, NOW, zone)).toBe(false);
  });

  it("is a change to a shift with people starting within 12 hours", () => {
    // Tuesday's evening starts at 15:00, in under four hours.
    const filled = {
      ...tueEvening,
      assignees: [...tueEvening.assignees, { user: itai, position: null }],
    };
    expect(
      touchesSoon(
        week,
        [monMorning, monEvening, tueMorning, filled, wedMorning],
        NOW,
        zone,
      ),
    ).toBe(true);
    // Taking its only person off touches it too.
    expect(
      touchesSoon(
        week,
        [
          monMorning,
          monEvening,
          tueMorning,
          { ...tueEvening, assignees: [] },
          wedMorning,
        ],
        NOW,
        zone,
      ),
    ).toBe(true);
  });

  it("is a person put on a shift under way", () => {
    const joined = {
      ...tueMorning,
      assignees: [...tueMorning.assignees, { user: roni, position: null }],
    };
    expect(
      touchesSoon(
        week,
        [monMorning, monEvening, joined, tueEvening, wedMorning],
        NOW,
        zone,
      ),
    ).toBe(true);
  });

  it("is not a change further ahead, nor one with nobody on it", () => {
    // Wednesday's morning starts at 08:00, 20 hours and 40 minutes away.
    const moved = { ...wedMorning, end: "16:00" };
    expect(
      touchesSoon(
        week,
        [monMorning, monEvening, tueMorning, tueEvening, moved],
        NOW,
        zone,
      ),
    ).toBe(false);
    const emptyAdded: ScheduledShift = {
      day: "2026-11-17",
      name: "אמצע",
      start: "17:00",
      end: "20:00",
      needed: 1,
      pattern: null,
      assignees: [],
    };
    expect(touchesSoon(week, [...week, emptyAdded], NOW, zone)).toBe(false);
  });

  it("counts a shift moved from far ahead to soon, and one removed that was soon", () => {
    const pulled = {
      ...wedMorning,
      day: "2026-11-17",
      start: "17:00",
      end: "21:00",
    };
    expect(
      touchesSoon(
        week,
        [monMorning, monEvening, tueMorning, tueEvening, pulled],
        NOW,
        zone,
      ),
    ).toBe(true);
    expect(
      touchesSoon(
        week,
        [monMorning, monEvening, tueMorning, wedMorning],
        NOW,
        zone,
      ),
    ).toBe(true);
  });

  it("takes everything with people as new in a week never published", () => {
    expect(touchesSoon([], week, NOW, zone)).toBe(true);
    expect(touchesSoon([], [wedMorning], NOW, zone)).toBe(false);
  });

  it("can look less far ahead", () => {
    const filled = {
      ...tueEvening,
      assignees: [...tueEvening.assignees, { user: itai, position: null }],
    };
    const screen = [monMorning, monEvening, tueMorning, filled, wedMorning];
    // 15:00 is three hours and forty minutes away.
    expect(touchesSoon(week, screen, NOW, zone, 3)).toBe(false);
    expect(touchesSoon(week, screen, NOW, zone, 4)).toBe(true);
  });
});

describe("lockBegun", () => {
  const begun = begunShifts(week, true, NOW, zone);
  const ended = new Set([ID(1), ID(2)]);
  const rows = (shifts: ScheduledShift[]) =>
    shifts.map((shift, id) => ({ id, shift }));

  it("is nothing while the begun shifts are as read, or took people while under way", () => {
    const joined = {
      ...tueMorning,
      assignees: [...tueMorning.assignees, { user: roni, position: null }],
    };
    expect(
      lockBegun(
        {
          rows: rows([monMorning, monEvening, joined, tueEvening]),
          removed: [],
        },
        week,
        begun,
        ended,
      ),
    ).toBeNull();
  });

  it("puts a begun shift changed on the screen back as it was read, in its place", () => {
    // The morning's end moved, while it had not begun yet on the screen.
    const moved = { ...tueMorning, start: "16:00", end: "18:00" };
    const screen = rows([
      monMorning,
      monEvening,
      tueEvening,
      moved,
      wedMorning,
    ]);
    const locked = lockBegun({ rows: screen, removed: [] }, week, begun, ended);
    expect(locked?.started).toEqual([tueMorning]);
    expect(locked?.ended).toEqual([]);
    // Back before the evening, keeping the screen's id (3).
    expect(locked?.rows.map((r) => [r.id, r.shift])).toEqual([
      [0, monMorning],
      [1, monEvening],
      [3, tueMorning],
      [2, tueEvening],
      [4, wedMorning],
    ]);
  });

  it("brings back a begun shift taken off", () => {
    const locked = lockBegun(
      {
        rows: rows([monMorning, tueMorning, tueEvening]),
        removed: [
          { id: 7, shift: monEvening },
          { id: 8, shift: { ...wedMorning, id: undefined } },
        ],
      },
      week,
      begun,
      ended,
    );
    expect(locked?.started).toEqual([monEvening]);
    expect(locked?.rows.map((r) => r.id)).toEqual([0, 7, 1, 2]);
    // A shift that has not begun stays among the removed.
    expect(locked?.removed.map((r) => r.id)).toEqual([8]);
  });

  it("takes off the people put on a shift that has ended since", () => {
    const joined = {
      ...monEvening,
      assignees: [...monEvening.assignees, { user: roni, position: null }],
    };
    const locked = lockBegun(
      { rows: rows([monMorning, joined, tueMorning]), removed: [] },
      week,
      begun,
      ended,
    );
    expect(locked?.ended).toEqual([monEvening]);
    expect(locked?.started).toEqual([]);
    expect(locked?.rows[1]).toEqual({ id: 1, shift: monEvening });
  });

  it("leaves a week with nothing begun as it is", () => {
    const moved = { ...tueMorning, end: "16:00" };
    expect(
      lockBegun(
        { rows: rows([moved]), removed: [] },
        week,
        new Set(),
        new Set(),
      ),
    ).toBeNull();
  });
});

// A clash across the week's edge names the other week from the week written
// (20261115000600_running_week_edge.sql); the words name it from now.
describe("edgeWeek", () => {
  it("is last week or next week from the running week", () => {
    expect(edgeWeek("this", "previous")).toBe("previous");
    expect(edgeWeek("this", "next")).toBe("next");
  });

  it("is this week, or the week after next, from next week", () => {
    expect(edgeWeek("next", "previous")).toBe("this");
    expect(edgeWeek("next", "next")).toBe("afterNext");
  });
});

// The fill's edge after the week on the screen (the fill plan's PR 3).
describe("nextWeekEdge", () => {
  const sunMorning = shift(11, "2026-11-22", "07:00", "15:00", [tamar]);
  const sunEvening = shift(12, "2026-11-22", "15:00", "23:00");
  const monMorning = shift(13, "2026-11-23", "07:00", "15:00", [itai]);
  const tueMorning = shift(14, "2026-11-24", "07:00", "15:00", [roni]);
  const next = [sunMorning, sunEvening, monMorning, tueMorning];

  it("is next week's first two days with people on them, building the week running now", () => {
    expect(nextWeekEdge("this", WEEKS.nextWeek, next)).toEqual([
      sunMorning,
      monMorning,
    ]);
    // Drawn from the pattern, with nobody on it yet: no edge.
    expect(nextWeekEdge("this", WEEKS.nextWeek, [sunEvening])).toEqual([]);
    // A shift dated outside next week is never its edge.
    const before = shift(15, "2026-11-21", "20:00", "02:00", [tamar]);
    expect(nextWeekEdge("this", WEEKS.nextWeek, [before, ...next])).toEqual([
      sunMorning,
      monMorning,
    ]);
  });

  it("is none building next week, whose week after can't be built yet", () => {
    expect(nextWeekEdge("next", WEEKS.nextWeek, next)).toEqual([]);
  });

  it("follows a week that starts on Monday", () => {
    // Next week from Monday 23 November: Monday and Tuesday.
    expect(nextWeekEdge("this", "2026-11-23", next)).toEqual([
      monMorning,
      tueMorning,
    ]);
  });
});
