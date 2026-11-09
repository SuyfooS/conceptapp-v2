/*
 * The clock's codes as the worker's browser handles them, apart from their
 * schemas in punch-code.ts, so the clock screen never downloads Zod to read a
 * code (as time-clock-format.ts does for the sums). No imports, on purpose:
 * tooling/boundaries.test.ts keeps it that way. punch-code.ts re-exports all
 * of this for the server and the manager's code screen.
 */

/** What the QR holds: the format's version, then the code. */
export const PUNCH_PAYLOAD_PREFIX = "ca1:";

/**
 * How long typing stays blocked after too many wrong digits, at most: the
 * database counts a person's tries over the last 30 minutes
 * (note_punch_attempt, check_punch in 20261108000300_sealed.sql).
 */
export const PUNCH_TYPING_BLOCK_MINUTES = 30;

/** How a person proves a punch. plain: the business needs no code from them. */
export type PunchProof =
  | { kind: "plain" }
  | { kind: "scan"; code: string }
  | { kind: "typed"; digits: string }
  | { kind: "none" };

const SCANNED = new RegExp(`^${PUNCH_PAYLOAD_PREFIX}([A-Za-z0-9_-]{22})$`);

/** The text a QR carries for a code: never a link, so nobody can forward one to tap. */
export function punchPayload(code: string): string {
  return `${PUNCH_PAYLOAD_PREFIX}${code}`;
}

/** The code in what a camera read, or null when it is not the clock's. */
export function parsePunchScan(text: string): string | null {
  return SCANNED.exec(text.trim())?.[1] ?? null;
}

/** "482915" as it is read aloud from a screen: "482 915". */
export function formatShortCode(digits: string): string {
  return `${digits.slice(0, 3)} ${digits.slice(3)}`;
}

/** "482915" for a screen reader, digit by digit: "4 8 2 9 1 5". */
export function spokenDigits(digits: string): string {
  return [...digits].join(" ");
}

/** 42 → "000042": the six digits of a whole number below a million. */
export function padShortCode(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n >= 1_000_000) {
    throw new RangeError("A short code is a whole number below a million");
  }
  return String(n).padStart(6, "0");
}
