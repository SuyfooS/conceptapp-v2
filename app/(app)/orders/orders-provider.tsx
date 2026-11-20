"use client";

import {
  type DraftLine,
  draftCount,
  readyNews,
  roundLinesOf,
} from "@domain/order-screens";
import type { Menu } from "@domain/order-taking";
import type {
  MyOrders,
  OrderDetail,
  OrderFloor,
  OrderPrep,
  RoundTarget,
} from "@domain/orders";
import {
  nextOrdersSyncDelay,
  ORDERS_SEND_PATH,
  offShiftAnswer,
  ordersSyncAnswer,
  ordersSyncHref,
  retriesSend,
  SEND_BODY_MAX,
  type SendBody,
  sendAnswer,
  sendRetryDelay,
} from "@domain/orders-sync";
import { useNavCount } from "@ui/app-shell";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { newId } from "./new-id";
import { OrdersModeContext, useModeToast } from "./orders-mode";
import { usePlaceWords } from "./orders-parts";
import { appOrdersPaths } from "./orders-paths";
import type {
  OrdersActions,
  OrdersFrame,
  PendingSend,
  SendFailure,
  SendOutcome,
  SendRefusal,
} from "./orders-types";

/** The reads the mode holds, each the newest it saw. */
export type OrdersReads = {
  floor: OrderFloor | null;
  mine: MyOrders | null;
  prep: OrderPrep | null;
  menu: Menu | null;
  /** Orders read whole, by id: null once one is no longer to read. */
  orders: Record<string, OrderDetail | null>;
};

type Wants = { floor: boolean; prep: boolean; order: string | null };

type OrdersData = {
  reads: OrdersReads;
  /** A screen's first reads, from the server: kept where newer. */
  seed: (
    first: Partial<Omit<OrdersReads, "orders">> & {
      order?: OrderDetail | null;
    },
  ) => void;
  /** What a screen asks the sync for while it is on. */
  want: (wants: Partial<Wants>) => () => void;
};

const OrdersDataContext = createContext<OrdersData | null>(null);

/** The newer of two reads by their version. */
function newest<T extends { version: number }>(
  a: T | null | undefined,
  b: T | null | undefined,
): T | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return b.version >= a.version ? b : a;
}

/** The later of two reads of an order, by when the server read it. */
function later(
  a: OrderDetail | null | undefined,
  b: OrderDetail | null | undefined,
): OrderDetail | null | undefined {
  if (a === undefined) return b;
  if (b === undefined || b === null) return b === null ? null : a;
  if (a === null) return b;
  return Date.parse(b.now) >= Date.parse(a.now) ? b : a;
}

/**
 * A screen's data (waiter mode P4): what the server drew it with, or what
 * the mode's sync heard since, whichever is newer; and the sync asks for it
 * while the screen is on.
 */
export function useOrdersRead(
  first: Partial<Omit<OrdersReads, "orders">> & {
    order?: { id: string; detail: OrderDetail | null | undefined } | null;
  },
  wants: Partial<Wants> = {},
): OrdersReads & { order: OrderDetail | null | undefined } {
  const data = useContext(OrdersDataContext);
  if (!data) throw new Error("useOrdersRead outside the mode");
  const { seed, want, reads } = data;
  const orderId = first.order?.id ?? null;
  const detail = first.order?.detail;
  // Each server drawing once: its reads are the same objects until the next.
  useEffect(() => {
    seed({
      floor: first.floor,
      mine: first.mine,
      prep: first.prep,
      menu: first.menu,
      ...(detail ? { order: detail } : {}),
    });
  }, [seed, first.floor, first.mine, first.prep, first.menu, detail]);
  useEffect(
    () => want({ floor: wants.floor, prep: wants.prep, order: orderId }),
    [want, wants.floor, wants.prep, orderId],
  );
  return {
    floor: newest(first.floor, reads.floor),
    mine: newest(first.mine, reads.mine),
    prep: newest(first.prep, reads.prep),
    menu: newest(first.menu, reads.menu),
    orders: reads.orders,
    order: orderId
      ? later(first.order?.detail, reads.orders[orderId])
      : undefined,
  };
}

