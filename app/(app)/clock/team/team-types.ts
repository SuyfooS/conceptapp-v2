import type {
  Attendance,
  ConfirmRow,
  EntryProblem,
  ShiftRecord,
} from "@domain/time-clock";

/**
 * An entry waiting for this viewer's approval, as the confirm card lists it:
 * what waits and the time it names come from `confirmRowOf`.
 */
export type EntryToConfirm = ConfirmRow & {
  entryId: string;
  userId: string;
  name: string | null;
  /** The business day it began on. */
  date: string;
};

export type TeamHoursData = {
  /** The month shown, `YYYY-MM`. */
  month: string;
  currentMonth: string;
  /** Everyone's minutes and shifts in the month. */
  minutes: number;
  shifts: number;
  /** The business asks for a code to clock in and out. */
  required: boolean;
  /** The code can be shown on this person's phone: the header's action. */
  showCode: boolean;
  /** Someone from ConceptApp is looking; nothing can be pressed. */
  viewOnly: boolean;
  /** They hold pay access: the way to the hours for payroll. */
  payroll: boolean;
  /** What this viewer may approve, oldest first. */
  toConfirm: EntryToConfirm[];
  atWork: {
    userId: string;
    name: string | null;
    since: string;
    onBreak: boolean;
    /** The month its shift belongs to, which may be the one before. */
    month: string;
    /** How their entry was recorded so far. */
    attendance: Attendance | null;
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
  /** Why the hours change is missing: the database keeps one for each. */
  | "reasonNeeded"
  /** Someone else approves a person's own hours. */
  | "ownHours"
  /** Hours someone set for themselves wait for an owner. */
  | "ownerOnly"
  | "noAccess"
  | "viewOnly"
  | "failed";

export type EntryActionResult =
  | { ok: true }
  | { ok: false; failure: EntryFailure };

/** What was typed for a shift, as the form holds it, with why it changes. */
export type EntryValues = {
  date: string;
  in: string;
  out: string;
  reason: string;
};

export type EntryActions = {
  correct: (entryId: string, values: EntryValues) => Promise<EntryActionResult>;
  add: (personId: string, values: EntryValues) => Promise<EntryActionResult>;
};

/** What the team's screen can do. The demo passes a stand-in. */
export type TeamActions = {
  confirm: (entryId: string) => Promise<EntryActionResult>;
};

/** Where this screen's links go; the demo keeps them inside the demo. */
export type TeamPaths = {
  clock: string;
  team: string;
  code: string;
  /** The hours for payroll, for those who hold pay access. */
  pay: string;
};
