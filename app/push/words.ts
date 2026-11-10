import "server-only";
import { dateIn, weekdayOf } from "@domain/availability";
import { dayMonth, WEEKDAY_KEYS } from "@domain/availability-form";
import type {
  NotificationEntry,
  NotificationPerson,
  NotificationShift,
} from "@domain/notifications";
import type { PushNotice } from "@domain/push";
import { timeIn } from "@domain/shabbat";
import { dayMonthYear } from "@domain/wages";
import { type AppWording, translator } from "@/app/(app)/wording";
import { defaultLocale, direction } from "@/i18n/config";

/**
 * What a phone shows for a line: its title and one body, in plain text, with
 * the business's words (the same sentences as the inbox). Times and numbers
 * sit in Unicode isolates, as `<ltr>` does on screen. Never a note, a message
 * or a number of hours: the lines hold none.
 */

const isolate = (chunks: string) => `⁦${chunks}⁩`;

const LANG = defaultLocale;
const DIR = direction(defaultLocale);

export function pushWords(
  entry: NotificationEntry,
  wording: AppWording,
  /** The business's own clock, for the times it names. */
  timeZone: string,
): { title: string; body?: string } {
  const t = translator(wording, "app.notifications");
  const tDays = translator(wording, "app.availability.weekdays");
  const weekday = (date: string) =>
    tDays(WEEKDAY_KEYS[weekdayOf(date)] ?? "sun");
  const who = (person: NotificationPerson) =>
    person.kind === "member"
      ? (person.name ?? t("who.noName"))
      : t(`who.${person.kind}`);
  const shiftWords = (shift: NotificationShift | null) =>
    shift
      ? t.markup("shift", {
          ltr: isolate,
          name: shift.name,
          day: weekday(shift.day),
          date: dayMonth(shift.day),
          start: shift.start,
          end: shift.end,
        })
      : null;
  const body = (...parts: (string | null)[]) => {
    const text = parts.filter((part): part is string => !!part).join("\n");
    return text ? { body: text } : {};
  };
  const { line, settled } = entry;

  switch (line.kind) {
    case "schedule.published":
    case "schedule.changed": {
      const key = line.kind === "schedule.published" ? "published" : "changed";
      return {
        title: t(`kinds.schedule.${key}.title`, {
          date: dayMonth(line.startsOn),
        }),
        ...body(t(`kinds.schedule.${key}.body`, { count: line.mine })),
      };
    }
    case "swap.offered":
      return {
        title: t("kinds.swap.offered.title", { name: who(line.from) }),
        ...body(
          shiftWords(line.shift),
          settled
            ? t("kinds.swap.offered.settledNote")
            : t("kinds.swap.offered.note"),
        ),
      };
    case "swap.taken":
      return {
        title: t("kinds.swap.taken.title", { name: who(line.by) }),
        ...body(shiftWords(line.shift), t("kinds.swap.taken.note")),
      };
    case "swap.waiting":
      return {
        title: settled
          ? t("kinds.swap.waiting.settledTitle")
          : t("kinds.swap.waiting.title"),
        ...body(
          t("kinds.swap.waiting.people", {
            to: who(line.to),
            from: who(line.from),
          }),
          shiftWords(line.shift),
        ),
      };
    case "swap.cancelled":
      return {
        title: t("kinds.swap.cancelled.title", { name: who(line.from) }),
        ...body(shiftWords(line.shift), t("kinds.swap.cancelled.note")),
      };
    case "swap.approved":
      return {
        title:
          line.side === "from"
            ? t("kinds.swap.approved.titleFrom", { name: who(line.to) })
            : line.side === "to"
              ? t("kinds.swap.approved.titleTo")
              : t("kinds.swap.approved.title", {
                  to: who(line.to),
                  from: who(line.from),
                }),
        ...body(shiftWords(line.shift)),
      };
    case "swap.declined":
      return {
        title:
          line.side === "from"
            ? t("kinds.swap.declined.titleFrom")
            : line.side === "to"
              ? t("kinds.swap.declined.titleTo", { name: who(line.from) })
              : t("kinds.swap.declined.title", { from: who(line.from) }),
        ...body(shiftWords(line.shift)),
      };
    case "swap.removed":
      return {
        title: t("kinds.swap.removed.title"),
        ...body(shiftWords(line.shift)),
      };
    case "clock.confirm": {
      const at = new Date(line.at);
      return {
        title: settled
          ? t("kinds.clock.confirm.settledTitle", { name: who(line.person) })
          : t("kinds.clock.confirm.title", { name: who(line.person) }),
        ...body(
          t.markup("kinds.clock.confirm.body", {
            ltr: isolate,
            what: line.proof === "self" ? "self" : line.direction,
            day: weekday(dateIn(at, timeZone)),
            time: timeIn(at, timeZone),
          }),
        ),
      };
    }
    case "team.joined":
      return {
        title: t("kinds.team.joined.title", { name: who(line.person) }),
      };
    case "lists.sent":
      return {
        // Finished, cancelled or missed: nothing waits on it now.
        title: settled
          ? t("kinds.lists.sent.settledTitle", { name: line.name })
          : t("kinds.lists.sent.title", { name: line.name }),
      };
    case "lists.finished":
      return {
        title: t("kinds.lists.finished.title", { name: line.name }),
      };
    case "access.pay_granted":
      return settled
        ? { title: t("kinds.access.pay_granted.settledTitle") }
        : {
            title: t("kinds.access.pay_granted.title"),
            ...body(t("kinds.access.pay_granted.note")),
          };
    case "pay.wage_set":
      // The day it takes effect, never the amount.
      return {
        title: t("kinds.pay.wage_set.title"),
        ...body(
          line.since
            ? t.markup("kinds.pay.wage_set.note", {
                ltr: isolate,
                since: dayMonthYear(line.since),
              })
            : t("kinds.pay.wage_set.noteUndated"),
        ),
      };
    case "push.test":
      return {
        title: t("kinds.push.test.title"),
        ...body(t("kinds.push.test.note")),
      };
    case "other":
      return { title: t("kinds.other.title") };
    default: {
      // A new kind of line needs its words here too: typecheck says so.
      const unhandled: never = line;
      return unhandled;
    }
  }
}

