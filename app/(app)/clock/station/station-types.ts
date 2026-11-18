import type { LockResult } from "@domain/clock-station";

/**
 * Locking the device the person is on into the business's clock station,
 * offered to whoever edits the clock (`editsClock`), writing as themselves,
 * where codes may be shown on a station (`codeDisplay` isn't "manager").
 */
export type LockOffer = {
  /**
   * This device is already one of the business's running stations: locking
   * it again keeps that one, with its name, rather than making another.
   */
  current: { name: string } | null;
  /**
   * The names of the stations running, for the name a new one is offered and
   * the limit of ten; empty with `current`, where neither applies.
   */
  running: string[];
};

/** Locks the device, signs out on it, and says where it goes. The demo passes a stand-in. */
export type LockAction = (input: { name: string }) => Promise<LockResult>;
