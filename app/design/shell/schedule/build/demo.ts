import type { AwaySpan } from "@domain/absences";
import {
  draftWeek,
  type ScheduledShift,
  type ShiftAsNow,
  type ShiftBasis,
} from "@domain/schedule";
import type { ShiftSwap } from "@domain/swaps";
import type { ShareWeek } from "../../../../(app)/schedule/share-week";
import { business, demoExtraShift, demoShiftPatterns } from "../../data";
import { demoWeek } from "../availability/week";

// Who is already on a shift in the demo, and in which position: a week
// halfway done, with some shifts full and some still short.
const placed: Record<string, [string, string | null][]> = {
  "2026-11-01/morning": [
    ["noa", "waiter"],
    ["itay", "cook"],
  ],
  "2026-11-01/evening": [
    ["maya", "waiter"],
    ["yoav", "bartender"],
    ["omer", "cook"],
  ],
  "2026-11-01/extra": [["shira", "host"]],
  "2026-11-02/morning": [
    ["shiran", null],
    ["itay", "cook"],
    ["shira", "host"],
  ],
  "2026-11-02/evening": [
    ["noa", "waiter"],
    ["yoav", "bartender"],
    ["omer", "cook"],
    ["maya", "waiter"],
  ],
  "2026-11-03/morning": [
    ["maya", "waiter"],
    ["itay", "cook"],
  ],
  "2026-11-03/evening": [
    ["noa", "waiter"],
    ["yoav", "bartender"],
    ["omer", "cook"],
    ["shira", "host"],
  ],
  "2026-11-04/morning": [
    ["noa", "waiter"],
    ["omer", "cook"],
    ["shira", "host"],
  ],
  "2026-11-04/evening": [
    ["maya", "waiter"],
    ["itay", "cook"],
  ],
  "2026-11-05/morning": [["itay", "cook"]],
  "2026-11-06/friday": [
    ["noa", "waiter"],
    ["maya", "waiter"],
    ["itay", "cook"],
    ["yoav", "bartender"],
  ],
  "2026-11-07/saturday-night": [
    ["omer", "cook"],
    ["shira", "host"],
  ],
};

/**
 * The demo week of 1–7 November as the manager builds it: the restaurant's
 * shift pattern, one shift added by hand on Sunday, and the people above.
 */
export function demoBuildShifts(): ScheduledShift[] {
  return [
    ...draftWeek(demoWeek.start, demoShiftPatterns),
    { ...demoExtraShift, day: demoWeek.start },
  ]
    .sort(
      (a, b) => a.day.localeCompare(b.day) || a.start.localeCompare(b.start),
    )
    .map((s) => ({
      ...s,
      assignees: (placed[`${s.day}/${s.pattern ?? "extra"}`] ?? []).map(
        ([user, position]) => ({ user, position }),
      ),
    }));
}

/**
 * `&away=1`: Shiran is away on Sunday (known issue 19). The day says so,
 * and the fill from availability leaves Sunday morning, which it would give
 * her, open, naming her as away.
 */
export const demoAway: AwaySpan[] = [
  { userId: "shiran", from: demoWeek.start, to: demoWeek.start },
];

/** When the demo week was published, for `?state=meanwhile`. */
export const MEANWHILE_PUBLISHED_AT = "2026-10-29T15:40:00.000Z";

/** A stand-in for what the database digests of a shift: 32 hex digits. */
const digest = (n: number, version: number) =>
  `${version}`.padStart(16, "0") + `${n}`.padStart(16, "0");

/**
 * The same week published, as the builder reads it (`?state=meanwhile`):
 * each shift with an id and what was seen of it.
 */
export const meanwhileShifts: (ScheduledShift & { id: string })[] =
  demoBuildShifts().map((shift, i) => ({
    ...shift,
    id: `00000000-0000-4000-8000-${`${i + 1}`.padStart(12, "0")}`,
  }));

export const meanwhileBasis: ShiftBasis = Object.fromEntries(
  meanwhileShifts.map((shift, i) => [shift.id, digest(i + 1, 1)]),
);

const sundayMorning = meanwhileShifts.find(
  (s) => s.day === demoWeek.start && s.pattern === "morning",
);
const sundayEvening = meanwhileShifts.find(
  (s) => s.day === demoWeek.start && s.pattern === "evening",
);
if (!sundayMorning || !sundayEvening) {
  throw new Error("The demo week has no Sunday morning or evening");
}

/** The shift another manager changes while the builder is open. */
export const meanwhileShift = sundayMorning;

const request = (
  n: number,
  shiftId: string,
  requestedBy: string,
  takenBy: string | null = null,
): ShiftSwap => ({
  id: `00000000-0000-4000-a000-0000000001${`${n}`.padStart(2, "0")}`,
  shiftId,
  requestedBy,
  takenBy,
  status: takenBy ? "taken" : "open",
});

/**
 * Waiting requests on the week: Omer gives his Sunday evening away, and Maya
 * took Noa's Sunday morning, which waits for a manager.
 */
export const meanwhileSwaps: ShiftSwap[] = [
  request(1, sundayEvening.id, "omer"),
  request(2, sundayMorning.id, "noa", "maya"),
];

/**
 * Sunday morning once another manager approved Maya taking it: Maya in Noa's
 * place as a waiter, with what is seen of it now. Her request is no longer
 * waiting; Omer's still is.
 */
export const meanwhileNow: ShiftAsNow = {
  ...sundayMorning,
  assignees: sundayMorning.assignees.map((a) =>
    a.user === "noa" ? { ...a, user: "maya" } : a,
  ),
  seen: digest(meanwhileShifts.indexOf(sundayMorning) + 1, 2),
};

export const meanwhileSwapsNow: ShiftSwap[] = meanwhileSwaps.filter(
  (swap) => swap.requestedBy !== "noa",
);

/** Sharing a published week: its link leads to the schedule tab's twin. */
export const demoShare: ShareWeek = {
  business: business.name,
  base: "/design/shell/schedule",
};
