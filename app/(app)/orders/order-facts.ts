import { createContext, useContext } from "react";
import { OrdersModeContext, type OrdersModeValue } from "./orders-mode";

/**
 * What the orders' shared parts read besides their own props (`TicketView`,
 * `useOrderWords`, `Price`): the business's clock and time zone, its
 * departments and people by name, and when a ticket is late. The mode gives
 * them from its frame; a station of the orders (waiter mode P8a), which
 * mounts no mode, gives its own through `OrderFactsContext`.
 */
export type OrderFacts = {
  timeZone: string;
  /** Every department, removed ones too, by its name. */
  departments: Readonly<Record<string, string>>;
  /** People by id (lower case), by the names the business calls them. */
  names: Readonly<Record<string, string>>;
  lateAfterMinutes: number;
  /** The server's clock, in milliseconds. */
  now: number;
};

export const OrderFactsContext = createContext<OrderFacts | null>(null);

/** The station's facts when it gives them, else the mode's. */
export function factsFrom(
  facts: OrderFacts | null,
  mode: Pick<OrdersModeValue, "frame" | "now"> | null,
): OrderFacts {
  if (facts) return facts;
  if (!mode)
    throw new Error("The orders' parts outside the mode and a station");
  return {
    timeZone: mode.frame.timeZone,
    departments: mode.frame.departments,
    names: mode.frame.names,
    lateAfterMinutes: mode.frame.lateAfterMinutes,
    now: mode.now,
  };
}

/** The facts the orders' shared parts read, a station's or the mode's. */
export function useOrderFacts(): OrderFacts {
  return factsFrom(
    useContext(OrderFactsContext),
    useContext(OrdersModeContext),
  );
}
