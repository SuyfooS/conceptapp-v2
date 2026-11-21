import type { LockResult, StationStopResult } from "@domain/clock-station";
import type { LockInput, LockOffer } from "../../clock/station/station-types";

/** What a station last did, as the list of screens says it. */
export type StationAction =
  | "ready"
  | "putBack"
  | "soldOut"
  | "available"
  | "close"
  | "reopen";

/** A kitchen's screen or a till running, as the list of screens shows it. */
export type OrderStationRow = {
  id: string;
  name: string;
  shows: "prep" | "till";
  /** A kitchen's screen's department by its name; null for every one (or one the reader can't tell). */
  department: string | null;
  /** A kitchen's screen of every department. */
  every: boolean;
  /** When it last read: the business's day and HH:MM. */
  seen:
    | { kind: "showing" }
    | { kind: "seen"; date: string; time: string }
    | { kind: "never" };
  /** What it last did, and at HH:MM, or null before anything. */
  last: { what: StationAction; time: string } | null;
};

/**
 * The prep screen's part for whoever runs orders (waiter mode P8a, the S0
 * section Orel saw): locking this device as the kitchen's screen or the till,
 * and the screens running, to stop.
 */
export type OrderStationsData = {
  kitchen: LockOffer;
  till: LockOffer;
  /** The live departments a kitchen's screen may show, in order. */
  departments: { id: string; name: string }[];
  rows: OrderStationRow[];
  /** The business's date today, to name another day's "last seen". */
  today: string;
  /** A view: everything reads, nothing locks or stops. */
  viewOnly: boolean;
};

/** Locking, stopping and starting again: the app's actions, or the twin's stand-ins. */
export type OrderStationsActions = {
  /** Locks this device as the kitchen's screen or the till. */
  lock: (input: LockInput & { shows: "prep" | "till" }) => Promise<LockResult>;
  stop: (id: string) => Promise<StationStopResult>;
  restart: (id: string) => Promise<StationStopResult>;
  /** Whether locking clears waiter mode's records on the device: not on the twin's. */
  clearsDevice: boolean;
};
