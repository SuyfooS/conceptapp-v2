import { z } from "zod";
import type { Role } from "./modules";
import type { PunchProof } from "./punch-code-format";
import {
  PUNCH_CODE_REFRESH_SECONDS,
  PUNCH_CODE_TTL_SECONDS,
} from "./time-clock";

export * from "./punch-code-format";
export { PUNCH_CODE_REFRESH_SECONDS, PUNCH_CODE_TTL_SECONDS };

/*
 * The clock's code (issue #78): a manager's phone shows a QR with six digits
 * under it, a new one every PUNCH_CODE_REFRESH_SECONDS, each valid for
 * PUNCH_CODE_TTL_SECONDS. A worker types the digits (or, next, scans the QR)
 * to clock in or out. These are the schemas at its boundaries and the code
 * screen's timing; the database checks every punch again.
 */

/** A code shown on screen still has at least this long to live; below it, it is hidden. */
export const PUNCH_CODE_MIN_LEFT_SECONDS =
  PUNCH_CODE_TTL_SECONDS - 2 * PUNCH_CODE_REFRESH_SECONDS;

/** The code inside the QR: 16 random bytes, base64url. */
export const punchCodeText = z.string().regex(/^[A-Za-z0-9_-]{22}$/);
/** The digits under it. */
export const punchDigits = z.string().regex(/^\d{6}$/);

/** The server action's input, checked: the same shape as PunchProof. */
export const punchProof: z.ZodType<PunchProof> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("plain") }),
  z.object({ kind: z.literal("scan"), code: punchCodeText }),
  z.object({ kind: z.literal("typed"), digits: punchDigits }),
  z.object({ kind: z.literal("none") }),
]);

/** Owners never need a code (check_punch); everyone else does when the setting is on. */
export function needsPunchCode(
  settings: { requirePunchCode: boolean },
  role: Role,
): boolean {
  return settings.requirePunchCode && role !== "owner";
}

/**
 * A POST the code route accepts: `Sec-Fetch-Site` absent or `same-origin`, and
 * `Origin`, when present, equal to the app's own origin. Pure, so it is tested
 * here; app/origin.ts feeds it the request's headers and requestOrigin().
 */
export function isSameOriginPost(
  headers: { secFetchSite: string | null; origin: string | null },
  ownOrigin: string,
): boolean {
  if (headers.secFetchSite !== null && headers.secFetchSite !== "same-origin") {
    return false;
  }
  return headers.origin === null || headers.origin === ownOrigin;
}

/** What the issue route answers. Checked on the client: it's a boundary. */
export const issuedCode = z.object({
  ok: z.literal(true),
  code: punchCodeText,
  short: punchDigits,
  expiresAt: z.iso.datetime({ offset: true }),
  /** The database's time when it made the code. */
  now: z.iso.datetime({ offset: true }),
});
export const issueRefusal = z.object({
  ok: z.literal(false),
  // No "clockOff": the database says the clock is off with the same 42501 as no access.
  failure: z.enum(["noAccess", "viewOnly", "stationsOnly", "failed"]),
});
export const issueResponse = z.discriminatedUnion("ok", [
  issuedCode,
  issueRefusal,
]);
export type IssueResponse = z.infer<typeof issueResponse>;
export type IssuedCode = Omit<z.infer<typeof issuedCode>, "ok">;

export type CodePhase =
  | "loading"
  | "showing"
  | "reconnecting"
  | "stale"
  | "offline";

/**
 * What the code screen shows. Timing runs on the server's two times plus the
 * device's monotonic clock since the answer arrived, so a wrong clock on the
 * phone changes nothing. A code with at least PUNCH_CODE_MIN_LEFT_SECONDS left
 * is shown, also after failed fetches (`reconnecting` after two: the code
 * stays, with one quiet line), because the workers' phones may well be online.
 * Below that it is hidden: `stale` while fetches still succeed or have failed
 * once, `offline` after two failures in a row.
 */
export function codePhase(input: {
  issued: { expiresAt: string; now: string } | null;
  elapsedMs: number;
  failures: number;
}): CodePhase {
  const { issued, elapsedMs, failures } = input;
  if (issued) {
    const left =
      Date.parse(issued.expiresAt) - Date.parse(issued.now) - elapsedMs;
    if (left >= PUNCH_CODE_MIN_LEFT_SECONDS * 1000) {
      return failures >= 2 ? "reconnecting" : "showing";
    }
  }
  if (failures >= 2) return "offline";
  return issued ? "stale" : "loading";
}

/** When to ask again: 20 s after an answer, then 5 s and 10 s after failures (10 s from then on). */
export function nextFetchDelayMs(failures: number): number {
  if (failures <= 0) return PUNCH_CODE_REFRESH_SECONDS * 1000;
  return failures === 1 ? 5_000 : 10_000;
}

/** Whole seconds until the next code, for the line under the digits (20 → 1, never below 0). */
export function secondsToNextCode(elapsedMs: number): number {
  return Math.max(
    0,
    Math.ceil((PUNCH_CODE_REFRESH_SECONDS * 1000 - elapsedMs) / 1000),
  );
}
