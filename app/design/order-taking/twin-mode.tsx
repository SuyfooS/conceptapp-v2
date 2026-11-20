"use client";

import type { DraftLine } from "@domain/order-screens";
import { draftCount } from "@domain/order-screens";
import type { RoundTarget } from "@domain/orders";
import { useTranslations } from "next-intl";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { newId } from "../../(app)/orders/new-id";
import {
  OrdersModeContext,
  useModeToast,
} from "../../(app)/orders/orders-mode";
import { usePlaceWords } from "../../(app)/orders/orders-parts";
import type {
  OrdersActions,
  OrdersPaths,
  OrdersSender,
  SendOutcome,
} from "../../(app)/orders/orders-types";
import { changeTicket, sendRound, setLabel, setTakenBack } from "./changes";
import { type DemoData, useOrderDemo } from "./demo-store";
import {
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
 * after opening, and the mode's toast says so, as the app's sync does.
 */
export function TwinOrdersMode({ children }: { children: ReactNode }) {
  const { data, now, update } = useOrderDemo();
  const t = useTranslations("app.orders.toast");
  const { placeTitle } = usePlaceWords();
  const { say, toast } = useModeToast();
  const frame = useMemo(() => twinFrame(data.viewer), [data.viewer]);
  // A version that moves with every change to the rows, as the server's does.
  const [seen, setSeen] = useState({ data, version: 1 });
  if (seen.data !== data) setSeen({ data, version: seen.version + 1 });

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
      say(
        t("ready", {
          place: placeTitle({ placeName: "4", takeaway: null }),
          department: frame.departments.kitchen ?? "",
        }),
        { open: twinPaths.takeaway("order-4") },
      );
    }, readyIn);
    return () => clearTimeout(timer);
  }, [readyIn, update, say, t, placeTitle, frame.departments]);

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
    }),
    [update, frame.userId],
  );

  const sender: OrdersSender = {
    send: (draft: string, target: RoundTarget, lines: DraftLine[]) => {
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
    pending: (draft) => data.pending[draft] ?? null,
    refusal: (draft) => data.refusals[draft] ?? null,
    clearRefusal: (draft) =>
      update((d) => {
        const { [draft]: _, ...rest } = d.refusals;
        return { ...d, refusals: rest };
      }),
  };

  const value = {
    frame,
    paths: twinPaths,
    now,
    off: frame.runs ? null : frame.clock,
    drafts: {
      get: (draft: string) => data.drafts[draft] ?? [],
      set: (draft: string, lines: DraftLine[]) =>
        update((d) => ({ ...d, drafts: { ...d.drafts, [draft]: lines } })),
      counts: Object.fromEntries(
        Object.entries(data.drafts).map(([key, lines]) => [
          key,
          draftCount(lines),
        ]),
      ),
    },
    sender,
    actions,
    say,
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
