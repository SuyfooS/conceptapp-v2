"use client";

import { messageTime } from "@domain/chat-days";
import { formatShekels, moneyLocale } from "@domain/money";
import {
  minutesSince,
  type PlaceState,
  placeTitleKind,
  ticketAge,
  ticketBadge,
} from "@domain/order-screens";
import type { PrepLine, TicketStatus } from "@domain/orders";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { cn } from "@ui/cn";
import { EmptyState } from "@ui/empty-state";
import { PlaceTile, type PlaceTileTone } from "@ui/place-tile";
import { OrderLine, TicketCard } from "@ui/ticket-card";
import { Clock3, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useCallback } from "react";
import { useOrdersMode } from "./orders-mode";
import type { OrdersActionFailure, SendFailure } from "./orders-types";

/*
 * The parts the mode's screens share (waiter mode P4): the words for places,
 * people, departments and times, and the reads put into words for the parts
 * in packages/ui that draw them (PlaceTile, TicketCard and OrderLine, Badge),
 * which /design shows. The twins draw the same.
 */

export const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

export type OrdersT = ReturnType<typeof useTranslations<"app.orders">>;

/** Where an order is, as the reads name it. */
export type Where = { placeName: string | null; takeaway: number | null };

/**
 * A place in words (default 15): a number takes the word ("שולחן 4"), a
 * name stands alone ("בר 3"); a takeaway by its number, or a new one.
 */
export function usePlaceWords() {
  const t = useTranslations("app.orders.place");
  const placeTitle = useCallback(
    (where: Where) => {
      if (where.placeName !== null) {
        return placeTitleKind(where.placeName) === "numbered"
          ? t("numbered", { name: where.placeName })
          : t("named", { name: where.placeName });
      }
      return where.takeaway === null
        ? t("newTakeaway")
        : t("takeaway", { number: where.takeaway });
    },
    [t],
  );
  return { placeTitle };
}

/** The mode's words, with its times, people and departments as the frame names them. */
export function useOrderWords() {
  const t = useTranslations("app.orders");
  const locale = moneyLocale(useLocale());
  const { frame } = useOrdersMode();
  const { placeTitle } = usePlaceWords();
  return {
    t,
    placeTitle,
    /** An instant as "20:36" in the business's clock, for an LTR span. */
    time: (at: string | number) => messageTime(new Date(at), frame.timeZone),
    /** How long ago, in words: "עכשיו", "לפני 6 דק׳". */
    ago: (at: string | number, now: number) =>
      t("age.ago", { count: minutesSince(at, now) }),
    department: (id: string) => frame.departments[id] ?? "",
    person: (id: string | null) =>
      id ? (frame.names[id.toLowerCase()] ?? "") : "",
    /** Agorot as "62.00 ₪", for an LTR span. */
    shekels: (agorot: number) => formatShekels(agorot, locale),
  };
}

/** Every top screen's way out of the mode, and its eyebrow: the mode's name. */
export function useModeHeading() {
  const tMode = useTranslations("app.mode");
  const tm = useTranslations("modules.order_taking");
  const { paths } = useOrdersMode();
  return {
    back: { href: paths.leave, label: tMode("leave") },
    eyebrow: tm("name"),
  };
}

export function Price({ agorot }: { agorot: number }) {
  const { shekels } = useOrderWords();
  return (
    <span dir="ltr" className="tabular-nums">
      {shekels(agorot)}
    </span>
  );
}

/** A place's one state in words: its tile, its row in a list. */
export function placeStateWords(
  t: OrdersT,
  state: PlaceState,
  draft = 0,
): string {
  switch (state.kind) {
    case "ready":
      return t("floor.state.ready");
    case "late":
      return t("floor.state.late", { count: state.minutes });
    case "open":
      return t("floor.state.open", { count: state.minutes });
    default:
      return draft > 0
        ? t("floor.state.draft", { count: draft })
        : t("floor.state.free");
  }
}

