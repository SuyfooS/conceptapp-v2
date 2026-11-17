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
import { DEMO_START } from "./data";
import { type DemoData, scenario } from "./scenario";

export type { DemoData } from "./scenario";

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
 * since rather than starting over. A link without one keeps what is there:
 * the screens' own links and tabs, never the index's, whose plain rows ask
 * for `?state=service`.
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
