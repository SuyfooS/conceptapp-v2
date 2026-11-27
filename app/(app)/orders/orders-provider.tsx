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
} from "@domain/orders";
import type { OutboxRow } from "@domain/orders-outbox";
import {
  laterServerTime,
  nextOrdersSyncDelay,
  nextOrdersSyncQuery,
  type OrdersSyncWant,
  offShiftAnswer,
  ordersSyncAnswer,
  ordersSyncHref,
  ordersSyncPace,
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
  useSyncExternalStore,
} from "react";
import { useSignedInId } from "@/app/release-note";
import { inTurn, writesOnWay } from "./in-turn";
import { keepLostNotice } from "./lost-notice";
import { newId } from "./new-id";
import { OrdersModeContext, useModeToast } from "./orders-mode";
import { usePlaceWords } from "./orders-parts";
import { appOrdersPaths, draftPath } from "./orders-paths";
import type {
  OrdersActions,
  OrdersFrame,
  OrdersSender,
  SendFailure,
  SendRefusal,
  WholeWrite,
} from "./orders-types";
import {
  EMPTY_OWNER,
  type KeptSendRefusal,
  ordersOutbox,
  pendingSends,
  unsentOf,
} from "./outbox";
import { readyMarks } from "./ready-marks";
import { reloadOnRelease } from "./release-writes";
import {
  pendingOfDraft,
  refusalMoved,
  type SendStore,
  storeDraftChanged,
  storeDraftMoved,
  storeMovedBack,
} from "./send-store";
import { wholeOnWayFor, wholeWrites } from "./whole-on-way";

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

/** Two refusals that say the same, whether their screen showed them or not. */
const sameRefusal = (a: SendRefusal, b: SendRefusal) =>
  a.failure === b.failure &&
  a.order === b.order &&
  JSON.stringify(a.items) === JSON.stringify(b.items) &&
  JSON.stringify(a.target) === JSON.stringify(b.target);

/**
 * Where a kept round's screen is: its draft's, or the order a new
 * takeaway's first round opened.
 */
const screenOf = (row: OutboxRow, order: string | null = null) =>
  row.draft === NEW_TAKEAWAY && order
    ? appOrdersPaths.takeaway(order)
    : draftPath(row.draft);

const NEW_TAKEAWAY = draftKey({ takeaway: null });

