import { describe, expect, it } from "vitest";
import {
  availabilityStatus,
  clockAt,
  dayPart,
  nextShift,
  shiftPhase,
  shiftWhen,
  type TodayTile,
  tileNeedsAction,
  todayTiles,
} from "./today";

const shift = (
  day: string,
  start: string,
  end: string,
  people: string[] = [],
) => ({
  day,
  start,
  end,
  assignees: people.map((user) => ({ user, position: null })),
});

const at = (date: string, time: string) => ({ date, time });

describe("clockAt", () => {
  it("reads the date and time in the business's zone", () => {
    // Winter in Israel is UTC+2, so this is already the next day there.
    expect(clockAt(new Date("2026-11-03T22:30:00Z"), "Asia/Jerusalem")).toEqual(
      { date: "2026-11-04", time: "00:30" },
    );
  });
});

describe("dayPart", () => {
  it.each([
    ["04:59", "night"],
    ["05:00", "morning"],
    ["11:59", "morning"],
    ["12:00", "noon"],
    ["16:59", "noon"],
    ["17:00", "evening"],
    ["21:59", "evening"],
    ["22:00", "night"],
    ["00:00", "night"],
  ])("%s is %s", (time, part) => {
    expect(dayPart(time)).toBe(part);
  });
});

describe("shiftPhase", () => {
  const morning = shift("2026-11-03", "09:00", "16:00");

  it("follows the clock through the shift", () => {
    expect(shiftPhase(morning, at("2026-11-03", "08:59"))).toBe("before");
    expect(shiftPhase(morning, at("2026-11-03", "09:00"))).toBe("now");
    expect(shiftPhase(morning, at("2026-11-03", "15:59"))).toBe("now");
    expect(shiftPhase(morning, at("2026-11-03", "16:00"))).toBe("after");
  });

  it("counts a shift that runs past midnight as on until it ends", () => {
    const late = shift("2026-11-03", "19:30", "01:00");
    expect(shiftPhase(late, at("2026-11-03", "23:00"))).toBe("now");
    expect(shiftPhase(late, at("2026-11-04", "00:30"))).toBe("now");
    expect(shiftPhase(late, at("2026-11-04", "01:00"))).toBe("after");
  });
});

describe("nextShift", () => {
  const shifts = [
    shift("2026-11-03", "09:00", "16:00", ["noa"]),
    shift("2026-11-03", "16:00", "23:30", ["yoav"]),
    shift("2026-11-04", "09:00", "16:00", ["noa", "yoav"]),
  ];

  it("gives the soonest shift of the person", () => {
    expect(nextShift(shifts, at("2026-11-03", "08:00"), "yoav")).toBe(
      shifts[1],
    );
  });

  it("gives the shift the person is on right now", () => {
    expect(nextShift(shifts, at("2026-11-03", "12:00"), "noa")).toBe(shifts[0]);
  });

  it("skips a shift that ended earlier today", () => {
    expect(nextShift(shifts, at("2026-11-03", "16:00"), "noa")).toBe(shifts[2]);
  });

  it("gives anyone's shift without a person", () => {
    expect(nextShift(shifts, at("2026-11-03", "17:00"))).toBe(shifts[1]);
  });

  it("finds a shift still on after midnight", () => {
    const late = shift("2026-11-03", "19:30", "01:00", ["noa"]);
    expect(nextShift([late], at("2026-11-04", "00:30"), "noa")).toBe(late);
  });

  it("is null when nothing is ahead, or the person is on nothing", () => {
    expect(nextShift(shifts, at("2026-11-05", "08:00"))).toBeNull();
    expect(nextShift(shifts, at("2026-11-03", "08:00"), "maya")).toBeNull();
    expect(nextShift([], at("2026-11-03", "08:00"))).toBeNull();
  });

  it("does not depend on the order it is given", () => {
    const backwards = [...shifts].reverse();
    expect(nextShift(backwards, at("2026-11-03", "08:00"))).toBe(shifts[0]);
  });
});

describe("shiftWhen", () => {
  const evening = shift("2026-11-03", "16:00", "23:30");

  it("says now while the shift is on", () => {
    expect(shiftWhen(evening, at("2026-11-03", "16:00"))).toEqual({
      kind: "now",
    });
  });

  it("counts minutes under an hour", () => {
    expect(shiftWhen(evening, at("2026-11-03", "15:12"))).toEqual({
      kind: "minutes",
      count: 48,
    });
  });

  it("counts minutes across midnight", () => {
    const early = shift("2026-11-04", "00:15", "06:00");
    expect(shiftWhen(early, at("2026-11-03", "23:30"))).toEqual({
      kind: "minutes",
      count: 45,
    });
  });

  it("rounds to hours later today", () => {
    expect(shiftWhen(evening, at("2026-11-03", "15:00"))).toEqual({
      kind: "hours",
      count: 1,
    });
    expect(shiftWhen(evening, at("2026-11-03", "08:12"))).toEqual({
      kind: "hours",
      count: 8,
    });
  });

  it("says tomorrow, then leaves the day to the screen", () => {
    expect(shiftWhen(evening, at("2026-11-02", "08:00"))).toEqual({
      kind: "tomorrow",
    });
    expect(shiftWhen(evening, at("2026-11-01", "08:00"))).toEqual({
      kind: "later",
    });
  });
});

