"use client";

import { minutesSince } from "@domain/order-screens";
import { stationGone, stationSince } from "@domain/order-stations";
import { ORDER_RULES, type PrepTicket } from "@domain/orders";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { cn } from "@ui/cn";
import { PageSection } from "@ui/page";
import { Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useOrderFacts } from "./order-facts";
import { ltr, TicketView, useOrderWords } from "./orders-parts";

/*
 * What the phone's prep screen (waiter mode P4) and the kitchen's station
 * (P8a) draw alike: the tickets to make and "מוכנים לאחרונה". The phone's
 * one column grows to three on a desktop; the station's, larger, to four.
 */

/** A ticket still to make: a line of it is live. */
export const liveTicket = (ticket: PrepTicket) =>
  ticket.lines.some((line) => line.state === "live");

/**
 * What a screen makes of its tickets: the new ones oldest first, then the
 * held blocks, greyed, with no "מוכן" until they are called. A ticket with
 * nothing left to make is left out, unless the screen keeps it struck
 * whole (`keepGone`, the station's, until it is taken off).
 */
export function toMake(
  tickets: readonly PrepTicket[],
  keepGone = false,
): PrepTicket[] {
  const shown = tickets.filter(
    (ticket) =>
      (ticket.status === "new" || ticket.status === "held") &&
      (liveTicket(ticket) || (keepGone && stationGone(ticket))),
  );
  return [
    ...shown.filter((ticket) => ticket.status === "new"),
    ...shown.filter((ticket) => ticket.status === "held"),
  ];
}

/** Made ready in the last five minutes, the newest first: they go back to new from here. */
export function recentlyReady(
  tickets: readonly PrepTicket[],
  now: number,
): PrepTicket[] {
  return tickets
    .filter(
      (ticket) =>
        ticket.status === "ready" &&
        ticket.readyAt !== null &&
        minutesSince(ticket.readyAt, now) < ORDER_RULES.readyUndoMinutes,
    )
    .sort((a, b) => Date.parse(b.readyAt ?? "") - Date.parse(a.readyAt ?? ""));
}

/** The tickets to make, each with its "מוכן". */
export function TicketGrid({
  tickets,
  label,
  layout,
  busy,
  onReady,
  fresh,
  onDismiss,
}: {
  tickets: readonly PrepTicket[];
  /** Names the list for screen readers. */
  label: string;
  /** The phone's prep screen, or a station's larger one. */
  layout: "phone" | "station";
  /** The ticket whose "מוכן" waits for the server. */
  busy: string | null;
  /** Null while viewing: no "מוכן". */
  onReady: ((ticket: PrepTicket, place: string) => void) | null;
  /** Tickets that just arrived, drawn fresh. */
  fresh?: ReadonlySet<string>;
  /** A station's: a ticket struck whole is taken off it by hand. */
  onDismiss?: (ticket: PrepTicket) => void;
}) {
  const { placeTitle, department } = useOrderWords();
  const tStation = useTranslations("app.orders.station");
  const station = layout === "station";
  return (
    <ul
      aria-label={label}
      className={cn(
        "grid gap-4 md:grid-cols-2 md:items-start",
        station ? "lg:grid-cols-3 xl:grid-cols-4" : "xl:grid-cols-3",
      )}
    >
      {tickets.map((ticket) => {
        const place = placeTitle(ticket);
        const gone = onDismiss && stationGone(ticket);
        return (
          <li key={ticket.id}>
            <TicketView
              title={place}
              department={department(ticket.department)}
              sentBy={ticket.sentBy}
              since={stationSince(ticket)}
              held={ticket.status === "held"}
              lines={ticket.lines}
              ready={onReady ? () => onReady(ticket, place) : null}
              busy={busy === ticket.id}
              large={station}
              fresh={fresh?.has(ticket.id) ?? false}
              gone={
                gone
                  ? {
                      label: tStation("gone"),
                      dismiss: tStation("dismiss"),
                      onDismiss: () => onDismiss(ticket),
                    }
                  : null
              }
            />
          </li>
        );
      })}
    </ul>
  );
}

/** "מוכנים לאחרונה": each with "החזרה להכנה" for five minutes. */
export function RecentlyReady({
  tickets,
  onPutBack,
  disabled = false,
  layout,
}: {
  tickets: readonly PrepTicket[];
  onPutBack: (ticket: PrepTicket, place: string) => void;
  disabled?: boolean;
  layout: "phone" | "station";
}) {
  const { t, placeTitle, time } = useOrderWords();
  const { now } = useOrderFacts();
  if (tickets.length === 0) return null;
  const putBack = (ticket: PrepTicket, place: string) => (
    <Button
      variant={layout === "station" ? "secondary" : "ghost"}
      className={cn("shrink-0", layout === "phone" && "px-3")}
      disabled={disabled}
      onClick={() => onPutBack(ticket, place)}
    >
      <Undo2 aria-hidden="true" />
      {t("prep.putBack")}
      <span className="sr-only">{t("draft.forItem", { name: place })}</span>
    </Button>
  );
  const readyAt = (ticket: PrepTicket) =>
    t.rich("prep.readyAt", { time: time(ticket.readyAt ?? now), ltr });
  return (
    <PageSection title={t("prep.recent")}>
      {layout === "station" ? (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {tickets.map((ticket) => {
            const place = placeTitle(ticket);
            return (
              <li key={ticket.id}>
                <Card className="flex flex-wrap items-center gap-3">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-semibold text-lg">{place}</span>
                    <span className="text-base text-ink-2">
                      {readyAt(ticket)}
                    </span>
                  </span>
                  {putBack(ticket, place)}
                </Card>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="overflow-hidden rounded-card bg-surface shadow-card md:max-w-2xl">
          {tickets.map((ticket) => {
            const place = placeTitle(ticket);
            return (
              <li
                key={ticket.id}
                className="relative flex min-h-16 items-center gap-3 px-4 py-2.5 not-first:before:absolute not-first:before:start-4 not-first:before:end-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium">{place}</span>
                  <span className="text-ink-2 text-sm">{readyAt(ticket)}</span>
                </span>
                {putBack(ticket, place)}
              </li>
            );
          })}
        </ul>
      )}
    </PageSection>
  );
}
