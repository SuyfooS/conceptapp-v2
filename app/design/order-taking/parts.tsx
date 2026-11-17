"use client";

import { messageTime } from "@domain/chat-days";
import { formatShekels, moneyLocale } from "@domain/money";
import { ISRAEL_TIME_ZONE } from "@domain/shabbat";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { cn } from "@ui/cn";
import { StatusToast } from "@ui/status-toast";
import { Check, Clock, Hourglass, Info, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useRef, useState } from "react";
import { orderDemoDepartments, orderDemoPeople, orderDemoTables } from "./data";
import type { DemoData } from "./demo-store";
import {
  type DepartmentKey,
  LATE_AFTER_MINUTES,
  liveLines,
  minutesSince,
  type Order,
  openTicket,
  type Place,
  type PlaceStatus,
  type Round,
  roundLines,
  type SentLine,
  type Ticket,
  type TillItem,
  ticketSince,
  tillByItem,
} from "./model";

/*
 * The parts the order-taking demo's screens share: where each screen is,
 * the words for places, people and times, and the twin's stand-ins for the
 * components P4 brings to packages/ui (PlaceTile, TicketCard, TillList).
 */

const BASE = "/design/order-taking";

export const paths = {
  index: BASE,
  floor: `${BASE}/floor`,
  order: (placeId: string) => `${BASE}/floor/order?place=${placeId}`,
  /** The till list of an order, open or closed today. */
  till: (orderId: string) => `${BASE}/floor/till?order=${orderId}`,
  mine: `${BASE}/mine`,
  prep: `${BASE}/prep`,
  menu: `${BASE}/menu`,
  import: `${BASE}/menu/import`,
  kitchen: `${BASE}/station/prep`,
  counter: `${BASE}/station/till`,
  /** Out of the mode: the app's own demo. */
  app: "/design/shell",
};

export type OrderT = ReturnType<typeof useTranslations<"design.orderTaking">>;

export const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/** The demo's words, with its prices and times as the screen's language writes them. */
export function useOrderWords() {
  const t = useTranslations("design.orderTaking");
  const locale = moneyLocale(useLocale());
  return {
    t,
    /** Agorot as "62.00 ₪", for an LTR span. */
    shekels: (agorot: number) => formatShekels(agorot, locale),
    /** An instant as "20:36" in Tel Aviv, for an LTR span. */
    time: (at: number) => messageTime(new Date(at), ISRAEL_TIME_ZONE),
  };
}

export function Price({
  agorot,
  className,
}: {
  agorot: number;
  className?: string;
}) {
  const { shekels } = useOrderWords();
  return (
    <span dir="ltr" className={cn("tabular-nums", className)}>
      {shekels(agorot)}
    </span>
  );
}

export const personName = (id: string | null) =>
  orderDemoPeople.find((p) => p.id === id)?.name ?? "";

/** Who closed an order: a person, or the till's station, which names nobody. */
export const closerName = (t: OrderT, order: Order) =>
  personName(order.closedBy) || t("station.tillTitle");

export const departmentName = (key: DepartmentKey) =>
  orderDemoDepartments.find((d) => d.key === key)?.name ?? key;

/** Every place: the tables, then the takeaways. */
export const placesOf = (data: DemoData): Place[] => [
  ...orderDemoTables,
  ...data.takeaways,
];

export const placeById = (data: DemoData, id: string | null) =>
  placesOf(data).find((place) => place.id === id);

export const openOrderOf = (data: DemoData, placeId: string) =>
  data.orders.find((order) => order.placeId === placeId);

/** "שולחן 4", "לקחת 2", or a takeaway still being taken. */
export function placeTitle(t: OrderT, place: Place): string {
  if (place.kind === "table")
    return t("place.table", { name: place.name ?? "" });
  return place.name === null
    ? t("place.newTakeaway")
    : t("place.takeaway", { number: place.name });
}

/** How long ago, in words: "עכשיו", "לפני 6 דק׳". */
export function ago(t: OrderT, at: number, now: number): string {
  return t("age.ago", { count: minutesSince(at, now) });
}

/**
 * A place on the floor: its name large, and its one state in words as well
 * as colour. A free one is a flat fill; an open one lifts; one ready to
 * serve takes the business's tint, and one waiting past the late mark says
 * so in warning.
 */
