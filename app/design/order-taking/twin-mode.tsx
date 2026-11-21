"use client";

import type { DraftLine } from "@domain/order-screens";
import { draftCount, withoutSent } from "@domain/order-screens";
import { closeUndoState, type RoundTarget } from "@domain/orders";
import { useTranslations } from "next-intl";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { newId } from "../../(app)/orders/new-id";
import {
  OrdersModeContext,
  useModeToast,
} from "../../(app)/orders/orders-mode";
import { usePlaceWords } from "../../(app)/orders/orders-parts";
import type {
  OrdersActionResult,
  OrdersActions,
  OrdersPaths,
  OrdersSender,
  SendOutcome,
  SendRefusal,
  WholeWrite,
} from "../../(app)/orders/orders-types";
import {
  type OwnLine,
  refusalMoved,
  storeDraftMoved,
  storeMovedBack,
} from "../../(app)/orders/send-store";
import { wholeWaits } from "../../(app)/orders/whole-on-way";
import {
  cancelLine,
  cancelOrder,
  changeTicket,
  closeOrder,
  compLine,
  moveOrder,
  reopenOrder,
  restoreLine,
  sendRound,
  setLabel,
  setTakenBack,
  uncompLine,
  undoCloseOrder,
} from "./changes";
import { type DemoData, useOrderDemo } from "./demo-store";
import {
  choicesRefused,
  soldOutIn,
  twinFrame,
  twinOrderAt,
  twinSentRound,
} from "./real-orders";

const BASE = "/design/order-taking";

/** Where the twin's mode screens lead: its own, and the app demo's clock and Today. */
export const twinPaths: OrdersPaths = {
  floor: `${BASE}/floor`,
  mine: `${BASE}/mine`,
  prep: `${BASE}/prep`,
  menu: `${BASE}/menu`,
  place: (id) => `${BASE}/floor/order?place=${id}`,
  takeaway: (order) =>
    order
      ? `${BASE}/floor/order?order=${order}`
      : `${BASE}/floor/order?place=takeaway-new`,
  clock: "/design/shell/clock",
  leave: "/design/shell",
  menuPlaces: `${BASE}/menu/places`,
  menuImport: `${BASE}/menu/import`,
  till: (order) => `${BASE}/floor/till?order=${order}`,
};

type TwinData = { data: DemoData; now: number; version: number };

const TwinDataContext = createContext<TwinData | null>(null);

/** The twin's rows, its clock and their version; only inside TwinOrdersMode. */
export function useTwinData(): TwinData {
  const value = useContext(TwinDataContext);
  if (!value) throw new Error("useTwinData outside TwinOrdersMode");
  return value;
}

const done = Promise.resolve({ ok: true as const, value: null });

/**
 * The app's mode, over the twin's store (waiter mode P4): the same screens
 * read its rows through real-orders.ts, and its stand-ins write them as the
 * database would, at once. Nothing goes anywhere: a reload starts the evening
 * again. `?state=readyNow` turns a ticket of Shiran's ready three seconds
 * after opening, and the mode's toast says so, as the app's sync does. P5's
 * fixes write the store the same way; a move to a taken table, a reopen
 * while its table is taken, or a close's "ביטול" too late or of another's
 * close, is refused as the database refuses it, and that "ביטול" puts back
 * what the close served. Since P6 a draft whose choices no longer fit the
 * twin's menu is refused as the send refuses it.
 */
