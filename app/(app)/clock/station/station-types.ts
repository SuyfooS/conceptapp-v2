import type {
  LockResult,
  StationShows,
  StationStopFailure,
  StationStopResult,
} from "@domain/clock-station";

/**
 * Locking the device the person is on into one of the business's stations:
 * the clock's, offered to whoever edits the clock (`editsClock`), writing as
 * themselves, where codes may be shown on a station (`codeDisplay` isn't
 * "manager"); or the kitchen's screen or the till (waiter mode P8a), offered
 * to whoever runs orders.
 */
export type LockOffer = {
  /**
   * This device is already one of the business's running stations of this
   * kind: locking it again keeps that one, with its name, rather than making
   * another. A kitchen's screen keeps its department too (null for every
   * one), which the sheet sends as it is, with no choice to make.
   */
  current: { name: string; department?: string | null } | null;
  /**
   * The names of the stations running, for the name a new one is offered and
   * the limit of ten; empty with `current`, where neither applies.
   */
  running: string[];
  /** How many run of every kind, for the limit of ten, when it is known. */
  total?: number;
  /**
   * This device is a running station of another kind: it isn't locked as this
   * one until that one is stopped (the clock's lock offers that stop on a
   * kitchen's screen or a till, `StationLock`'s `stopOther`).
   */
  other?: { name: string; shows: StationShows } | null;
};

/** What locking takes: the name, and a kitchen's screen's department (null for every one). */
export type LockInput = { name: string; department?: string | null };

/** What the device is locked as: the clock's code, a kitchen's screen, or the till. */
export type LockKind = "clock" | "prep" | "till";

/**
 * What the lock's sheet sends: the name, and for a kitchen's screen its
 * department. On a device that is that screen already (`offer.current`,
 * where the sheet offers no choice), the department it shows, so locking it
 * again keeps it whichever department that is; else the one chosen ("" for
 * every one, sent as null).
 */
export function lockInputOf(
  kind: LockKind,
  offer: LockOffer,
  chosen: string,
  name: string,
): LockInput {
  if (kind !== "prep") return { name };
  return {
    name,
    department: offer.current
      ? (offer.current.department ?? null)
      : chosen || null,
  };
}

/** Locks the device, signs out on it, and says where it goes. The demo passes a stand-in. */
export type LockAction = (input: LockInput) => Promise<LockResult>;

/**
 * What stopping the kitchen's screen or the till this device is answers:
 * done, with the station's id when the person may start it again (they run
 * orders, with taking orders on), for the toast's "ביטול"; or why not.
 */
export type DeviceStopResult =
  | { ok: true; undo: string | null }
  | { ok: false; failure: StationStopFailure };

/**
 * The clock's lock on a device that is the business's kitchen's screen or
 * till (`LockOffer`'s `other`): stopping that one there, so the device can
 * be locked on the code, also while taking orders is off, when no other
 * screen reaches it; and starting it again, the toast's "ביטול".
 */
export type StopOther = {
  stop: () => Promise<DeviceStopResult>;
  restart: (stationId: string) => Promise<StationStopResult>;
};

/**
 * Locking offered on a screen: what is offered and the action, and whether
 * it clears waiter mode's records on the device (`LockStation`'s
 * `clearsDevice`; false on /design's twins, whose lock locks nothing). The
 * clock's lock stops the device's kitchen's screen or till first
 * (`stopOther`), where it is one.
 */
export type StationLock = {
  offer: LockOffer;
  action: LockAction;
  clearsDevice?: boolean;
  stopOther?: StopOther;
};

/**
 * What Home says on a device that is one of the business's running stations
 * (`currentStationHome`), of the kind it shows: whoever may lock it locks it
 * again, as the station it is; anyone else signs out when done.
 */
export type StationHome =
  | {
      kind: "lock";
      shows: StationShows;
      offer: LockOffer & { current: { name: string } };
    }
  | { kind: "signOut"; shows: StationShows };
