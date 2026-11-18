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
 * A week's dates in words, as the schedule tab names its weeks: "22–28
 * בנובמבר", or "29 בנובמבר–5 בדצמבר" across two months.
 */
export function weekRange(locale: string, dates: readonly string[]): string {
  const first = dates[0];
  const last = dates.at(-1);
  if (first === undefined || last === undefined) {
    throw new Error("A week has days");
  }
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).formatRange(new Date(`${first}T00:00:00Z`), new Date(`${last}T00:00:00Z`));
}

/**
 * Whether availability is late at `now`: the due moment has passed. Late
 * answers are still taken, so the reminder goes on, in other words.
 */
export function availabilityLate(dueAt: string, now: Date): boolean {
  return Date.parse(dueAt) < now.getTime();
}