type Stored = {
  drafts: Record<string, DraftLine[]>;
  pending: Record<string, { body: SendBody; lines: DraftLine[] }>;
};

const STORE_PREFIX = "orders:";

/** What this tab keeps for the person in the business, if anything. */
function readStored(key: string, user: string): Stored {
  const empty: Stored = { drafts: {}, pending: {} };
  try {
    // Another person's drafts in this tab go when the next opens the mode.
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const name = sessionStorage.key(i);
      if (
        name?.startsWith(STORE_PREFIX) &&
        !name.startsWith(`${STORE_PREFIX}${user}:`)
      ) {
        sessionStorage.removeItem(name);
      }
    }
    const raw = sessionStorage.getItem(key);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    return {
      drafts:
        parsed.drafts && typeof parsed.drafts === "object" ? parsed.drafts : {},
      pending:
        parsed.pending && typeof parsed.pending === "object"
          ? parsed.pending
          : {},
    };
  } catch {
    return empty;
  }
}

function writeStored(key: string, stored: Stored) {
  try {
    const empty =
      Object.values(stored.drafts).every((lines) => lines.length === 0) &&
      Object.keys(stored.pending).length === 0;
    if (empty) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(stored));
  } catch {
    // A private window or blocked storage: the drafts live in memory alone.
  }
}

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** The failure a send's status means when its body says none. */
function failureOf(status: number | null): SendFailure {
  if (status === 401) return "signedOut";
  if (status === 403) return "noAccess";
  if (status === 404) return "gone";
  if (status === 429) return "tooMany";
  return "failed";
}

const SEND_FAILURES = new Set<string>([
  "gone",
  "off",
  "noAccess",
  "clock",
  "staleShift",
  "sender",
  "ownDepartment",
  "managersOnly",
  "invalid",
  "unavailable",
  "route",
  "choices",
  "price",
  "allergy",
  "place",
  "taken",
  "key",
  "body",
  "closed",
  "moved",
  "held",
  "window",
  "prepared",
  "takenBack",
  "cancelled",
  "comped",
  "served",
  "day",
  "takeaway",
  "notClosed",
  "tooMany",
  "notYet",
  "failed",
  "signedOut",
  "viewOnly",
]);

/**
 * Waiter mode in the app (P4), above every screen of it: the drafts on the
 * phone, kept in this tab (sessionStorage, until the outbox of P7) and gone
 * with it, another person's removed when the next opens the mode; the send,
 * through /orders-send with the phone's key, retried with the same key and
 * body at 1, 2, 5, 10 and 30 seconds while nothing comes back or the server
 * failed on its way, and on coming back to the mode while one waits; the
 * sync, /orders-sync every 15 seconds while visible and at once when the page
 * comes back, the phone comes online and after each of its own writes; the
 * mode's one toast, which says what of one's own turned ready, whichever
 * screen is on; and the counts on its items. A taker off a shift finds their
 * screens waiting and their draft kept.
 */
