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
};

/** What the template screens ask the server to do. The console and demo pass their own. */
export type TemplateActions = {
  save: (
    input: ListTemplateInput,
    seenVersion: number | null,
  ) => Promise<ListActionResult<SavedTemplate>>;
  archive: (templateId: string) => Promise<ListActionResult>;
};

export type RestoreTemplate = (templateId: string) => Promise<ListActionResult>;
