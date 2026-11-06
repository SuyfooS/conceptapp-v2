import type { EntryProblem, ShiftRecord } from "@domain/time-clock";

export type TeamHoursData = {
  /** The month shown, `YYYY-MM`. */
  month: string;
  currentMonth: string;
  /** Everyone's minutes and shifts in the month. */
  minutes: number;
  shifts: number;
  atWork: {
    userId: string;
    name: string | null;
    since: string;
    onBreak: boolean;
  }[];
  /** Open for longer than an entry can be, wherever the month shown is. */
  overdue: {
    entryId: string;
    userId: string;
    name: string | null;
    /** The business day it began on. */
    date: string;
    in: string;
  }[];
  people: {
    userId: string;
    name: string | null;
    former: boolean;
    minutes: number;
    shifts: number;
    breakMinutes: number;
  }[];
};

export type PersonHoursData = {
  person: { userId: string; name: string | null };
  month: string;
  currentMonth: string;
  minutes: number;
  records: ShiftRecord[];
  /** The business's date today, to start a new shift from. */
  today: string;
  viewOnly: boolean;
};

export type EntryFailure =
  | EntryProblem
  | "times"
  | "noAccess"
  | "viewOnly"
  | "failed";

export type EntryActionResult =
  | { ok: true }
  | { ok: false; failure: EntryFailure };

/** What was typed for a shift, as the form holds it. */
export type EntryValues = { date: string; in: string; out: string };

export type EntryActions = {
  correct: (entryId: string, values: EntryValues) => Promise<EntryActionResult>;
  add: (personId: string, values: EntryValues) => Promise<EntryActionResult>;
};

/** Where this screen's links go; the demo keeps them inside the demo. */
export type TeamPaths = { clock: string; team: string };
