import type { DraftLine } from "@domain/order-screens";
import type { PendingSend, SendRefusal } from "../../(app)/orders/orders-types";
import {
  demoClosed,
  demoDraft,
  demoFishDraft,
  demoJustSent,
  demoOrders,
  demoSoldOut,
  demoTakeaways,
  orderDemoMenu,
  orderDemoTables,
  READER,
} from "./data";
import type { Menu, Order, Place } from "./model";

/**
 * Who looks at the twin: Shiran, a manager in the bar, who takes orders and
 * runs them; Noa, who only prepares in the kitchen; Yoav off a shift, or
 * with a shift left open since yesterday; or the team viewing as a manager.
 */
export type TwinViewer =
  | "shiran"
  | "noa"
  | "offClock"
  | "staleShift"
  | "viewing";

/** Everything the demo holds, in memory only: a reload starts the evening again. */
export type DemoData = {
  menu: Menu;
  soldOut: string[];
  /** The tables, in their order. */
  tables: Place[];
  /** The open orders, one per place at most. */
  orders: Order[];
  /** Today's closed orders, newest first. */
  closed: Order[];
  /** What is being built on the phone, by where it waits (`draftKey`). */
  drafts: Record<string, DraftLine[]>;
  takeaways: Place[];
  /** The next takeaway's number, given at its first send. */
  nextTakeaway: number;
  viewer: TwinViewer;
  /** A send on its way (`?state=pending`), by its draft. */
  pending: Record<string, PendingSend>;
  /** A send refused (`?state=taken`), by its draft. */
  refusals: Record<string, SendRefusal>;
  /** One of Shiran's tickets turns ready this long after opening (`?state=readyNow`). */
  readyIn: number | null;
};

/** The evening at 20:42, as the demo opens without a state. */
const service = (): DemoData => ({
  menu: orderDemoMenu,
  soldOut: demoSoldOut,
  tables: orderDemoTables,
  orders: demoOrders(),
  closed: demoClosed(),
  drafts: {},
  takeaways: demoTakeaways,
  nextTakeaway: demoTakeaways.length + 1,
  viewer: "shiran",
  pending: {},
  refusals: {},
  readyIn: null,
});

/** No takeaway yet today: the first one sent is number 1. */
const noTakeaways = { takeaways: [], nextTakeaway: 1 };

const TABLE_6 = "place:table-6";

/**
 * What the demo opens with for each `?state=` that changes its rows: `service`
 * the evening at 20:42, which the index's plain links ask for so that each
 * opens afresh; `quiet` the evening before anyone sat down; `draft` table 6's
 * draft with an allergy and a main held; `sent` table 6 just sent;
 * `nothingSent` an evening when Shiran sent nothing yet; `nothingOpen` a
 * kitchen with every ticket out; `noMenu` a business whose menu is still to
 * be added; `noPlaces` one with no places yet; `offClock` and `staleShift`
 * Yoav off a shift; `viewing` the team viewing as a manager; `kitchen` Noa,
 * who only prepares; `readyNow` a ticket of Shiran's turning ready while she
 * looks; `pending` table 6's send not through yet; `soldOut` table 6's draft
 * with the fish, sold out meanwhile; `taken` table 6 opened by Yoav a moment
 * before Shiran's send.
 */
export function scenario(state: string | null): DemoData {
  const base = service();
  switch (state) {
    case "quiet":
      return { ...base, orders: [], closed: [], ...noTakeaways };
    case "draft":
      return { ...base, drafts: { [TABLE_6]: demoDraft() } };
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
    case "noPlaces":
      return { ...base, tables: [], orders: [], closed: [], ...noTakeaways };
    case "offClock":
    case "staleShift":
      return { ...base, viewer: state, drafts: { [TABLE_6]: demoDraft() } };
    case "viewing":
      return { ...base, viewer: "viewing" };
    case "kitchen":
      return { ...base, viewer: "noa" };
    case "readyNow":
      return { ...base, readyIn: 3000 };
    case "pending":
      return {
        ...base,
        pending: {
          [TABLE_6]: {
            target: { place: "table-6" },
            lines: demoDraft().slice(0, 2),
          },
        },
      };
    case "soldOut":
      return { ...base, drafts: { [TABLE_6]: demoFishDraft() } };
    case "taken": {
      const yoavs = demoJustSent();
      const opened: Order = {
        ...yoavs,
        openedBy: "yoav",
        rounds: yoavs.rounds.map((round) => ({ ...round, by: "yoav" })),
      };
      return {
        ...base,
        orders: [...base.orders, opened],
        drafts: { [TABLE_6]: demoDraft() },
        refusals: {
          [TABLE_6]: {
            ok: false,
            failure: "taken",
            items: [],
            order: opened.id,
            target: { place: "table-6" },
          },
        },
      };
    }
    default:
      return base;
  }
}
