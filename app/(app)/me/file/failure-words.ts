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

/** A code's refusal as the bank step says it, in `app.file.bank.code`; null for a file's refusal. */
export function codeKey(
  failure: CodeFailure | FileActionFailure,
): "wrongCode" | "tooMany" | "rateLimit" | "noPhone" | null {
  switch (failure) {
    case "wrongCode":
    case "tooMany":
    case "rateLimit":
    case "noPhone":
      return failure;
    case "invalidPhone":
      return "noPhone";
    default:
      return null;
  }
}
