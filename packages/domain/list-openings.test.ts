import { describe, expect, it } from "vitest";
import {
  dueOpenings,
  listOpenings,
  nextOpenings,
  type OpeningContext,
  type OpeningSchedule,
  type OpeningShift,
  restartsOpenings,
  type ShabbatSpan,
  shabbatTouches,
  wallInstant,
} from "./list-openings";
import { ISRAEL_TIME_ZONE, ISRAELI_CITIES } from "./shabbat";
import { shabbatSpansFrom, shabbatTimes } from "./shabbat-times";

const TZ = ISRAEL_TIME_ZONE;

/** Sunday to Thursday at 08:30, 45 minutes to do it, saved long ago. */
const opening: OpeningSchedule = {
  days: [0, 1, 2, 3, 4],
  anchor: "day",
  shift: null,
  opensOffset: 8 * 60 + 30,
  dueOffset: 9 * 60 + 15,
  active: true,
  startsOn: "2026-11-01",
  opensFrom: "2026-11-01T00:00:00.000Z",
};

const open: OpeningContext = {
  timeZone: TZ,
  shabbat: [],
  shifts: [],
  patterns: [],
};

/** The Shabbat of 13 and 14 November 2026 in Tel Aviv, as hebcal has it. */
const telAviv = shabbatTimes(
  { ...ISRAELI_CITIES.telAviv, timeZone: TZ },
  "2026-11-13",
);
const span: ShabbatSpan = {
  friday: telAviv.friday,
  candleLighting: telAviv.candleLighting.toISOString(),
  havdalah: telAviv.havdalah.toISOString(),
};
const closed: OpeningContext = { ...open, shabbat: [span] };

const at = (iso: string) => new Date(iso);
const opens = (list: { opensAt: string }[]) => list.map((o) => o.opensAt);
const minutes = (n: number) => n * 60_000;

describe("a time of the day", () => {
  it("opens once on each of its days across a week, by the business's clock", () => {
    // Sunday 8 November 00:00 to Saturday 14 November 24:00 in Israel (+02).
    const week = listOpenings(
      opening,
      at("2026-11-07T22:00:00.000Z"),
      at("2026-11-14T22:00:00.000Z"),
      open,
    );
    expect(week.map((o) => o.occursOn)).toEqual([
      "2026-11-08",
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
    ]);
    expect(week[0]).toEqual({
      occursOn: "2026-11-08",
      opensAt: "2026-11-08T06:30:00.000Z",
      dueAt: "2026-11-08T07:15:00.000Z",
      shiftId: null,
    });
    expect(week.every((o) => o.shiftId === null)).toBe(true);
  });

  it("starts the day after when it was saved after its own time", () => {
    // Saved on Tuesday at 10:00: Tuesday's 08:30 has gone by.
    const saved = {
      ...opening,
      startsOn: "2026-11-10",
      opensFrom: "2026-11-10T08:00:00.000Z",
    };
    expect(
      opens(nextOpenings(saved, at("2026-11-10T08:00:00.000Z"), open)),
    ).toEqual([
      "2026-11-11T06:30:00.000Z",
      "2026-11-12T06:30:00.000Z",
      "2026-11-15T06:30:00.000Z",
    ]);
  });

  it("opens nothing while paused, or before the first day it runs", () => {
    const from = at("2026-11-07T22:00:00.000Z");
    const to = at("2026-11-14T22:00:00.000Z");
    expect(listOpenings({ ...opening, active: false }, from, to, open)).toEqual(
      [],
    );
    expect(
      opens(
        listOpenings({ ...opening, startsOn: "2026-11-11" }, from, to, open),
      ),
    ).toEqual(["2026-11-11T06:30:00.000Z", "2026-11-12T06:30:00.000Z"]);
  });

  it("is what the minute job opens, back to 12 hours past its due time", () => {
    expect(dueOpenings(opening, at("2026-11-10T07:00:00.000Z"), open)).toEqual([
      {
        occursOn: "2026-11-10",
        opensAt: "2026-11-10T06:30:00.000Z",
        dueAt: "2026-11-10T07:15:00.000Z",
        shiftId: null,
      },
    ]);
    // Before it opens, and long after it was due: nothing.
    expect(dueOpenings(opening, at("2026-11-10T06:29:00.000Z"), open)).toEqual(
      [],
    );
    expect(dueOpenings(opening, at("2026-11-10T19:16:00.000Z"), open)).toEqual(
      [],
    );
  });
});

