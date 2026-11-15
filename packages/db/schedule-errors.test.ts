import { describe, expect, it } from "vitest";
import {
  endedShifts,
  movedShifts,
  pastShifts,
  ScheduleWriteError,
  scheduleClashedMeanwhile,
  scheduleTeamChanged,
  scheduleWeekOver,
  startedShifts,
} from "./schedule-errors";

// `saveWeekSchedule` and `publishWeekSchedule` throw the database's message
// after their own words; these are the two that mean someone on the week
// left the team or the staff since the builder was opened.
describe("scheduleTeamChanged", () => {
  it("knows someone no longer on the team, or off the staff", () => {
    expect(
      scheduleTeamChanged(
        new Error(
          "Could not save the schedule: Only active members of the business can work a shift",
        ),
      ),
    ).toBe(true);
    expect(
      scheduleTeamChanged(
        new Error(
          "Could not publish the schedule: An accountant is not on the staff",
        ),
      ),
    ).toBe(true);
    expect(
      scheduleTeamChanged(
        new ScheduleWriteError(
          "Could not publish the schedule: Only active members of the business can work a shift",
          { code: "22023" },
        ),
      ),
    ).toBe(true);
  });

  it("leaves every other failure to say it failed", () => {
    expect(
      scheduleTeamChanged(
        new Error(
          "Could not save the schedule: A person works two shifts at once",
        ),
      ),
    ).toBe(false);
    expect(
      scheduleTeamChanged({
        message: "Only active members of the business can work a shift",
      }),
    ).toBe(false);
    expect(scheduleTeamChanged(null)).toBe(false);
  });
});

// Past the action's own check of what was sent, a clash the database finds
// is with something the screen did not read: 22023 with the sentence that
// week_in_place.test.sql pins.
describe("scheduleClashedMeanwhile", () => {
  it("knows a clash with something changed meanwhile", () => {
    expect(
      scheduleClashedMeanwhile(
        new ScheduleWriteError(
          "Could not publish the schedule: A person works two shifts at once",
          { code: "22023" },
        ),
      ),
    ).toBe(true);
  });

  it("leaves every other failure to its own words", () => {
    expect(
      scheduleClashedMeanwhile(
        new ScheduleWriteError(
          "Could not publish the schedule: Only active members of the business can work a shift",
          { code: "22023" },
        ),
      ),
    ).toBe(false);
    expect(
      scheduleClashedMeanwhile(
        new ScheduleWriteError(
          "Could not publish the schedule: A person works two shifts at once",
          { code: "40001", hint: "moved" },
        ),
      ),
    ).toBe(false);
    expect(
      scheduleClashedMeanwhile(
        new Error(
          "Could not save the schedule: A person works two shifts at once",
        ),
      ),
    ).toBe(false);
    expect(scheduleClashedMeanwhile(null)).toBe(false);
  });
});

