import type {
  OpeningShift,
  ScheduleOpenings,
  ShabbatSpan,
} from "@domain/list-openings";
import type {
  ItemResult,
  ListDetail,
  ListItemKind,
  ListProgress,
  ListSummary,
  ListsTally,
  ListTemplate,
  ListTemplateInput,
  SavedTemplate,
  ScheduleAnchor,
  SendShift,
  TemplateRecipient,
} from "@domain/lists";
import type { StaffRole } from "@domain/modules";

/** Who and what a list's ids point at, as the reader may see them. */
export type ListLookups = {
  /** The business's active people, by id. */
  people: Record<string, { name: string | null; photo: string | null }>;
  /** Its departments, removed ones too, by id: their names. */
  departments: Record<string, string>;
};

/** What the screens need of the lists settings. */
export type ListsTiming = {
  remindBeforeMinutes: number;
  lateAfterMinutes: number;
};

/**
 * Whose lists a screen shows: the person's own, the whole business's (a view
 * session as a manager, which is no one), or none (a view session as a worker:
 * lists belong to the people they were sent to).
 */
export type ListsView = "mine" | "business" | "viewOnly";

/** The way to send a list from Lists, when the person may send one. */
export type SendWay = {
  href: string;
  /** The only list they may send (a department's order), named on the button. */
  only: string | null;
};

/** Everything on Lists, and the part of it Today shows. */
export type ListsHomeData = {
  /** ISO timestamp of the moment the screen is read. */
  now: string;
  timeZone: string;
  timing: ListsTiming;
  lookups: ListLookups;
  view: ListsView;
  /** Who is reading: their own lists say "for you". */
  userId: string;
  /** Open lists, most urgent first. */
  open: ListSummary[];
  /** Closed lists that opened today, newest first. */
  closed: ListSummary[];
  /** The business's day, for those who manage lists. */
  team: ListsTally | null;
  send: SendWay | null;
  /** A list this person just sent, while it can still be taken back. */
  sent: ListSummary | null;
  /**
   * How many live templates the business has, for those who manage lists:
   * the way to change and make them. Null for everyone else.
   */
  templates: number | null;
};

/** Why a list is only read here. */
export type ListReadOnly =
  | "finished"
  | "missed"
  | "cancelled"
  | "elsewhere"
  | "viewOnly";

/** One list on its own screen. */
export type ListScreenData = {
  now: string;
  timeZone: string;
  timing: ListsTiming;
  lookups: ListLookups;
  userId: string;
  list: ListDetail;
  can: {
    /** Ticking and typing its items. */
    fill: boolean;
    /**
     * Opening it again whenever, after it was finished or cancelled: a list
     * manager's. Whoever closed it has `undoUntil` instead.
     */
    reopen: boolean;
  };
  readOnly: ListReadOnly | null;
  /**
   * Until when this person may take their finish or cancel back (the undo),
   * or null. Counted against `now`, the server's clock.
   */
  undoUntil: string | null;
};

export type ListFailure =
  | "noAccess"
  | "viewOnly"
  | "invalid"
  | "changed"
  | "finished"
  | "left"
  | "notYet"
  /**
   * The person switched business after the screen was drawn (payroll P3b):
   * refused, never written in the other one.
   */
  | "businessChanged"
  | "failed";

export type ListActionResult<T = null> =
  | { ok: true; value: T }
  | {
      ok: false;
      failure: ListFailure;
      /**
       * A new template the database did save before what came after failed:
       * its id, which the editor takes instead of making it again.
       */
      saved?: string;
    };

/** What the list's screen asks the server to do. The demo passes stand-ins. */
export type ListActions = {
  setItem: (
    itemId: string,
    result: ItemResult,
  ) => Promise<ListActionResult<ListProgress>>;
  finish: (listId: string) => Promise<ListActionResult>;
  reopen: (listId: string) => Promise<ListActionResult>;
};

/** An item as a preview of a list shows it. */
export type PreviewItem = {
  kind: ListItemKind;
  label: string;
  required: boolean;
  unit: string | null;
  min: number | null;
  max: number | null;
};

/** A template as the send screen offers it. */
export type SendTemplate = {
  id: string;
  name: string;
  note: string | null;
  items: PreviewItem[];
  recipient: TemplateRecipient | null;
  /** An order: the department that asks, which sends it to its recipient. */
  fromDepartment: string | null;
};

/** Where the send screen starts: a template, or a list typed now. */
export const NEW_LIST = "new";

export type SendFormData = {
  /** ISO timestamp of the moment the screen is read, and the business's zone. */
  now: string;
  timeZone: string;
  templates: SendTemplate[];
  /** The one to start with: from the address, the first, or `NEW_LIST`. */
  initial: string;
  /**
   * May send any list to anyone, typed now too; otherwise only their
   * department's orders.
   */
  free: boolean;
  people: { userId: string; name: string | null; photo: string | null }[];
  departments: { id: string; name: string }[];
  roles: readonly StaffRole[];
  /**
   * Published shifts from today to a week ahead that haven't ended, earliest
   * first; null while scheduling is off.
   */
  shifts: SendShift[] | null;
};

/** A list to send, as the form sends it (`sendInput` checks it). */
export type SendResult = ListActionResult<string>;

