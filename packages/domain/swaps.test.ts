import { describe, expect, it } from "vitest";
import {
  approvalsFor,
  myRequestFor,
  offersFor,
  type ShiftSwap,
  shiftsOverlap,
  swapFailureOf,
} from "./swaps";

const shift = (
  id: string,
  day: string,
  start: string,
  end: string,
  users: string[],
) => ({
  id,
  day,
  start,
  end,
  name: id,
  assignees: users.map((user) => ({ user, position: null })),
});

const swap = (
  id: string,
  shiftId: string,
  requestedBy: string,
  takenBy: string | null = null,
): ShiftSwap => ({
  id,
  shiftId,
  requestedBy,
  takenBy,
  status: takenBy ? "taken" : "open",
});

describe("shiftsOverlap", () => {
  it("compares hours on the same day", () => {
    expect(
      shiftsOverlap(
        { day: "2026-11-08", start: "07:00", end: "15:00" },
        { day: "2026-11-08", start: "14:00", end: "22:00" },
      ),
    ).toBe(true);
    expect(
      shiftsOverlap(
        { day: "2026-11-08", start: "07:00", end: "15:00" },
        { day: "2026-11-08", start: "15:00", end: "22:00" },
      ),
    ).toBe(false);
  });

  it("counts a night shift into the next day, also across weeks", () => {
    expect(
      shiftsOverlap(
        { day: "2026-11-14", start: "20:00", end: "02:00" },
        { day: "2026-11-15", start: "01:00", end: "09:00" },
      ),
    ).toBe(true);
    expect(
      shiftsOverlap(
        { day: "2026-11-14", start: "20:00", end: "02:00" },
        { day: "2026-11-15", start: "02:00", end: "09:00" },
      ),
    ).toBe(false);
  });
});

describe("myRequestFor", () => {
  it("finds the person's own live request for a shift", () => {
    const swaps = [swap("1", "s1", "noa"), swap("2", "s2", "yoav")];
    expect(myRequestFor(swaps, "s1", "noa")?.id).toBe("1");
    expect(myRequestFor(swaps, "s2", "noa")).toBeNull();
    expect(myRequestFor(swaps, "s1", "yoav")).toBeNull();
  });
});

describe("offersFor", () => {
  const shifts = [
    shift("sun-morning", "2026-11-08", "07:00", "15:00", ["noa"]),
    shift("sun-middle", "2026-11-08", "11:00", "19:00", ["yoav"]),
    shift("sun-evening", "2026-11-08", "16:00", "23:00", ["maya", "omer"]),
    shift("mon-morning", "2026-11-09", "07:00", "15:00", ["itay"]),
    shift("old", "2026-11-07", "07:00", "15:00", ["itay"]),
  ];

  it("lists others' open requests, busy when at the same time, day by day", () => {
    const offers = offersFor(
      [
        swap("a", "mon-morning", "itay"),
        swap("b", "sun-middle", "yoav"),
        swap("c", "sun-evening", "maya"),
      ],
      shifts,
      "noa",
      "2026-11-08",
    );
    expect(offers.map((o) => [o.swap.id, o.state])).toEqual([
      ["b", "busy"],
      ["c", "available"],
      ["a", "available"],
    ]);
  });

  it("leaves out own requests, shifts the person is on and past days", () => {
    const offers = offersFor(
      [
        swap("own", "sun-morning", "noa"),
        swap("on-it", "sun-evening", "maya"),
        swap("past", "old", "itay"),
      ],
      shifts,
      "omer",
      "2026-11-08",
    );
    expect(offers.map((o) => o.swap.id)).toEqual(["own"]);
    expect(
      offersFor(
        [swap("own", "sun-morning", "noa")],
        shifts,
        "noa",
        "2026-11-08",
      ),
    ).toEqual([]);
    expect(
      offersFor([swap("past", "old", "itay")], shifts, "noa", "2026-11-08"),
    ).toEqual([]);
  });

  it("shows a taken request only to the person who took it", () => {
    const swaps = [swap("t", "mon-morning", "itay", "noa")];
    expect(
      offersFor(swaps, shifts, "noa", "2026-11-08").map((o) => o.state),
    ).toEqual(["takenByYou"]);
    expect(offersFor(swaps, shifts, "yoav", "2026-11-08")).toEqual([]);
  });

  it("skips requests for shifts it does not know", () => {
    expect(
      offersFor([swap("x", "gone", "itay")], shifts, "noa", "2026-11-08"),
    ).toEqual([]);
  });
});

describe("swapFailureOf", () => {
  it("explains the database's refusals", () => {
    expect(swapFailureOf("55000", "The shift has already started")).toBe(
      "started",
    );
    expect(swapFailureOf("55000", "This request is no longer open")).toBe(
      "closed",
    );
    expect(swapFailureOf("22023")).toBe("busy");
    expect(swapFailureOf("23505")).toBe("already");
    expect(swapFailureOf("42501")).toBe("noAccess");
    expect(swapFailureOf("P0002")).toBe("noAccess");
    expect(swapFailureOf(undefined)).toBe("failed");
  });
});

describe("approvalsFor", () => {
  const shifts = [
    {
      ...shift("eve", "2026-11-08", "16:00", "23:00", []),
      assignees: [
        { user: "noa", position: "waiter" },
        { user: "itay", position: "cook" },
      ],
    },
    shift("morning", "2026-11-08", "08:00", "16:00", ["maya"]),
    shift("past", "2026-11-05", "08:00", "16:00", ["omer"]),
  ];

  it("lists taken requests by shift time, with the giver's position", () => {
    const swaps = [
      swap("1", "eve", "noa", "yoav"),
      swap("2", "morning", "maya", "shira"),
    ];
    expect(
      approvalsFor(swaps, shifts, "2026-11-06").map((a) => [
        a.swap.id,
        a.position,
      ]),
    ).toEqual([
      ["2", null],
      ["1", "waiter"],
    ]);
  });

  it("leaves out open requests, past days and unknown shifts", () => {
    const swaps = [
      swap("1", "eve", "noa"),
      swap("2", "past", "omer", "yoav"),
      swap("3", "gone", "maya", "yoav"),
    ];
    expect(approvalsFor(swaps, shifts, "2026-11-06")).toEqual([]);
  });

  it("keeps a request whose giver has left the shift, with no position", () => {
    const [approval] = approvalsFor(
      [swap("1", "morning", "noa", "yoav")],
      shifts,
      "2026-11-08",
    );
    expect(approval?.position).toBeNull();
    expect(approval?.swap.takenBy).toBe("yoav");
  });
});
