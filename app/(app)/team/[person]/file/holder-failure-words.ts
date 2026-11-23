import { clockAt } from "@domain/today";
import type { FileHold } from "./holder-file-types";

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
  | "code.captcha"
  | "code.noPhone"
  | "code.failed"
  | "code.phoneHoldPlain"
  | "reveal.limit"
  | "reveal.noAccess"
  | "unavailable";

/**
 * A refusal in words. A send that failed (the SMS service or the auth
 * server) says the code didn't go, and one refused for its "אני לא רובוט"
 * check says so; anything else that failed, "something didn't work". A holder's write (H6b-1) also says the account changed
 * again or was confirmed meanwhile, a demo's files kept as they are, real
 * files not open yet, and the person off the team. The week after a phone
 * change has words of its own, with its day (`holdWordsOf`); without one,
 * these.
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
    case "captcha":
    case "noPhone":
      return `code.${failure}`;
    case "invalidPhone":
      return "code.noPhone";
    case "phoneHold":
      return "code.phoneHoldPlain";
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

/** The week after a phone change in words, under `app.team.file`, with what goes in them. */
export type HoldWords =
  | { key: "code.phoneHoldToday"; time: string }
  | { key: "code.phoneHold"; day: string }
  | { key: "code.phoneHoldPlain" };

/**
 * The week after the holder's own phone change in words: by its time, in
 * the business's zone, when it ends later `today` (so "today" never reads
 * as now), by its day otherwise, and plainly when neither is known.
 */
export function holdWordsOf(
  hold: FileHold,
  today: string,
  timeZone: string,
): HoldWords {
  if (hold.at !== null && hold.day === today) {
    return {
      key: "code.phoneHoldToday",
      time: clockAt(new Date(hold.at), timeZone).time,
    };
  }
  if (hold.day !== null) return { key: "code.phoneHold", day: hold.day };
  return { key: "code.phoneHoldPlain" };
}