/** A template as the screen of templates lists it. */
export type TemplateRow = {
  id: string;
  name: string;
  recipient: TemplateRecipient | null;
  fromDepartment: string | null;
  items: number;
  archivedAt: string | null;
  /** Its times, in short (L4). */
  times: {
    /** How many it has, paused ones too. */
    count: number;
    /** The first one that isn't paused, for its words; null when none runs. */
    first: {
      days: number[];
      anchor: ScheduleAnchor;
      shift: string | null;
      opensOffset: number;
    } | null;
    /** How many point at a shift or a department that is gone, and open nothing. */
    gone: number;
  };
};

/** Where the screens of templates lead, inside the app, the console or the demo. */
export type TemplatePaths = {
  /** The screen of templates; an editor is `${list}/${id}`, a new one `${list}/new`. */
  list: string;
  /** What the screen of templates goes back to. */
  back: { href: string; label: string };
  /** The send screen, for "send it now"; null where nobody sends (the console). */
  send: string | null;
};

/** The business's templates on their own screen. */
export type TemplatesScreenData = {
  /** Live templates, in their order. */
  templates: TemplateRow[];
  /** Removed ones, most recently removed first, each with its undo. */
  removed: TemplateRow[];
  /** Live departments, in their order. */
  departments: { id: string; name: string }[];
  /** Every department's name by id, removed ones too. */
  departmentNames: Record<string, string>;
  /** The scheduling settings' shifts by key: their names. */
  shiftNames: Record<string, string>;
  /** The template just removed in its editor (`?removed=`), for its undo. */
  justRemoved: TemplateRow | null;
  /** Only reading: a view session. */
  readOnly: boolean;
};

/**
 * What a template's times are worked out with in its editor (L4): the
 * moment and the business's zone, its Shabbat, the shifts a time may follow,
 * the people one may go to, and the saved times' next openings as the
 * database will open them.
 */
export type EditorTimes = {
  /** ISO timestamp of the moment the screen is read. */
  now: string;
  timeZone: string;
  closesOnShabbat: boolean;
  /** The business's next Shabbatot; none when it is open on Shabbat. */
  shabbat: ShabbatSpan[];
  /** Published shifts of the coming week, for a time that follows a shift. */
  shifts: OpeningShift[];
  /** Who a time may go to by name; none where nobody is read (the console). */
  people: { userId: string; name: string | null }[];
  /** Each saved time's next openings, by its id. */
  openings: ScheduleOpenings;
};

/** One template in its editor, or a new one. */
export type TemplateEditorData = {
  /** Null for a new template, saved once it has a name and an item. */
  template: ListTemplate | null;
  /** Live departments, in their order. */
  departments: { id: string; name: string }[];
  departmentNames: Record<string, string>;
  /** The scheduling settings' shifts, which a template may go to. */
  shifts: { key: string; name: string }[];
  roles: readonly StaffRole[];
  /** Only reading: a view session. */
  readOnly: boolean;
  /** Back after a save was refused: what shows is the latest, and says so. */
  changed: boolean;
  times: EditorTimes;
};

/** A number item's reading, on the manager's day. */
export type DayReading = {
  listId: string;
  listName: string;
  label: string;
  unit: string | null;
  min: number | null;
  max: number | null;
  reading: number;
  doneAt: string | null;
  doneBy: string | null;
  outOfRange: boolean;
};

/** One number item of a template across the week, a reading a day. */
export type WeekReadings = {
  /** The template's item, or the list's own item when it has none. */
  key: string;
  label: string;
  listName: string;
  unit: string | null;
  min: number | null;
  max: number | null;
  /** By day, "YYYY-MM-DD": the day's reading, or null when there was none. */
  days: Record<string, { reading: number; outOfRange: boolean } | null>;
};

/** The manager's overview of a day (L4): today's lists, or a past day's. */
export type ListsTodayData = {
  now: string;
  timeZone: string;
  timing: ListsTiming;
  lookups: ListLookups;
  userId: string;
  /** The day shown, "YYYY-MM-DD", and whether it is today. */
  day: string;
  today: boolean;
  /** The days a person can pick, oldest first, today last. */
  week: string[];
  /** Late first; the rest by when they are due. */
  late: ListSummary[];
  open: ListSummary[];
  /** Finished or cancelled. */
  closed: ListSummary[];
  missed: ListSummary[];
  /** The readings of the day's number items, those outside their range first. */
  readings: DayReading[];
  /** The week's number items, a row each. */
  weekReadings: WeekReadings[];
  /**
   * Each day of the week, "YYYY-MM-DD", that has something to look at: lists
   * nobody did, lists still late, and readings outside their range.
   */
  weekFlags: Record<string, DayFlags>;
  /**
   * Live templates whose times, not paused, follow a shift or go to a place
   * that is gone, and so open nothing: their ids and names.
   */
  stopped: { id: string; name: string }[];
  send: SendWay | null;
  /** Only reading: a view session. */
  viewOnly: boolean;
};

/** What a day of the overview's week has to look at. */
export type DayFlags = { missed: number; late: number; outOfRange: number };

/** What the template screens ask the server to do. The console and demo pass their own. */
export type TemplateActions = {
  save: (
    input: ListTemplateInput,
    seenVersion: number | null,
  ) => Promise<ListActionResult<SavedTemplate>>;
  archive: (templateId: string) => Promise<ListActionResult>;
};

export type RestoreTemplate = (templateId: string) => Promise<ListActionResult>;
