"use client";

import { messageTime } from "@domain/chat-days";
import { formatShekels, moneyLocale } from "@domain/money";
import { ISRAEL_TIME_ZONE } from "@domain/shabbat";
import { Badge } from "@ui/badge";
import { cn } from "@ui/cn";
import { type PlaceTileTone, PlaceTile as UiPlaceTile } from "@ui/place-tile";
import { StatusToast } from "@ui/status-toast";
import { OrderLine, type TicketAge, TicketCard } from "@ui/ticket-card";
import { TillList } from "@ui/till-list";
import { Info } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useRef, useState } from "react";
import {
  orderDemoDepartments,
  orderDemoPeople,
  orderDemoTables,
  READER,
  READER_DEPARTMENTS,
} from "./data";
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
  takeawaysOnFloor,
  ticketSince,
  tillByItem,
} from "./model";
import type { DemoData } from "./scenario";

/*
 * The parts the order-taking demo's screens share: where each screen is,
 * the words for places, people and times, and the twin's data put into
 * words for the components in packages/ui that draw it (PlaceTile,
 * TicketCard and OrderLine, TillList, MenuItemRow), which /design shows.
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

/** The takeaways on the floor: open, or new with a draft; a closed one is gone. */
export const floorTakeaways = (data: DemoData) =>
  takeawaysOnFloor(data.takeaways, data.orders, data.drafts);

/** Who looks at the demo: Shiran, a manager in the bar. */
export const viewer = { id: READER, departments: READER_DEPARTMENTS };

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

/** A place's one state, in words: its tile, its row in a list. */
export function placeStateWords(
  t: OrderT,
  status: PlaceStatus,
  draft = 0,
): string {
  switch (status.kind) {
    case "ready":
      return t("floor.state.ready");
    case "late":
      return t("floor.state.late", { count: status.minutes });
    case "open":
      return t("floor.state.open", { count: status.minutes });
    default:
      return draft > 0
        ? t("floor.state.draft", { count: draft })
        : t("floor.state.free");
  }
}

/**
 * A place on the floor, as `PlaceTile` draws it: its kind above its name,
 * its one state in words, and who opened it.
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
  const tone: PlaceTileTone =
    status.kind === "free" ? (draft > 0 ? "draft" : "free") : status.kind;
  return (
    <UiPlaceTile
      href={href}
      kind={
        place.kind === "table" ? t("place.tableWord") : t("place.takeawayWord")
      }
      name={
        place.kind === "takeaway" && place.name === null
          ? t("place.newShort")
          : (place.name ?? "")
      }
      state={placeStateWords(t, status, draft)}
      tone={tone}
      by={by}
      label={place.label}
    />
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
 * A sent line as the kitchen and the waiter read it (`OrderLine`): how
 * many and what, the choices under it, a note and an allergy. One taken
 * back is struck through.
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
    <OrderLine
      title={t.rich("line.qtyName", { qty: line.qty, name: line.name, ltr })}
      choices={line.choices}
      note={line.note ? t("line.note", { note: line.note }) : null}
      allergy={
        line.allergy ? t("line.allergy", { allergy: line.allergy }) : null
      }
      takenBack={line.takenBack ? t("line.takenBack") : null}
      large={large}
      trailing={trailing}
    />
  );
}

/** The age band of a ticket still new: late past the late mark, overdue past twice it. */
function ageTone(minutes: number): TicketAge {
  if (minutes >= LATE_AFTER_MINUTES * 2) return "overdue";
  if (minutes >= LATE_AFTER_MINUTES) return "late";
  return "calm";
}

/**
 * A ticket on a prep screen, as `TicketCard` draws it: the place, its age,
 * who sent it and its lines. A held block is greyed, headed "מחכה לקריאה",
 * with no "מוכן".
 */
export function TicketView({
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
  const department = departmentName(ticket.department);
  return (
    <TicketCard
      title={place}
      label={t("ticket.label", { place, department })}
      from={t("ticket.from", { name: personName(round.by), department })}
      age={{ text: t("age.ago", { count: minutes }), tone: ageTone(minutes) }}
      held={ticket.held ? t("ticketState.held") : null}
      large={large}
      ready={onReady ? { label: t("ticket.ready"), onClick: onReady } : null}
    >
      {ticket.lines.map((line) => (
        <SentLineView key={line.id} t={t} line={line} large={large} />
      ))}
    </TicketCard>
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
 * What the till rings up, in one of two views, each a `TillList`: by
 * item, each line with how many, the choices and the unit price; or by
 * round, each with its time and sender. No total: the register adds it up.
 */
export function TillView({
  order,
  view,
  headingLevel = 3,
  large = false,
}: {
  order: Order;
  view: "item" | "round";
  /** The rounds' headings: 2 straight under the page's title. */
  headingLevel?: 2 | 3;
  /** The till's tablet at the counter, read from a step away. */
  large?: boolean;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const { t, time } = useOrderWords();
  const list = (label: string, rows: TillItem[], empty: string) => (
    <TillList
      label={label}
      rows={rows.map((row) => ({
        key: row.key,
        qty: row.qty,
        name: row.name,
        choices: row.choices,
        price: <Price agorot={row.unit} />,
      }))}
      empty={empty}
      qtyLabel={t("till.qty")}
      priceLabel={t("till.unit")}
      large={large}
    />
  );
  if (view === "item") {
    return list(t("till.byItem"), tillByItem(order), t("till.empty"));
  }
  return (
    <div className="flex flex-col gap-4">
      {order.rounds.map((round, index) => (
        <section key={round.id} className="flex flex-col gap-2">
          <Heading
            className={cn(
              "px-1 font-semibold text-ink-2",
              large ? "text-md" : "text-base",
            )}
          >
            {t.rich("till.round", {
              n: index + 1,
              time: time(round.at),
              name: personName(round.by),
              ltr,
            })}
          </Heading>
          {list(
            t("till.roundLabel", { n: index + 1 }),
            roundLines(round).map(tillRow),
            t("till.roundEmpty"),
          )}
        </section>
      ))}
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