export function TwinOrdersMode({ children }: { children: ReactNode }) {
  const { data, now, update } = useOrderDemo();
  const t = useTranslations("app.orders.toast");
  const { placeTitle } = usePlaceWords();
  const { say, tell, toast } = useModeToast();
  const frame = useMemo(() => twinFrame(data.viewer), [data.viewer]);
  // A version that moves with every change to the rows, as the server's does.
  const [seen, setSeen] = useState({ data, version: 1 });
  if (seen.data !== data) setSeen({ data, version: seen.version + 1 });
  // What a table held of its own as an order moved there, and its refusal,
  // by its draft, for the move's "ביטול" (as the app's store and provider).
  const own = useRef<Record<string, OwnLine[]>>({});
  const ownRefusals = useRef(new Map<string, SendRefusal | null>());
  const onItsWay = (draft: string) => (data.pending[draft] ? 1 : 0);

  // Shiran's table 4 starters, made in the kitchen while she looks.
  const readyIn = data.readyIn;
  useEffect(() => {
    if (readyIn === null) return;
    const timer = setTimeout(() => {
      update((d) => ({
        ...changeTicket(d, "t-4a-kitchen", {
          state: "ready",
          readyAt: Date.now(),
          readyBy: "noa",
        }),
        readyIn: null,
      }));
      // News, as the app's sync tells it: never in a way back's place.
      tell("ready", () =>
        say(
          t("ready", {
            place: placeTitle({ placeName: "4", takeaway: null }),
            department: frame.departments.kitchen ?? "",
          }),
          { open: twinPaths.takeaway("order-4") },
        ),
      );
    }, readyIn);
    return () => clearTimeout(timer);
  }, [readyIn, update, say, tell, t, placeTitle, frame.departments]);

  const actions: OrdersActions = useMemo(
    () => ({
      serve: (ticket, served) => {
        update((d) => {
          const found = d.orders
            .flatMap((o) => o.rounds.flatMap((r) => r.tickets))
            .find((x) => x.id === ticket);
          return changeTicket(d, ticket, {
            state: served ? "served" : found?.readyAt ? "ready" : "new",
          });
        });
        return done;
      },
      setReady: (ticket, ready) => {
        update((d) =>
          changeTicket(
            d,
            ticket,
            ready
              ? { state: "ready", readyAt: Date.now(), readyBy: frame.userId }
              : { state: "new" },
          ),
        );
        return done;
      },
      takeBack: (line) => {
        update((d) => setTakenBack(d, line, true));
        return done;
      },
      fire: (order) => {
        let fired = 0;
        update((d) => {
          const target = d.orders.find((o) => o.id === order);
          const held =
            target?.rounds
              .flatMap((r) => r.tickets)
              .filter((x) => x.held && x.state === "new") ?? [];
          fired = held.length;
          return held.reduce(
            (rows, x) =>
              changeTicket(rows, x.id, {
                held: false,
                firedAt: Date.now(),
                seen: false,
              }),
            d,
          );
        });
        return Promise.resolve({ ok: true as const, value: fired });
      },
      setLabel: (order, label) => {
        update((d) => {
          const placeId = d.orders.find((o) => o.id === order)?.placeId;
          return placeId ? setLabel(d, placeId, label ?? "") : d;
        });
        return done;
      },
      cancelLine: (line, reason, cancelled) => {
        update((d) =>
          cancelled && reason
            ? cancelLine(d, line, reason, frame.userId, now)
            : restoreLine(d, line),
        );
        return done;
      },
      compLine: (line, reason, comped) => {
        update((d) =>
          comped && reason
            ? compLine(d, line, reason, frame.userId, now)
            : uncompLine(d, line),
        );
        return done;
      },
      cancelOrder: (order, reason) => {
        update((d) => cancelOrder(d, order, reason, frame.userId, now));
        return done;
      },
      move: (order, place) => {
        if (data.orders.some((o) => o.placeId === place && o.id !== order)) {
          return Promise.resolve({ ok: false as const, failure: "taken" });
        }
        update((d) => moveOrder(d, order, place, frame.userId, now));
        return done;
      },
      close: (order) => {
        update((d) => closeOrder(d, order, frame.userId, now));
        return done;
      },
      reopen: (order) => {
        const closed = data.closed.find((o) => o.id === order);
        if (closed && data.orders.some((o) => o.placeId === closed.placeId)) {
          return Promise.resolve({ ok: false as const, failure: "taken" });
        }
        update((d) => reopenOrder(d, order, frame.userId, now));
        return done;
      },
      // As undo_close_order: whoever closed it, within the 2 minutes, then
      // while the table is free; what the close served goes back.
      undoClose: (order) => {
        const closed = data.closed.find((o) => o.id === order);
        if (
          closed &&
          closed.closedAt !== null &&
          closeUndoState({
            closedAt: new Date(closed.closedAt),
            closedBy: closed.closedBy,
            actor: frame.userId,
            now: new Date(now),
          }) === "window"
        ) {
          return Promise.resolve({ ok: false as const, failure: "window" });
        }
        if (closed && data.orders.some((o) => o.placeId === closed.placeId)) {
          return Promise.resolve({ ok: false as const, failure: "taken" });
        }
        update((d) => undoCloseOrder(d, order, frame.userId, now));
        return done;
      },
    }),
    [update, frame.userId, now, data.orders, data.closed],
  );

  const sender: OrdersSender = {
    send: (draft: string, target: RoundTarget, lines: DraftLine[]) => {
      // A table's own line that goes out with the order moved there is the
      // order's from then on, sent or refused, as the app's (`storeSent`).
      const ownThere = own.current[draft];
      if (ownThere) {
        const sent = new Set(lines.map((line) => line.id));
        own.current = {
          ...own.current,
          [draft]: ownThere.filter((line) => !sent.has(line.id)),
        };
      }
      const refuse = (outcome: Extract<SendOutcome, { ok: false }>) => {
        update((d) => ({
          ...d,
          refusals: { ...d.refusals, [draft]: { ...outcome, target } },
        }));
        return Promise.resolve(outcome);
      };
      if (frame.clock && !frame.runs) {
        return refuse({
          ok: false,
          failure: frame.clock,
          items: [],
          order: null,
        });
      }
      // Choices that no longer fit: the database stops at them first, and
      // names no item.
      if (choicesRefused(data, lines)) {
        return refuse({
          ok: false,
          failure: "choices",
          items: [],
          order: null,
        });
      }
      const items = soldOutIn(
        data,
        lines.map((line) => line.item),
      );
      if (items.length > 0) {
        return refuse({
          ok: false,
          failure: "unavailable",
          items,
          order: null,
        });
      }
      if ("place" in target && !("order" in target)) {
        const open = twinOrderAt(data, target.place);
        if (open) {
          return refuse({
            ok: false,
            failure: "taken",
            items: [],
            order: open.id,
          });
        }
      }
      const where = {
        orderId: "order" in target ? target.order : null,
        placeId: "place" in target ? (target.place ?? null) : null,
        label: "label" in target ? target.label : null,
      };
      const sent = sendRound(data, where, lines, frame.userId, now);
      const { [draft]: _, ...refusals } = sent.data.refusals;
      update(() => ({
        ...sent.data,
        drafts: { ...sent.data.drafts, [draft]: [] },
        refusals,
      }));
      return Promise.resolve({
        ok: true as const,
        round: twinSentRound(sent.data, sent.order, sent.round),
      });
    },
    pending: (draft) => {
      const round = data.pending[draft];
      return round ? [round] : [];
    },
    refusal: (draft) => data.refusals[draft] ?? null,
    clearRefusal: (draft) =>
      update((d) => {
        const { [draft]: _, ...rest } = d.refusals;
        return { ...d, refusals: rest };
      }),
    // The twin's send answers at once, to the screen that sent it.
    landed: null,
  };

  const value = {
    frame,
    paths: twinPaths,
    now,
    clock: frame.clock,
    off: frame.runs ? null : frame.clock,
    drafts: {
      get: (draft: string) => data.drafts[draft] ?? [],
      // From the draft as it is when the change lands, as the app's: a line
      // on its way (the twin's `?state=pending`) never comes back into it.
      update: (draft: string, change: (lines: DraftLine[]) => DraftLine[]) =>
        update((d) => ({
          ...d,
          drafts: {
            ...d.drafts,
            [draft]: withoutSent(
              change(d.drafts[draft] ?? []),
              d.pending[draft]?.lines ?? [],
            ),
          },
        })),
      // An order moved: its table's draft goes with it, its refusal too, as
      // the app's, and what the new table held, and its refusal, stay there
      // on its undo, but what went out in one of the order's rounds.
      move: (from: string, to: string) => {
        if (from === to) return;
        const moved = storeDraftMoved(
          { drafts: data.drafts, pending: {}, own: own.current },
          from,
          to,
        );
        own.current = moved.own ?? {};
        ownRefusals.current.delete(from);
        ownRefusals.current.set(to, data.refusals[to] ?? null);
        update((d) => {
          const was = { drafts: d.drafts, pending: {} };
          const next = storeDraftMoved(was, from, to);
          return next.drafts === was.drafts
            ? d
            : {
                ...d,
                drafts: next.drafts,
                refusals: refusalMoved(d.refusals, from, to),
              };
        });
      },
      moveBack: (from: string, to: string) => {
        const lines = own.current[from];
        const refusal = ownRefusals.current.get(from) ?? null;
        const { [from]: _, ...others } = own.current;
        own.current = others;
        ownRefusals.current.delete(from);
        if (lines === undefined) return;
        update((d) => {
          const was = { drafts: d.drafts, pending: {}, own: { [from]: lines } };
          const next = storeMovedBack(was, from, to, newId);
          return next.drafts === was.drafts
            ? d
            : {
                ...d,
                drafts: next.drafts,
                refusals: refusalMoved(d.refusals, from, to, refusal),
              };
        });
      },
      counts: Object.fromEntries(
        Object.entries(data.drafts).map(([key, lines]) => [
          key,
          draftCount(lines),
        ]),
      ),
    },
    sender,
    actions,
    // The twin's writes land at once, so none is ever on its way; one still
    // waits for a round its store shows on its way (`?state=pending`).
    whole: (on: WholeWrite, write: () => Promise<OrdersActionResult>) =>
      wholeWaits(on, onItsWay)
        ? Promise.resolve({ ok: false as const, failure: "sending" as const })
        : write(),
    wholeRefusal: (on: WholeWrite) =>
      wholeWaits(on, onItsWay) ? ("sending" as const) : null,
    wholeOnWay: () => false,
    say,
    tell,
    syncNow: () => {},
    newId,
  };

  return (
    <OrdersModeContext.Provider value={value}>
      <TwinDataContext.Provider value={{ data, now, version: seen.version }}>
        {children}
        {toast}
      </TwinDataContext.Provider>
    </OrdersModeContext.Provider>
  );
}
