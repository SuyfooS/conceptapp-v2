import type {
  ItemResult,
  ListDetail,
  ListProgress,
  ListSummary,
  ListsTally,
  TemplateRecipient,
} from "@domain/lists";
import type { Role } from "@domain/modules";

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
  | "failed";

export type ListActionResult<T = null> =
  | { ok: true; value: T }
  | { ok: false; failure: ListFailure };

/** What the list's screen asks the server to do. The demo passes stand-ins. */
export type ListActions = {
  setItem: (
    itemId: string,
    result: ItemResult,
  ) => Promise<ListActionResult<ListProgress>>;
  finish: (listId: string) => Promise<ListActionResult>;
  reopen: (listId: string) => Promise<ListActionResult>;
};

/** A template as the send screen offers it. */
export type SendTemplate = {
  id: string;
  name: string;
  note: string | null;
  items: { kind: string; label: string }[];
  recipient: TemplateRecipient | null;
  /** An order: the department that asks, which sends it to its recipient. */
  fromDepartment: string | null;
};

export type SendFormData = {
  templates: SendTemplate[];
  /** The one to start with: from the address, or the first. */
  initial: string;
  /** May send any list to anyone; otherwise only their department's orders. */
  free: boolean;
  people: { userId: string; name: string | null; photo: string | null }[];
  departments: { id: string; name: string }[];
  roles: readonly Role[];
};

/** A list to send, as the form sends it (`sendInput` checks it). */
export type SendResult = ListActionResult<string>;