describe("the clock changes", () => {
  it("reads a time the autumn repeats as the later one, on 25 October 2026", () => {
    const night = {
      ...opening,
      days: [0, 1, 2, 3, 4, 5, 6],
      opensOffset: 90,
      dueOffset: 120,
      startsOn: "2026-10-01",
      opensFrom: "2026-10-01T00:00:00.000Z",
    };
    const around = listOpenings(
      night,
      at("2026-10-23T12:00:00.000Z"),
      at("2026-10-26T12:00:00.000Z"),
      open,
    );
    expect(around.map((o) => [o.occursOn, o.opensAt, o.dueAt])).toEqual([
      // Saturday, summer time (+03).
      ["2026-10-24", "2026-10-23T22:30:00.000Z", "2026-10-23T23:00:00.000Z"],
      // Sunday: 01:30 happens twice; the second, in winter time (+02).
      ["2026-10-25", "2026-10-24T23:30:00.000Z", "2026-10-25T00:00:00.000Z"],
      ["2026-10-26", "2026-10-25T23:30:00.000Z", "2026-10-26T00:00:00.000Z"],
    ]);
    // A day's time moves with the clock: 08:00 is 05:00 UTC, then 06:00.
    expect(wallInstant("2026-10-24", 480, TZ).toISOString()).toBe(
      "2026-10-24T05:00:00.000Z",
    );
    expect(wallInstant("2026-10-25", 480, TZ).toISOString()).toBe(
      "2026-10-25T06:00:00.000Z",
    );
  });

  it("opens a time the spring skips an hour later, on 26 March 2027, with as long as it had", () => {
    const skipped = {
      ...opening,
      days: [5],
      opensOffset: 150,
      dueOffset: 180,
      startsOn: "2027-03-01",
      opensFrom: "2027-03-01T00:00:00.000Z",
    };
    const [friday] = listOpenings(
      skipped,
      at("2027-03-25T12:00:00.000Z"),
      at("2027-03-26T12:00:00.000Z"),
      closed,
    );
    // 02:30 doesn't exist: it is 03:30 summer time, and due half an hour on.
    expect(friday).toEqual({
      occursOn: "2027-03-26",
      opensAt: "2027-03-26T00:30:00.000Z",
      dueAt: "2027-03-26T01:00:00.000Z",
      shiftId: null,
    });
  });
});