export function PlaceTile({
  t,
  place,
  status,
  by,
  draft,
  href,
}: {
  t: OrderT;
  place: Place;
  status: PlaceStatus;
  /** Who opened it, for an open one. */
  by: string | null;
  /** Items in its draft not sent yet. */
  draft: number;
  href: string;
}) {
  const line =
    status.kind === "ready"
      ? t("floor.state.ready")
      : status.kind === "late"
        ? t("floor.state.late", { count: status.minutes })
        : status.kind === "open"
          ? t("floor.state.open", { count: status.minutes })
          : draft > 0
            ? t("floor.state.draft", { count: draft })
            : t("floor.state.free");
  const mark =
    status.kind === "ready" ? (
      <Check />
    ) : status.kind === "late" ? (
      <TriangleAlert />
    ) : status.kind === "open" ? (
      <Clock />
    ) : null;
  return (
    <Link
      href={href}
      className={cn(
        "pressable flex min-h-[88px] w-full min-w-0 flex-col justify-between gap-1 rounded-card p-3 text-start",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        status.kind === "free"
          ? "bg-surface-2"
          : status.kind === "ready"
            ? "bg-accent-soft"
            : "bg-surface shadow-card",
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="font-bold text-2xl leading-none">
          <span className="sr-only">
            {place.kind === "table"
              ? t("place.tableWord")
              : t("place.takeawayWord")}{" "}
          </span>
          {place.kind === "takeaway" && place.name === null
            ? t("place.newShort")
            : place.name}
        </span>
        {mark ? (
          <span
            aria-hidden="true"
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-full [&_svg]:size-4 [&_svg]:stroke-[2.2]",
              status.kind === "ready"
                ? "bg-accent text-accent-ink"
                : status.kind === "late"
                  ? "bg-warning-soft text-warning"
                  : "bg-surface-2 text-ink-2",
            )}
          >
            {mark}
          </span>
        ) : null}
      </span>
      <span className="flex flex-col">
        <span
          className={cn(
            "font-semibold text-sm",
            status.kind === "late"
              ? "text-warning"
              : status.kind === "free" && draft === 0
                ? "text-ink-2"
                : "text-ink",
          )}
        >
          {line}
        </span>
        {by ? <span className="text-ink-2 text-sm">{by}</span> : null}
        {place.label ? (
          <span className="text-ink-2 text-sm">{place.label}</span>
        ) : null}
      </span>
    </Link>
  );
}

/** A ticket's state for the person who sent it, in words as well as colour. */
export function TicketStateBadge({ t, ticket }: { t: OrderT; ticket: Ticket }) {
  const department = departmentName(ticket.department);
  if (ticket.held && ticket.state === "new") {
    return <Badge>{t("ticketState.held")}</Badge>;
  }
  switch (ticket.state) {
    case "ready":
      return (
        <Badge tone="accent">{t("ticketState.ready", { department })}</Badge>
      );
    case "served":
      return <Badge tone="success">{t("ticketState.served")}</Badge>;
    default:
      return ticket.seen ? (
        <Badge>{t("ticketState.onScreen", { department })}</Badge>
      ) : (
        <Badge>{t("ticketState.sent")}</Badge>
      );
  }
}

/**
 * A sent line as the kitchen and the waiter read it: how many and what,
 * the choices under it, a note in a warning box and an allergy in danger
 * with its word, never colour alone. One taken back is struck through.
 */
export function SentLineView({
  t,
  line,
  large = false,
  trailing,
}: {
  t: OrderT;
  line: SentLine;
  /** The station's size, readable from about 1.5 m. */
  large?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex min-w-0 flex-1 flex-col",
            line.takenBack && "text-danger",
          )}
        >
          <span
            className={cn(
              "font-semibold",
              large ? "text-lg" : "text-md",
              line.takenBack && "line-through",
            )}
          >
            {t.rich("line.qtyName", {
              qty: line.qty,
              name: line.name,
              ltr,
            })}
          </span>
          {line.choices.length > 0 ? (
            <span
              className={cn(
                line.takenBack ? "line-through" : "text-ink-2",
                large ? "text-md" : "text-base",
              )}
            >
              {line.choices.join(" · ")}
            </span>
          ) : null}
          {line.takenBack ? (
            <span className="font-semibold text-sm">{t("line.takenBack")}</span>
          ) : null}
        </span>
        {trailing}
      </div>
      {line.allergy && !line.takenBack ? (
        <p
          className={cn(
            "flex items-start gap-1.5 font-semibold text-danger",
            large ? "text-md" : "text-base",
          )}
        >
          <TriangleAlert
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
          />
          {t("line.allergy", { allergy: line.allergy })}
        </p>
      ) : null}
      {line.note && !line.takenBack ? (
        <p
          className={cn(
            "rounded-control bg-warning-soft px-3 py-1.5 text-ink",
            large ? "text-md" : "text-base",
          )}
        >
          {t("line.note", { note: line.note })}
        </p>
      ) : null}
    </li>
  );
}

/** The age band of a ticket still new: warning past the late mark, danger past twice it. */
function ageTone(minutes: number) {
  if (minutes >= LATE_AFTER_MINUTES * 2) return "text-danger";
  if (minutes >= LATE_AFTER_MINUTES) return "text-warning";
  return "text-ink-2";
}

