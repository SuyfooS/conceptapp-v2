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
  | "failures.demo"
  | "failures.closed"
  | "failures.notInTeam"
  | "review.moved"
  | "review.settled"
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
 * didn't work". A holder's write (H6b-1) also says the account changed
 * again or was confirmed meanwhile, a demo's files kept as they are, real
 * files not open yet, and the person off the team.
 */
export function holderWordsOf(
  failure: string,
  when: "send" | "confirm" | "reveal" | "write" | "other" = "other",
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
    case "moved":
    case "settled":
      return `review.${failure}`;
    case "demo":
    case "closed":
    case "notInTeam":
      return `failures.${failure}`;
    case "keys":
    case "unavailable":
      return "unavailable";
    case "failed":
      return when === "send" ? "code.failed" : "failures.failed";
    default:
      return "failures.failed";
  }
}
