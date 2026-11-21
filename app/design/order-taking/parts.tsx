"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { liveLines, type Ticket, ticketSince } from "./model";
import type { DemoData } from "./scenario";

/*
 * The parts the order-taking demo's screens share: where each screen is,
 * the demo's own words, and the twin's tickets as the mode's shell counts
 * them. Since P4 the screens are the app's own (app/(app)/orders), and
 * since P8a the kitchen's and the till's stations too
 * (app/(station)/station/orders), drawn from the twin's store.
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
  categories: `${BASE}/menu/categories`,
  places: `${BASE}/menu/places`,
  /** The app demo's departments, saying what each prepares. */
  departments: "/design/shell/manage/departments?state=menu",
  kitchen: `${BASE}/station/prep`,
  counter: `${BASE}/station/till`,
  /** Out of the mode: the app's own demo. */
  app: "/design/shell",
};

/** The demo's own words. */
export function useOrderWords() {
  return { t: useTranslations("design.orderTaking") };
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

/** The live lines' count, for "3 פריטים". */
export const linesCount = (ticket: Ticket) =>
  liveLines(ticket).reduce((sum, line) => sum + line.qty, 0);

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
