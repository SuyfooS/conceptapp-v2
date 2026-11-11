import { addDays, dateIn } from "./availability";

/**
 * How a conversation names its days and times (chat C2): the divider over
 * each day's messages ("היום", "אתמול", or the date written out), and a
 * message's time, both on the business's own clock. The words are the
 * screen's; this only says which.
 */

/** A divider's day: today, yesterday, or a date the screen writes out. */
export type ChatDay =
  | { kind: "today" }
  | { kind: "yesterday" }
  /** YYYY-MM-DD. */
  | { kind: "date"; day: string };

/**
 * Which word a day takes, against today's date, both YYYY-MM-DD in the
 * business's clock (`dateIn`). A day after today, from a clock that runs a
 * little ahead, is still written out.
 */
export function chatDay(day: string, today: string): ChatDay {
  if (day === today) return { kind: "today" };
  if (day === addDays(today, -1)) return { kind: "yesterday" };
  return { kind: "date", day };
}

/**
 * Whether a day is in today's year, both YYYY-MM-DD in the business's clock.
 * Messages are kept for good, so a date from another year is written with it.
 */
export function inThisYear(day: string, today: string): boolean {
  return day.slice(0, 4) === today.slice(0, 4);
}

/**
 * A day as the chat list writes it, when it is neither today nor yesterday:
 * "1.11", or with its year ("1.11.25") when it isn't this year's, so an old
 * chat's row never looks recent.
 */
export function chatShortDate(day: string, today: string): string {
  const [year = "", month = "1", date = "1"] = day.split("-");
  const short = `${Number(date)}.${Number(month)}`;
  return inThisYear(day, today) ? short : `${short}.${year.slice(2)}`;
}

const timeFormats = new Map<string, Intl.DateTimeFormat>();

/** An instant's time of day on a clock, "08:05", the same in every language. */
export function messageTime(instant: string | Date, timeZone: string): string {
  let format = timeFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone,
    });
    timeFormats.set(timeZone, format);
  }
  return format.format(
    typeof instant === "string" ? new Date(instant) : instant,
  );
}

/**
 * When a row of the chat list last spoke: today by its time, yesterday by
 * the word, and before that by its date, as a phone's messages app does.
 */
export type ChatWhen =
  | { kind: "time"; time: string }
  | { kind: "yesterday" }
  /** YYYY-MM-DD. */
  | { kind: "date"; day: string };

export function chatWhen(
  instant: string,
  now: Date,
  timeZone: string,
): ChatWhen {
  const day = dateIn(new Date(instant), timeZone);
  const which = chatDay(day, dateIn(now, timeZone));
  switch (which.kind) {
    case "today":
      return { kind: "time", time: messageTime(instant, timeZone) };
    case "yesterday":
      return which;
    case "date":
      return which;
    default: {
      const unhandled: never = which;
      return unhandled;
    }
  }
}