/** A place on the floor, as `PlaceTile` draws it. */
export function PlaceTileView({
  where,
  state,
  by,
  label,
  draft,
  href,
}: {
  where: Where;
  state: PlaceState;
  /** Who opened it, for an open one. */
  by: string | null;
  label?: string | null;
  /** Items in its draft not sent yet. */
  draft: number;
  href: string;
}) {
  const { t } = useOrderWords();
  const tone: PlaceTileTone =
    state.kind === "free" ? (draft > 0 ? "draft" : "free") : state.kind;
  const name = where.placeName;
  return (
    <PlaceTile
      href={href}
      kind={
        name === null
          ? t("place.takeawayKind")
          : placeTitleKind(name) === "numbered"
            ? t("place.kind")
            : ""
      }
      name={
        name ??
        (where.takeaway === null ? t("place.newShort") : String(where.takeaway))
      }
      state={placeStateWords(t, state, draft)}
      tone={tone}
      by={by}
      label={label}
    />
  );
}

/**
 * A line as the kitchen and the waiter read it, its state in words: struck
 * once taken back or cancelled ("בוטל", or with its reason in `gone` on the
 * order), and still made with its `mark` once on the house.
 */
export function SentLineView({
  line,
  trailing,
  gone: goneAs = null,
  mark,
  large = false,
}: {
  line: Omit<PrepLine, "state"> & { state?: PrepLine["state"] };
  trailing?: ReactNode;
  /** The struck line's words in place of the state's own. */
  gone?: string | null;
  mark?: ReactNode;
  large?: boolean;
}) {
  const { t } = useOrderWords();
  const gone =
    line.state === "takenBack"
      ? (goneAs ?? t("line.takenBack"))
      : line.state === "cancelled"
        ? (goneAs ?? t("line.cancelled"))
        : null;
  return (
    <OrderLine
      title={t.rich("line.qtyName", {
        qty: line.quantity,
        name: line.name,
        ltr,
      })}
      choices={line.choices}
      note={
        line.note && !line.allergy ? t("line.note", { note: line.note }) : null
      }
      allergy={
        line.note && line.allergy
          ? t("line.allergy", { note: line.note })
          : null
      }
      takenBack={gone}
      mark={gone ? null : mark}
      large={large}
      trailing={trailing}
    />
  );
}

/** A ticket's state for whoever sent it, in words as well as colour. */
export function TicketBadgeView({
  ticket,
  department,
}: {
  ticket: { status: TicketStatus; kitchenSeenAt: string | null; lines: number };
  department: string;
}) {
  const { t } = useOrderWords();
  switch (ticketBadge(ticket)) {
    case "held":
      return <Badge>{t("ticketState.held")}</Badge>;
    case "ready":
      return (
        <Badge tone="accent">{t("ticketState.ready", { department })}</Badge>
      );
    case "served":
      return <Badge tone="success">{t("ticketState.served")}</Badge>;
    case "onScreen":
      return <Badge>{t("ticketState.onScreen", { department })}</Badge>;
    case "sent":
      return <Badge>{t("ticketState.sent")}</Badge>;
    default:
      return null;
  }
}

/** A ticket on a prep screen, as `TicketCard` draws it. */
export function TicketView({
  title,
  department,
  sentBy,
  since,
  held,
  lines,
  ready,
  busy = false,
}: {
  title: string;
  department: string;
  sentBy: string | null;
  /** Since when it waits: sent, or fired for a held block. */
  since: string;
  held: boolean;
  lines: PrepLine[];
  ready?: (() => void) | null;
  busy?: boolean;
}) {
  const { t, person } = useOrderWords();
  const { now, frame } = useOrdersMode();
  const age = ticketAge(since, now, frame.lateAfterMinutes);
  const name = person(sentBy);
  return (
    <TicketCard
      title={title}
      label={t("prep.label", { place: title, department })}
      from={
        name
          ? t("prep.from", { name, department })
          : t("prep.fromNobody", { department })
      }
      age={{ text: t("age.ago", { count: age.minutes }), tone: age.tone }}
      held={held ? t("ticketState.held") : null}
      ready={
        ready ? { label: t("prep.ready"), onClick: ready, loading: busy } : null
      }
    >
      {lines.map((line) => (
        <SentLineView key={line.id} line={line} />
      ))}
    </TicketCard>
  );
}

/**
 * A taker off a shift (default 11): the screen says so and leads to the
 * clock, the draft kept; a shift left open since yesterday is a manager's to
 * fix.
 */