/**
 * A ticket on a prep screen: the place large, its age in words, who sent
 * it, its lines, and one full-width "מוכן" at the foot. A held block is
 * greyed, headed "מחכה לקריאה", with no "מוכן". No prices: they are noise
 * to a cook.
 */
export function TicketCard({
  t,
  ticket,
  round,
  place,
  now,
  large = false,
  onReady,
}: {
  t: OrderT;
  ticket: Ticket;
  round: Round;
  place: string;
  now: number;
  large?: boolean;
  onReady?: () => void;
}) {
  const minutes = minutesSince(ticketSince(ticket, round), now);
  const held = ticket.held;
  return (
    <article
      aria-label={t("ticket.label", {
        place,
        department: departmentName(ticket.department),
      })}
      className={cn(
        "flex flex-col gap-3 rounded-card p-4",
        held ? "bg-surface-2" : "bg-surface shadow-card",
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 flex-col">
          <span className="font-bold text-2xl">{place}</span>
          <span className="text-ink-2 text-sm">
            {t("ticket.from", {
              name: personName(round.by),
              department: departmentName(ticket.department),
            })}
          </span>
        </span>
        {held ? (
          <span className="flex shrink-0 items-center gap-1.5 font-semibold text-base text-ink-2">
            <Hourglass aria-hidden="true" className="size-4" />
            {t("ticketState.held")}
          </span>
        ) : (
          <span
            className={cn(
              "shrink-0 font-semibold",
              large ? "text-md" : "text-base",
              ageTone(minutes),
            )}
          >
            {t("age.ago", { count: minutes })}
          </span>
        )}
      </header>
      <ul className="flex flex-col divide-y divide-line">
        {ticket.lines.map((line) => (
          <SentLineView key={line.id} t={t} line={line} large={large} />
        ))}
      </ul>
      {!held && onReady ? (
        // One on every ticket, so not in the accent, which is for a
        // screen's one main action.
        <Button
          size="lg"
          variant="secondary"
          onClick={onReady}
          className={cn("w-full", large && "min-h-16 text-lg")}
        >
          <Check aria-hidden="true" />
          {t("ticket.ready")}
        </Button>
      ) : null}
    </article>
  );
}

/** Every ticket of the open orders, with its round and place, oldest first. */
export function ticketsOf(data: DemoData) {
  return data.orders
    .flatMap((order) =>
      order.rounds.flatMap((round) =>
        round.tickets.map((ticket) => ({ order, round, ticket })),
      ),
    )
    .sort(
      (a, b) => ticketSince(a.ticket, a.round) - ticketSince(b.ticket, b.round),
    );
}

/**
 * What the till rings up, in one of two views: by item, each line with how
 * many, the choices and the unit price; or by round, each with its time and
 * sender. No total: the register adds it up.
 */
export function TillList({
  order,
  view,
  headingLevel = 3,
}: {
  order: Order;
  view: "item" | "round";
  /** The rounds' headings: 2 straight under the page's title. */
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const { t, time } = useOrderWords();
  const rows = tillByItem(order);
  if (view === "item") {
    return (
      <TillRows label={t("till.byItem")} rows={rows} empty={t("till.empty")} />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {order.rounds.map((round, index) => {
        const lines = roundLines(round);
        return (
          <section key={round.id} className="flex flex-col gap-2">
            <Heading className="px-1 font-semibold text-base text-ink-2">
              {t.rich("till.round", {
                n: index + 1,
                time: time(round.at),
                name: personName(round.by),
                ltr,
              })}
            </Heading>
            <TillRows
              label={t("till.roundLabel", { n: index + 1 })}
              rows={lines.map((line) => tillRow(line))}
              empty={t("till.roundEmpty")}
            />
          </section>
        );
      })}
    </div>
  );
}

const tillRow = (line: SentLine): TillItem => ({
  key: line.id,
  name: line.name,
  choices: line.choices,
  unit: line.unit,
  qty: line.qty,
});

function TillRows({
  label,
  rows,
  empty,
}: {
  label: string;
  rows: TillItem[];
  empty: string;
}) {
  const { t } = useOrderWords();
  if (rows.length === 0) {
    return (
      <p className="rounded-card bg-surface px-4 py-4 text-ink-2 shadow-card">
        {empty}
      </p>
    );
  }
  return (
    <ul
      aria-label={label}
      className="overflow-hidden rounded-card bg-surface shadow-card"
    >
      {rows.map((row) => (
        <li
          key={row.key}
          className="relative flex min-h-14 items-center gap-3 px-4 py-2.5 not-first:before:absolute not-first:before:start-4 not-first:before:end-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']"
        >
          <span
            dir="ltr"
            className="grid min-w-9 shrink-0 place-items-center rounded-full bg-surface-2 px-2 py-1 font-bold text-base tabular-nums"
          >
            <span className="sr-only">{t("till.qty")} </span>
            {row.qty}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-medium">{row.name}</span>
            {row.choices.length > 0 ? (
              <span className="text-ink-2 text-sm">
                {row.choices.join(" · ")}
              </span>
            ) : null}
          </span>
          <span className="shrink-0 text-ink-2">
            <span className="sr-only">{t("till.unit")} </span>
            <Price agorot={row.unit} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The live lines' count, for "3 פריטים". */
export const linesCount = (ticket: Ticket) =>
  liveLines(ticket).reduce((sum, line) => sum + line.qty, 0);

type Toast = {
  text: string;
  stamp: number;
  undo: (() => void) | null;
  /** What it undoes went with the focus: the way back takes it. */
  focus: boolean;
};

/**
 * The demo's toast: what just happened, and for what can be undone its
 * "ביטול" for 8 seconds rather than an "are you sure". When what was
 * pressed went away with the change, the keyboard's focus goes to the way
 * back, and after it to `after`.
 */
export function useUndoToast() {
  const { t } = useOrderWords();
  const [toast, setToast] = useState<Toast | null>(null);
  const after = useRef<(() => HTMLElement | null | undefined) | null>(null);
  function say(
    text: string,
    undo?: () => void,
    options: {
      focus?: boolean;
      after?: () => HTMLElement | null | undefined;
    } = {},
  ) {
    after.current = options.after ?? null;
    setToast({
      text,
      stamp: Date.now(),
      undo: undo ?? null,
      focus: Boolean(undo && options.focus),
    });
  }
  const element = (
    <StatusToast
      message={toast?.text ?? null}
      stamp={toast ? String(toast.stamp) : undefined}
      duration={toast?.undo ? 8000 : 4000}
      action={
        toast?.undo
          ? {
              label: t("toast.undo"),
              onClick: () => {
                toast.undo?.();
                setToast(null);
              },
            }
          : null
      }
      focusAction={toast?.focus ?? false}
      onFocusLeave={() => after.current?.()?.focus({ preventScroll: true })}
    />
  );
  return { say, toast: element };
}

/** How long a ticket marked ready stays in "מוכנים לאחרונה", to put back. */
const RECENT_MINUTES = 5;

/** A department's tickets to make, oldest first, then its held blocks. */
export function toMake(data: DemoData, department: DepartmentKey) {
  const mine = ticketsOf(data).filter(
    ({ ticket }) => ticket.department === department && openTicket(ticket),
  );
  return [
    ...mine.filter(({ ticket }) => !ticket.held),
    ...mine.filter(({ ticket }) => ticket.held),
  ];
}

/** What was marked ready in the last few minutes, newest first. */
export function recentlyReady(
  data: DemoData,
  department: DepartmentKey,
  now: number,
) {
  return ticketsOf(data)
    .filter(
      ({ ticket }) =>
        ticket.department === department &&
        ticket.state === "ready" &&
        ticket.readyAt !== null &&
        minutesSince(ticket.readyAt, now) < RECENT_MINUTES,
    )
    .sort((a, b) => (b.ticket.readyAt ?? 0) - (a.ticket.readyAt ?? 0));
}

/** "4 פתוחות · הוותיקה מחכה 20 דק׳". */
export function prepStatus(
  t: OrderT,
  data: DemoData,
  department: DepartmentKey,
  now: number,
) {
  const open = toMake(data, department).filter(({ ticket }) => !ticket.held);
  if (open.length === 0) return t("prep.nothingOpen");
  const oldest = open[0];
  return t("prep.status", {
    count: open.length,
    minutes: oldest
      ? minutesSince(ticketSince(oldest.ticket, oldest.round), now)
      : 0,
  });
}

/** The order the address names, open or closed today. */
export const orderById = (data: DemoData, id: string | null) =>
  data.orders.find((o) => o.id === id) ?? data.closed.find((o) => o.id === id);

/** What the list is, and what it isn't, before anyone rings it up. */
export function TillNote({ t }: { t: OrderT }) {
  return (
    <p className="flex items-start gap-2 text-ink-2 md:max-w-2xl">
      <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      {t("till.note")}
    </p>
  );
}

/** The demo's own way back to the phone: a locked station has none. */
export function StationFoot() {
  const { t } = useOrderWords();
  return (
    <p className="text-center text-ink-2 text-sm">
      {t("station.demoNote")}{" "}
      <Link
        href={paths.prep}
        className="inline-flex min-h-11 items-center font-medium text-ink underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent"
      >
        {t("station.backToPhone")}
      </Link>
    </p>
  );
}