describe("Shabbat, for a business closed on it", () => {
  const friday = (opensOffset: number, dueOffset: number) =>
    listOpenings(
      { ...opening, days: [5], opensOffset, dueOffset },
      at("2026-11-12T22:00:00.000Z"),
      at("2026-11-14T22:00:00.000Z"),
      closed,
    );

  it("knows the Shabbat it reads", () => {
    expect(span.friday).toBe("2026-11-13");
    expect(Date.parse(span.candleLighting)).toBeLessThan(
      Date.parse(span.havdalah),
    );
    expect(shabbatSpansFrom(ISRAELI_CITIES.telAviv, "2026-11-10", 2)).toEqual([
      span,
      expect.objectContaining({ friday: "2026-11-20" }),
    ]);
  });

  it("sends nothing on Friday after candle lighting", () => {
    expect(friday(17 * 60, 18 * 60)).toEqual([]);
  });

  it("is due at candle lighting when it opens before it and is due after", () => {
    const [list] = friday(15 * 60 + 30, 17 * 60);
    expect(list?.opensAt).toBe("2026-11-13T13:30:00.000Z");
    expect(list?.dueAt).toBe(span.candleLighting);
    // One due before candle lighting stays as it is.
    const [early] = friday(9 * 60, 10 * 60);
    expect(early?.dueAt).toBe("2026-11-13T08:00:00.000Z");
  });

  it("opens on Saturday at havdalah, with as long as it would have had", () => {
    const [list] = listOpenings(
      { ...opening, days: [6], opensOffset: 10 * 60, dueOffset: 11 * 60 },
      at("2026-11-13T22:00:00.000Z"),
      at("2026-11-14T22:00:00.000Z"),
      closed,
    );
    expect(list).toEqual({
      occursOn: "2026-11-14",
      opensAt: span.havdalah,
      dueAt: new Date(Date.parse(span.havdalah) + minutes(60)).toISOString(),
      shiftId: null,
    });
    // After havdalah, it opens at its own time.
    const [late] = listOpenings(
      { ...opening, days: [6], opensOffset: 21 * 60, dueOffset: 22 * 60 },
      at("2026-11-13T22:00:00.000Z"),
      at("2026-11-14T22:00:00.000Z"),
      closed,
    );
    expect(late?.opensAt).toBe("2026-11-14T19:00:00.000Z");
  });

  it("leaves a business open on Shabbat as it is", () => {
    const [list] = listOpenings(
      { ...opening, days: [5], opensOffset: 17 * 60, dueOffset: 18 * 60 },
      at("2026-11-12T22:00:00.000Z"),
      at("2026-11-13T22:00:00.000Z"),
      open,
    );
    expect(list?.opensAt).toBe("2026-11-13T15:00:00.000Z");
    expect(shabbatTouches({ days: [5] }, false)).toBe(false);
    expect(shabbatTouches({ days: [5] }, true)).toBe(true);
    expect(shabbatTouches({ days: [0, 1] }, true)).toBe(false);
  });

  it("holds a time that follows a shift to the same rule", () => {
    // Friday's short shift ends at candle lighting, 16:20 (+02) here.
    const friday: ShabbatSpan = {
      friday: "2026-11-13",
      candleLighting: "2026-11-13T14:20:00.000Z",
      havdalah: "2026-11-14T15:20:00.000Z",
    };
    const candles = new Date(friday.candleLighting);
    const short: OpeningContext = {
      ...open,
      shabbat: [friday],
      patterns: ["short"],
      shifts: [
        {
          id: "f1",
          day: "2026-11-13",
          start: "09:00",
          end: "16:20",
          pattern: "short",
        },
      ],
    };
    const atEnd = (opensOffset: number, dueOffset: number) =>
      listOpenings(
        {
          ...opening,
          days: [5],
          anchor: "shift_end",
          shift: "short",
          opensOffset,
          dueOffset,
        },
        at("2026-11-12T22:00:00.000Z"),
        at("2026-11-14T22:00:00.000Z"),
        short,
      );
    // At its end, at candle lighting: nothing, as the database has it.
    expect(atEnd(0, 30)).toEqual([]);
    // Half an hour before: due at candle lighting.
    expect(atEnd(-30, 30)).toEqual([
      {
        occursOn: "2026-11-13",
        opensAt: new Date(candles.getTime() - minutes(30)).toISOString(),
        dueAt: friday.candleLighting,
        shiftId: "f1",
      },
    ]);
    expect(shabbatTouches({ days: [5] }, true)).toBe(true);
  });

  it("opens a Saturday shift's time before havdalah at havdalah", () => {
    const saturday: OpeningContext = {
      ...closed,
      patterns: ["evening"],
      shifts: [
        {
          id: "sat",
          day: "2026-11-14",
          start: "16:00",
          end: "23:00",
          pattern: "evening",
        },
      ],
    };
    const [list] = listOpenings(
      {
        ...opening,
        days: [6],
        anchor: "shift_start",
        shift: "evening",
        opensOffset: -30,
        dueOffset: 60,
      },
      at("2026-11-13T22:00:00.000Z"),
      at("2026-11-14T22:00:00.000Z"),
      saturday,
    );
    // 15:30 on Saturday is before havdalah: it opens then, with its 90 minutes.
    expect(list).toEqual({
      occursOn: "2026-11-14",
      opensAt: span.havdalah,
      dueAt: new Date(Date.parse(span.havdalah) + minutes(90)).toISOString(),
      shiftId: "sat",
    });
  });
});

