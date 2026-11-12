import { dateIn, weekdayOf } from "@domain/availability";
import { dayMonth, WEEKDAY_KEYS } from "@domain/availability-form";
import { numberRange, signed } from "@domain/lists";
import {
  inboxAgo,
  type NotificationActor,
  type NotificationEntry,
  type NotificationGroup,
  type NotificationShift,
} from "@domain/notifications";
import { timeIn } from "@domain/shabbat";
import { addMonths } from "@domain/time-clock-format";
import { dayMonthYear } from "@domain/wages";
import { Button } from "@ui/button";
import { Card, CardText, CardTitle } from "@ui/card";
import { cn } from "@ui/cn";
import { EmptyState } from "@ui/empty-state";
import { ListGroup } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { PersonAvatar } from "@ui/person-row";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useFormatter } from "next-intl";
import type { ReactNode } from "react";
import { type AppWording, translator } from "../wording";
import { GROUP_ICONS } from "./group-icons";
import { InboxOpen, InboxRow, ReadAllButton } from "./inbox-row";
import { NotificationSettingsLink } from "./settings-link";

export type InboxPaths = {
  /** This screen, for the newest page and an older one's cursor. */
  self: string;
  home: string;
  /** Prefixes where a line leads on the demo, where lines are plain links. */
  base: string;
};

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

const th = "px-4 py-3 text-start font-medium text-ink-2 text-sm";
const td = "border-line border-t px-4 py-3 align-top";

/** A line with its words, worked out once for every shape. */
type Described = {
  entry: NotificationEntry;
  title: ReactNode;
  /** The shift it is about, where there is one. */
  shift: ReactNode | null;
  /** What else it says, a line apiece. */
  notes: ReactNode[];
  /** The actor's picture, or the group's icon. */
  leading: ReactNode;
};

/**
 * The inbox: the person's notifications in the business, every unread one
 * first, then the ones already read, a page at a time. Pressing a line marks
 * it read and opens where it leads (`open`, a server action, so a prefetch
 * never marks anything). A line whose request was handled says so. One list on
 * a phone; on a tablet, beside it a card saying what comes here; on a computer,
 * each section is a table with who, what, the shift and when, beside the same
 * card. The words are worked out once per line, so every shape says the same.
 * `push`, the switch for notifications on this phone, sits at the top on a
 * phone and above the card from the tablet up. `settings`, the way to what
 * reaches the phone: under the lines on a phone, under the card from the
 * tablet up. Also on the design demo.
 */