export function OffShiftCard({ off }: { off: "clock" | "staleShift" }) {
  const { t } = useOrderWords();
  const { paths } = useOrdersMode();
  const words = off === "clock" ? "offClock" : "staleShift";
  return (
    <EmptyState
      headingLevel="h2"
      icon={<Clock3 />}
      title={t(`${words}.title`)}
      body={t(`${words}.body`)}
    >
      <Button asChild>
        <Link href={paths.clock}>{t(`${words}.action`)}</Link>
      </Button>
    </EmptyState>
  );
}

const SAID = new Set<string>([
  "unavailable",
  "route",
  "choices",
  "price",
  "closed",
  "moved",
  "place",
  "window",
  "prepared",
  "held",
  "tooMany",
  "off",
  "noAccess",
  "viewOnly",
  "signedOut",
  "gone",
  "businessChanged",
  "served",
  "sender",
  "ownDepartment",
  "cancelled",
  "takenBack",
  "managersOnly",
  "comped",
  "day",
  "notClosed",
  "takeaway",
  "notYet",
  "failed",
]);

/**
 * Why a write was refused, in the screen's words. Nothing tries a write
 * again by itself, so the rest say it wasn't saved and that pressing again
 * tries again.
 */
export function failureWords(
  t: OrdersT,
  failure: OrdersActionFailure | SendFailure,
  items = "",
): string {
  const key = SAID.has(failure) ? failure : "failed";
  return t(`failed.${key}` as "failed.failed", { items });
}

/**
 * Which of P5's fixes was refused, for its own words: "line" a line taken
 * back or cancelled, "restore" a cancelled line put back, "undoClose" the
 * close's "ביטול".
 */
export type FixWrite =
  | "line"
  | "restore"
  | "comp"
  | "order"
  | "move"
  | "close"
  | "reopen"
  | "undoClose";

/**
 * Why a fix was refused (P5), in the screen's words: what only those who
 * run orders do says so (a comp, a whole order's cancel, a line ready put
 * back); a place taken names it for a move and says to wait for a reopen or
 * a close's undo; a close's undo too late, or of another's close, says where
 * it opens again; a held block says what to do before a close; a round on
 * its way says it lands first, and another write of the order on its way
 * says so; a shift that ended says so; anything else as any write.
 */
export function fixFailureWords(
  t: OrdersT,
  failure: OrdersActionFailure,
  what: FixWrite,
  place = "",
): string {
  if (failure === "noAccess" && (what === "comp" || what === "order")) {
    return t("failed.runsOnly");
  }
  if (failure === "managersOnly" && what === "restore") {
    return t("failed.managersOnlyRestore");
  }
  if (failure === "taken" && what === "move") {
    return t("failed.moveTaken", { place });
  }
  if (failure === "taken" && (what === "reopen" || what === "undoClose")) {
    return t("failed.reopenTaken");
  }
  if (failure === "window" && what === "undoClose") {
    return t("failed.undoClose");
  }
  if (failure === "held" && what === "close") return t("close.held");
  // A write of the order whole waits for a round on its way to land first,
  // and never goes behind another of the order not answered yet.
  if (failure === "sending") return t("order.actions.waitSend");
  if (failure === "writing") return t("order.actions.waitWrite");
  // A shift that ended while the screen was on.
  if (failure === "clock") return t("offClock.title");
  if (failure === "staleShift") return t("staleShift.title");
  return failureWords(t, failure);
}

/**
 * Why a send was refused, its lines back in the draft: off a shift, or a
 * shift left open, for someone who runs orders (a taker's screen says it
 * whole); else as any write, the rest saying the draft is back to send again.
 */
export function sendFailureWords(
  t: OrdersT,
  failure: SendFailure,
  items = "",
): string {
  if (failure === "clock") return t("failed.clock");
  if (failure === "staleShift") return t("failed.staleShift");
  return SAID.has(failure) && failure !== "failed"
    ? failureWords(t, failure, items)
    : t("failed.notSent");
}

/** A refusal over what it is about, in danger, read out at once. */
export function FailureLine({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-card bg-danger-soft px-4 py-3 font-medium text-danger",
        className,
      )}
    >
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <span className="min-w-0 flex-1">{children}</span>
    </p>
  );
}
