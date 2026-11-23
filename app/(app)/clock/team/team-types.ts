import type {
  AbsenceFailure,
  AbsenceKind,
  AbsenceValues,
} from "@domain/absences";
import type { StationStopResult } from "@domain/clock-station";
import type {
  Attendance,
  BreakProblem,
  BreakRecord,
  ConfirmRow,
  EntryProblem,
  ShiftRecord,
} from "@domain/time-clock";

/** A record of days away, as the person's page lists it (known issue 19). */
export type AbsenceRow = {
  id: string;
  kind: AbsenceKind;
  /** `YYYY-MM-DD`, both included. */
  from: string;
  to: string;
  note: string | null;
  /** Its days in all, by the calendar, and those in the month shown. */
  days: number;
  inMonth: number;
  /** Who recorded it, as the business names them; null when unknown. */
  recordedBy: string | null;
  /** The business's day it was recorded on. */
  recordedOn: string;
  /** Their published shifts on its days, from today on. */
  shifts: number;
};

/** Someone away today, for those who edit the clock: with the kind. */
export type AwayTodayRow = {
  userId: string;
  name: string | null;
  kind: AbsenceKind;
  /** Their last day away, `YYYY-MM-DD`: today for one day. */
  until: string;
};

export type AbsenceActionResult =
  | { ok: true }
  | {
      ok: false;
      failure: AbsenceFailure;
      /** The month closed for payroll, `YYYY-MM`, when that is why. */
      month?: string;
    };

/** What the person's page does with days away. The demo passes a stand-in. */
export type AbsenceActions = {
  record: (
    personId: string,
    values: AbsenceValues,
  ) => Promise<AbsenceActionResult>;
  change: (
    absenceId: string,
    values: AbsenceValues,
  ) => Promise<AbsenceActionResult>;
  /** Remove one at once; the toast's "ביטול" brings it back. */
  remove: (absenceId: string) => Promise<AbsenceActionResult>;
  restore: (absenceId: string) => Promise<AbsenceActionResult>;
};

/** A running clock station, as the team's hours list it. */
export type StationRow = {
  id: string;
  name: string;
  /** When it last showed a code: the business's day and HH:MM. */
  seen:
    | { kind: "showing" }
    | { kind: "seen"; date: string; time: string }
    | { kind: "never" };
};

/** The business's clock stations, for those who edit the clock. */
export type TeamStations = {
  /** Running, oldest first. */
  rows: StationRow[];
  /**
   * The line on leaving a device as one: where codes may show on a station
   * (`codeDisplay` isn't "manager").
   */
  howTo: boolean;
  /**
   * With none running, the list says how to leave a device as one: where the
   * business asks for the code too. Otherwise it shows nothing then, until a
   * station is stopped from it, whose toast and way back stay with the list.
   */
  shownEmpty: boolean;
  /** The business's date today, to name another day's "last seen". */
  today: string;
};

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
  /**
   * The stations running, with the line on leaving a device as one. Always
   * there, also with none to show, so stopping the last one keeps its toast
   * and its "ביטול" when the page is read again.
   */
  stations: TeamStations;
  /** Who on the staff is away today, with the kind and their last day. */
  awayToday: AwayTodayRow[];
};

export type PersonHoursData = {
  person: { userId: string; name: string | null };
  month: string;
  currentMonth: string;
  minutes: number;
  records: ShiftRecord[];
  /** The business's date today, to start a new shift from. */
  today: string;
  /** A break added now comes off the hours (the clock's `unpaidBreaks`). */
  unpaidBreaks: boolean;
  viewOnly: boolean;
  /** Their days away that touch the month (in today's month, those still to come too), in date order. */
  absences: AbsenceRow[];
  /**
   * The viewer records days away for them (`canRecordAbsence`): someone
   * else's, or their own when an owner. Whether they are on the staff is
   * the database's to say.
   */
  canRecord: boolean;
  /** The viewer builds the schedule: the way from a shift on a day away. */
  builds: boolean;
};