export function InboxView({
  unread,
  earlier,
  older,
  olderPage,
  groups,
  now,
  timeZone,
  open,
  readAll,
  paths,
  wording,
  push,
  settings = null,
}: {
  unread: NotificationEntry[];
  earlier: NotificationEntry[];
  /** The cursor of the next older page, or null at the start. */
  older: string | null;
  /** Whether this is an older page rather than the newest. */
  olderPage: boolean;
  /** What reaches this person here, for the side card. */
  groups: NotificationGroup[];
  /** ISO timestamp of the moment the screen is read. */
  now: string;
  timeZone: string;
  /**
   * Marks a line read and opens where it leads; null on the demo, where a
   * line is a plain link and nothing is marked.
   */
  open: ((id: string) => Promise<void>) | null;
  readAll: () => Promise<void>;
  paths: InboxPaths;
  /** The business's words. */
  wording: AppWording;
  /** The phone switch (`PushSwitch`), or nothing where push isn't set up. */
  push?: ReactNode;
  /** Where the notification settings are, where there is something to choose. */
  settings?: string | null;
}) {
  const t = translator(wording, "app.notifications");
  const tDays = translator(wording, "app.availability.weekdays");
  const tDocuments = translator(wording, "app.chat.documents");
  const format = useFormatter();
  const nowDate = new Date(now);

  const weekday = (date: string) =>
    tDays(WEEKDAY_KEYS[weekdayOf(date)] ?? "sun");
  /** A month in words, `2026-10` as "אוקטובר 2026". */
  const monthName = (month: string) =>
    format.dateTime(new Date(`${month}-15T12:00:00Z`), {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  /** Who a line names or is from: the app itself for its own reminders. */
  const who = (person: NotificationActor) =>
    person.kind === "member"
      ? (person.name ?? t("who.noName"))
      : t(`who.${person.kind}`);
  const shiftWords = (shift: NotificationShift | null) =>
    shift
      ? t.rich("shift", {
          ltr,
          name: shift.name,
          day: weekday(shift.day),
          date: dayMonth(shift.day),
          start: shift.start,
          end: shift.end,
        })
      : null;
  /** A moment's weekday and time on the business's clock, in words. */
  const dayAndTime = (at: string) => {
    const instant = new Date(at);
    return {
      day: weekday(dateIn(instant, timeZone)),
      time: timeIn(instant, timeZone),
    };
  };
  const when = (at: string) => {
    const instant = new Date(at);
    const ago = inboxAgo(instant, nowDate);
    if (ago?.unit === "now") return t("time.now");
    if (ago) return t(`time.${ago.unit}`, { count: ago.count });
    return format.dateTime(instant, {
      day: "numeric",
      month: "numeric",
      timeZone,
    });
  };

  /** The line's title, its shift, and the lines under it. */
  function words(
    entry: NotificationEntry,
  ): Pick<Described, "title" | "shift" | "notes"> {
    const { line, settled } = entry;
    switch (line.kind) {
      case "schedule.published":
      case "schedule.changed": {
        const key =
          line.kind === "schedule.published" ? "published" : "changed";
        return {
          title: t(`kinds.schedule.${key}.title`, {
            date: dayMonth(line.startsOn),
          }),
          shift: null,
          notes: [t(`kinds.schedule.${key}.body`, { count: line.mine })],
        };
      }
      case "swap.offered":
        return {
          title: t("kinds.swap.offered.title", { name: who(line.from) }),
          shift: shiftWords(line.shift),
          // Taken, withdrawn or gone with the schedule: nothing to take.
          notes: [
            settled
              ? t("kinds.swap.offered.settledNote")
              : t("kinds.swap.offered.note"),
          ],
        };
      case "swap.taken":
        return {
          title: t("kinds.swap.taken.title", { name: who(line.by) }),
          shift: shiftWords(line.shift),
          notes: [t("kinds.swap.taken.note")],
        };
      case "swap.waiting":
        return {
          title: settled
            ? t("kinds.swap.waiting.settledTitle")
            : t("kinds.swap.waiting.title"),
          shift: shiftWords(line.shift),
          notes: [
            t("kinds.swap.waiting.people", {
              to: who(line.to),
              from: who(line.from),
            }),
          ],
        };
      case "swap.cancelled":
        return {
          title: t("kinds.swap.cancelled.title", { name: who(line.from) }),
          shift: shiftWords(line.shift),
          notes: [t("kinds.swap.cancelled.note")],
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
          shift: shiftWords(line.shift),
          notes: [],
        };
      case "swap.declined":
        return {
          title:
            line.side === "from"
              ? t("kinds.swap.declined.titleFrom")
              : line.side === "to"
                ? t("kinds.swap.declined.titleTo", { name: who(line.from) })
                : t("kinds.swap.declined.title", { from: who(line.from) }),
          shift: shiftWords(line.shift),
          notes: [],
        };
      case "swap.removed":
        return {
          title: t("kinds.swap.removed.title"),
          shift: shiftWords(line.shift),
          notes: [],
        };
      case "clock.confirm": {
        const at = new Date(line.at);
        return {
          // Confirmed, corrected by an owner, taken back, or now an owner's
          // alone: in every case no longer this reader's to approve.
          title: settled
            ? t("kinds.clock.confirm.settledTitle", { name: who(line.person) })
            : t("kinds.clock.confirm.title", { name: who(line.person) }),
          shift: null,
          notes: [
            t.rich("kinds.clock.confirm.body", {
              ltr,
              what: line.proof === "self" ? "self" : line.direction,
              day: weekday(dateIn(at, timeZone)),
              time: timeIn(at, timeZone),
            }),
          ],
        };
      }
      case "team.joined":
        return {
          title: t("kinds.team.joined.title", { name: who(line.person) }),
          shift: null,
          notes: [],
        };
      // The reminders (notifications part 4): what they ask for and by when,
      // from what the line holds (a week, a moment, a count). Who hasn't
      // sent availability is on the team's screen it leads to, not here.
      case "availability.due": {
        const date = dayMonth(line.startsOn);
        // Sent, or the week published: nothing waits on it now.
        return settled
          ? {
              title: t("kinds.availability.due.settledTitle", { date }),
              shift: null,
              notes: [],
            }
          : {
              title: t("kinds.availability.due.title", { date }),
              shift: null,
              notes: line.dueAt
                ? [
                    t.rich("kinds.availability.due.note", {
                      ltr,
                      ...dayAndTime(line.dueAt),
                    }),
                  ]
                : [],
            };
      }
      case "availability.missing": {
        const date = dayMonth(line.startsOn);
        // Everyone sent it, or the week published.
        return settled
          ? {
              title: t("kinds.availability.missing.settledTitle", { date }),
              shift: null,
              notes: [],
            }
          : {
              title: t("kinds.availability.missing.title", {
                count: line.missing,
                date,
              }),
              shift: null,
              notes: line.dueAt
                ? [
                    t.rich("kinds.availability.missing.note", {
                      ltr,
                      ...dayAndTime(line.dueAt),
                    }),
                  ]
                : [],
            };
      }
      case "clock.open":
        // Clocked out, closed by a correction, or now a manager's to close.
        return settled
          ? {
              title: t("kinds.clock.open.settledTitle"),
              shift: null,
              notes: [],
            }
          : {
              title: t("kinds.clock.open.title"),
              shift: null,
              notes: [
                line.shiftEnd
                  ? t.rich("kinds.clock.open.afterShift", {
                      ltr,
                      time: timeIn(new Date(line.shiftEnd), timeZone),
                    })
                  : line.since
                    ? t.rich("kinds.clock.open.noShift", {
                        ltr,
                        ...dayAndTime(line.since),
                      })
                    : t("kinds.clock.open.plain"),
              ],
            };
      case "clock.overdue":
        return {
          // The reader's own entry says so, without their name; once
          // corrected, it says that.
          title: line.mine
            ? settled
              ? t("kinds.clock.overdue.settledTitleMine")
              : t("kinds.clock.overdue.titleMine")
            : settled
              ? t("kinds.clock.overdue.settledTitle", {
                  name: who(line.person),
                })
              : t("kinds.clock.overdue.title", { name: who(line.person) }),
          shift: null,
          notes: [
            ...(line.since
              ? [
                  t.rich("kinds.clock.overdue.since", {
                    ltr,
                    ...dayAndTime(line.since),
                  }),
                ]
              : []),
            ...(settled ? [] : [t("kinds.clock.overdue.note")]),
          ],
        };
      case "lists.sent":
        return {
          // Finished, cancelled or missed: nothing waits on it now.
          title: settled
            ? t("kinds.lists.sent.settledTitle", { name: line.name })
            : t("kinds.lists.sent.title", { name: line.name }),
          shift: null,
          notes: [],
        };
      case "lists.finished":
        return {
          title: t("kinds.lists.finished.title", { name: line.name }),
          shift: null,
          notes: [],
        };
      case "lists.passed":
        // Finished, or passed on again: nothing waits on it now.
        return settled
          ? {
              title: t("kinds.lists.passed.settledTitle", { name: line.name }),
              shift: null,
              notes: [],
            }
          : {
              title: line.department
                ? t("kinds.lists.passed.title", {
                    name: line.name,
                    department: line.department,
                  })
                : t("kinds.lists.passed.titlePlain", { name: line.name }),
              shift: null,
              notes: line.hasNote ? [t("kinds.lists.passed.note")] : [],
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
        return settled
          ? {
              title: t(`kinds.lists.${key}.settledTitle`, { name: line.name }),
              shift: null,
              notes: [],
            }
          : {
              title: t(`kinds.lists.${key}.title`, { name: line.name }),
              shift: null,
              notes: line.due
                ? [
                    t.rich(`kinds.lists.${key}.note`, {
                      ltr,
                      time: timeIn(new Date(line.due), timeZone),
                    }),
                  ]
                : [],
            };
      }
      case "lists.out_of_range": {
        // The reading and its range, with a real minus sign, when it kept them.
        const range = line.reading ? numberRange(line.reading) : null;
        return {
          title: line.label
            ? t("kinds.lists.out_of_range.title", {
                name: line.name,
                label: line.label,
              })
            : t("kinds.lists.out_of_range.titleNoLabel", { name: line.name }),
          shift: null,
          notes:
            line.reading && range
              ? [
                  t.rich("kinds.lists.out_of_range.note", {
                    ltr,
                    reading: `${signed(line.reading.value)}${line.reading.unit ? ` ${line.reading.unit}` : ""}`,
                    kind: range.kind,
                    range: range.range,
                  }),
                ]
              : [],
        };
      }
      case "access.pay_granted":
        return {
          // Taken back since: it says so, and leads nowhere new.
          title: settled
            ? t("kinds.access.pay_granted.settledTitle")
            : t("kinds.access.pay_granted.title"),
          shift: null,
          notes: settled ? [] : [t("kinds.access.pay_granted.note")],
        };
      case "pay.wage_set":
        return {
          // The day it takes effect, never the amount: the clock shows that.
          title: t("kinds.pay.wage_set.title"),
          shift: null,
          notes: [
            line.since
              ? t.rich("kinds.pay.wage_set.note", {
                  ltr,
                  since: dayMonthYear(line.since),
                })
              : t("kinds.pay.wage_set.noteUndated"),
          ],
        };
      case "pay.after_close":
        return {
          // Its difference goes into the file of the month after the closed
          // one, named: read on the day of the correction, "next month"
          // would read as the month after today. Nothing to do.
          title: line.month
            ? t("kinds.pay.after_close.title", { month: monthName(line.month) })
            : t("kinds.pay.after_close.titleUndated"),
          shift: null,
          notes: [
            line.month
              ? t("kinds.pay.after_close.note", {
                  next: monthName(addMonths(line.month, 1)),
                })
              : t("kinds.pay.after_close.noteUndated"),
          ],
        };
      case "pay.month_due": {
        // Counts only; once the month is closed, it says so.
        const month = line.month ? monthName(line.month) : null;
        if (settled) {
          return {
            title: month
              ? t("kinds.pay.month_due.settledTitle", { month })
              : t("kinds.pay.month_due.settledTitleUndated"),
            shift: null,
            notes: [],
          };
        }
        const counts = [
          ...(line.waiting > 0
            ? [t("kinds.pay.month_due.waiting", { count: line.waiting })]
            : []),
          ...(line.open > 0
            ? [t("kinds.pay.month_due.open", { count: line.open })]
            : []),
        ];
        return {
          title: month
            ? t("kinds.pay.month_due.title", { month })
            : t("kinds.pay.month_due.titleUndated"),
          shift: null,
          notes: counts.length > 0 ? counts : [t("kinds.pay.month_due.ready")],
        };
      }
      // A chat's own lines don't reach the inbox (`inbox: false`); the
      // phone says the same words.
      case "chat.direct":
        return {
          title: t("kinds.chat.direct.title", { name: who(line.from) }),
          shift: null,
          notes: [t("kinds.chat.direct.body", { count: line.count })],
        };
      case "chat.group":
        return {
          title:
            line.chat?.kind === "team"
              ? t("kinds.chat.group.titleTeam")
              : line.chat?.name
                ? t("kinds.chat.group.title", { group: line.chat.name })
                : t("kinds.chat.group.titlePlain"),
          shift: null,
          notes: [
            t("kinds.chat.group.body", {
              count: line.count,
              name: who(line.from),
            }),
          ],
        };
      case "chat.announcement":
        return {
          title: t("kinds.chat.announcement.title"),
          shift: null,
          notes: [
            settled
              ? t("kinds.chat.announcement.settledNote")
              : line.chat?.kind === "team"
                ? t("kinds.chat.announcement.bodyTeam")
                : line.chat?.name
                  ? t("kinds.chat.announcement.body", {
                      group: line.chat.name,
                    })
                  : t("kinds.chat.announcement.bodyPlain"),
          ],
        };
      // A document's lines (chat C6): who sent it, and here, behind
      // sign-in, its category, read from the document itself under the
      // reader's own session; nothing of it once they no longer read it.
      // The phone never says the category.
      case "documents.received":
        return {
          title: t("kinds.documents.received.title", { name: who(line.from) }),
          shift: null,
          notes: [
            ...(line.category
              ? [tDocuments(`categories.${line.category}`)]
              : []),
            ...(settled ? [t("kinds.documents.received.settledNote")] : []),
          ],
        };
      case "documents.sent":
        return {
          title: t("kinds.documents.sent.title"),
          shift: null,
          notes: line.category
            ? [tDocuments(`categories.${line.category}`)]
            : [],
        };
      case "documents.to_confirm":
        return {
          title: t("kinds.documents.to_confirm.title"),
          shift: null,
          notes: [
            ...(line.category
              ? [tDocuments(`categories.${line.category}`)]
              : []),
            settled
              ? t("kinds.documents.to_confirm.settledNote")
              : t("kinds.documents.to_confirm.body"),
          ],
        };
      case "push.test":
        return {
          title: t("kinds.push.test.title"),
          shift: null,
          notes: [t("kinds.push.test.note")],
        };
      case "other":
        return { title: t("kinds.other.title"), shift: null, notes: [] };
      default: {
        // A new kind of line needs its words here: typecheck says so.
        const unhandled: never = line;
        return unhandled;
      }
    }
  }

  const describe = (entries: NotificationEntry[]): Described[] =>
    entries.map((entry) => {
      const actor =
        entry.actor.kind === "member" && entry.actor.name
          ? entry.actor.name
          : null;
      return {
        entry,
        ...words(entry),
        leading: actor ? (
          <PersonAvatar name={actor} />
        ) : (
          (entry.group && GROUP_ICONS[entry.group]) || <Bell />
        ),
      };
    });

  const unreadMark = (entry: NotificationEntry) =>
    entry.read ? null : <span className="sr-only">{t("inbox.unread")}</span>;
  const unreadDot = (entry: NotificationEntry) =>
    entry.read ? null : (
      <span
        aria-hidden="true"
        className="size-2.5 shrink-0 rounded-full bg-accent"
      />
    );
  const time = (entry: NotificationEntry) => (
    <time
      dateTime={new Date(entry.at).toISOString()}
      className="text-ink-2 text-sm"
    >
      {when(entry.at)}
    </time>
  );

  /** Phone and tablet: a grouped list, one row per line. */
  const list = (lines: Described[]) => (
    <ListGroup className="xl:hidden">
      {lines.map(({ entry, title, shift, notes, leading }) => {
        const more = shift ? [shift, ...notes] : notes;
        return (
          <InboxRow
            key={entry.id}
            id={entry.id}
            href={`${paths.base}${entry.href}`}
            open={open}
            leading={leading}
            title={title}
            subtitle={
              more.length > 0 ? (
                <span className="flex flex-col gap-0.5">
                  {more.map((text, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: a line's details have no ids and never move
                    <span key={index}>{text}</span>
                  ))}
                </span>
              ) : undefined
            }
            trailing={
              <span className="flex items-center gap-2">
                {time(entry)}
                {unreadDot(entry)}
                {unreadMark(entry)}
              </span>
            }
          />
        );
      })}
    </ListGroup>
  );

  /** A computer: the full picture, with who, what, the shift and when. */
  const table = (lines: Described[], caption: string) => (
    <div className="hidden overflow-hidden rounded-card bg-surface shadow-card xl:block">
      <table className="w-full border-collapse">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className={th}>
              {t("columns.who")}
            </th>
            <th scope="col" className={th}>
              {t("columns.what")}
            </th>
            <th scope="col" className={th}>
              {t("columns.shift")}
            </th>
            <th scope="col" className={cn(th, "w-28")}>
              {t("columns.when")}
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map(({ entry, title, shift, notes, leading }) => (
            <tr key={entry.id}>
              <th scope="row" className={cn(td, "text-start font-medium")}>
                <span className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2 [&_svg]:size-5"
                  >
                    {leading}
                  </span>
                  <span>{who(entry.actor)}</span>
                </span>
              </th>
              <td className={td}>
                <InboxOpen
                  id={entry.id}
                  href={`${paths.base}${entry.href}`}
                  open={open}
                  className="group flex min-h-11 w-full flex-col justify-center gap-0.5 rounded-control text-start focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <span className="font-medium text-ink group-hover:underline">
                    {title}
                  </span>
                  {notes.map((note, index) => (
                    <span
                      // biome-ignore lint/suspicious/noArrayIndexKey: a line's details have no ids and never move
                      key={index}
                      className="text-ink-2 text-sm"
                    >
                      {note}
                    </span>
                  ))}
                  {unreadMark(entry)}
                </InboxOpen>
              </td>
              <td className={cn(td, "text-ink-2 text-sm")}>{shift}</td>
              <td className={td}>
                <span className="flex min-h-11 items-center gap-2">
                  {time(entry)}
                  {unreadDot(entry)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const shapes = (lines: Described[], caption: string) => (
    <>
      {list(lines)}
      {table(lines, caption)}
    </>
  );

  const nothing = unread.length === 0 && earlier.length === 0;

  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={{ href: paths.home, label: t("back") }}
        title={t("title")}
        subtitle={t("subtitle")}
      />

      {nothing && !olderPage ? (
        <EmptyState
          headingLevel="h2"
          icon={<Bell />}
          title={t("inbox.empty.title")}
          body={t("inbox.empty.body")}
        >
          <Button asChild variant="secondary">
            <Link href={paths.home}>{t("inbox.empty.action")}</Link>
          </Button>
        </EmptyState>
      ) : null}
      {nothing && !olderPage ? (
        push || settings ? (
          <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
            {push}
            {settings ? (
              <NotificationSettingsLink
                href={settings}
                wording={wording}
                from="inbox"
              />
            ) : null}
          </div>
        ) : null
      ) : nothing ? (
        <EmptyState
          headingLevel="h2"
          icon={<Bell />}
          title={t("inbox.noOlder.title")}
          body={t("inbox.noOlder.body")}
        >
          <Button asChild variant="secondary">
            <Link href={paths.self}>{t("inbox.noOlder.action")}</Link>
          </Button>
        </EmptyState>
      ) : (
        // No gap between the rows on a phone: the switch above the lines
        // keeps its own distance, so a switch that is hidden, not ready yet
        // or not offered leaves no space above them.
        <div className="grid items-start md:grid-cols-[minmax(0,1fr)_17rem] md:gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-8">
          <div className="flex min-w-0 flex-col gap-8">
            {/* An older page has new lines only while unread ones run on. */}
            {olderPage && unread.length === 0 ? null : (
              <PageSection
                title={t("inbox.new")}
                action={
                  unread.length > 0 ? (
                    <form action={readAll}>
                      <ReadAllButton>{t("inbox.markAll")}</ReadAllButton>
                    </form>
                  ) : null
                }
              >
                {unread.length > 0 ? (
                  shapes(describe(unread), t("inbox.new"))
                ) : (
                  <p className="px-1 text-ink-2">{t("inbox.caughtUp")}</p>
                )}
              </PageSection>
            )}

            {earlier.length > 0 ? (
              <PageSection title={t("inbox.earlier")}>
                {shapes(describe(earlier), t("inbox.earlier"))}
              </PageSection>
            ) : null}

            {older !== null || olderPage ? (
              <nav
                aria-label={t("inbox.older")}
                className="flex flex-col gap-2 md:flex-row"
              >
                {older !== null ? (
                  <Button asChild variant="secondary">
                    <Link
                      href={`${paths.self}?before=${encodeURIComponent(older)}`}
                    >
                      {t("inbox.older")}
                    </Link>
                  </Button>
                ) : null}
                {olderPage ? (
                  <Button asChild variant="ghost">
                    <Link href={paths.self}>{t("inbox.newest")}</Link>
                  </Button>
                ) : null}
              </nav>
            ) : null}

            {settings ? (
              <NotificationSettingsLink
                href={settings}
                wording={wording}
                from="inbox"
                className="md:hidden"
              />
            ) : null}
          </div>

          {push || groups.length > 0 || settings ? (
            <div
              className={cn(
                "order-first flex min-w-0 flex-col gap-6 md:order-none",
                // On a phone only the switch shows here, and only while it
                // shows does it take its distance from the lines.
                "max-md:[&>*]:mb-6",
                // Without the switch, nothing of it shows on a phone.
                push ? null : "hidden md:flex",
              )}
            >
              {push}
              {groups.length > 0 ? (
                <Card
                  tone="flat"
                  padding="lg"
                  className="hidden flex-col gap-4 md:flex"
                >
                  <div className="flex flex-col gap-1">
                    <CardTitle as="h2">{t("here.title")}</CardTitle>
                    <CardText className="text-sm">{t("here.body")}</CardText>
                  </div>
                  <ul className="flex flex-col gap-3">
                    {groups.map((group) => (
                      <li key={group} className="flex items-start gap-3">
                        <span
                          aria-hidden="true"
                          className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2 [&_svg]:size-[18px]"
                        >
                          {GROUP_ICONS[group]}
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="font-medium">
                            {t(`groups.${group}.name`)}
                          </span>
                          <span className="text-ink-2 text-sm">
                            {t(`groups.${group}.hint`)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}
              {settings ? (
                <NotificationSettingsLink
                  href={settings}
                  wording={wording}
                  from="inbox"
                  className="hidden md:block"
                />
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </PageBody>
  );
}