export function OrdersModeProvider({
  frame,
  actions,
  children,
}: {
  frame: OrdersFrame;
  actions: OrdersActions;
  children: ReactNode;
}) {
  const router = useRouter();
  const t = useTranslations("app.orders.toast");
  const { placeTitle } = usePlaceWords();
  const { say, toast } = useModeToast();
  const storeKey = `${STORE_PREFIX}${frame.userId}:${frame.business}`;
  const [stored, setStored] = useState<Stored>({ drafts: {}, pending: {} });
  const [loaded, setLoaded] = useState(false);
  const [refusals, setRefusals] = useState<Record<string, SendRefusal>>({});
  // A taker off a shift reads nothing of the floor; one who runs orders
  // reads all of it, and only the send waits for a shift.
  const offOf = (f: OrdersFrame) => (f.runs ? null : f.clock);
  const [off, setOff] = useState<"clock" | "staleShift" | null>(offOf(frame));
  const [reads, setReads] = useState<OrdersReads>({
    floor: null,
    mine: null,
    prep: null,
    menu: null,
    orders: {},
  });
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const readsRef = useRef(reads);
  readsRef.current = reads;
  const alive = useRef(true);
  const wants = useRef(new Map<number, Wants>());
  const wantId = useRef(0);
  const sync = useRef({ running: false, again: false, failures: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offRef = useRef(off);
  offRef.current = off;

  useEffect(() => {
    setOff(frame.runs ? null : frame.clock);
  }, [frame.clock, frame.runs]);

  // The server's clock, from the newest read that says it.
  const heard = useCallback((serverNow: string | undefined) => {
    if (!serverNow) return;
    const at = Date.parse(serverNow);
    if (!Number.isNaN(at)) setOffset(at - Date.now());
  }, []);
  useEffect(() => {
    setNow(Date.now() + offset);
    const tick = setInterval(() => setNow(Date.now() + offset), 10_000);
    return () => clearInterval(tick);
  }, [offset]);

  const seed = useCallback<OrdersData["seed"]>(
    (first) => {
      heard(first.floor?.now ?? first.mine?.now ?? first.prep?.now);
      setReads((was) => {
        const next = {
          floor: newest(was.floor, first.floor),
          mine: newest(was.mine, first.mine),
          prep: newest(was.prep, first.prep),
          menu: newest(was.menu, first.menu),
          orders:
            first.order === undefined || first.order === null
              ? was.orders
              : {
                  ...was.orders,
                  [first.order.id]:
                    later(was.orders[first.order.id], first.order) ?? null,
                },
        };
        // Nothing newer: the same state, so nothing draws again.
        const same =
          next.floor === was.floor &&
          next.mine === was.mine &&
          next.prep === was.prep &&
          next.menu === was.menu &&
          (first.order == null ||
            next.orders[first.order.id] === was.orders[first.order.id]);
        return same ? was : next;
      });
    },
    [heard],
  );

  // What turned ready of one's own: one toast for the mode, whichever screen.
  const tellReady = useCallback(
    (before: MyOrders | null, after: MyOrders) => {
      const news = readyNews(before, after);
      const first = news[0];
      if (!first) return;
      const place = placeTitle({
        placeName: first.placeName,
        takeaway: first.takeaway,
      });
      const department = frame.departments[first.department] ?? "";
      say(
        news.length === 1
          ? t("ready", { place, department })
          : t("readyMany", { count: news.length }),
        { open: appOrdersPaths.takeaway(first.order) },
      );
    },
    [frame.departments, placeTitle, say, t],
  );

  const syncOnce = useCallback(async () => {
    const state = sync.current;
    if (state.running) {
      state.again = true;
      return;
    }
    state.running = true;
    if (timer.current) clearTimeout(timer.current);
    const asked = [...wants.current.values()];
    const held = readsRef.current;
    const isOff = offRef.current !== null;
    const takes = frame.takes && !frame.viewing && !isOff;
    const ask = {
      floor: !isOff && frame.takes && asked.some((w) => w.floor),
      mine: takes,
      prep:
        asked.some((w) => w.prep) &&
        frame.prepares.length + Number(frame.runs) > 0,
      order: isOff ? null : (asked.find((w) => w.order)?.order ?? null),
    };
    // What the screen holds of what it asks: the oldest of them, so nothing
    // newer is skipped; none when it holds nothing of one.
    const asking: ({ version: number } | null)[] = [];
    if (ask.floor) asking.push(held.floor);
    if (ask.mine) asking.push(held.mine);
    if (ask.prep) asking.push(held.prep);
    const version =
      asking.length === 0 || asking.some((read) => read === null)
        ? null
        : Math.min(...asking.map((read) => read?.version ?? 0));
    try {
      const response = await fetch(
        ordersSyncHref({
          business: frame.business,
          version,
          menu: held.menu ? held.menu.version : "new",
          floor: ask.floor,
          mine: ask.mine,
          prep: ask.prep,
          order: ask.order,
        }),
        { cache: "no-store", credentials: "same-origin" },
      );
      if (response.status === 200) {
        const answer = ordersSyncAnswer.parse(await response.json());
        heard(
          answer.floor?.now ??
            answer.mine?.now ??
            answer.prep?.now ??
            answer.order?.now,
        );
        if (answer.mine) tellReady(readsRef.current.mine, answer.mine);
        setReads((was) => ({
          floor: newest(was.floor, answer.floor),
          mine: newest(was.mine, answer.mine),
          prep: newest(was.prep, answer.prep),
          menu: newest(was.menu, answer.menu),
          orders:
            ask.order && answer.order !== undefined
              ? {
                  ...was.orders,
                  [ask.order]:
                    later(was.orders[ask.order], answer.order) ?? null,
                }
              : was.orders,
        }));
        state.failures = 0;
      } else if (response.status === 204) {
        state.failures = 0;
      } else if (response.status === 409) {
        const answer = offShiftAnswer.safeParse(await response.json());
        if (answer.success) setOff(answer.data.off);
        state.failures = 0;
      } else if (response.status === 401 || response.status === 404) {
        // Signed out, or the mode is no longer theirs: the server says where.
        router.refresh();
        state.failures += 1;
      } else {
        state.failures += 1;
      }
    } catch {
      state.failures += 1;
    } finally {
      state.running = false;
      if (state.again) {
        state.again = false;
        void again.current();
      } else if (alive.current) {
        const delay = nextOrdersSyncDelay({
          visible: document.visibilityState === "visible",
          failures: state.failures,
        });
        if (delay !== null) {
          timer.current = setTimeout(() => void again.current(), delay);
        }
      }
    }
  }, [frame, heard, router, tellReady]);
  // The latest sync, for timers and listeners set before the screen drew again.
  const again = useRef(syncOnce);
  again.current = syncOnce;
  const syncNow = useCallback(() => void again.current(), []);

  const want = useCallback<OrdersData["want"]>(
    (what) => {
      wantId.current += 1;
      const id = wantId.current;
      wants.current.set(id, {
        floor: Boolean(what.floor),
        prep: Boolean(what.prep),
        order: what.order ?? null,
      });
      syncNow();
      return () => {
        wants.current.delete(id);
      };
    },
    [syncNow],
  );

  // Visible again, online again: at once.
  useEffect(() => {
    alive.current = true;
    const again = () => {
      if (document.visibilityState === "visible") syncNow();
    };
    document.addEventListener("visibilitychange", again);
    window.addEventListener("online", again);
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", again);
      window.removeEventListener("online", again);
    };
  }, [syncNow]);

  // The drafts this tab kept, and any send still on its way.
  useEffect(() => {
    setStored(readStored(storeKey, frame.userId));
    setLoaded(true);
  }, [storeKey, frame.userId]);
  useEffect(() => {
    if (loaded) writeStored(storeKey, stored);
  }, [loaded, storeKey, stored]);

  const setDraft = useCallback((draft: string, lines: DraftLine[]) => {
    setStored((was) => ({ ...was, drafts: { ...was.drafts, [draft]: lines } }));
  }, []);

  /** Sends one round, trying again while nothing comes back, and settles it. */
  const deliver = useCallback(
    async (
      draft: string,
      body: SendBody,
      lines: DraftLine[],
    ): Promise<SendOutcome> => {
      const text = JSON.stringify(body);
      for (let attempt = 0; ; attempt += 1) {
        let status: number | null = null;
        let json: unknown = null;
        try {
          const response = await fetch(ORDERS_SEND_PATH, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: text,
            keepalive: text.length < SEND_BODY_MAX,
            credentials: "same-origin",
          });
          status = response.status;
          json = await response.json().catch(() => null);
        } catch {
          status = null;
        }
        if (!retriesSend(status)) {
          const parsed = sendAnswer.safeParse(json);
          const outcome: SendOutcome =
            parsed.success && parsed.data.ok
              ? { ok: true, round: parsed.data.round }
              : {
                  ok: false,
                  failure:
                    parsed.success &&
                    !parsed.data.ok &&
                    SEND_FAILURES.has(parsed.data.failure)
                      ? (parsed.data.failure as SendFailure)
                      : failureOf(status),
                  items:
                    parsed.success && !parsed.data.ok ? parsed.data.items : [],
                  order:
                    parsed.success && !parsed.data.ok
                      ? parsed.data.order
                      : null,
                };
          setStored((was) => {
            const { [draft]: _, ...pending } = was.pending;
            if (outcome.ok) return { ...was, pending };
            // Refused: the lines go back to the front of their draft.
            return {
              pending,
              drafts: {
                ...was.drafts,
                [draft]: [...lines, ...(was.drafts[draft] ?? [])],
              },
            };
          });
          if (!outcome.ok) {
            setRefusals((was) => ({
              ...was,
              [draft]: { ...outcome, target: body.target },
            }));
            if (
              !frame.runs &&
              (outcome.failure === "clock" || outcome.failure === "staleShift")
            ) {
              setOff(outcome.failure);
            }
          }
          syncNow();
          return outcome;
        }
        // Left the mode: the send waits in this tab for the next time.
        if (!alive.current) {
          return { ok: false, failure: "failed", items: [], order: null };
        }
        await wait(sendRetryDelay(attempt));
      }
    },
    [syncNow, frame.runs],
  );

  const send = useCallback(
    (draft: string, target: RoundTarget, lines: DraftLine[]) => {
      const body: SendBody = {
        business: frame.business,
        key: newId(),
        target,
        lines: roundLinesOf(lines),
      };
      setRefusals(({ [draft]: _, ...rest }) => rest);
      setStored((was) => ({
        drafts: { ...was.drafts, [draft]: [] },
        pending: { ...was.pending, [draft]: { body, lines } },
      }));
      return deliver(draft, body, lines);
    },
    [deliver, frame.business],
  );

  // A send left on its way when the mode was last open goes again, with its key.
  const resumed = useRef(false);
  useEffect(() => {
    if (!loaded || resumed.current) return;
    resumed.current = true;
    for (const [draft, entry] of Object.entries(stored.pending)) {
      void deliver(draft, entry.body, entry.lines);
    }
  }, [loaded, stored.pending, deliver]);

  const drafts = useMemo(
    () => ({
      get: (draft: string) => stored.drafts[draft] ?? [],
      set: setDraft,
      counts: Object.fromEntries(
        Object.entries(stored.drafts).map(([key, lines]) => [
          key,
          draftCount(lines),
        ]),
      ),
    }),
    [stored.drafts, setDraft],
  );

  const sender = useMemo(
    () => ({
      send,
      pending: (draft: string): PendingSend | null => {
        const entry = stored.pending[draft];
        return entry ? { target: entry.body.target, lines: entry.lines } : null;
      },
      refusal: (draft: string) => refusals[draft] ?? null,
      clearRefusal: (draft: string) =>
        setRefusals(({ [draft]: _, ...rest }) => rest),
    }),
    [send, stored.pending, refusals],
  );

  // The items' counts, as the sync hears them.
  const ready = reads.mine
    ? reads.mine.rounds
        .filter((round) => round.orderStatus === "open")
        .flatMap((round) => round.tickets)
        .filter((ticket) => ticket.status === "ready" && ticket.lines > 0)
        .length
    : undefined;
  useNavCount(appOrdersPaths.mine, ready === undefined ? undefined : ready);
  const soldOut = reads.menu
    ? reads.menu.items.filter((item) => !item.available).length
    : undefined;
  useNavCount(appOrdersPaths.menu, soldOut);

  const data = useMemo(() => ({ reads, seed, want }), [reads, seed, want]);
  const value = useMemo(
    () => ({
      frame,
      paths: appOrdersPaths,
      now,
      off,
      drafts,
      sender,
      actions,
      say,
      syncNow,
      newId,
    }),
    [frame, now, off, drafts, sender, actions, say, syncNow],
  );

  return (
    <OrdersModeContext.Provider value={value}>
      <OrdersDataContext.Provider value={data}>
        {children}
        {toast}
      </OrdersDataContext.Provider>
    </OrdersModeContext.Provider>
  );
}