/** A line as the phone shows it, opening through /notifications/open. */
export function pushNotice(
  entry: NotificationEntry,
  wording: AppWording,
  timeZone: string,
  again = false,
): PushNotice {
  const words = pushWords(entry, wording, timeZone);
  return {
    tag: entry.id,
    ...words,
    url: `/notifications/open/${entry.id}`,
    timestamp: Date.parse(entry.at),
    lang: LANG,
    dir: DIR,
    ...(again ? { silent: true } : {}),
  };
}

/** Several lines at once: one notification that says how many. */
export function summaryNotice(count: number, wording: AppWording): PushNotice {
  const t = translator(wording, "app.notifications.push.notice");
  return {
    tag: "summary",
    title: t("summary", { count }),
    body: t("summaryBody"),
    url: "/notifications",
    lang: LANG,
    dir: DIR,
  };
}

/**
 * A line that says nothing of anyone: for a phone signed in as someone else,
 * or with nothing of the person's to show.
 */
export function plainNotice(wording: AppWording): PushNotice {
  const t = translator(wording, "app.notifications.push.notice");
  return {
    tag: "conceptapp",
    title: t("plain.title"),
    body: t("plain.body"),
    url: "/notifications",
    lang: LANG,
    dir: DIR,
  };
}

/** For a phone nobody is signed in on: sign in again to get them. */
export function signedOutNotice(wording: AppWording): PushNotice {
  const t = translator(wording, "app.notifications.push.notice");
  return {
    tag: "conceptapp",
    title: t("signedOut.title"),
    body: t("signedOut.body"),
    url: "/notifications",
    lang: LANG,
    dir: DIR,
  };
}
