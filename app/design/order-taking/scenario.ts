import {
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

/** The evening at 20:42, as the demo opens without a state. */
const service = (): DemoData => ({
  menu: orderDemoMenu,
  soldOut: demoSoldOut,
  orders: demoOrders(),
  closed: demoClosed(),
  drafts: {},
  takeaways: demoTakeaways,
  nextTakeaway: demoTakeaways.length + 1,
});

/** No takeaway yet today: the first one sent is number 1. */
const noTakeaways = { takeaways: [], nextTakeaway: 1 };

/**
 * What the demo opens with for each `?state=` that changes its rows (the
 * rest open a screen's own part, such as a sheet, on the evening as it
 * is): `service` the evening at 20:42, which the index's plain links ask
 * for so that each opens afresh; `quiet` the evening before anyone sat
 * down; `draft` table 6's draft with a note, an allergy and a main held;
 * `sent` table 6 just sent; `nothingSent` an evening when Shiran sent
 * nothing yet; `nothingOpen` a kitchen with every ticket out; and `noMenu`
 * a business whose menu is still to be added.
 */
export function scenario(state: string | null): DemoData {
  const base = service();
  switch (state) {
    case "quiet":
      return { ...base, orders: [], closed: [], ...noTakeaways };
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
        ...noTakeaways,
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
        ...noTakeaways,
      };
    default:
      return base;
  }
}