describe("ScheduleWriteError", () => {
  it("keeps the database's code, hint and detail with its words", () => {
    const error = new ScheduleWriteError("Could not publish the schedule: x", {
      code: "40001",
      hint: "moved",
      details: '["a"]',
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Could not publish the schedule: x");
    expect([error.code, error.hint, error.detail]).toEqual([
      "40001",
      "moved",
      '["a"]',
    ]);
    expect(new ScheduleWriteError("y", {})).toMatchObject({
      code: null,
      hint: null,
      detail: null,
    });
  });
});

// 20261115000100_week_in_place.sql refuses a save or a publish that changes a
// shift changed since the screen read it: 40001, hint 'moved', the ids in its
// detail as a JSON array.
describe("movedShifts", () => {
  const moved = (details: string | null) =>
    new ScheduleWriteError("Could not publish the schedule: moved", {
      code: "40001",
      hint: "moved",
      details,
    });

  it("names the shifts that changed meanwhile", () => {
    expect(
      movedShifts(
        moved(
          '["8f000000-0000-4000-a000-0000000000e1", "8f000000-0000-4000-a000-0000000000e2"]',
        ),
      ),
    ).toEqual([
      "8f000000-0000-4000-a000-0000000000e1",
      "8f000000-0000-4000-a000-0000000000e2",
    ]);
    // Still a stale screen when the detail can't be read.
    expect(movedShifts(moved(null))).toEqual([]);
    expect(movedShifts(moved("not json"))).toEqual([]);
  });

  it("is nothing for any other refusal", () => {
    expect(
      movedShifts(
        new ScheduleWriteError("x", { code: "40001", hint: null, details: "" }),
      ),
    ).toBeNull();
    expect(
      movedShifts(
        new ScheduleWriteError("x", { code: "22023", hint: "moved" }),
      ),
    ).toBeNull();
    expect(movedShifts(new Error("40001 moved"))).toBeNull();
    expect(movedShifts(null)).toBeNull();
  });
});

// 20261115000300_running_week.sql: in a published week, what has begun stays
// as it was (55006, hint 'started', the ids), people join a shift under way
// only until it ends (55006, 'ended'), what is put in place starts after now
// (22023, 'past', each shift's id or null, day and start), and a week wholly
// over no longer changes (55000, 'over'). running_week.test.sql pins them.
describe("the week under way", () => {
  const refused = (code: string, hint: string, details: string | null) =>
    new ScheduleWriteError("Could not publish the schedule: refused", {
      code,
      hint,
      details,
    });
  const ID = "7a000000-0000-4000-a000-0000000000e1";

  it("names the shifts that had begun, or ended", () => {
    expect(startedShifts(refused("55006", "started", `["${ID}"]`))).toEqual([
      ID,
    ]);
    expect(endedShifts(refused("55006", "ended", `["${ID}"]`))).toEqual([ID]);
    // Still that refusal when the detail can't be read.
    expect(startedShifts(refused("55006", "started", null))).toEqual([]);
    expect(endedShifts(refused("55006", "ended", "not json"))).toEqual([]);
  });

  it("says which shifts would start before now", () => {
    expect(
      pastShifts(
        refused(
          "22023",
          "past",
          `[{"id": null, "day": "2026-12-08", "start": "09:00"}, {"id": "${ID}", "day": "2026-12-08", "start": "09:30"}]`,
        ),
      ),
    ).toEqual([
      { id: null, day: "2026-12-08", start: "09:00" },
      { id: ID, day: "2026-12-08", start: "09:30" },
    ]);
    expect(pastShifts(refused("22023", "past", "[]"))).toEqual([]);
    expect(pastShifts(refused("22023", "past", null))).toEqual([]);
  });

  it("knows a week that is over", () => {
    expect(scheduleWeekOver(refused("55000", "over", null))).toBe(true);
    // A save of a published week: 55000 with no hint.
    expect(
      scheduleWeekOver(
        new ScheduleWriteError(
          "Could not save the schedule: This week is published; publish the changes instead",
          { code: "55000" },
        ),
      ),
    ).toBe(false);
  });

  it("is nothing for any other refusal", () => {
    const moved = refused("40001", "moved", `["${ID}"]`);
    expect([
      startedShifts(moved),
      endedShifts(moved),
      pastShifts(moved),
      scheduleWeekOver(moved),
    ]).toEqual([null, null, null, false]);
    // The hint alone, or the code alone, is not enough.
    expect(startedShifts(refused("55000", "started", `["${ID}"]`))).toBeNull();
    expect(startedShifts(refused("55006", "ended", `["${ID}"]`))).toBeNull();
    expect(endedShifts(refused("55006", "started", `["${ID}"]`))).toBeNull();
    expect(pastShifts(refused("55006", "past", "[]"))).toBeNull();
    expect(scheduleWeekOver(refused("55006", "over", null))).toBe(false);
    expect(startedShifts(new Error("55006 started"))).toBeNull();
    expect(pastShifts(null)).toBeNull();
    expect(scheduleWeekOver(undefined)).toBe(false);
  });

  it("keeps them apart from a clash and from the team", () => {
    const past = new ScheduleWriteError(
      "Could not publish the schedule: A new or moved shift must start after now",
      { code: "22023", hint: "past", details: "[]" },
    );
    expect([scheduleClashedMeanwhile(past), scheduleTeamChanged(past)]).toEqual(
      [false, false],
    );
  });
});
