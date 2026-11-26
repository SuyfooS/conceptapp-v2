import type { BuildWeeks } from "./running-week";
import { calendarDate } from "./shabbat";

/**
 * Sharing the published schedule, and reminding the team to send their
 * availability (`@ui/share-sheet`). The app never sends these itself: the
 * person taps WhatsApp, the device's share sheet or a copy, and chooses whom
 * to send to there. So nothing is written or logged, and the message holds
 * only what the whole team already reads: the business's name, the week and
 * the app's link, never anyone's name, number or hours.
 */

/** The schedule tab, where the team reads the published week. */
export const SCHEDULE_PATH = "/schedule";

/** Where each person sends their own availability. */
export const AVAILABILITY_PATH = "/schedule/availability";

/**
 * The schedule tab on one of its weeks, by the week's first day: the link a
 * shared schedule carries, so it still opens the week it was about after the
 * week turns. `base` is the tab's path (a twin's on /design).
 */
export function scheduleWeekHref(
  start: string,
  base: `/${string}` = SCHEDULE_PATH,
): `/${string}` {
  calendarDate.parse(start);
  return `${base}?week=${start}`;
}

/**
 * Which of the tab's weeks `?week=` names: this week or next. Anything else,
 * an old week's link included, is neither, and the tab opens as it would
 * with none.
 */
export function scheduleWeekOf(
  asked: string | null | undefined,
  weeks: BuildWeeks,
): "this" | "next" | null {
  if (asked === weeks.thisWeek) return "this";
  if (asked === weeks.nextWeek) return "next";
  return null;
}

/** The message as it goes out: the sentence, then the link on its own line. */
export function shareText(message: string, link: string): string {
  return `${message.trim()}\n${link}`;
}

/**
 * WhatsApp with the text written and no number, so WhatsApp asks whom to
 * send it to: the app on a phone, WhatsApp Web or Desktop on a computer.
 */
export function whatsappHref(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/**
 * WhatsApp with the text written, in a chat to one number: an invite's own
 * link sent to the number it was made for (inviting from a list, part 2;
 * the plan's 3.6), so nobody searches their contacts for each person. `phone`
 * is E.164 ("+972501234567"); wa.me takes its digits alone. The person
 * still presses send in WhatsApp, which shows the chat first; the app sends
 * nothing. The text names nobody: the business, the sentence and the link.
 * Only behind the database, never on a twin, where a made-up number may be
 * someone's.
 */
export function whatsappToHref(phone: string, text: string): string {
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    throw new Error("WhatsApp takes a number in E.164");
  }
  return `https://wa.me/${phone.slice(1)}?text=${encodeURIComponent(text)}`;
}

/**
 * A week's dates in words, as the schedule tab names its weeks: "22–28
 * בנובמבר", or "29 בנובמבר–5 בדצמבר" across two months. The days of one
 * month read left to right (`daysLeftToRight`), on the tab and in the
 * message a share sends alike.
 */
export function weekRange(locale: string, dates: readonly string[]): string {
  const first = dates[0];
  const last = dates.at(-1);
  if (first === undefined || last === undefined) {
    throw new Error("A week has days");
  }
  return daysLeftToRight(
    new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).formatRange(
      new Date(`${first}T00:00:00Z`),
      new Date(`${last}T00:00:00Z`),
    ),
  );
}

/** LEFT-TO-RIGHT ISOLATE and POP DIRECTIONAL ISOLATE. */
const LRI = "\u2066";
const PDI = "\u2069";

/**
 * Each run of digits, a dash and digits ("22–28") held in a left-to-right
 * isolate, so the first day stands on the left in a right-to-left line, as
 * `<ltr>` holds "1.11–7.11" on the screens. Left alone, the dash between two
 * numbers takes the line's direction and draws "28–22". Plain text, since a
 * WhatsApp message takes no markup (a push line's isolates do the same).
 * Only that run: "29 בנובמבר–5 בדצמבר" already reads right, and would
 * scramble held whole.
 */
export function daysLeftToRight(text: string): string {
  return text.replace(/(\d+)–(\d+)/g, `${LRI}$1–$2${PDI}`);
}

/**
 * Whether availability is late at `now`: the due moment has passed. Late
 * answers are still taken, so the reminder goes on, in other words.
 */
export function availabilityLate(dueAt: string, now: Date): boolean {
  return Date.parse(dueAt) < now.getTime();
}
