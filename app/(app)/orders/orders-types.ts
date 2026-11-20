import type { OrderFailure } from "@db/order-failures";
import type { DraftLine } from "@domain/order-screens";
import type { RoundTarget, SentRound } from "@domain/orders";

/*
 * What the mode's screens and their parts share (waiter mode P4), in the app
 * and on the twins at /design/order-taking, which draw the same views over
 * the demo's store with stand-ins that store nothing.
 */

/** The person and the business, as the screens read them. */
export type OrdersFrame = {
  business: string;
  userId: string;
  /** A view session: everything reads, nothing saves. */
  viewing: boolean;
  takes: boolean;
  runs: boolean;
  /** Why a taker can't send now: off a shift, or a shift left open. */
  clock: "clock" | "staleShift" | null;
  /** The departments they prepare for, in the business's order. */
  prepares: string[];
  /** Their own live departments: they never take back what went to one. */
  own: string[];
  /** People by id, by the names the business calls them. */
  names: Record<string, string>;
  /** Every department, removed ones too, by its name. */
  departments: Record<string, string>;
  /** The departments in the business's order. */
  departmentOrder: string[];
  lateAfterMinutes: number;
  timeZone: string;
};

/** Where the mode's screens lead: the app's, or the twin's. */
export type OrdersPaths = {
  floor: string;
  mine: string;
  prep: string;
  menu: string;
  place: (id: string) => string;
  /** A takeaway's order, or a new one for null. */
  takeaway: (order: string | null) => string;
  clock: string;
  /** Out of the mode: the app's Home. */
  leave: string;
  menuPlaces: string;
  menuImport: string;
  /** The till's list of an order: the twin's alone until P5. */
  till?: (order: string) => string;
};

/** Why an action was refused: the database's reasons, and the server's own. */
export type OrdersActionFailure = OrderFailure | "viewOnly" | "businessChanged";

export type OrdersActionResult<T = null> =
  | { ok: true; value: T }
  | { ok: false; failure: OrdersActionFailure };

/** The writes on the mode's screens besides the send, each bound to the business. */
export type OrdersActions = {
  serve: (ticket: string, served: boolean) => Promise<OrdersActionResult>;
  setReady: (ticket: string, ready: boolean) => Promise<OrdersActionResult>;
  takeBack: (line: string) => Promise<OrdersActionResult>;
  fire: (order: string) => Promise<OrdersActionResult<number>>;
  setLabel: (
    order: string,
    label: string | null,
  ) => Promise<OrdersActionResult>;
};

/** Why a send was refused, as the screens say it. */
export type SendFailure = OrderFailure | "signedOut" | "viewOnly";

/** A send's answer, once there is one. */
export type SendOutcome =
  | { ok: true; round: SentRound }
  | {
      ok: false;
      failure: SendFailure;
      items: string[];
      order: string | null;
    };

/** A round on its way: being sent, or waiting to be tried again. */
export type PendingSend = {
  /** The round's own key: two rounds of one draft never share a place. */
  key: string;
  target: RoundTarget;
  lines: DraftLine[];
  /**
   * Waits for a connection: an attempt of it failed and it is tried again,
   * or the phone is offline. Until then it is simply being sent.
   */
  waiting: boolean;
};

/** Why the last send of a draft was refused, until it is sent again. */
export type SendRefusal = Extract<SendOutcome, { ok: false }> & {
  target: RoundTarget;
};

/** Sends a draft, and says what is on its way and what was refused. */
export type OrdersSender = {
  /**
   * Sends `lines` (at most a round's 40, `roundOf`) as one round to
   * `target`: they leave the draft at once, the rest of it stays, and they
   * come back to its front with the reason when refused. Resolves with the
   * answer, after any retries.
   */
  send: (
    draft: string,
    target: RoundTarget,
    lines: DraftLine[],
  ) => Promise<SendOutcome>;
  /** The draft's rounds on their way, in the order they were sent. */
  pending: (draft: string) => PendingSend[];
  refusal: (draft: string) => SendRefusal | null;
  clearRefusal: (draft: string) => void;
};

/** The drafts on the phone, by `draftKey`. */
export type DraftStore = {
  get: (draft: string) => DraftLine[];
  set: (draft: string, lines: DraftLine[]) => void;
  /** How many items each draft holds, for the floor's tiles. */
  counts: Record<string, number>;
};

/** What the mode's one toast says: with its undo, or a way to what it names. */
export type Say = (
  text: string,
  options?: {
    undo?: () => void;
    open?: string;
    /** What it undoes went with the focus: the way back takes it. */
    focus?: boolean;
    /** Where the focus goes once the toast leaves. */
    after?: () => HTMLElement | null | undefined;
    /** The toast stops counting while the way back is reached. */
    onWaitingChange?: (waiting: boolean) => void;
  },
) => void;
