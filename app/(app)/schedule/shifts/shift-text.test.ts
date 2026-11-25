import {
  type EndedSwap,
  type PastRequest,
  SWAP_OUTCOMES,
  type SwapOutcome,
} from "@domain/swaps";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import he from "@/messages/he.json";
import {
  type AppT,
  awayOnShift,
  endedRequestLine,
  nameOf,
  outcomeLine,
  ownEndedSwaps,
  pastRequestLine,
  pastRequestNote,
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

// The schedule tab's warning on a shift, for whoever builds the schedule
// (known issue 107): who is away during it, as the builder's card and the
// shift's sheet say it, by name and never why.
describe("awayOnShift", () => {
  // Next week's Saturday 5 December and the Sunday after it.
  const away = [
    { userId: "noa", from: "2026-12-06", to: "2026-12-06" },
    { userId: "yoav", from: "2026-12-05", to: "2026-12-05" },
    { userId: "gone", from: "2026-12-05", to: "2026-12-06" },
  ];
  const shift = (start: string, end: string, users: string[]) => ({
    day: "2026-12-05",
    start,
    end,
    assignees: users.map((user) => ({ user, position: null })),
  });
  const named = (on: ReturnType<typeof shift>) =>
    awayOnShift(t, { people, away }, on);

  it("names whoever is away the day after a night past midnight", () => {
    // Noa is away on Sunday alone: Saturday's own day said nothing of her.
    expect(named(shift("20:00", "02:00", ["noa", "shiran"]))).toEqual([
      "נועה כהן",
    ]);
  });

  it("names whoever is away on a day shift's own day, and not the day after", () => {
    expect(named(shift("09:00", "16:00", ["noa", "yoav"]))).toEqual([
      "יואב לוי",
    ]);
    // Until 00:00 exactly is Saturday's alone.
    expect(named(shift("19:30", "00:00", ["noa", "yoav"]))).toEqual([
      "יואב לוי",
    ]);
  });

  it("names them in the shift's order, someone no longer on the team as such", () => {
    expect(named(shift("20:00", "02:00", ["yoav", "gone", "noa"]))).toEqual([
      "יואב לוי",
      "«shifts.former»",
      "נועה כהן",
    ]);
  });

  it("says nothing to whoever reads no days away", () => {
    const night = shift("20:00", "02:00", ["noa", "yoav"]);
    expect(awayOnShift(t, { people, away: null }, night)).toEqual([]);
    expect(awayOnShift(t, { people }, night)).toEqual([]);
  });

  it("is said in the words of the shift's sheet, on the tab and in the builder", () => {
    const build = he.app.build;
    expect(build.awayOnShift).toBe(`{names} ${build.groups.away}`);
    expect(build.notes.away).toBe(build.groups.away);
    expect(en.app.build.awayOnShift).toBe(
      `{names}: ${en.app.build.groups.away.toLowerCase()}`,
    );
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
const request = (
  outcome: SwapOutcome,
  side: "from" | "to",
  shiftId: string | null = "eve",
): PastRequest => ({ swap: { ...ended(outcome), shiftId }, side });

describe("pastRequestLine", () => {
  const line = (outcome: SwapOutcome, side: "from" | "to") =>
    pastRequestLine(t, { people }, request(outcome, side));

  it("tells whoever asked who took it, and whoever took it who asked", () => {
    expect(line("approved", "from")).toBe(
      '«shifts.past.approvedFrom» {"name":"יואב לוי"}',
    );
    expect(line("approved", "to")).toBe(
      '«shifts.past.approvedTo» {"name":"נועה כהן"}',
    );
    expect(line("declined", "from")).toBe(
      '«shifts.past.declined» {"name":"יואב לוי"}',
    );
    expect(line("declined", "to")).toBe(
      '«shifts.past.declined» {"name":"נועה כהן"}',
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

describe("pastRequestNote", () => {
  it("says the shift was taken off the schedule, and nothing while it is there", () => {
    for (const outcome of SWAP_OUTCOMES) {
      expect(pastRequestNote(t, request(outcome, "from", null))).toBe(
        "«shifts.past.gone»",
      );
      expect(pastRequestNote(t, request(outcome, "to"))).toBeNull();
    }
  });
});

/** What a line would hold if the words had failed: a key's path or an ICU argument. */
const NOT_WORDS = /^app\.|[{}]/;

const translators = [
  ["he", createTranslator({ locale: "he", messages: he, namespace: "app" })],
  ["en", createTranslator({ locale: "en", messages: en, namespace: "app" })],
] as unknown as [string, AppT][];

// The list is read long after a request ended, when its shift may have been
// deleted, changed or given away again since: a decided request stays as it
// was (private.write_week_schedule ends only waiting ones). So in the app's
// own words each row says what happened then, with whom, and never whose the
// shift is now (the review of 17 November 2026: "המשמרת נשארת של נועה" on
// Yoav's list once Maya had it).
describe("pastRequestLine, in the app's words", () => {
  const [, real] = translators[0] as [string, AppT];
  const line = (outcome: SwapOutcome, side: "from" | "to") =>
    pastRequestLine(real, { people }, request(outcome, side));

  it("says what was decided and with whom, in the past", () => {
    expect(line("approved", "from")).toBe(
      "ההחלפה עם יואב לוי אושרה. מסרת את המשמרת",
    );
    expect(line("approved", "to")).toBe(
      "ההחלפה עם נועה כהן אושרה. קיבלת את המשמרת",
    );
    expect(line("declined", "from")).toBe("ההחלפה עם יואב לוי לא אושרה");
    expect(line("declined", "to")).toBe("ההחלפה עם נועה כהן לא אושרה");
    expect(pastRequestNote(real, request("declined", "from", null))).toBe(
      "המשמרת הוסרה מהסידור",
    );
  });

  for (const [language, words] of translators) {
    it(`never says whose the shift is now, in ${language}`, () => {
      for (const outcome of SWAP_OUTCOMES) {
        for (const side of ["from", "to"] as const) {
          const said = [
            pastRequestLine(words, { people }, request(outcome, side)),
            pastRequestNote(words, request(outcome, side, null)) ?? "",
          ];
          for (const text of said) {
            expect(text, `${outcome} ${side}`).not.toMatch(NOT_WORDS);
            expect(text, `${outcome} ${side}`).not.toMatch(
              /נשאר|במקומך|אליך|stays|stay with|your place|yours now/,
            );
          }
        }
      }
    });
  }
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
