"use client";

import {
  type DraftLine,
  draftCount,
  draftKey,
  type ReadyNews,
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
  SentRound,
} from "@domain/orders";
import {
  laterServerTime,
  nextOrdersSyncDelay,
  nextOrdersSyncQuery,
  ORDERS_SEND_PATH,
  type OrdersSyncWant,
  offShiftAnswer,
  ordersSyncAnswer,
  ordersSyncHref,
  retriesSend,
  SEND_BODY_MAX,
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
import { claim, keep, readKept, storeKeyOf } from "./orders-storage";
import type {
  OrdersActions,
  OrdersFrame,
  PendingSend,
  SendFailure,
  SendOutcome,
  SendRefusal,
} from "./orders-types";
import { readyMarks } from "./ready-marks";
import {
  emptySendStore,
  type PendingRound,
  pendingOfDraft,
  type SendStore,
  storeDraftChanged,
  storedFrom,
  storeEmpty,
  storeSent,
  storeSettled,
} from "./send-store";

/** The reads the mode holds, each the newest it saw. */
export type OrdersReads = {
  floor: OrderFloor | null;
  mine: MyOrders | null;
  prep: OrderPrep | null;
  menu: Menu | null;
  /** Orders read whole, by id: null once one is no longer to read. */
  orders: Record<string, OrderDetail | null>;
  /**
   * The version each of `orders` was read at, by id, which the sync asks
   * from: null when it isn't known (the server drew a takeaway's page).
   */
  orderVersions: Record<string, number | null>;
};

type Seed = Partial<Omit<OrdersReads, "orders" | "orderVersions">> & {
  order?: OrderDetail | null;
  /** The version the order was read at, when known; else it is read again. */
  orderVersion?: number | null;
};

type OrdersData = {
  reads: OrdersReads;
  /** A screen's first reads, from the server: kept where newer. */
  seed: (first: Seed) => void;
  /** What a screen asks the sync for while it is on. */
  want: (wants: Partial<OrdersSyncWant>) => () => void;
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
 * An order read again into what the mode holds: the later of the two, and
 * the version it was read at when the new read is the one kept.
 */
function withOrder(
  was: OrdersReads,
  id: string,
  detail: OrderDetail | null,
  version: number | null,
): Pick<OrdersReads, "orders" | "orderVersions"> {
  const kept = later(was.orders[id], detail) ?? null;
  if (kept === was.orders[id] && id in was.orderVersions) {
    return { orders: was.orders, orderVersions: was.orderVersions };
  }
  return {
    orders: { ...was.orders, [id]: kept },
    orderVersions:
      kept === detail
        ? { ...was.orderVersions, [id]: version }
        : was.orderVersions,
  };
}

/**
 * A screen's data (waiter mode P4): what the server drew it with, or what
 * the mode's sync heard since, whichever is newer; and the sync asks for it
 * while the screen is on.
 */
export function useOrdersRead(
  first: Partial<Omit<OrdersReads, "orders" | "orderVersions">> & {
    order?: {
      id: string;
      detail: OrderDetail | null | undefined;
      /** The version the server read it at, when known. */
      version?: number | null;
    } | null;
  },
  wants: Partial<OrdersSyncWant> = {},
): OrdersReads & { order: OrderDetail | null | undefined } {
  const data = useContext(OrdersDataContext);
  if (!data) throw new Error("useOrdersRead outside the mode");
  const { seed, want, reads } = data;
  const orderId = first.order?.id ?? null;
  const detail = first.order?.detail;
  const version = first.order?.version ?? null;
  // Each server drawing once: its reads are the same objects until the next.
  useEffect(() => {
    seed({
      floor: first.floor,
      mine: first.mine,
      prep: first.prep,
      menu: first.menu,
      ...(detail ? { order: detail, orderVersion: version } : {}),
    });
  }, [seed, first.floor, first.mine, first.prep, first.menu, detail, version]);
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
    orderVersions: reads.orderVersions,
    order: orderId
      ? later(first.order?.detail, reads.orders[orderId])
      : undefined,
  };
}

/** What this tab keeps for the person in the business, if anything. */
const readStored = (key: string, user: string): SendStore =>
  storedFrom(readKept(key, user));

const writeStored = (key: string, stored: SendStore, writer: object) =>
  keep(key, storeEmpty(stored) ? null : JSON.stringify(stored), writer);

const NEW_TAKEAWAY = draftKey({ takeaway: null });

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

const shiftRefusal = (failure: SendFailure) =>
  failure === "clock" || failure === "staleShift";

/** Whether a ticket of one's own is still ready to serve in this read. */
const stillReady = (mine: MyOrders | null, ticket: string) =>
  !mine ||
  mine.rounds.some(
    (round) =>
      round.orderStatus === "open" &&
      round.tickets.some(
        (t) => t.id === ticket && t.status === "ready" && t.lines > 0,
      ),
  );

/**
 * Waiter mode in the app (P4), above every screen of it: the drafts on the
 * phone, kept in this tab (sessionStorage, until the outbox of P7) and gone
 * with it, another person's removed when the next opens the mode, and all
 * of them as a session ends here (orders-storage.ts); the send, through
 * /orders-send with the phone's key, retried with the same key and body at
 * 1, 2, 5, 10 and 30 seconds while nothing comes back or the server failed
 * on its way, each round kept by its own key, and tried again whenever the
 * mode is on screen again, the page visible or the phone online while one
 * waits with no try going (a round sent so, with no screen waiting for its
 * answer, says on the toast where it went once it lands); the sync,
 * /orders-sync every 15 seconds while visible, from the moment the mode
 * opens (the menu inside it too, for the items' counts), at once when the
 * page comes back, the phone comes online and after each of its own writes;
 * the mode's one toast, which says what of one's own turned ready, whichever
 * screen is on, never what was marked ready on this phone nor what was put
 * back here before the read (ready-marks.ts), and never in the place of a
 * way back still offered; and the counts on its items. A taker off a shift
 * finds their screens waiting and their draft kept, until a sync hears the
 * shift began (at the clock station too); someone who runs orders reads and
 * serves, and only their send waits for one.
 *
 * Next keeps the mode in a hidden <Activity> while another part of the app
 * is on screen: its effects go and come back, its state and refs stay. So
 * the tab's store is read once for each person and business, and written as
 * it changes, shown or hidden, until a newer mode has read it (one Next
 * dropped from its cache still hears the answers of its sends).
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
  const routerRef = useRef(router);
  routerRef.current = router;
  const t = useTranslations("app.orders.toast");
  const { placeTitle } = usePlaceWords();
  const { say, tell, toast } = useModeToast();
  const storeKey = storeKeyOf(frame.userId, frame.business);
  /** This mode, as the writer of the tab's entry it read (orders-storage.ts). */
  const [writer] = useState(() => ({}));
  const [stored, setStoredState] = useState<SendStore>(emptySendStore);
  /** The store as it is now, which every change starts from. */
  const storedRef = useRef(stored);
  /** The key whose kept store this holds: null until it is read. */
  const readFrom = useRef<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refusals, setRefusals] = useState<Record<string, SendRefusal>>({});
  /**
   * The latest round of a new takeaway that landed, and the order it opened:
   * the screen that showed it on its way goes to that order.
   */
  const [landed, setLanded] = useState<{ key: string; order: string } | null>(
    null,
  );
  // Rounds of which an attempt failed, by key, and whether the phone is
  // online: until either, a round on its way is simply being sent.
  const [retrying, setRetrying] = useState<ReadonlySet<string>>(new Set());
  const [online, setOnline] = useState(true);
  // Why a send waits for a shift: the frame's, then what was heard since. A
  // taker off a shift reads nothing of the floor; one who runs orders reads
  // all of it, and only the send waits for a shift.
  const [clock, setClock] = useState(frame.clock);
  const off = frame.runs ? null : clock;
  const [reads, setReads] = useState<OrdersReads>({
    floor: null,
    mine: null,
    prep: null,
    menu: null,
    orders: {},
    orderVersions: {},
  });
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const readsRef = useRef(reads);
  readsRef.current = reads;
  const alive = useRef(true);
  const wants = useRef(new Map<number, OrdersSyncWant>());
  const wantId = useRef(0);
  const sync = useRef({ running: false, again: false, failures: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offRef = useRef(off);
  offRef.current = off;
  const clockRef = useRef(clock);
  clockRef.current = clock;
  /** The newest of one's own rounds the sync heard, for news told later. */
  const heardMine = useRef<MyOrders | null>(null);
  /** What turned ready and wasn't told yet: a way back was on screen. */
  const untold = useRef<ReadyNews[]>([]);
  /**
   * Tickets marked ready on this phone (their "מוכן" was its own toast), and
   * those put back here, until a read made after the put-back.
   */
  const [marks] = useState(readyMarks);
  /** The latest server time heard, which the clock never goes back from. */
  const heardAt = useRef<number | null>(null);
  /** Each round with a send trying it, by its key: never two for one. */
  const delivering = useRef(new Map<string, Promise<SendOutcome>>());

  useEffect(() => {
    setClock(frame.clock);
  }, [frame.clock]);
  // On a shift again: a refusal that asked for one says nothing more.
  useEffect(() => {
    if (clock !== null) return;
    setRefusals((was) => {
      const kept = Object.entries(was).filter(
        ([, refusal]) => !shiftRefusal(refusal.failure),
      );
      return kept.length === Object.keys(was).length
        ? was
        : Object.fromEntries(kept);
    });
  }, [clock]);

  // The server's clock, from the latest read that says it: a screen drawn
  // again with older data never sets it back.
  const heard = useCallback((serverNow: string | undefined) => {
    const at = laterServerTime(heardAt.current, serverNow);
    if (at === null) return;
    heardAt.current = at;
    setOffset(at - Date.now());
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
        const order = first.order;
        const next = {
          floor: newest(was.floor, first.floor),
          mine: newest(was.mine, first.mine),
          prep: newest(was.prep, first.prep),
          menu: newest(was.menu, first.menu),
          ...(order
            ? withOrder(was, order.id, order, first.orderVersion ?? null)
            : { orders: was.orders, orderVersions: was.orderVersions }),
        };
        // Nothing newer: the same state, so nothing draws again.
        const same =
          next.floor === was.floor &&
          next.mine === was.mine &&
          next.prep === was.prep &&
          next.menu === was.menu &&
          next.orders === was.orders &&
          next.orderVersions === was.orderVersions;
        return same ? was : next;
      });
    },
    [heard],
  );

  // What turned ready of one's own: one toast for the mode, whichever
  // screen. While a way back is on screen it waits, and everything that
  // turned ready meanwhile is told together once it has gone. What was
  // marked ready on this phone, and not put back, is no news; nor is what
  // was put back here, in the read of a sync that started before the
  // put-back answered (`read`, the sync's number).
  const tellReady = useCallback(
    (before: MyOrders | null, after: MyOrders, read: number) => {
      const news = readyNews(before, after, marks.quietFor(read));
      if (news.length === 0) return;
      const fresh = new Set(news.map((item) => item.ticket));
      untold.current = [
        ...news,
        ...untold.current.filter((item) => !fresh.has(item.ticket)),
      ];
      tell(() => {
        const due = untold.current.filter(
          (item) =>
            stillReady(heardMine.current, item.ticket) &&
            !marks.quiet(item.ticket),
        );
        untold.current = [];
        const first = due[0];
        if (!first) return;
        const place = placeTitle({
          placeName: first.placeName,
          takeaway: first.takeaway,
        });
        const department = frame.departments[first.department] ?? "";
        say(
          due.length === 1
            ? t("ready", { place, department })
            : t("readyMany", { count: due.length }),
          { open: appOrdersPaths.takeaway(first.order) },
        );
      });
    },
    [frame.departments, marks, placeTitle, say, t, tell],
  );

  const syncOnce = useCallback(async () => {
    const state = sync.current;
    if (state.running) {
      state.again = true;
      return;
    }
    state.running = true;
    const read = marks.started();
    if (timer.current) clearTimeout(timer.current);
    const held = readsRef.current;
    const wasOff = offRef.current !== null;
    const query = nextOrdersSyncQuery({
      business: frame.business,
      takes: frame.takes,
      viewing: frame.viewing,
      prepares: frame.prepares.length > 0 || frame.runs,
      off: wasOff,
      wants: [...wants.current.values()],
      held: {
        floor: held.floor,
        mine: held.mine,
        prep: held.prep,
        menu: held.menu,
        orders: held.orderVersions,
      },
    });
    try {
      const response = await fetch(ordersSyncHref(query), {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (response.status === 200) {
        const answer = ordersSyncAnswer.parse(await response.json());
        heard(
          answer.floor?.now ??
            answer.mine?.now ??
            answer.prep?.now ??
            answer.order?.now,
        );
        if (answer.mine) {
          heardMine.current = newest(heardMine.current, answer.mine);
          tellReady(readsRef.current.mine, answer.mine, read);
        }
        const order = query.order;
        setReads((was) => ({
          floor: newest(was.floor, answer.floor),
          mine: newest(was.mine, answer.mine),
          prep: newest(was.prep, answer.prep),
          menu: newest(was.menu, answer.menu),
          // The order, read after the rest: at least as new as the version
          // the answer says.
          ...(order && answer.order !== undefined
            ? withOrder(was, order, answer.order, answer.version)
            : { orders: was.orders, orderVersions: was.orderVersions }),
        }));
        // Off a shift, one's own rounds came back: the shift began, at the
        // clock station or on another phone. The floor and the order now.
        if (wasOff && answer.mine) {
          offRef.current = null;
          clockRef.current = null;
          setClock(null);
          state.again = true;
        }
        state.failures = 0;
      } else if (response.status === 204) {
        state.failures = 0;
      } else if (response.status === 409) {
        const answer = offShiftAnswer.safeParse(await response.json());
        if (answer.success) {
          clockRef.current = answer.data.off;
          offRef.current = frame.runs ? null : answer.data.off;
          setClock(answer.data.off);
        }
        state.failures = 0;
      } else if (response.status === 401 || response.status === 404) {
        // Signed out, or the mode is no longer theirs: the server says where.
        routerRef.current.refresh();
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
  }, [frame, heard, marks, tellReady]);
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

  /**
   * Changes the store from what it is now, and keeps it in the tab at once:
   * a mode hidden in an <Activity> runs no effects, and the tab may close
   * from another part of the app. Once a newer mode has read the tab's
   * entry (this one was dropped from Next's cache with a send on its way),
   * the change stays in this one's memory.
   */
  const change = useCallback(
    (next: (was: SendStore) => SendStore) => {
      const was = storedRef.current;
      const value = next(was);
      if (value === was) return;
      storedRef.current = value;
      setStoredState(value);
      if (readFrom.current !== null) {
        writeStored(readFrom.current, value, writer);
      }
    },
    [writer],
  );

  // The drafts this tab kept, and any send still on its way: read once for
  // each person and business, and from then on written by this mode alone.
  // The mode shown again holds what is newer.
  useEffect(() => {
    if (readFrom.current === storeKey) return;
    claim(storeKey, writer);
    const kept = readStored(storeKey, frame.userId);
    readFrom.current = storeKey;
    storedRef.current = kept;
    setStoredState(kept);
    setLoaded(true);
  }, [storeKey, frame.userId, writer]);

  /**
   * A round sent again with no screen waiting for its answer (`resume`: the
   * mode was left, or the tab read again, while it was on its way) landed:
   * the toast says where it went, with the way there, and never in the place
   * of a way back still offered.
   */
  const tellSent = useCallback(
    (sent: SentRound) => {
      const name =
        sent.place === null
          ? null
          : (readsRef.current.menu?.places.find((p) => p.id === sent.place)
              ?.name ?? null);
      // A place no longer on the menu: its order says it.
      if (sent.place !== null && name === null) return;
      const place = placeTitle({ placeName: name, takeaway: sent.takeaway });
      const open =
        sent.place === null
          ? appOrdersPaths.takeaway(sent.order)
          : appOrdersPaths.place(sent.place);
      tell(() => say(t("sent", { place }), { open }));
    },
    [placeTitle, say, t, tell],
  );

  /**
   * Sends one round, trying again while nothing comes back, and settles it.
   * `awaited`: a screen waits for its answer (the send), or none does (the
   * round goes again, `resume`).
   */
  const deliverOnce = useCallback(
    async (round: PendingRound, awaited: boolean): Promise<SendOutcome> => {
      const { draft, body } = round;
      const text = JSON.stringify(body);
      const settled = () =>
        setRetrying((was) => {
          if (!was.has(body.key)) return was;
          const next = new Set(was);
          next.delete(body.key);
          return next;
        });
      try {
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
                      parsed.success && !parsed.data.ok
                        ? parsed.data.items
                        : [],
                    order:
                      parsed.success && !parsed.data.ok
                        ? parsed.data.order
                        : null,
                  };
            // Only this round settles: another of the same draft keeps its
            // place. Refused, its lines go back to the front of their draft;
            // sent as a new takeaway's first, what was added meanwhile is
            // that order's.
            change((was) =>
              storeSettled(
                was,
                round,
                outcome.ok
                  ? { sent: true, order: outcome.round.order }
                  : { sent: false },
              ),
            );
            settled();
            if (outcome.ok) {
              // A new takeaway's first round opened its order: the screen
              // that showed it on its way goes there.
              if (round.draft === NEW_TAKEAWAY) {
                setLanded({ key: body.key, order: outcome.round.order });
              }
              if (!awaited) tellSent(outcome.round);
            } else {
              setRefusals((was) => ({
                ...was,
                [draft]: { ...outcome, target: body.target },
              }));
              // Off a shift: a taker's screens wait, and anyone's send asks
              // for one now.
              if (shiftRefusal(outcome.failure)) {
                const failure = outcome.failure as "clock" | "staleShift";
                clockRef.current = failure;
                setClock(failure);
              }
            }
            syncNow();
            return outcome;
          }
          // It didn't go: it says so, and waits for its next try.
          if (alive.current) {
            setRetrying((was) =>
              was.has(body.key) ? was : new Set(was).add(body.key),
            );
            await wait(sendRetryDelay(attempt));
          }
          // Left the mode, before or while it waited: the send waits in this
          // tab, and goes again when the mode is on screen again (`resume`).
          if (!alive.current) {
            settled();
            return { ok: false, failure: "failed", items: [], order: null };
          }
        }
      } finally {
        delivering.current.delete(body.key);
      }
    },
    [change, syncNow, tellSent],
  );

  /** A round's send: the one trying it already, or a new one. */
  const deliver = useCallback(
    (round: PendingRound, awaited: boolean): Promise<SendOutcome> => {
      const running = delivering.current.get(round.body.key);
      if (running) return running;
      const trying = deliverOnce(round, awaited);
      delivering.current.set(round.body.key, trying);
      return trying;
    },
    [deliverOnce],
  );

  const send = useCallback(
    (draft: string, target: RoundTarget, lines: DraftLine[]) => {
      const round: PendingRound = {
        draft,
        body: {
          business: frame.business,
          key: newId(),
          target,
          lines: roundLinesOf(lines),
        },
        lines,
      };
      setRefusals(({ [draft]: _, ...rest }) => rest);
      // Only the lines sent leave the draft: any past a round's 40 stay.
      change((was) => storeSent(was, round));
      return deliver(round, true);
    },
    [change, deliver, frame.business],
  );

  /**
   * Every round on its way with no send trying it goes again, with its key:
   * no screen waits for its answer now.
   */
  const resume = useCallback(() => {
    if (readFrom.current === null) return;
    for (const round of Object.values(storedRef.current.pending)) {
      void deliver(round, false);
    }
  }, [deliver]);

  // From the moment the mode opens, whatever its screen (the menu's too,
  // which wants nothing of its own: the items' counts still move); again at
  // once when the page is visible again or the phone online, and any send
  // left waiting goes again then. Waiting for a shift, the frame is read
  // again then too: the person may have clocked in at the station or on
  // another phone.
  useEffect(() => {
    alive.current = true;
    setOnline(navigator.onLine);
    const again = () => {
      if (document.visibilityState !== "visible") return;
      syncNow();
      resume();
      if (clockRef.current !== null) routerRef.current.refresh();
    };
    const offline = () => setOnline(false);
    const backOnline = () => {
      setOnline(true);
      again();
    };
    document.addEventListener("visibilitychange", again);
    window.addEventListener("online", backOnline);
    window.addEventListener("offline", offline);
    // A screen that wants something started the first sync already (its
    // effects run before these).
    if (wants.current.size === 0) syncNow();
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", again);
      window.removeEventListener("online", backOnline);
      window.removeEventListener("offline", offline);
    };
  }, [syncNow, resume]);

  // A send left on its way goes again, with its key: when the mode opens or
  // is on screen again (its effects come back with it), and as rounds come.
  // biome-ignore lint/correctness/useExhaustiveDependencies: each change to the rounds on their way checks again
  useEffect(() => {
    if (loaded) resume();
  }, [loaded, stored.pending, resume]);

  const update = useCallback<
    (draft: string, next: (lines: DraftLine[]) => DraftLine[]) => void
  >(
    (draft, next) => change((was) => storeDraftChanged(was, draft, next)),
    [change],
  );

  const drafts = useMemo(
    () => ({
      get: (draft: string) => stored.drafts[draft] ?? [],
      update,
      counts: Object.fromEntries(
        Object.entries(stored.drafts).map(([key, lines]) => [
          key,
          draftCount(lines),
        ]),
      ),
    }),
    [stored.drafts, update],
  );

  const sender = useMemo(
    () => ({
      send,
      pending: (draft: string): PendingSend[] =>
        pendingOfDraft(stored.pending, draft).map((round) => ({
          key: round.body.key,
          target: round.body.target,
          lines: round.lines,
          waiting: !online || retrying.has(round.body.key),
        })),
      refusal: (draft: string) => refusals[draft] ?? null,
      clearRefusal: (draft: string) =>
        setRefusals(({ [draft]: _, ...rest }) => rest),
      landed,
    }),
    [send, stored.pending, refusals, online, retrying, landed],
  );

  // A ticket marked ready here is no news to this phone, until it is put
  // back here and a read made after that has come.
  const modeActions = useMemo<OrdersActions>(
    () => ({
      ...actions,
      setReady: async (ticket, ready) => {
        const result = await actions.setReady(ticket, ready);
        if (result.ok) marks.said(ticket, ready);
        return result;
      },
    }),
    [actions, marks],
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
      clock,
      off,
      drafts,
      sender,
      actions: modeActions,
      say,
      syncNow,
      newId,
    }),
    [frame, now, clock, off, drafts, sender, modeActions, say, syncNow],
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
