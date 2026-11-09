import { dateIn, weekdayOf } from "@domain/availability";
import { dayMonth, WEEKDAY_KEYS } from "@domain/availability-form";
import type {
  NotificationEntry,
  NotificationGroup,
  NotificationPerson,
  NotificationShift,
} from "@domain/notifications";
import { timeIn } from "@domain/shabbat";
import { Button } from "@ui/button";
import { Card, CardText, CardTitle } from "@ui/card";
import { cn } from "@ui/cn";
import { EmptyState } from "@ui/empty-state";
import { ListGroup } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { PersonAvatar } from "@ui/person-row";
import {
  Bell,
  CalendarDays,
  ClipboardCheck,
  Repeat,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useFormatter } from "next-intl";
import type { ReactNode } from "react";
import { type AppWording, translator } from "../wording";
import { InboxOpen, InboxRow, ReadAllButton } from "./inbox-row";

export type InboxPaths = {
  /** This screen, for the newest page and an older one's cursor. */
  self: string;
  home: string;
  /** Prefixes where a line leads on the demo, where lines are plain links. */
  base: string;
};

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

const GROUP_ICONS: Record<NotificationGroup, ReactNode> = {
  schedule: <CalendarDays />,
  swaps: <Repeat />,
  approvals: <ClipboardCheck />,
  team: <Users />,
};

/** A week is long enough to say "3 days ago"; older lines say their date. */
const RELATIVE_FOR_MS = 7 * 24 * 60 * 60 * 1000;

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
 * Also on the design demo.
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
}) {
  const t = translator(wording, "app.notifications");
  const tDays = translator(wording, "app.availability.weekdays");
  const format = useFormatter();
  const nowDate = new Date(now);

  const weekday = (date: string) =>
    tDays(WEEKDAY_KEYS[weekdayOf(date)] ?? "sun");
  const who = (person: NotificationPerson) =>
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
  const when = (at: string) => {
    const instant = new Date(at);
    const ago = nowDate.getTime() - instant.getTime();
    if (ago < 60_000) return t("time.now");
    if (ago < RELATIVE_FOR_MS) return format.relativeTime(instant, nowDate);
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
        <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_17rem] xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-8">
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
          </div>

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
        </div>
      )}
    </PageBody>
  );
}
