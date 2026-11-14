import "server-only";
import { dateIn, weekdayOf } from "@domain/availability";
import { dayMonth, WEEKDAY_KEYS } from "@domain/availability-form";
import { numberRange, signed } from "@domain/lists";
import type {
  NotificationChat,
  NotificationEntry,
  NotificationPerson,
  NotificationShift,
} from "@domain/notifications";
import type { PushNotice } from "@domain/push";
import { timeIn } from "@domain/shabbat";
import { addMonths } from "@domain/time-clock-format";
import { dayMonthYear } from "@domain/wages";
import { type AppWording, translator } from "@/app/(app)/wording";
import { defaultLocale, direction } from "@/i18n/config";

/**
 * What a phone shows for a line: its title and one body, in plain text, with
 * the business's words (the same sentences as the inbox). Times and numbers
 * sit in Unicode isolates, as `<ltr>` does on screen. Never a note, a message
 * or a number of hours: the lines hold none. A chat's line says who wrote and
 * how many messages wait, and a group's name, never a word of them: a lock
 * screen is seen by whoever is near the phone. A document's says who sent it,
 * never its category, title or file. Someone who keeps details off the lock
 * screen gets the group's words alone (`hiddenWords`).
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
  /** A month in words, `2026-10` as "אוקטובר 2026". */
  const monthName = (month: string) =>
    new Intl.DateTimeFormat(LANG, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${month}-15T12:00:00Z`));
  /** A group's name in a line's title, or null when the line lost it. */
  const groupTitle = (chat: NotificationChat | null) =>
    chat?.kind === "team"
      ? t("kinds.chat.group.titleTeam")
      : chat?.name
        ? t("kinds.chat.group.title", { group: chat.name })
        : null;
  /** A moment's weekday and time on the business's clock, in words. */
  const dayAndTime = (at: string) => {
    const instant = new Date(at);
    return {
      day: weekday(dateIn(instant, timeZone)),
      time: timeIn(instant, timeZone),
    };
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
    // The reminders (notifications part 4): what they ask for and by when,
    // from what the line holds (a week, a moment, a count), never who.
    case "availability.due": {
      const date = dayMonth(line.startsOn);
      // Sent, or the week published: nothing waits on it now.
      if (settled) {
        return { title: t("kinds.availability.due.settledTitle", { date }) };
      }
      return {
        title: t("kinds.availability.due.title", { date }),
        ...body(
          line.dueAt
            ? t.markup("kinds.availability.due.note", {
                ltr: isolate,
                ...dayAndTime(line.dueAt),
              })
            : null,
        ),
      };
    }
    case "availability.missing": {
      const date = dayMonth(line.startsOn);
      // Everyone sent it, or the week published.
      if (settled) {
        return {
          title: t("kinds.availability.missing.settledTitle", { date }),
        };
      }
      return {
        title: t("kinds.availability.missing.title", {
          count: line.missing,
          date,
        }),
        ...body(
          line.dueAt
            ? t.markup("kinds.availability.missing.note", {
                ltr: isolate,
                ...dayAndTime(line.dueAt),
              })
            : null,
        ),
      };
    }
    case "clock.open":
      // Clocked out, closed by a correction, or now a manager's to close.
      if (settled) return { title: t("kinds.clock.open.settledTitle") };
      return {
        title: t("kinds.clock.open.title"),
        ...body(
          line.shiftEnd
            ? t.markup("kinds.clock.open.afterShift", {
                ltr: isolate,
                time: timeIn(new Date(line.shiftEnd), timeZone),
              })
            : line.since
              ? t.markup("kinds.clock.open.noShift", {
                  ltr: isolate,
                  ...dayAndTime(line.since),
                })
              : t("kinds.clock.open.plain"),
        ),
      };
    case "clock.overdue":
      return {
        // The reader's own entry says so, without their name.
        title: line.mine
          ? settled
            ? t("kinds.clock.overdue.settledTitleMine")
            : t("kinds.clock.overdue.titleMine")
          : settled
            ? t("kinds.clock.overdue.settledTitle", { name: who(line.person) })
            : t("kinds.clock.overdue.title", { name: who(line.person) }),
        ...body(
          line.since
            ? t.markup("kinds.clock.overdue.since", {
                ltr: isolate,
                ...dayAndTime(line.since),
              })
            : null,
          settled ? null : t("kinds.clock.overdue.note"),
        ),
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
    case "lists.passed":
      // Finished, or passed on again: nothing waits on it now.
      if (settled) {
        return {
          title: t("kinds.lists.passed.settledTitle", { name: line.name }),
        };
      }
      return {
        title: line.department
          ? t("kinds.lists.passed.title", {
              name: line.name,
              department: line.department,
            })
          : t("kinds.lists.passed.titlePlain", { name: line.name }),
        ...body(line.hasNote ? t("kinds.lists.passed.note") : null),
      };
    case "lists.due":
    case "lists.late":
    case "lists.late_team": {
      const key =
        line.kind === "lists.due"
          ? "due"
          : line.kind === "lists.late"
            ? "late"
            : "late_team";
      // Finished or missed: nothing waits on it now.
      if (settled) {
        return {
          title: t(`kinds.lists.${key}.settledTitle`, { name: line.name }),
        };
      }
      return {
        title: t(`kinds.lists.${key}.title`, { name: line.name }),
        ...body(
          line.due
            ? t.markup(`kinds.lists.${key}.note`, {
                ltr: isolate,
                time: timeIn(new Date(line.due), timeZone),
              })
            : null,
        ),
      };
    }
    case "lists.out_of_range": {
      const range = line.reading ? numberRange(line.reading) : null;
      return {
        title: line.label
          ? t("kinds.lists.out_of_range.title", {
              name: line.name,
              label: line.label,
            })
          : t("kinds.lists.out_of_range.titleNoLabel", { name: line.name }),
        ...body(
          line.reading && range
            ? t.markup("kinds.lists.out_of_range.note", {
                ltr: isolate,
                reading: `${signed(line.reading.value)}${line.reading.unit ? ` ${line.reading.unit}` : ""}`,
                kind: range.kind,
                range: range.range,
              })
            : null,
        ),
      };
    }
    case "access.pay_granted":
      return settled
        ? { title: t("kinds.access.pay_granted.settledTitle") }
        : {
            title: t("kinds.access.pay_granted.title"),
            // Given from the console: the ConceptApp team, as the inbox says.
            ...body(
              entry.actor.kind === "team"
                ? t("kinds.access.pay_granted.byTeam")
                : null,
              t("kinds.access.pay_granted.note"),
            ),
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
    case "pay.after_close":
      return {
        title: line.month
          ? t("kinds.pay.after_close.title", { month: monthName(line.month) })
          : t("kinds.pay.after_close.titleUndated"),
        // The file it goes into, named: the month after the closed one.
        ...body(
          line.month
            ? t("kinds.pay.after_close.note", {
                next: monthName(addMonths(line.month, 1)),
              })
            : t("kinds.pay.after_close.noteUndated"),
        ),
      };
    case "pay.month_due": {
      // Counts only; once the month is closed, it says so.
      const month = line.month ? monthName(line.month) : null;
      if (settled) {
        return {
          title: month
            ? t("kinds.pay.month_due.settledTitle", { month })
            : t("kinds.pay.month_due.settledTitleUndated"),
        };
      }
      return {
        title: month
          ? t("kinds.pay.month_due.title", { month })
          : t("kinds.pay.month_due.titleUndated"),
        ...body(
          line.waiting > 0
            ? t("kinds.pay.month_due.waiting", { count: line.waiting })
            : null,
          line.open > 0
            ? t("kinds.pay.month_due.open", { count: line.open })
            : null,
          line.waiting === 0 && line.open === 0
            ? t("kinds.pay.month_due.ready")
            : null,
        ),
      };
    }
    case "chat.direct":
      return {
        title: t("kinds.chat.direct.title", { name: who(line.from) }),
        ...body(t("kinds.chat.direct.body", { count: line.count })),
      };
    case "chat.group":
      return {
        title: groupTitle(line.chat) ?? t("kinds.chat.group.titlePlain"),
        ...body(
          t("kinds.chat.group.body", {
            count: line.count,
            name: who(line.from),
          }),
        ),
      };
    case "chat.announcement":
      return {
        title: t("kinds.chat.announcement.title"),
        ...body(
          settled
            ? t("kinds.chat.announcement.settledNote")
            : line.chat?.kind === "team"
              ? t("kinds.chat.announcement.bodyTeam")
              : line.chat?.name
                ? t("kinds.chat.announcement.body", { group: line.chat.name })
                : t("kinds.chat.announcement.bodyPlain"),
        ),
      };
    // A document's lines (chat C6) say who sent it, and that it waits for
    // "קראתי", never what it is: the category ("אישור מחלה") stays off a lock
    // screen anyone near the phone can see, whatever the line was read with.
    case "documents.received":
      return {
        title: t("kinds.documents.received.title", { name: who(line.from) }),
        ...body(settled ? t("kinds.documents.received.settledNote") : null),
      };
    case "documents.sent":
      return { title: t("kinds.documents.sent.title") };
    case "documents.to_confirm":
      return {
        title: t("kinds.documents.to_confirm.title"),
        ...body(
          settled
            ? t("kinds.documents.to_confirm.settledNote")
            : t("kinds.documents.to_confirm.body"),
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

/**
 * What a lock screen shows of a line when its person keeps details off it
 * (notifications part 3): its group's words alone ("עדכון בסידור"), never a
 * name, a time or anything else of the line, and no body. A line with no
 * group says only that something is new.
 */
export function hiddenWords(
  entry: NotificationEntry,
  wording: AppWording,
): { title: string } {
  const t = translator(wording, "app.notifications.push.notice.hidden");
  return { title: t(entry.group ?? "other") };
}

/**
 * A line as the phone shows it, opening through /notifications/open. Shown
 * `again` in place of itself, it makes no sound; without `previews`, the
 * lock screen gets its group's words alone.
 */
export function pushNotice(
  entry: NotificationEntry,
  wording: AppWording,
  timeZone: string,
  {
    again = false,
    previews = true,
  }: { again?: boolean; previews?: boolean } = {},
): PushNotice {
  const words = previews
    ? pushWords(entry, wording, timeZone)
    : hiddenWords(entry, wording);
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

/**
 * Several lines at once: one notification that says how many. It opens the
 * inbox when they are all from the business the person is in; lines from
 * another of their businesses (payroll P3b) open Home instead, which lists
 * each business with what is unread there (`summaryPlace`).
 */
export function summaryNotice(
  count: number,
  wording: AppWording,
  place: "inbox" | "home" = "inbox",
): PushNotice {
  const t = translator(wording, "app.notifications.push.notice");
  return {
    tag: "summary",
    title: t("summary", { count }),
    body: place === "home" ? t("summaryBodyBusinesses") : t("summaryBody"),
    url: place === "home" ? "/home" : "/notifications",
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