export type EntryFailure =
  | EntryProblem
  | BreakProblem
  | "times"
  /** Why the hours change is missing: the database keeps one for each. */
  | "reasonNeeded"
  /** Someone else approves a person's own hours. */
  | "ownHours"
  /** Hours someone set for themselves wait for an owner. */
  | "ownerOnly"
  /** Someone already cancelled the shift: it comes back before it changes. */
  | "cancelled"
  /** Someone already brought the shift back. */
  | "notCancelled"
  /** Only an owner cancels their own shift, or brings it back. */
  | "ownShift"
  /** Bringing it back: a live shift of the person covers those hours now. */
  | "overlap"
  /** Cancelling one still open: a break after its first day; its end is fixed first. */
  | "breaksAfterDay"
  /** Bringing back one a cancel ended: the person is off the staff now. */
  | "notOnStaff"
  /** A break edit: another break of the shift covers that time. */
  | "breakOverlap"
  /** A break edit: the break is still running. */
  | "breakOpen"
  /** A break edit: the break was removed, or cut away, meanwhile. */
  | "breakGone"
  /** Only an owner edits the breaks of their own shift. */
  | "ownBreaks"
  /** Taking a removed break back: its ten minutes passed. */
  | "tooLate"
  | "noAccess"
  | "viewOnly"
  | "failed";

export type EntryActionResult =
  | { ok: true }
  | { ok: false; failure: EntryFailure };

/** What was typed for a break, HH:MM, with why it changes. */
export type BreakValues = {
  start: string;
  end: string;
  reason: string;
};

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
  /** Cancel a shift, with why: it stays, marked, and counts for nothing. */
  cancel: (entryId: string, reason: string) => Promise<EntryActionResult>;
  /** Bring a cancelled shift back as it was; the toast's "ביטול" too. */
  restore: (entryId: string) => Promise<EntryActionResult>;
  /** Add a break the shift is missing, with why. */
  addBreak: (
    entryId: string,
    values: BreakValues,
  ) => Promise<EntryActionResult>;
  /** Change the times of one of the shift's breaks that ended, with why. */
  changeBreak: (
    entryId: string,
    breakId: string,
    values: BreakValues,
  ) => Promise<EntryActionResult>;
  /** Remove a break pressed by mistake, with why: it is marked, and kept. */
  removeBreak: (breakId: string, reason: string) => Promise<EntryActionResult>;
  /** Take a removal back: the toast's "ביטול", within ten minutes. */
  restoreBreak: (breakId: string) => Promise<EntryActionResult>;
};

/**
 * What the person's sheet is open on: a shift to add, one to fix, the step
 * that cancels it, one cancelled, to bring back, or the step that fixes one
 * of its breaks (`pause`), or adds one (null).
 */
export type EntryTarget =
  | { kind: "add" }
  | { kind: "edit"; record: ShiftRecord }
  | { kind: "cancel"; record: ShiftRecord }
  | { kind: "cancelled"; record: ShiftRecord }
  | { kind: "break"; record: ShiftRecord; pause: BreakRecord | null }
  /** Days away to record, or a record of them to change or remove. */
  | { kind: "absenceAdd" }
  | { kind: "absenceEdit"; absence: AbsenceRow };

/** What the team's screen can do. The demo passes a stand-in. */
export type TeamActions = {
  confirm: (entryId: string) => Promise<EntryActionResult>;
  /** Stop a clock station at once: it shows no code from its next ask. */
  stopStation: (stationId: string) => Promise<StationStopResult>;
  /** The toast's "ביטול": start it again, within two minutes. */
  restartStation: (stationId: string) => Promise<StationStopResult>;
};

/** Where this screen's links go; the demo keeps them inside the demo. */
export type TeamPaths = {
  clock: string;
  team: string;
  code: string;
  /** The hours for payroll, for those who hold pay access. */
  pay: string;
};
