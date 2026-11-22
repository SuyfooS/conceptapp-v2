/**
 * The words a refusal on a holder's file shows, under `app.team.file`; null
 * for those the screen answers by drawing itself again: the duties first
 * (`ack`) and no fresh step-up (`stepUp`), which show the duties' card and
 * the locked one.
 */
export type HolderWordsKey =
  | "failures.viewOnly"
  | "failures.businessChanged"
  | "failures.off"
  | "failures.noAccess"
  | "failures.failed"
  | "code.wrongCode"
  | "code.tooMany"
  | "code.rateLimit"
  | "code.noPhone"
  | "code.failed"
  | "reveal.limit"
  | "reveal.noAccess"
  | "unavailable";

/**
 * A refusal in words. A send that failed (the SMS service or the auth
 * server) says the code didn't go; anything else that failed, "something
 * didn't work".
 */
export function holderWordsOf(
  failure: string,
  when: "send" | "confirm" | "reveal" | "other" = "other",
): HolderWordsKey | null {
  switch (failure) {
    case "ack":
    case "stepUp":
      return null;
    case "wrongCode":
    case "tooMany":
    case "rateLimit":
    case "noPhone":
      return `code.${failure}`;
    case "invalidPhone":
      return "code.noPhone";
    case "viewOnly":
    case "businessChanged":
    case "off":
      return `failures.${failure}`;
    case "noAccess":
      return when === "reveal" ? "reveal.noAccess" : "failures.noAccess";
    case "limit":
      return "reveal.limit";
    case "keys":
    case "unavailable":
      return "unavailable";
    case "failed":
      return when === "send" ? "code.failed" : "failures.failed";
    default:
      return "failures.failed";
  }
}
