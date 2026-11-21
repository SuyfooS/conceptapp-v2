import type { DraftLine } from "@domain/order-screens";
import type { PendingSend, SendRefusal } from "../../(app)/orders/orders-types";
import {
  DEMO_START,
  demoChoicesDraft,
  demoClosed,
  demoDraft,
  demoFishDraft,
  demoJustSent,
  demoOrders,
  demoSoldOut,
  demoTableThreeAgain,
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
  /**
   * A send on its way (`?state=pending`), waiting, or asking after ten
   * minutes (`?state=asking`, P7), by its draft.
   */
  pending: Record<string, PendingSend>;
  /** Whether the mode reaches the server (`?state=offline`: it doesn't, P7). */
  connection: "ok" | "down";
  /**
   * Rounds taken off the phone as the account signed out (`?state=lost`,
   * P7): how many, and the names of their places.
   */
  lost: {
    count: number;
    placeNames: string[];
    why: "signedOut" | "notMember";
  } | null;
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
  connection: "ok",
  lost: null,
  refusals: {},
  readyIn: null,
});

/**
 * No takeaway yet today: the first one sent is number 1, and none is among
 * today's closed.
 */
const noTakeaways = (data: DemoData) => ({
  takeaways: [],
  nextTakeaway: 1,
  closed: data.closed.filter((order) =>
    data.tables.some((place) => place.id === order.placeId),
  ),
});

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
 * before Shiran's send; `fixed` table 4 after its hummus was cancelled (sent
 * by mistake) and its beer given on the house (P5); `reopenTaken` table 3
 * open again with Yoav's new round, so its order closed today can't open
 * again; `choices` the evening, with the burger's choices open on table 6
 * (P6, opened by the screen); `choicesChanged` the burger's "מדיום וול"
 * gone from the menu while table 6's draft holds one; `asking` table 6's
 * round that hasn't gone for 12 minutes, which asks (P7); `offline` no
 * connection, table 6's round waiting for one; `lost` the notice of table
 * 6's round taken off the phone as the account signed out.
 */
export function scenario(state: string | null): DemoData {
  const base = service();
  switch (state) {
    case "quiet":
      return { ...base, ...noTakeaways(base), orders: [], closed: [] };
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
        ...noTakeaways(base),
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
        ...noTakeaways(base),
        orders: [],
        closed: [],
      };
    case "noPlaces":
      return {
        ...base,
        ...noTakeaways(base),
        tables: [],
        orders: [],
        closed: [],
      };
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
            key: "pending-table-6",
            target: { place: "table-6" },
            lines: demoDraft().slice(0, 2),
            // Tried, and it didn't go: it waits for a connection.
            state: "waiting",
            age: null,
          },
        },
      };
    case "asking":
      return {
        ...base,
        pending: {
          [TABLE_6]: {
            key: "pending-table-6",
            target: { place: "table-6" },
            lines: demoDraft().slice(0, 2),
            state: "ask",
            age: { unit: "minutes", count: 12 },
          },
        },
      };
    case "offline":
      return {
        ...base,
        connection: "down",
        pending: {
          [TABLE_6]: {
            key: "pending-table-6",
            target: { place: "table-6" },
            lines: demoDraft().slice(0, 2),
            state: "waiting",
            age: null,
          },
        },
      };
    case "lost":
      return {
        ...base,
        lost: { count: 1, placeNames: ["6"], why: "signedOut" },
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
    case "fixed":
      return { ...base, orders: fixedEvening(base.orders) };
    case "reopenTaken":
      return { ...base, orders: [...base.orders, demoTableThreeAgain()] };
    case "choices":
      return base;
    case "choicesChanged":
      return {
        ...base,
        menu: withoutOption(base.menu, "burger", "doneness", "mw"),
        drafts: { [TABLE_6]: demoChoicesDraft() },
      };
    default:
      return base;
  }
}

/** The menu with one option of an item's group gone, as a manager removed it. */
function withoutOption(
  menu: Menu,
  item: string,
  group: string,
  option: string,
): Menu {
  return {
    ...menu,
    items: menu.items.map((i) =>
      i.id !== item
        ? i
        : {
            ...i,
            groups: i.groups.map((g) =>
              g.id !== group
                ? g
                : { ...g, options: g.options.filter((o) => o.id !== option) },
            ),
          },
    ),
  };
}

/** The evening's orders with table 4's hummus cancelled and its beer on the house. */
function fixedEvening(orders: Order[]): Order[] {
  const by = READER;
  const at = DEMO_START - 3 * 60_000;
  return orders.map((order) =>
    order.id !== "order-4"
      ? order
      : {
          ...order,
          rounds: order.rounds.map((round) => ({
            ...round,
            tickets: round.tickets.map((ticket) => ({
              ...ticket,
              lines: ticket.lines.map((line) =>
                line.id === "l5"
                  ? { ...line, cancelled: { reason: "mistake", at, by } }
                  : line.id === "l8"
                    ? { ...line, comped: { reason: "make_good", at, by } }
                    : line,
              ),
            })),
          })),
        },
  );
}
