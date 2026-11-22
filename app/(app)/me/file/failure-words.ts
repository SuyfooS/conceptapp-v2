import type { CodeFailure, FileActionFailure } from "./file-types";

/** The words a refused write shows, in `app.file.failures`. */
export type FailureKey =
  | "off"
  | "demo"
  | "closed"
  | "keys"
  | "invalid"
  | "stepUp"
  | "phoneHold"
  | "viewOnly"
  | "businessChanged"
  | "failed";

/**
 * A refusal of the file's writes as the screen says it: the few a worker
 * can meet on their own file in words of their own, and the rest (a holder's
 * refusals, a race with the database) as "not saved, try again".
 */
export function failureKey(failure: FileActionFailure): FailureKey {
  switch (failure) {
    case "off":
    case "notStaff":
    case "notInTeam":
      return "off";
    case "demo":
    case "closed":
    case "invalid":
    case "stepUp":
    case "phoneHold":
    case "viewOnly":
    case "businessChanged":
      return failure;
    case "keys":
    case "unavailable":
    case "shredded":
      return "keys";
    default:
      return "failed";
  }
}

/** The words a code's refusal shows, in `app.file.bank.code`. */
export type CodeKey =
  | "wrongCode"
  | "tooMany"
  | "rateLimit"
  | "noPhone"
  | "failed";

/**
 * A code's refusal as the bank step says it, in `app.file.bank.code`; null
 * for a file's refusal. A send that failed (the SMS service or the auth
 * server) says the code didn't go, never that something wasn't saved; a
 * check that failed is the file's "not saved", since the account didn't go
 * in either.
 */
export function codeKey(
  failure: CodeFailure | FileActionFailure,
  when: "send" | "confirm",
): CodeKey | null {
  switch (failure) {
    case "wrongCode":
    case "tooMany":
    case "rateLimit":
    case "noPhone":
      return failure;
    case "invalidPhone":
      return "noPhone";
    case "failed":
      return when === "send" ? "failed" : null;
    default:
      return null;
  }
}
