import type { EndedSwap, PastRequest, SwapOutcome } from "@domain/swaps";
import { describe, expect, it } from "vitest";
import {
  type AppT,
  endedRequestLine,
  nameOf,
  outcomeLine,
  ownEndedSwaps,
  pastRequestLine,
  type ShiftData,
} from "./shift-text";

// The key a sentence is read by stands for its words here, with what it was
// given, if anything.
const t = ((key: string, values?: Record<string, unknown>) =>
  values
    ? `«${key}» ${JSON.stringify(values)}`
    : `«${key}»`) as unknown as AppT;

const people = [
  { userId: "noa", name: "נועה כהן" },
  { userId: "omer", name: null },
  { userId: "yoav", name: "יואב לוי", addressForm: "m" },
  { userId: "shiran", name: "שירן אלון", addressForm: "f" },
] as unknown as ShiftData["people"];

// Who is on a shift, as the boards and the builder name them (Orel,
// 14 November 2026): someone taken off the team keeps the past shifts they
// worked, and nobody reads their name now.
describe("nameOf", () => {
  it("names someone on the team, or says they have no name", () => {
    expect(nameOf(t, { people }, "noa")).toBe("נועה כהן");
    expect(nameOf(t, { people }, "omer")).toBe("«shifts.noName»");
  });

  it("says someone the team no longer has is no longer on it", () => {
    expect(nameOf(t, { people }, "gone")).toBe("«shifts.former»");
  });

  it("says no name when there is nobody", () => {
    expect(nameOf(t, { people }, null)).toBe("«shifts.noName»");
  });
});

describe("outcomeLine", () => {
  it("says the shift stays theirs, and why", () => {
    expect(outcomeLine(t, "declined")).toBe("«shifts.swap.declined»");
    expect(outcomeLine(t, "schedule")).toBe("«shifts.swap.removed»");
  });
});

// Noa asked to give her evening away and Yoav took it; Shiran decided.
const ended = (
  outcome: SwapOutcome,
  decidedBy: string | null = "shiran",
): EndedSwap => ({
  id: "1",
  shiftId: "eve",
  shift: { day: "2026-11-08", name: "ערב", start: "16:00", end: "23:30" },
  requestedBy: "noa",
  takenBy: "yoav",
  outcome,
  decidedBy,
  createdAt: "2026-11-05T10:00:00Z",
});

describe("ownEndedSwaps", () => {
  it("keeps the requests the person asked for or took, and no one else's", () => {
    const theirs = { ...ended("approved"), id: "2", requestedBy: "omer" };
    const endedSwaps = [ended("declined"), theirs];
    const ids = (userId: string) =>
      ownEndedSwaps({ endedSwaps, userId }).map((s) => s.id);
    expect(ids("noa")).toEqual(["1"]);
    expect(ids("yoav")).toEqual(["1", "2"]);
    expect(ids("shiran")).toEqual([]);
  });
});

// "מה קרה לבקשות שלך", read by each of the two.
describe("pastRequestLine", () => {
  const request = (outcome: SwapOutcome, side: "from" | "to"): PastRequest => ({
    swap: ended(outcome),
    side,
  });
  const line = (outcome: SwapOutcome, side: "from" | "to") =>
    pastRequestLine(t, { people }, request(outcome, side));

  it("tells whoever asked who took it, and whoever took it who asked", () => {
    expect(line("approved", "from")).toBe(
      '«shifts.past.approvedFrom» {"name":"יואב לוי"}',
    );
    expect(line("approved", "to")).toBe("«shifts.past.approvedTo»");
    expect(line("declined", "from")).toBe("«shifts.past.declinedFrom»");
    expect(line("declined", "to")).toBe(
      '«shifts.past.declinedTo» {"name":"נועה כהן"}',
    );
    expect(line("withdrawn", "from")).toBe("«shifts.past.withdrawnFrom»");
    expect(line("withdrawn", "to")).toBe(
      '«shifts.past.withdrawnTo» {"name":"נועה כהן","form":"x"}',
    );
  });

  it("names nobody for a change to the schedule or the team", () => {
    for (const side of ["from", "to"] as const) {
      expect(line("schedule", side)).toBe("«shifts.past.schedule»");
      expect(line("team", side)).toBe("«shifts.past.team»");
    }
  });

  it("never says who decided", () => {
    for (const outcome of ["approved", "declined"] as const) {
      for (const side of ["from", "to"] as const) {
        expect(line(outcome, side)).not.toContain("שירן");
      }
    }
  });
});

// "כבר לא מחכות להחלטה", for whoever decides.
describe("endedRequestLine", () => {
  const line = (swap: EndedSwap, viewer = "uri") =>
    endedRequestLine(t, { people }, swap, viewer);

  it("says who decided, as they chose to be written about", () => {
    expect(line(ended("approved"))).toBe(
      '«swaps.ended.approved» {"name":"שירן אלון","form":"f"}',
    );
    expect(line(ended("declined"))).toBe(
      '«swaps.ended.declined» {"name":"שירן אלון","form":"f"}',
    );
  });

  it("says it was the reader", () => {
    expect(line(ended("approved"), "shiran")).toBe("«swaps.ended.approvedYou»");
    expect(line(ended("declined"), "shiran")).toBe("«swaps.ended.declinedYou»");
  });

  it("names someone who left as such, and nobody when nobody is known", () => {
    expect(line(ended("approved", "gone"))).toBe(
      '«swaps.ended.approved» {"name":"«shifts.former»","form":"x"}',
    );
    expect(line(ended("approved", null))).toBe("«swaps.ended.approvedPlain»");
    expect(line(ended("declined", null))).toBe("«swaps.ended.declinedPlain»");
  });

  it("says why a cancelled one was cancelled", () => {
    expect(line(ended("withdrawn", null))).toBe(
      '«swaps.ended.withdrawn» {"name":"נועה כהן","form":"x"}',
    );
    expect(line(ended("schedule", null))).toBe("«swaps.ended.schedule»");
    expect(line(ended("team", null))).toBe("«swaps.ended.team»");
  });
});
