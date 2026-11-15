import { describe, expect, it } from "vitest";
import {
  movedShifts,
  ScheduleWriteError,
  scheduleClashedMeanwhile,
  scheduleTeamChanged,
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