describe("a time changed after it was saved", () => {
  it("counts from now once its days or hours change, or it is switched back on", () => {
    expect(restartsOpenings(opening, { ...opening, opensOffset: 480 })).toBe(
      true,
    );
    expect(restartsOpenings(opening, { ...opening, dueOffset: 600 })).toBe(
      true,
    );
    expect(restartsOpenings(opening, { ...opening, days: [0, 1, 2, 3] })).toBe(
      true,
    );
    expect(
      restartsOpenings(opening, {
        ...opening,
        anchor: "shift_start",
        shift: "evening",
      }),
    ).toBe(true);
    expect(
      restartsOpenings({ ...opening, active: false }, { ...opening }),
    ).toBe(true);
  });

  it("keeps its moment for the same days in another order, or a pause", () => {
    expect(
      restartsOpenings(opening, { ...opening, days: [4, 3, 2, 1, 0] }),
    ).toBe(false);
    expect(restartsOpenings(opening, { ...opening, active: false })).toBe(
      false,
    );
  });

  it("opens nothing today once it counts from after its hour", () => {
    // Moved to 08:30 at 10:00 on Tuesday: Wednesday is the first.
    const moved = { ...opening, opensFrom: "2026-11-10T08:00:00.000Z" };
    expect(dueOpenings(moved, at("2026-11-10T08:00:00.000Z"), open)).toEqual(
      [],
    );
    expect(
      opens(nextOpenings(moved, at("2026-11-10T08:00:00.000Z"), open, 1)),
    ).toEqual(["2026-11-11T06:30:00.000Z"]);
  });
});

describe("a time that follows a shift", () => {
  const shifts: OpeningShift[] = [
    {
      id: "s1",
      day: "2026-11-10",
      start: "16:00",
      end: "23:30",
      pattern: "evening",
    },
    // Ends after midnight, on the 12th.
    {
      id: "s2",
      day: "2026-11-11",
      start: "18:00",
      end: "01:00",
      pattern: "evening",
    },
    {
      id: "s3",
      day: "2026-11-11",
      start: "09:00",
      end: "16:00",
      pattern: "morning",
    },
  ];
  const context: OpeningContext = {
    ...closed,
    shifts,
    patterns: ["morning", "evening"],
  };
  const evening: OpeningSchedule = {
    ...opening,
    days: [0, 1, 2, 3, 4, 5, 6],
    anchor: "shift_start",
    shift: "evening",
    opensOffset: -30,
    dueOffset: 60,
  };
  const window = [
    at("2026-11-09T22:00:00.000Z"),
    at("2026-11-12T22:00:00.000Z"),
  ] as const;

  it("opens half an hour before each published shift of its pattern starts", () => {
    expect(listOpenings(evening, ...window, context)).toEqual([
      {
        occursOn: "2026-11-10",
        opensAt: "2026-11-10T13:30:00.000Z",
        dueAt: "2026-11-10T15:00:00.000Z",
        shiftId: "s1",
      },
      {
        occursOn: "2026-11-11",
        opensAt: "2026-11-11T15:30:00.000Z",
        dueAt: "2026-11-11T17:00:00.000Z",
        shiftId: "s2",
      },
    ]);
  });

  it("follows a shift's end into the next day, on the shift's own day", () => {
    const [, second] = listOpenings(
      { ...evening, anchor: "shift_end", opensOffset: -30, dueOffset: 0 },
      ...window,
      context,
    );
    expect(second).toEqual({
      occursOn: "2026-11-11",
      opensAt: "2026-11-11T22:30:00.000Z",
      dueAt: "2026-11-11T23:00:00.000Z",
      shiftId: "s2",
    });
  });

  it("opens nothing for a shift the settings no longer have, or on days it doesn't run", () => {
    expect(
      listOpenings(evening, ...window, { ...context, patterns: ["morning"] }),
    ).toEqual([]);
    expect(
      listOpenings({ ...evening, days: [3] }, ...window, context).map(
        (o) => o.shiftId,
      ),
    ).toEqual(["s2"]);
  });
});