describe("availabilityStatus", () => {
  const dueAt = "2026-11-04T16:00:00.000Z";
  const before = new Date("2026-11-04T15:59:00.000Z");
  const after = new Date("2026-11-04T16:01:00.000Z");

  it("is sent once it is in, whatever else is true", () => {
    expect(
      availabilityStatus({ sent: true, published: true, dueAt, now: after }),
    ).toBe("sent");
  });

  it("is closed when next week is already published", () => {
    expect(
      availabilityStatus({ sent: false, published: true, dueAt, now: before }),
    ).toBe("closed");
  });

  it("is due until the due moment, then late", () => {
    expect(
      availabilityStatus({ sent: false, published: false, dueAt, now: before }),
    ).toBe("due");
    expect(
      availabilityStatus({ sent: false, published: false, dueAt, now: after }),
    ).toBe("late");
  });
});

describe("todayTiles", () => {
  const team = { gaps: 6, missing: 2, pastDue: false, swaps: 1 };
  const keys = (tiles: TodayTile[]) => tiles.map((tile) => tile.key);

  it("gives a worker their availability and the shifts they can take", () => {
    expect(
      todayTiles({
        role: "worker",
        availability: "due",
        offers: 2,
        team: null,
      }),
    ).toEqual([
      { key: "availability", status: "due" },
      { key: "offers", count: 2 },
    ]);
  });

  it("keeps a worker's tiles at zero, so the screen stays the same", () => {
    expect(
      keys(
        todayTiles({
          role: "worker",
          availability: "sent",
          offers: 0,
          team: null,
        }),
      ),
    ).toEqual(["availability", "offers"]);
  });

  it("gives an owner the team's tiles and no availability of their own", () => {
    expect(
      todayTiles({ role: "owner", availability: "due", offers: 3, team }),
    ).toEqual([
      { key: "gaps", count: 6 },
      { key: "missing", count: 2, late: false },
      { key: "swaps", count: 1 },
    ]);
  });

  it("adds a manager's own availability only while it is missing", () => {
    expect(
      keys(
        todayTiles({ role: "manager", availability: "due", offers: 0, team }),
      ),
    ).toEqual(["gaps", "missing", "swaps", "availability"]);
    expect(
      keys(
        todayTiles({ role: "manager", availability: "late", offers: 0, team }),
      ),
    ).toEqual(["gaps", "missing", "swaps", "availability"]);
    expect(
      keys(
        todayTiles({ role: "manager", availability: "sent", offers: 0, team }),
      ),
    ).toEqual(["gaps", "missing", "swaps"]);
  });

  it("marks who has not sent as late once the due moment passed, also for a manager who sent theirs", () => {
    expect(
      todayTiles({
        role: "manager",
        availability: "sent",
        offers: 0,
        team: { ...team, pastDue: true },
      })[1],
    ).toEqual({ key: "missing", count: 2, late: true });
  });

  it("drops who has not sent once next week is published, also for a manager who sent theirs", () => {
    const published = { ...team, missing: null };
    for (const availability of ["sent", "closed"] as const) {
      expect(
        keys(
          todayTiles({
            role: "manager",
            availability,
            offers: 0,
            team: published,
          }),
        ),
      ).toEqual(["gaps", "swaps"]);
    }
  });

  it("drops open places when next week has no shifts", () => {
    expect(
      keys(
        todayTiles({
          role: "owner",
          availability: "sent",
          offers: 0,
          team: { ...team, gaps: null },
        }),
      ),
    ).toEqual(["missing", "swaps"]);
  });
});

describe("tileNeedsAction", () => {
  it("is true for counts above zero", () => {
    expect(tileNeedsAction({ key: "gaps", count: 1 })).toBe(true);
    expect(tileNeedsAction({ key: "swaps", count: 0 })).toBe(false);
  });

  it("is true only for availability someone still has to send", () => {
    expect(tileNeedsAction({ key: "availability", status: "due" })).toBe(true);
    expect(tileNeedsAction({ key: "availability", status: "late" })).toBe(true);
    expect(tileNeedsAction({ key: "availability", status: "sent" })).toBe(
      false,
    );
    expect(tileNeedsAction({ key: "availability", status: "closed" })).toBe(
      false,
    );
  });
});
