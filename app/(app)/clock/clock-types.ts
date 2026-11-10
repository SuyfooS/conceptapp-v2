import type { PunchProof } from "@domain/punch-code-format";
import type { PunchFailure, ShiftRecord, TimeEntry } from "@domain/time-clock";

export type ClockActionResult =
  | {
      ok: true;
      /**
       * A punch the database recorded without a code, for a manager to approve.
       * Not the same as asking without one: with codes switched off since the
       * page loaded, nothing waits.
       */
      marked?: boolean;
    }
  | { ok: false; failure: PunchFailure | "viewOnly" };

/** What the screen can do. The demo passes stand-ins that store nothing. */
export type ClockActions = {
  clockIn: (proof: PunchProof) => Promise<ClockActionResult>;
  clockOut: (proof: PunchProof) => Promise<ClockActionResult>;
  startBreak: () => Promise<ClockActionResult>;
  endBreak: () => Promise<ClockActionResult>;
  undoClockOut: (entryId: string) => Promise<ClockActionResult>;
};

export type ClockData = {
  /** When the page was read: the first value of the running time. */
  now: string;
  timeZone: string;
  /** The person's open entry, when they are at work. */
  open: TimeEntry | null;
  /**
   * The person's shift that is on or still to come today, by the published
   * schedule. Null when there is none, or the schedule is off.
   */
  shift: { start: string; end: string; from: string; to: string } | null;
  /** False when the business has no schedule to compare with. */
  scheduling: boolean;
  thisMonth: number;
  lastMonth: number;
  /** The newest entries, for the screens wide enough to show them. */
  recent: ShiftRecord[];
  /** The entry the person just left, while they can take it back. */
  undo: { entryId: string; out: string; minutes: number; until: string } | null;
  /** The business's setting: whether a break comes off the hours. */
  unpaidBreaks: boolean;
  /** The clock's code (issue #78). */
  punch: {
    /** The business asks for a code to clock in and out. */
    required: boolean;
    /** This person needs one: everyone but owners, while it is asked for. */
    needsCode: boolean;
    /** This person may show the code on their phone. */
    canShowCode: boolean;
  };
  /** For those who see the team: what its screen would show now. */
  team: { atWork: number; overdue: number } | null;
  /** They hold pay access: the way to the hours for payroll. */
  payroll: boolean;
  /** Someone from ConceptApp is looking; nothing can be pressed. */
  viewOnly: boolean;
};

/** Where this screen's links go; the demo keeps them inside the demo. */
export type ClockPaths = {
  clock: string;
  history: string;
  team: string;
  /** The clock's code, shown on a manager's phone. */
  code: string;
  /** The hours for payroll, for those who hold pay access. */
  pay: string;
};