/**
 * Waiter mode in the app (P4), above every screen of it: the drafts on the
 * phone and the rounds on their way, which live in the page's outbox
 * (outbox.ts, P7) and in the phone's store, for each person in each
 * business, until they are sent or 16 hours untouched; another person's
 * wait unread for them, and a session's end here clears them
 * (orders-storage.ts). The send, through /orders-send with the phone's key
 * and the person's id, tried again with the same key and body at 1, 2, 5,
 * 10 and 30 seconds while nothing comes back or the server failed on its
 * way, whichever screen is on (the outbox keeps sending while the mode is
 * hidden, and from the app's other screens), asking after ten minutes (a
 * round sent so, with no screen waiting for its answer, says on the toast
 * where it went once it lands); the sync, /orders-sync every 15 seconds
 * while visible, every 5 while a round of one's own waits to be ready or on
 * the prep screen (§7.1), from the moment the mode opens (the menu inside
 * it too, for the items' counts, kept on the phone so the mode opens with
 * one), at once when the page comes back, the phone comes online and after
 * each of its own writes; the mode's one toast, which says what of one's own
 * turned ready, whichever screen is on, never what was marked ready on this
 * phone nor what was put back here before the read (ready-marks.ts), and
 * never in the place of a way back still offered; whether the mode reaches
 * the server; and the counts on its items. A taker off a shift finds their
 * screens waiting and their draft kept, until a sync hears the shift began
 * (at the clock station too); someone who runs orders reads and serves, and
 * only their send waits for one.
 *
 * Next keeps the mode in a hidden <Activity> while another part of the app
 * is on screen: its effects go and come back, its state and refs stay. The
 * outbox is the page's, read through useSyncExternalStore, so a mode shown
 * again, or one Next dropped and drew afresh, reads what it holds now; its
 * news comes here only while the mode is on screen, and to the app's banner
 * otherwise (app/(app)/orders-outbox.tsx).
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
  const outbox = ordersOutbox();
  const user = frame.userId;
  const business = frame.business;
  const viewing = frame.viewing;
  /** Who the mode is for now, for what was set up once. */
  const who = useRef({ user, business });
  who.current = { user, business };
  useEffect(() => {
    outbox.start({ user, business, viewing });
  }, [outbox, user, business, viewing]);
  const held = useSyncExternalStore(
    outbox.subscribe,
    () => outbox.snapshot(user, business),
    () => EMPTY_OWNER,
  );
  const stored = held.store;
  /** What the outbox holds now, read as a change is made. */
  const heldNow = useCallback(
    () => outbox.snapshot(who.current.user, who.current.business),
    [outbox],
  );
  const setRefusals = useCallback(
    (
      next: (
        was: Readonly<Record<string, KeptSendRefusal>>,
      ) => Readonly<Record<string, KeptSendRefusal>>,
    ) => outbox.setRefusals(who.current.user, who.current.business, next),
    [outbox],
  );
  /**
   * The refusal each place held of its own as an order moved there, by its
   * draft, until the move's "ביטול" or the order moves on (as the store's
   * `own`): it stays there with the place's own lines.
   */
  const ownRefusals = useRef(new Map<string, KeptSendRefusal | null>());
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
  // Two syncs in a row that reached nothing: the mode says there is no
  // connection, until one answers.
  const [syncDown, setSyncDown] = useState(false);
  const readsRef = useRef(reads);
  readsRef.current = reads;
  const alive = useRef(true);
  const wants = useRef(new Map<number, OrdersSyncWant>());
  const wantId = useRef(0);
  /** The sync's state, and how many of its reads have started. */
  const sync = useRef({
    running: false,
    again: false,
    failures: 0,
    /** Syncs in a row that reached nothing at all. */
    unreached: 0,
    started: 0,
  });
  /**
   * Who waits for a read that started after they asked (`readAfter`), by
   * how many reads had started then.
   */
  const readsAfter = useRef<{ after: number; landed: () => void }[]>([]);
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
  /** The writes on their way, for a close or a move to wait its turn. */
  const [onWay] = useState(writesOnWay);
  /** The latest server time heard, which the clock never goes back from. */
  const heardAt = useRef<number | null>(null);

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
  }, [clock, setRefusals]);

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

  // The menu kept on the phone: the mode opens with it at once, even where
  // a screen's own read gave none, and the sync asks from its version. The
  // newest it holds is kept again as its version moves.
  useEffect(() => {
    let live = true;
    void outbox.menu(user, business).then((menu) => {
      if (live && menu) seed({ menu });
    });
    return () => {
      live = false;
    };
  }, [outbox, user, business, seed]);
  const menuHeld = reads.menu;
  useEffect(() => {
    if (menuHeld && !viewing) outbox.saveMenu(user, business, menuHeld);
  }, [outbox, user, business, viewing, menuHeld]);

  // What turned ready of one's own: one toast for the mode, whichever
  // screen. While a way back is on screen it waits, and everything that
  // turned ready meanwhile is told together once it has gone. What was
  // marked ready on this phone, and not put back, is no news, until a read
  // made after the mark sees it not ready (put back on another phone); nor
  // is what was put back here, in the read of a sync that started before
  // the put-back answered (`read`, the sync's number).
  const tellReady = useCallback(
    (before: MyOrders | null, after: MyOrders, read: number) => {
      marks.seen(read, after);
      const news = readyNews(before, after, marks.quietFor(read));
      if (news.length === 0) return;
      const fresh = new Set(news.map((item) => item.ticket));
      untold.current = [
        ...news,
        ...untold.current.filter((item) => !fresh.has(item.ticket)),
      ];
      tell("ready", () => {
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
    state.started += 1;
    const run = state.started;
    // Whether the server answered what it holds now (nothing newer is an
    // answer too, and so is off a shift): who waited for a read lands.
    let landed = false;
    const read = marks.started();
    if (timer.current) clearTimeout(timer.current);
    const held = readsRef.current;
    const wasOff = offRef.current !== null;
    const asked = [...wants.current.values()];
    const query = nextOrdersSyncQuery({
      business: frame.business,
      takes: frame.takes,
      viewing: frame.viewing,
      prepares: frame.prepares.length > 0 || frame.runs,
      off: wasOff,
      // What of one's own turned ready is shown only with the mode on screen
      // in a visible page: a sync after it was left, or behind a locked
      // phone, reads no "מוכן" line, and the push goes (P8b).
      shown: alive.current && document.visibilityState === "visible",
      wants: asked,
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
      // Anything came back: the server is reached.
      state.unreached = 0;
      setSyncDown(false);
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
          // A round still kept here among one's own went (a last send on
          // leaving that landed): it settles as sent.
          outbox.seenSent(frame.userId, frame.business, answer.mine);
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
        landed = true;
      } else if (response.status === 204) {
        state.failures = 0;
        landed = true;
      } else if (response.status === 409) {
        const answer = offShiftAnswer.safeParse(await response.json());
        if (answer.success) {
          clockRef.current = answer.data.off;
          offRef.current = frame.runs ? null : answer.data.off;
          setClock(answer.data.off);
        }
        state.failures = 0;
        landed = true;
      } else if (response.status === 401 || response.status === 404) {
        // Signed out, or the mode is no longer theirs: the server says where.
        routerRef.current.refresh();
        state.failures += 1;
      } else {
        state.failures += 1;
      }
    } catch {
      state.failures += 1;
      state.unreached += 1;
      if (state.unreached >= 2) setSyncDown(true);
    } finally {
      state.running = false;
      // Those who asked before this read started have it now, its reads set.
      if (landed) {
        const waiting = readsAfter.current;
        readsAfter.current = waiting.filter((one) => one.after >= run);
        for (const one of waiting) if (one.after < run) one.landed();
      }
      if (state.again) {
        state.again = false;
        void again.current();
      } else if (alive.current) {
        const delay = nextOrdersSyncDelay({
          visible: document.visibilityState === "visible",
          failures: state.failures,
          pace: ordersSyncPace({
            mine: newest(readsRef.current.mine, heardMine.current),
            prep: query.prep,
          }),
        });
        if (delay !== null) {
          timer.current = setTimeout(() => void again.current(), delay);
        }
      }
    }
  }, [frame, heard, marks, outbox, tellReady]);
  // The latest sync, for timers and listeners set before the screen drew again.
  const again = useRef(syncOnce);
  again.current = syncOnce;
  const syncNow = useCallback(() => void again.current(), []);
  /**
   * Asks the server again now, and resolves once a read that started after
   * the call has landed: one going already read too early, so the next.
   */
  const readAfter = useCallback(
    () =>
      new Promise<void>((landed) => {
        readsAfter.current.push({ after: sync.current.started, landed });
        syncNow();
      }),
    [syncNow],
  );

  /**
   * The writes of an order whole on their way, whichever screen sent them:
   * a send to them waits on every screen, not only on the one that wrote,
   * and each stays on its way once written until a read made after it has
   * landed, as the screens show the order as it was until then. None goes
   * while a round of a draft it names is on its way, read as the outbox has
   * it now (a way back pressed seconds after its screen drew), nor while
   * another of its order has not answered.
   */
  const [wholeGoing, setWholeGoing] = useState<readonly WholeWrite[]>([]);
  const [wholeWriter] = useState(() =>
    wholeWrites(
      (draft) => pendingOfDraft(heldNow().store.pending, draft).length,
      setWholeGoing,
      readAfter,
    ),
  );

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
   * Changes the drafts and the rounds from what they hold now, in the
   * outbox: kept on the phone at once, shown or hidden.
   */
  const change = useCallback(
    (next: (was: SendStore) => SendStore) =>
      outbox.change(who.current.user, who.current.business, next),
    [outbox],
  );

  /**
   * A round sent with no screen waiting for its answer landed (the mode was
   * left, or the app opened again, while it was on its way), or one that
   * went as the app closed was found among one's own: the toast says where
   * it went, with the way there, never in the place of a way back still
   * offered, and in its own turn beside the ready news.
   */
  const tellSent = useCallback(
    (row: OutboxRow, order: string, where: OutboxRow["where"]) => {
      const place = placeTitle(where);
      tell(`sent:${row.key}`, () =>
        say(t("sent", { place }), { open: screenOf(row, order) }),
      );
    },
    [placeTitle, say, t, tell],
  );

  // The outbox's news while the mode is on screen: sent, refused or asking
  // with no screen waiting for it, as news on the mode's toast; rounds taken
  // off the phone (signed out, no longer a member), kept for a notice where
  // the page lands; another person's cookie, the frame drawn again.
  useEffect(
    () =>
      outbox.screen((event) => {
        switch (event.kind) {
          case "sent":
            if (!event.awaited) tellSent(event.row, event.order, event.where);
            return;
          case "refused": {
            if (shiftRefusal(event.refusal.failure)) {
              const failure = event.refusal.failure as "clock" | "staleShift";
              clockRef.current = failure;
              setClock(failure);
            }
            if (event.awaited) return;
            const place = placeTitle(event.row.where);
            tell(`refused:${event.row.draft}`, () =>
              say(t("refusedAway", { place }), {
                open: screenOf(event.row),
              }),
            );
            return;
          }
          case "asks": {
            const [first] = event.rows;
            if (!first) return;
            tell("asks", () =>
              say(
                event.rows.length === 1
                  ? t("asks", { place: placeTitle(first.where) })
                  : t("asksMany", { count: event.rows.length }),
                {
                  open:
                    event.rows.length === 1
                      ? screenOf(first)
                      : appOrdersPaths.floor,
                },
              ),
            );
            return;
          }
          case "lost":
            keepLostNotice(event.rows, event.why, placeTitle);
            routerRef.current.refresh();
            return;
          default:
            routerRef.current.refresh();
        }
      }),
    [outbox, placeTitle, say, t, tell, tellSent],
  );

  const send = useCallback<OrdersSender["send"]>(
    (draft, target, lines, where, options = {}) =>
      outbox
        .send(
          who.current.user,
          who.current.business,
          {
            draft,
            body: {
              business: who.current.business,
              user: who.current.user,
              key: newId(),
              target,
              lines: roundLinesOf(lines),
            },
            lines,
            where,
          },
          { awaited: true, onQueued: options.onQueued },
        )
        .then((outcome) => {
          // Off a shift: a taker's screens wait, and anyone's send asks for
          // one now.
          if (!outcome.ok && shiftRefusal(outcome.failure)) {
            const failure = outcome.failure as "clock" | "staleShift";
            clockRef.current = failure;
            setClock(failure);
          }
          syncNow();
          return outcome;
        }),
    [outbox, syncNow],
  );

  // From the moment the mode opens, whatever its screen (the menu's too,
  // which wants nothing of its own: the items' counts still move); again at
  // once when the page is visible again or the phone online (the outbox
  // sends what waits then). Waiting for a shift, the frame is read again
  // then too: the person may have clocked in at the station or on another
  // phone.
  useEffect(() => {
    alive.current = true;
    const back = () => {
      if (document.visibilityState !== "visible") return;
      syncNow();
      if (clockRef.current !== null) routerRef.current.refresh();
    };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("online", back);
    // A screen that wants something started the first sync already (its
    // effects run before these).
    if (wants.current.size === 0) syncNow();
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("online", back);
    };
  }, [syncNow]);

  const update = useCallback<
    (draft: string, next: (lines: DraftLine[]) => DraftLine[]) => void
  >(
    (draft, next) => change((was) => storeDraftChanged(was, draft, next)),
    [change],
  );

  // What the new place's draft and its refusal held as the order came, read
  // as the outbox has them now, are its own: they stay there on the move's
  // undo. A refusal goes with the lines it is about.
  const move = useCallback(
    (from: string, to: string) => {
      if (from === to) return;
      ownRefusals.current.delete(from);
      ownRefusals.current.set(to, heldNow().refusals[to] ?? null);
      const was = heldNow().store.drafts;
      change((held) => storeDraftMoved(held, from, to));
      if (heldNow().store.drafts !== was) {
        setRefusals((refusals) => refusalMoved(refusals, from, to));
      }
    },
    [change, heldNow, setRefusals],
  );

  // The move's undo: all but the place's own goes back, its refusal too
  // unless it is the place's own (shown on its screen since, or not).
  const moveBack = useCallback(
    (from: string, to: string) => {
      const saved = ownRefusals.current.get(from) ?? null;
      ownRefusals.current.delete(from);
      const current = heldNow().refusals[from];
      const own =
        saved && current && sameRefusal(saved, current) ? current : saved;
      const was = heldNow().store.drafts;
      change((held) => storeMovedBack(held, from, to, newId));
      if (heldNow().store.drafts !== was) {
        setRefusals((refusals) => refusalMoved(refusals, from, to, own));
      }
    },
    [change, heldNow, setRefusals],
  );

  const wholeOnWay = useCallback(
    (order: string | null, draft: string) =>
      wholeOnWayFor(wholeGoing, order, draft),
    [wholeGoing],
  );

  const drafts = useMemo(
    () => ({
      get: (draft: string) => stored.drafts[draft] ?? [],
      update,
      move,
      moveBack,
      counts: Object.fromEntries(
        Object.entries(stored.drafts).map(([key, lines]) => [
          key,
          draftCount(lines),
        ]),
      ),
    }),
    [stored.drafts, update, move, moveBack],
  );

  const unsent = useMemo(() => unsentOf(held), [held]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: each tick of the clock is what moves the age
  const sender = useMemo<OrdersSender>(
    () => ({
      send,
      // How long a round asking hasn't gone, by the phone's clock as it is
      // now, the clock its time sent was kept by: never the last tick's, up
      // to ten seconds behind, so the question names the minutes it has
      // waited as it comes; each tick then draws it again.
      pending: (draft: string) => pendingSends(held, draft, Date.now()),
      answer: (key: string) =>
        outbox.answer(who.current.user, who.current.business, key),
      remove: (key: string) => {
        const row = outbox.remove(who.current.user, who.current.business, key);
        return row ? () => outbox.restore(row) : null;
      },
      unsent,
      refusal: (draft: string) => held.refusals[draft] ?? null,
      clearRefusal: (draft: string) =>
        setRefusals(({ [draft]: _, ...rest }) => rest),
      seeRefusal: (draft: string) =>
        outbox.seeRefusal(who.current.user, who.current.business, draft),
      landed: held.landed,
    }),
    [send, held, now, outbox, unsent, setRefusals],
  );

  // A ticket marked ready here is no news to this phone, until it is put
  // back here and a read made after that has come. A close or a move goes
  // after every write sent before it, from whichever screen: a line's fix
  // sent on leaving the order's screen lands before the till's close. Each
  // pressed on a page from the release before loads the page again, for
  // the person signed in, before its screen says it failed (known issue 37).
  const signedIn = useSignedInId();
  const modeActions = useMemo<OrdersActions>(() => {
    const writes = reloadOnRelease(actions, signedIn);
    return inTurn<OrdersActions>(
      {
        ...writes,
        setReady: async (ticket, ready) => {
          const result = await writes.setReady(ticket, ready);
          if (result.ok) marks.said(ticket, ready);
          return result;
        },
      },
      ["close", "move"],
      onWay,
    );
  }, [actions, signedIn, marks, onWay]);

  // The items' counts, as the sync hears them, and what hasn't gone on the
  // floor's.
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
  const unsentCount = Object.values(unsent).reduce(
    (sum, one) => sum + one.count,
    0,
  );
  useNavCount(appOrdersPaths.floor, unsentCount || undefined);

  const connection: "ok" | "down" =
    !held.online || syncDown || held.retrying.size > 0 ? "down" : "ok";

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
      whole: wholeWriter.run,
      wholeRefusal: wholeWriter.refusal,
      wholeOnWay,
      say,
      tell,
      syncNow,
      connection,
      newId,
    }),
    [
      frame,
      now,
      clock,
      off,
      drafts,
      sender,
      modeActions,
      wholeWriter,
      wholeOnWay,
      say,
      tell,
      syncNow,
      connection,
    ],
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
