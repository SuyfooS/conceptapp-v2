"use client";

import { usePathname, useSearchParams } from "next/navigation";
import {
  createContext,
  Fragment,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  DEMO_START,
  demoClosed,
  demoDraft,
  demoJustSent,
  demoOrders,
  demoSoldOut,
  demoTakeaways,
  orderDemoMenu,
  READER,
} from "./data";
import type { DraftLine, Menu, Order, Place } from "./model";

/** Everything the demo holds, in memory only: a reload starts the evening again. */
export type DemoData = {
  menu: Menu;
  soldOut: string[];
  /** The open orders, one per place at most. */
  orders: Order[];
  /** Today's closed orders, newest first. */
  closed: Order[];
  /** What each place's waiter is building, by place: it lives on the phone. */
  drafts: Record<string, DraftLine[]>;
  takeaways: Place[];
  /** The next takeaway's number, given at its first send. */
  nextTakeaway: number;
};

const service = (): DemoData => ({
  menu: orderDemoMenu,
  soldOut: demoSoldOut,
  orders: demoOrders(),
  closed: demoClosed(),
  drafts: {},
  takeaways: demoTakeaways,
  nextTakeaway: 2,
});

/**
 * What the demo opens with for each `?state=` that changes its rows (the
 * rest open a screen's own part, such as a sheet): `quiet` the evening
 * before anyone sat down, `draft` table 6's draft with a note, an allergy
 * and a main held, `sent` table 6 just sent, `nothingSent` an evening when
 * Shiran sent nothing yet, `nothingOpen` a kitchen with every ticket out,
 * and `noMenu` a business whose menu is still to be added.
 */
export function scenario(state: string | null): DemoData {
  const base = service();
  switch (state) {
    case "quiet":
      return { ...base, orders: [], closed: [], takeaways: [] };
    case "draft":
      return { ...base, drafts: { "table-6": demoDraft() } };
    case "sent":
      return { ...base, orders: [...base.orders, demoJustSent()] };
    case "nothingSent":
      return {
        ...base,
        orders: base.orders.filter((order) =>
          order.rounds.every((round) => round.by !== READER),
        ),
        takeaways: [],
      };
    case "nothingOpen":
      return {
        ...base,
        orders: base.orders.map((order) => ({
          ...order,
          rounds: order.rounds.map((round) => ({
            ...round,
            tickets: round.tickets.map((ticket) => ({
              ...ticket,
              held: false,
              state: "served" as const,
            })),
          })),
        })),
      };
    case "noMenu":
      return {
        ...base,
        menu: { categories: [], items: [] },
        soldOut: [],
        orders: [],
        closed: [],
        takeaways: [],
      };
    default:
      return base;
  }
}

/** How often the demo's clock moves: ages and the take-back window follow it. */
const TICK_MS = 10_000;

type OrderDemoValue = {
  data: DemoData;
  /** The demo's clock: 20:42 when it opened, moving with real time. */
  now: number;
  /** Changes each time a `?state=` opens the demo afresh. */
  opening: number;
  update: (change: (data: DemoData) => DemoData) => void;
};

const OrderDemoContext = createContext<OrderDemoValue | null>(null);

/** The demo's rows and clock; only inside OrderDemo. */
export function useOrderDemo(): OrderDemoValue {
  const value = useContext(OrderDemoContext);
  if (!value) throw new Error("useOrderDemo outside OrderDemo");
  return value;
}

/**
 * The `?state=` a screen opened with, for its own parts (a sheet open, a
 * view chosen). Read once, as the screen is first drawn: OrderDemo then
 * takes it off the address.
 */
export function useOpenedWith(): string | null {
  return useSearchParams().get("state");
}

/**
 * The demo's one store, above every screen of it, so what a waiter sends
 * reaches the prep screen and comes back ready on the floor. Nothing is
 * stored anywhere: a reload starts the evening again. A link with
 * `?state=` opens it afresh in that state (`scenario`), and the state then
 * comes off the address, so going back to that page keeps what was done
 * since rather than starting over.
 */
export function OrderDemo({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const state = useOpenedWith();
  const key = state === null ? null : `${pathname}?${state}`;
  const [openedFor, setOpenedFor] = useState(key);
  const [opening, setOpening] = useState(0);
  const [data, setData] = useState(() => scenario(state));
  if (key !== openedFor) {
    setOpenedFor(key);
    if (key !== null) {
      setOpening(opening + 1);
      setData(scenario(state));
    }
  }

  const [elapsed, setElapsed] = useState(0);
  // The clock starts at 20:42 with each opening and runs with real time.
  // biome-ignore lint/correctness/useExhaustiveDependencies: each opening starts the clock again
  useEffect(() => {
    const started = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Date.now() - started), TICK_MS);
    return () => clearInterval(timer);
  }, [opening]);

  useEffect(() => {
    if (state === null) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("state");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, [state]);

  return (
    <OrderDemoContext.Provider
      value={{ data, now: DEMO_START + elapsed, opening, update: setData }}
    >
      {children}
    </OrderDemoContext.Provider>
  );
}

/**
 * A screen of the demo, drawn afresh each time a `?state=` opens the demo
 * (`opening`): its own parts start as that state says, while moving
 * between screens keeps them as they were left.
 */
export function DemoScreen({ children }: { children: ReactNode }) {
  const { opening } = useOrderDemo();
  return <Fragment key={opening}>{children}</Fragment>;
}
