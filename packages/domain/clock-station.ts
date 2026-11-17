import { z } from "zod";
import { issuedCode } from "./punch-code";

/*
 * Clock stations (#78 phase 5; Orel's lock of 17 November 2026): a device left
 * at the business that shows only the clock's code, with nobody's account on
 * it. Whoever shows the code locks a signed-in tablet into one from
 * /clock/code, and it signs out. The device knows it is a station by a cookie
 * holding the station's secret, which the database keeps only as a hash
 * (20261108000200_qr_clock.sql). These are the schemas at its boundaries, the
 * refusals in words and the team's list's timing; the database checks every
 * code and every stop again.
 */

/** The cookie that makes this device a station: the station's secret. */
export const STATION_COOKIE = "ca_station";

/** How long it is kept: 400 days, the longest a browser keeps a cookie. */
export const STATION_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

/**
 * How the cookie is set. Path "/", not /station: the code screen's lock and
 * Home's reminder ask whether this device is a station too. httpOnly (only the
 * server reads it), Secure wherever the app runs on https (the browser tests
 * run on http://127.0.0.1, where a Secure cookie would be dropped), and
 * sameSite lax, so another site's request doesn't carry it.
 */
export function stationCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: STATION_COOKIE_MAX_AGE,
  };
}

/** A station's secret as the cookie holds it: 32 random bytes, base64url. */
export const stationToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/** At most this many running in a business (approve_station_pairing). */
export const MAX_STATIONS = 10;

/**
 * Whether the device can be locked now: it is one of the business's running
 * stations already (locking keeps that one), or fewer than ten run. With ten
 * running and this device none of them, nothing offers to lock it.
 */
export function lockOpen(offer: {
  current: { name: string } | null;
  running: readonly string[];
}): boolean {
  return offer.current !== null || offer.running.length < MAX_STATIONS;
}

/** A station's name, as the database takes it: 1 to 40 characters, trimmed. */
export const STATION_NAME_MAX = 40;
export const stationName = z.string().trim().min(1).max(STATION_NAME_MAX);

/**
 * The name a new station is offered: `nameFor(n)` ("עמדת שעון 2") for the
 * station after those running, or the next number no running one is called.
 */
export function defaultStationName(
  running: readonly string[],
  nameFor: (n: number) => string,
): string {
  const taken = new Set(running.map((name) => name.trim()));
  let n = running.length + 1;
  while (taken.has(nameFor(n))) n += 1;
  return nameFor(n);
}

/**
 * Seen this recently, a station counts as showing the code now: it asks every
 * 20 seconds, and the database stamps it at most once a minute
 * (issue_station_code's last_seen_at).
 */
export const STATION_SHOWING_MS = 2 * 60_000;

/** How the team's list says when a station was last seen. */
export type StationSeen =
  | { kind: "showing" }
  | { kind: "seen"; at: string }
  | { kind: "never" };

export function stationSeen(lastSeenAt: string | null, now: Date): StationSeen {
  if (lastSeenAt === null) return { kind: "never" };
  return now.getTime() - Date.parse(lastSeenAt) <= STATION_SHOWING_MS
    ? { kind: "showing" }
    : { kind: "seen", at: lastSeenAt };
}

/** How long a stop can be taken back (set_clock_station_stopped). */
export const STATION_RESTART_MS = 2 * 60_000;

/**
 * Why a station shows no code, from its route. `notStation`: this device
 * holds no running station's secret (never locked, or the cookie is gone);
 * `stopped`: someone stopped it; `clockOff`: the business switched the clock
 * off; `managerOnly`: the business shows codes on a manager's phone only;
 * `signedIn`: someone is signed in on this device, and a station never shows
 * codes beside an account.
 */
export const STATION_REFUSALS = [
  "notStation",
  "stopped",
  "clockOff",
  "managerOnly",
  "signedIn",
  "failed",
] as const;
export type StationRefusal = (typeof STATION_REFUSALS)[number];

/** What the station's code route answers. Checked on the client: it's a boundary. */
export const stationRefusal = z.object({
  ok: z.literal(false),
  failure: z.enum(STATION_REFUSALS),
});
export const stationCodeResponse = z.discriminatedUnion("ok", [
  issuedCode,
  stationRefusal,
]);
export type StationCodeResponse = z.infer<typeof stationCodeResponse>;

/** A code the database refused a station (issue_station_code), in words. */
export function stationCodeFailureOf(
  code: string | undefined,
  message = "",
): StationRefusal {
  if (code !== "42501") return "failed";
  if (/not a station/i.test(message)) return "notStation";
  if (/stopped/i.test(message)) return "stopped";
  if (/clock is off/i.test(message)) return "clockOff";
  return /phone only/i.test(message) ? "managerOnly" : "failed";
}

/**
 * Why a device wasn't locked. `tooManyStations`: ten run already; `name`: no
 * name, or one longer than 40 characters.
 */
export type LockFailure =
  | "tooManyStations"
  | "managerOnly"
  | "name"
  | "noAccess"
  | "viewOnly"
  | "failed";

/** Locking refused by the database (start_station_pairing, approve_station_pairing). */
export function lockFailureOf(
  code: string | undefined,
  message = "",
): LockFailure {
  switch (code) {
    case "54000":
      // Its other 54000 is a thousand devices pairing at once, everywhere.
      return /at most ten/i.test(message) ? "tooManyStations" : "failed";
    case "42501":
      // The clock being off reads the same as no access.
      return /phone only/i.test(message) ? "managerOnly" : "noAccess";
    case "22023":
      return /name/i.test(message) ? "name" : "failed";
    default:
      return "failed";
  }
}

/** What locking answers; `to` is where the device goes, as a whole new page. */
export type LockResult =
  | { ok: true; to: string }
  | { ok: false; failure: LockFailure };

/**
 * Why a station wasn't stopped or started again. `gone`: there is no such
 * station (the demo was reset meanwhile); `tooLate`: its two minutes to take
 * the stop back passed, and the device is locked again instead.
 */
export type StationStopFailure =
  | "gone"
  | "tooLate"
  | "noAccess"
  | "viewOnly"
  | "failed";

/** Stopping or restarting refused by the database (set_clock_station_stopped). */
export function stationStopFailureOf(
  code: string | undefined,
): StationStopFailure {
  switch (code) {
    case "P0002":
      return "gone";
    case "55000":
      return "tooLate";
    case "42501":
      return "noAccess";
    default:
      return "failed";
  }
}

export type StationStopResult =
  | { ok: true }
  | { ok: false; failure: StationStopFailure };
