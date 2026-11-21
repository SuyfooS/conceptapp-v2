import { draftKey } from "@domain/order-screens";
import type { Menu } from "@domain/order-taking";
import type { MyOrders } from "@domain/orders";
import {
  askAge,
  draftRecordSchema,
  keepsRecord,
  menuRecordSchema,
  type OutboxRow,
  type OutboxSession,
  type OutboxWhere,
  outboxRowSchema,
  rowTouched,
  rowTurn,
  sendVerdict,
  sentAlready,
} from "@domain/orders-outbox";
import {
  ORDERS_SEND_PATH,
  ordersSyncAnswer,
  ordersSyncHref,
  SEND_BODY_MAX,
  type SendBody,
  sendRetryDelay,
} from "@domain/orders-sync";
import {
  memoryOrdersDb,
  ORDERS_DB,
  type OrdersDb,
  openOrdersDb,
  type StoreName,
} from "./orders-db";
import { forgetTabEntries, ordersClosed, ordersOnPage } from "./orders-storage";
import type {
  PendingSend,
  SendFailure,
  SendOutcome,
  SendRefusal,
} from "./orders-types";
import {
  emptySendStore,
  type PendingRound,
  pendingOfDraft,
  type SendStore,
  storeSent,
  storeSettled,
} from "./send-store";

/*
 * Waiter mode's outbox (P7): one per page, outside React, the only writer of
 * the drafts, the rounds on their way, their refusals and the menu kept on
 * the phone (orders-db.ts), in memory and in IndexedDB. The mode's provider
 * reads it through useSyncExternalStore, so a mode Next hid in an
 * <Activity>, or dropped and drew again, reads the same; and it keeps
 * sending whichever screen is on, from the moment the app opens
 * (app/(app)/orders-outbox.tsx).
 *
 * A round goes at once, and again at 1, 2, 5, 10 and 30 seconds, then every
 * 30, with the same key and body, woken early when the phone comes online
 * or the page is visible again, and once more with keepalive as the page
 * hides. It shows "עוד לא נשלח" only once it is written to the disk
 * (`kept`). After ten minutes it stops and asks, once it has checked one's
 * own rounds (a last send on leaving that landed is never asked about). It
 * goes only as its own person in its own business, never while viewing:
 * another person's waits on the phone, unread, until they are back. A
 * refusal puts its lines back at the front of their draft, with the reason,
 * in one transaction with the round's settling, so two tabs that both sent
 * it put them back once. Signed out (401) or no longer a member, that
 * person's rounds and menu go, with a notice; another person's cookie (409
 * `person`) holds them in this page. The rules are @domain/orders-outbox's,
 * the tests outbox.test.ts's, over the fake store, fetch and timers.
 */

/**
 * A draft's refusal as the outbox keeps it: where its round went, and
 * whether its screen showed it.
 */
export type KeptSendRefusal = SendRefusal & {
  where?: OutboxWhere;
  seen: boolean;
};

/** What one person holds in one business, as the screens read it. */
export type OwnerState = {
  /** Read from the phone's store: until then, nothing is known. */
  loaded: boolean;
  online: boolean;
  store: SendStore;
  refusals: Readonly<Record<string, KeptSendRefusal>>;
  /** Rounds written to the disk: only those say "עוד לא נשלח". */
  kept: ReadonlySet<string>;
  /** Rounds of which an attempt failed, tried again. */
  retrying: ReadonlySet<string>;
  /** Rounds that stopped after ten minutes, and ask. */
  asking: ReadonlySet<string>;
  /**
   * The latest round of a new takeaway that landed, and the order it
   * opened: the screen that showed it on its way goes there.
   */
  landed: { key: string; order: string } | null;
};

const NONE: ReadonlySet<string> = new Set();

/** Before the outbox has read anything, and on the server. */
export const EMPTY_OWNER: OwnerState = {
  loaded: false,
  online: true,
  store: emptySendStore,
  refusals: {},
  kept: NONE,
  retrying: NONE,
  asking: NONE,
  landed: null,
};

/** What happened to rounds with no screen waiting for it, for the toast or the banner. */
export type OutboxEvent =
  | {
      kind: "sent";
      user: string;
      business: string;
      row: OutboxRow;
      order: string;
      /** Where it went: its place, or the takeaway's number it opened. */
      where: OutboxWhere;
      /** A screen waited for its answer, and says it. */
      awaited: boolean;
    }
  | {
      kind: "refused";
      user: string;
      business: string;
      row: OutboxRow;
      refusal: KeptSendRefusal;
      awaited: boolean;
    }
  | { kind: "asks"; user: string; business: string; rows: OutboxRow[] }
  | {
      kind: "lost";
      user: string;
      why: "signedOut" | "notMember";
      rows: OutboxRow[];
    }
  | { kind: "person"; user: string };

export type OutboxListener = (event: OutboxEvent) => void;

/** A message between tabs: this person's records in this business changed. */
type OwnerMessage = { user: string; business: string };

export type OutboxDeps = {
  /** The phone's store; one that fails to open falls back to memory. */
  db: () => Promise<OrdersDb>;
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  now: () => number;
  setTimeout: (run: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
  online: () => boolean;
  /** The other tabs (BroadcastChannel), where there are any. */
  channel?: {
    post: (message: OwnerMessage) => void;
    listen: (hear: (message: unknown) => void) => void;
  };
  /** A session ended here: nothing more is written or sent (orders-storage.ts). */
  closed?: () => boolean;
};

/** The words a screen shows for a send its outbox gave up on (`deliver` left). */
const NEUTRAL: SendOutcome = {
  ok: false,
  failure: "failed",
  items: [],
  order: null,
};

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

/** A refusal's reason as the screens say it: one they don't know is a failure. */
export const sendFailureOf = (failure: string): SendFailure =>
  SEND_FAILURES.has(failure) ? (failure as SendFailure) : "failed";

const NEW_TAKEAWAY = draftKey({ takeaway: null });

const norm = (id: string) => id.toLowerCase();

/** A round on its way as the screens show it: being sent, waiting, or asking. */
export function pendingSends(
  state: OwnerState,
  draft: string,
  now: number,
): PendingSend[] {
  return pendingOfDraft(state.store.pending, draft).map((round) => {
    const key = round.body.key;
    const asking = state.asking.has(key);
    const waiting =
      state.kept.has(key) && (!state.online || state.retrying.has(key));
    return {
      key,
      target: round.body.target,
      lines: round.lines,
      state: asking ? "ask" : waiting ? "waiting" : "sending",
      age: asking ? askAge({ queuedAt: round.queuedAt ?? now }, now) : null,
    };
  });
}

/** What hasn't gone, by draft: rounds waiting for a connection or asking. */
export function unsentOf(
  state: OwnerState,
): Record<string, { count: number; asks: number }> {
  const out: Record<string, { count: number; asks: number }> = {};
  for (const round of Object.values(state.store.pending)) {
    const key = round.body.key;
    const asking = state.asking.has(key);
    const waiting =
      state.kept.has(key) && (!state.online || state.retrying.has(key));
    if (!asking && !waiting) continue;
    const was = out[round.draft] ?? { count: 0, asks: 0 };
    out[round.draft] = {
      count: was.count + 1,
      asks: was.asks + (asking ? 1 : 0),
    };
  }
  return out;
}

/** The store and the refusals: what a change changes and the phone keeps. */
type Held = {
  store: SendStore;
  refusals: Readonly<Record<string, KeptSendRefusal>>;
};

type Owner = {
  id: string;
  user: string;
  business: string;
  state: OwnerState;
  /** The first read, once started. */
  loading: Promise<void> | null;
  /** Changes made before the first read: replayed over it. */
  queued: ((was: Held) => Held)[];
  /** What the first read's replay wrote. */
  loadWrite: Promise<void>;
  /** Moves with each change here, so a read made meanwhile is read again. */
  version: number;
  reloading: boolean;
  reloadAgain: boolean;
};

/** A round on its way, as a row of the outbox. */
function rowOf(owner: Owner, round: PendingRound): OutboxRow {
  return {
    key: round.body.key,
    user: owner.user,
    business: owner.business,
    draft: round.draft,
    body: round.body,
    lines: round.lines,
    where: round.where ?? { placeName: null, takeaway: null },
    queuedAt: round.queuedAt ?? 0,
    askFrom: round.askFrom ?? round.queuedAt ?? 0,
  };
}

const roundOf = (row: OutboxRow): PendingRound => ({
  draft: row.draft,
  body: row.body,
  lines: row.lines,
  where: row.where,
  queuedAt: row.queuedAt,
  askFrom: row.askFrom,
});

const without = (set: ReadonlySet<string>, keys: Iterable<string>) => {
  const next = new Set(set);
  let changed = false;
  for (const key of keys) changed = next.delete(key) || changed;
  return changed ? next : set;
};

const withKeys = (set: ReadonlySet<string>, keys: Iterable<string>) => {
  const next = new Set(set);
  let changed = false;
  for (const key of keys) {
    if (!next.has(key)) {
      next.add(key);
      changed = true;
    }
  }
  return changed ? next : set;
};

/**
 * A round's answer applied to what is held: it leaves the rounds on their
 * way (`storeSettled`), and a refusal stays on its draft. A round no
 * longer held here (read again meanwhile) is settled all the same.
 */
function settledHeld(
  held: Held,
  round: PendingRound,
  answer:
    | { sent: true; order: string }
    | { sent: false; refusal: KeptSendRefusal },
): Held {
  const key = round.body.key;
  const store = held.store.pending[key]
    ? held.store
    : { ...held.store, pending: { ...held.store.pending, [key]: round } };
  const settled = storeSettled(
    store,
    round,
    answer.sent ? { sent: true, order: answer.order } : { sent: false },
  );
  return {
    store: settled,
    refusals: answer.sent
      ? held.refusals
      : { ...held.refusals, [round.draft]: answer.refusal },
  };
}

export type SendInput = {
  draft: string;
  body: SendBody;
  /** The lines as drafted, to put back on a refusal. */
  lines: PendingRound["lines"];
  where: OutboxWhere;
};

/** The outbox of one page, over what it is given: the page's own, or the tests'. */
export function createOutbox(deps: OutboxDeps) {
  const closed = () => deps.closed?.() ?? false;
  let database: Promise<OrdersDb> | null = null;
  const db = () => {
    database ??= deps.db().catch(() => memoryOrdersDb());
    return database;
  };

  const owners = new Map<string, Owner>();
  const listeners = new Set<() => void>();
  let screenListener: OutboxListener | null = null;
  const appListeners = new Set<OutboxListener>();
  let session: OutboxSession | null = null;
  let online = deps.online();
  /** Each round with a loop sending it, by key: never two for one. */
  const deliveries = new Map<
    string,
    { promise: Promise<SendOutcome>; awaited: boolean }
  >();
  /** Each loop's wait between tries, to wake it early. */
  const naps = new Map<string, () => void>();
  /** Rounds with a request on its way now. */
  const inFlight = new Set<string>();
  /** Rounds sent with keepalive since the page last hid. */
  const hidden = new Set<string>();
  /**
   * What keepalive still allows until the page shows again: its 64 KB are
   * shared by every request still on its way as the page goes.
   */
  let keepaliveLeft = SEND_BODY_MAX;
  /** Rounds that asked in this page: each asks once, until "שליחה". */
  const asked = new Set<string>();
  /** People whose rounds wait in this page: the cookie is another's (409). */
  const held = new Set<string>();
  /** People whose kept records were checked for expiry in this page. */
  const expired = new Set<string>();
  /** People whose rounds are being lost now, so it is said once. */
  const losing = new Map<string, Promise<void>>();
  /** Rounds to ask about, by owner, checked against one's own rounds first. */
  const toAskOf = new Map<string, Set<string>>();

  /** Writes and reads of the store, one after the other, in the order they came. */
  let chain: Promise<unknown> = Promise.resolve();
  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = chain.then(task);
    chain = run.catch(() => undefined);
    return run;
  }

  const notify = () => {
    for (const listener of [...listeners]) listener();
  };

  function emit(event: OutboxEvent) {
    if (screenListener) {
      screenListener(event);
      return;
    }
    for (const listener of [...appListeners]) listener(event);
  }

  function ownerOf(user: string, business: string): Owner {
    const id = `${norm(user)}:${norm(business)}`;
    let owner = owners.get(id);
    if (!owner) {
      owner = {
        id,
        user: norm(user),
        business: norm(business),
        state: { ...EMPTY_OWNER, online },
        loading: null,
        queued: [],
        loadWrite: Promise.resolve(),
        version: 0,
        reloading: false,
        reloadAgain: false,
      };
      owners.set(id, owner);
    }
    return owner;
  }

  function setState(owner: Owner, next: Partial<OwnerState>) {
    owner.state = { ...owner.state, ...next };
    notify();
  }

  const heldOf = (owner: Owner): Held => ({
    store: owner.state.store,
    refusals: owner.state.refusals,
  });

  /** What changed between two holdings, written in one transaction. */
  function persist(owner: Owner, before: Held, after: Held): Promise<void> {
    const at = deps.now();
    const puts: [StoreName, unknown][] = [];
    const deletes: [StoreName, IDBValidKey][] = [];
    let strict = false;
    for (const [key, round] of Object.entries(after.store.pending)) {
      const was = before.store.pending[key];
      if (was === round) continue;
      // A round is on the disk before it says it waits.
      if (!was) strict = true;
      puts.push(["rounds", rowOf(owner, round)]);
    }
    for (const key of Object.keys(before.store.pending)) {
      if (!(key in after.store.pending)) deletes.push(["rounds", key]);
    }
    const drafts = new Set([
      ...Object.keys(before.store.drafts),
      ...Object.keys(after.store.drafts),
      ...Object.keys(before.refusals),
      ...Object.keys(after.refusals),
    ]);
    for (const draft of drafts) {
      if (
        before.store.drafts[draft] === after.store.drafts[draft] &&
        before.refusals[draft] === after.refusals[draft]
      ) {
        continue;
      }
      const lines = after.store.drafts[draft] ?? [];
      const refusal = after.refusals[draft] ?? null;
      if (lines.length === 0 && !refusal) {
        deletes.push(["drafts", [owner.user, owner.business, draft]]);
      } else {
        puts.push([
          "drafts",
          {
            user: owner.user,
            business: owner.business,
            draft,
            lines,
            refusal,
            at,
          },
        ]);
      }
    }
    if (puts.length === 0 && deletes.length === 0) return Promise.resolve();
    return enqueue(async () => {
      if (closed()) return;
      const store = await db();
      await store.run(
        ["rounds", "drafts"],
        "readwrite",
        (tx) => {
          for (const [name, key] of deletes) tx.delete(name, key);
          for (const [name, value] of puts) tx.put(name, value);
        },
        strict ? "strict" : "relaxed",
      );
      deps.channel?.post({ user: owner.user, business: owner.business });
    }).catch(() => {
      // Storage full or gone: what is held stays in this page.
    });
  }

  /**
   * Changes what one person holds in one business, at once in memory and
   * then on the disk. Before the first read, the change waits to be
   * replayed over it: none is lost.
   */
  function mutate(owner: Owner, change: (was: Held) => Held): Promise<void> {
    const before = heldOf(owner);
    const after = change(before);
    if (after.store === before.store && after.refusals === before.refusals) {
      return Promise.resolve();
    }
    owner.version += 1;
    setState(owner, { store: after.store, refusals: after.refusals });
    if (!owner.state.loaded) {
      owner.queued.push(change);
      return ensureLoaded(owner).then(() => owner.loadWrite);
    }
    return persist(owner, before, after);
  }

  /** One person's records in one business, read back through their schemas. */
  async function readOwner(owner: Owner): Promise<Held> {
    try {
      const store = await db();
      const [rows, drafts] = await store.run(
        ["rounds", "drafts"],
        "readonly",
        async (tx) => [
          await tx.getAll("rounds", { owner: [owner.user, owner.business] }),
          await tx.getAll("drafts", { owner: [owner.user, owner.business] }),
        ],
      );
      const pending: Record<string, PendingRound> = {};
      for (const raw of rows) {
        const row = outboxRowSchema.safeParse(raw);
        if (row.success) pending[row.data.key] = roundOf(row.data);
      }
      const lines: SendStore["drafts"] = {};
      const refusals: Record<string, KeptSendRefusal> = {};
      for (const raw of drafts) {
        const record = draftRecordSchema.safeParse(raw);
        if (!record.success) continue;
        const { draft, refusal } = record.data;
        if (record.data.lines.length > 0) lines[draft] = record.data.lines;
        if (refusal) {
          refusals[draft] = {
            ...refusal,
            failure: sendFailureOf(refusal.failure),
          };
        }
      }
      return { store: { drafts: lines, pending }, refusals };
    } catch {
      return { store: emptySendStore, refusals: {} };
    }
  }

  function ensureLoaded(owner: Owner): Promise<void> {
    owner.loading ??= enqueue(() => readOwner(owner)).then((base) => {
      // What changed before the read, replayed over it, and written.
      const queued = owner.queued;
      owner.queued = [];
      const after = queued.reduce((was, change) => change(was), base);
      owner.loadWrite = persist(owner, base, after);
      setState(owner, {
        loaded: true,
        store: after.store,
        refusals: after.refusals,
        kept: new Set(Object.keys(base.store.pending)),
      });
    });
    return owner.loading;
  }

  /**
   * Another tab changed the records, or a settle found its round gone: read
   * them again. A read made while this page changed them is read again.
   */
  function reload(owner: Owner) {
    if (!owner.state.loaded) return;
    if (owner.reloading) {
      owner.reloadAgain = true;
      return;
    }
    owner.reloading = true;
    const version = owner.version;
    void enqueue(() => readOwner(owner)).then((read) => {
      owner.reloading = false;
      if (owner.version !== version || owner.reloadAgain) {
        owner.reloadAgain = false;
        reload(owner);
        return;
      }
      const keys = Object.keys(read.store.pending);
      const gone = Object.keys(owner.state.store.pending).filter(
        (key) => !(key in read.store.pending),
      );
      setState(owner, {
        store: { ...read.store, own: owner.state.store.own },
        refusals: read.refusals,
        kept: withKeys(without(owner.state.kept, gone), keys),
        retrying: without(owner.state.retrying, gone),
        asking: without(owner.state.asking, gone),
      });
      for (const key of gone) naps.get(key)?.();
      plan(owner);
    });
  }

  /** Every expired or unreadable record goes, once per person in this page. */
  function expire(user: string) {
    if (expired.has(user)) return;
    expired.add(user);
    const now = deps.now();
    const who = { user };
    void enqueue(async () => {
      if (closed()) return;
      const store = await db();
      await store.run(
        ["rounds", "drafts", "menus"],
        "readwrite",
        async (tx) => {
          for (const raw of await tx.getAll("rounds")) {
            const row = outboxRowSchema.safeParse(raw);
            const record = raw as { key?: unknown };
            if (
              !row.success ||
              !keepsRecord(
                "row",
                { user: row.data.user, at: rowTouched(row.data) },
                who,
                now,
              )
            ) {
              if (typeof record?.key === "string")
                tx.delete("rounds", record.key);
            }
          }
          for (const raw of await tx.getAll("drafts")) {
            const draft = draftRecordSchema.safeParse(raw);
            const record = raw as {
              user?: string;
              business?: string;
              draft?: string;
            };
            if (!draft.success || !keepsRecord("draft", draft.data, who, now)) {
              tx.delete("drafts", [
                record?.user ?? "",
                record?.business ?? "",
                record?.draft ?? "",
              ]);
            }
          }
          for (const raw of await tx.getAll("menus")) {
            const menu = menuRecordSchema.safeParse(raw);
            const record = raw as { user?: string; business?: string };
            if (!menu.success || !keepsRecord("menu", menu.data, who, now)) {
              tx.delete("menus", [record?.user ?? "", record?.business ?? ""]);
            }
          }
        },
      );
    }).catch(() => {
      // Nothing kept to check.
    });
  }

  const turnOf = (owner: Owner, round: PendingRound) =>
    held.has(owner.user)
      ? "hold"
      : rowTurn(rowOf(owner, round), session, deps.now());

  /** Every round of the owner whose turn it is goes; those past ten minutes ask. */
  function plan(owner: Owner) {
    if (!owner.state.loaded || closed()) return;
    for (const round of Object.values(owner.state.store.pending)) {
      const key = round.body.key;
      if (owner.state.asking.has(key)) continue;
      const turn = turnOf(owner, round);
      if (turn === "send") void deliver(owner, key, false);
      else if (turn === "ask") askAbout(owner, key);
    }
  }

  function nap(key: string, ms: number): Promise<void> {
    return new Promise((woken) => {
      const timer = deps.setTimeout(wake, ms);
      function wake() {
        deps.clearTimeout(timer);
        if (naps.get(key) === wake) naps.delete(key);
        woken();
      }
      naps.set(key, wake);
    });
  }

  const wakeAll = () => {
    for (const wake of [...naps.values()]) wake();
  };

  function setRetrying(owner: Owner, key: string, on: boolean) {
    const retrying = on
      ? withKeys(owner.state.retrying, [key])
      : without(owner.state.retrying, [key]);
    if (retrying !== owner.state.retrying) setState(owner, { retrying });
  }

  /** One's own rounds today, as the sync reads them, or null when unknown. */
  async function readMine(owner: Owner): Promise<MyOrders | null> {
    try {
      const response = await deps.fetch(
        ordersSyncHref({
          business: owner.business,
          version: null,
          menu: null,
          floor: false,
          mine: true,
          prep: false,
          // Nothing shows this read: what turned ready stays unread, for
          // its push (P8b).
          shown: false,
          order: null,
        }),
        { cache: "no-store", credentials: "same-origin" },
      );
      if (response.status !== 200) return null;
      return ordersSyncAnswer.parse(await response.json()).mine ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Settles a round in one transaction: gone from the outbox and, refused,
   * its lines back in their draft with the reason. Only when the round is
   * still there: another tab that settled it first already did, and this
   * one reads again. True when this page settled it.
   */
  async function settle(
    owner: Owner,
    row: OutboxRow,
    answer:
      | { sent: true; order: string }
      | { sent: false; refusal: KeptSendRefusal },
  ): Promise<boolean> {
    const round = roundOf(row);
    const done = await enqueue(async () => {
      if (closed()) return false;
      const store = await db();
      return store.run(["rounds", "drafts"], "readwrite", async (tx) => {
        if (!(await tx.get("rounds", row.key))) return false;
        tx.delete("rounds", row.key);
        const before = heldOf(owner);
        const after = settledHeld(before, round, answer);
        const touched = new Set([row.draft, NEW_TAKEAWAY]);
        if (answer.sent && row.draft === NEW_TAKEAWAY) {
          touched.add(draftKey({ takeaway: answer.order }));
        }
        for (const draft of touched) {
          if (
            before.store.drafts[draft] === after.store.drafts[draft] &&
            before.refusals[draft] === after.refusals[draft]
          ) {
            continue;
          }
          const lines = after.store.drafts[draft] ?? [];
          const refusal = after.refusals[draft] ?? null;
          if (lines.length === 0 && !refusal) {
            tx.delete("drafts", [owner.user, owner.business, draft]);
          } else {
            tx.put("drafts", {
              user: owner.user,
              business: owner.business,
              draft,
              lines,
              refusal,
              at: deps.now(),
            });
          }
        }
        return true;
      });
    }).catch(() => false);
    if (!done) {
      reload(owner);
      return false;
    }
    deps.channel?.post({ user: owner.user, business: owner.business });
    const before = heldOf(owner);
    const after = settledHeld(before, round, answer);
    owner.version += 1;
    setState(owner, {
      store: after.store,
      refusals: after.refusals,
      kept: without(owner.state.kept, [row.key]),
      retrying: without(owner.state.retrying, [row.key]),
      asking: without(owner.state.asking, [row.key]),
      ...(answer.sent && row.draft === NEW_TAKEAWAY
        ? { landed: { key: row.key, order: answer.order } }
        : {}),
    });
    return true;
  }

  async function settleSent(
    owner: Owner,
    row: OutboxRow,
    sent: { order: string; takeaway: number | null },
    awaited: boolean,
  ) {
    if (await settle(owner, row, { sent: true, order: sent.order })) {
      emit({
        kind: "sent",
        user: owner.user,
        business: owner.business,
        row,
        order: sent.order,
        where: {
          placeName: row.where.placeName,
          takeaway: sent.takeaway ?? row.where.takeaway,
        },
        awaited,
      });
    }
  }

  /**
   * Signed out, or no longer a member: the person's rounds go from the
   * phone (in every business, or in this one) with their menu, and the
   * listener says which. Their drafts stay, for whoever signs in as them.
   */
  function lose(owner: Owner, why: "signedOut" | "notMember"): Promise<void> {
    const user = owner.user;
    const running = losing.get(user);
    if (running) return running;
    const affected = [...owners.values()].filter(
      (one) =>
        one.user === user &&
        (why === "signedOut" || one.business === owner.business),
    );
    for (const one of affected) {
      one.version += 1;
      const keys = Object.keys(one.state.store.pending);
      setState(one, {
        store: { ...one.state.store, pending: {} },
        kept: without(one.state.kept, keys),
        retrying: without(one.state.retrying, keys),
        asking: without(one.state.asking, keys),
      });
      for (const key of keys) naps.get(key)?.();
    }
    const work = enqueue(async () => {
      const store = await db();
      return store.run(
        ["rounds", "menus"],
        "readwrite",
        async (tx) => {
          const by =
            why === "signedOut"
              ? { user }
              : { owner: [user, owner.business] as const };
          const rows: OutboxRow[] = [];
          for (const raw of await tx.getAll("rounds", by)) {
            const row = outboxRowSchema.safeParse(raw);
            if (row.success) rows.push(row.data);
            const key = (raw as { key?: unknown })?.key;
            if (typeof key === "string") tx.delete("rounds", key);
          }
          if (why === "signedOut") {
            for (const raw of await tx.getAll("menus", { user })) {
              const record = raw as { business?: string };
              tx.delete("menus", [user, record?.business ?? ""]);
            }
          } else {
            tx.delete("menus", [user, owner.business]);
          }
          return rows;
        },
        "strict",
      );
    })
      .catch(() => [] as OutboxRow[])
      .then((rows) => {
        for (const one of affected) {
          deps.channel?.post({ user: one.user, business: one.business });
        }
        emit({ kind: "lost", user, why, rows });
      })
      .finally(() => losing.delete(user));
    losing.set(user, work);
    return work;
  }

  /** The cookie is another person's: this one's rounds wait in this page. */
  function holdPerson(user: string) {
    if (held.has(user)) return;
    held.add(user);
    wakeAll();
    emit({ kind: "person", user });
  }

  /**
   * A round past ten minutes asks, once one's own rounds were read: one
   * that went already (a last send on leaving that landed) settles as sent
   * and never asks. Rounds that reach it together are checked together.
   */
  function askAbout(owner: Owner, key: string) {
    let keys = toAskOf.get(owner.id);
    if (!keys) {
      keys = new Set();
      toAskOf.set(owner.id, keys);
      void Promise.resolve().then(() => checkThenAsk(owner));
    }
    keys.add(key);
  }

  async function checkThenAsk(owner: Owner) {
    const keys = toAskOf.get(owner.id) ?? new Set<string>();
    toAskOf.delete(owner.id);
    const rows = [...keys].flatMap((key) => {
      const round = owner.state.store.pending[key];
      return round && !owner.state.asking.has(key) ? [rowOf(owner, round)] : [];
    });
    if (rows.length === 0) return;
    const mine = await readMine(owner);
    const went = mine ? sentAlready(rows, mine) : [];
    for (const { row, ...sent } of went) {
      await settleSent(owner, row, sent, false);
    }
    const goneKeys = new Set(went.map(({ row }) => row.key));
    const rest = rows.filter(
      (row) => !goneKeys.has(row.key) && owner.state.store.pending[row.key],
    );
    if (rest.length === 0) return;
    setState(owner, {
      asking: withKeys(
        owner.state.asking,
        rest.map((row) => row.key),
      ),
      retrying: without(
        owner.state.retrying,
        rest.map((row) => row.key),
      ),
    });
    const fresh = rest.filter((row) => !asked.has(row.key));
    for (const row of fresh) asked.add(row.key);
    if (fresh.length > 0) {
      emit({
        kind: "asks",
        user: owner.user,
        business: owner.business,
        rows: fresh,
      });
    }
  }

  /**
   * Sends one round until it answers, then settles it: tried again while
   * nothing comes back or the server failed on its way, and only while it
   * is its person's turn. Resolves with the answer, or `NEUTRAL` once it
   * stops: asking, held for its person, or gone.
   */
  async function loop(
    owner: Owner,
    key: string,
    entry: { awaited: boolean },
  ): Promise<SendOutcome> {
    await ensureLoaded(owner);
    for (let attempt = 0; ; attempt += 1) {
      const round = owner.state.store.pending[key];
      if (!round || closed()) return NEUTRAL;
      const row = rowOf(owner, round);
      const turn = turnOf(owner, round);
      if (turn === "hold") {
        setRetrying(owner, key, false);
        return NEUTRAL;
      }
      if (turn === "ask" || owner.state.asking.has(key)) {
        askAbout(owner, key);
        return NEUTRAL;
      }
      // Offline: nothing goes until the phone is back (`flush` wakes it).
      if (!online) {
        await nap(key, sendRetryDelay(attempt));
        continue;
      }
      const text = JSON.stringify(row.body);
      let status: number | null = null;
      let json: unknown = null;
      inFlight.add(key);
      try {
        const response = await deps.fetch(ORDERS_SEND_PATH, {
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
      } finally {
        inFlight.delete(key);
      }
      const verdict = sendVerdict(status, json);
      switch (verdict.kind) {
        case "sent":
          await settleSent(owner, row, verdict.round, entry.awaited);
          return { ok: true, round: verdict.round };
        case "refused": {
          const failure = sendFailureOf(verdict.failure);
          const refusal: KeptSendRefusal = {
            ok: false,
            failure,
            items: verdict.items,
            order: verdict.order,
            target: row.body.target,
            where: row.where,
            seen: false,
          };
          if (await settle(owner, row, { sent: false, refusal })) {
            emit({
              kind: "refused",
              user: owner.user,
              business: owner.business,
              row,
              refusal,
              awaited: entry.awaited,
            });
          }
          return {
            ok: false,
            failure,
            items: verdict.items,
            order: verdict.order,
          };
        }
        case "lost":
          await lose(owner, verdict.why);
          return NEUTRAL;
        case "person":
          holdPerson(owner.user);
          return NEUTRAL;
        default:
          setRetrying(owner, key, true);
          await nap(key, sendRetryDelay(attempt));
      }
    }
  }

  /** A round's loop: the one sending it already, or a new one. */
  function deliver(
    owner: Owner,
    key: string,
    awaited: boolean,
  ): Promise<SendOutcome> {
    const running = deliveries.get(key);
    if (running) return running.promise;
    const entry = { awaited, promise: Promise.resolve(NEUTRAL) };
    entry.promise = loop(owner, key, entry).finally(() => {
      if (deliveries.get(key) === entry) deliveries.delete(key);
    });
    deliveries.set(key, entry);
    return entry.promise;
  }

  function setRefusals(
    owner: Owner,
    next: (
      was: Readonly<Record<string, KeptSendRefusal>>,
    ) => Readonly<Record<string, KeptSendRefusal>>,
  ) {
    void mutate(owner, (was) => {
      const refusals = next(was.refusals);
      return refusals === was.refusals ? was : { ...was, refusals };
    });
  }

  function setOnline(value: boolean) {
    if (online === value) return;
    online = value;
    for (const owner of owners.values()) {
      owner.state = { ...owner.state, online: value };
    }
    notify();
  }

  return {
    /** The phone's store this page writes to, for the session ends' clearing. */
    db,

    /**
     * Who the page is for, from the mode and the app's frame: their rounds
     * are read and go. Another person's waiting tries stop. The same again
     * plans afresh (the frame drew again: a round held for another cookie
     * is tried once more).
     */
    start(next: OutboxSession) {
      const now: OutboxSession = {
        user: norm(next.user),
        business: norm(next.business),
        viewing: next.viewing,
      };
      const same =
        session !== null &&
        session.user === now.user &&
        session.business === now.business &&
        session.viewing === now.viewing;
      session = now;
      held.clear();
      if (!same) wakeAll();
      expire(now.user);
      const owner = ownerOf(now.user, now.business);
      void ensureLoaded(owner).then(() => plan(owner));
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    snapshot(user: string, business: string): OwnerState {
      return ownerOf(user, business).state;
    },

    /** The drafts and rounds changed from what they hold now. */
    change(
      user: string,
      business: string,
      next: (was: SendStore) => SendStore,
    ): void {
      void mutate(ownerOf(user, business), (was) => {
        const store = next(was.store);
        return store === was.store ? was : { ...was, store };
      });
    },

    /** The refusals changed from what they hold now, kept on their drafts. */
    setRefusals(
      user: string,
      business: string,
      next: (
        was: Readonly<Record<string, KeptSendRefusal>>,
      ) => Readonly<Record<string, KeptSendRefusal>>,
    ): void {
      setRefusals(ownerOf(user, business), next);
    },

    /** The draft's refusal was shown on its screen: no banner says it. */
    seeRefusal(user: string, business: string, draft: string): void {
      setRefusals(ownerOf(user, business), (was) => {
        const refusal = was[draft];
        return !refusal || refusal.seen
          ? was
          : { ...was, [draft]: { ...refusal, seen: true } };
      });
    },

    /**
     * Sends a round: its lines leave the draft at once, it is written to
     * the disk (`onQueued` once it is: the screen may send again), and it
     * goes. Resolves with the answer, or `NEUTRAL` if it stops first.
     */
    send(
      user: string,
      business: string,
      input: SendInput,
      options: { awaited?: boolean; onQueued?: () => void } = {},
    ): Promise<SendOutcome> {
      const owner = ownerOf(user, business);
      const now = deps.now();
      const round: PendingRound = {
        draft: input.draft,
        body: input.body,
        lines: input.lines,
        where: input.where,
        queuedAt: now,
        askFrom: now,
      };
      const key = input.body.key;
      const written = mutate(owner, (was) => {
        const { [input.draft]: _, ...refusals } = was.refusals;
        return { store: storeSent(was.store, round), refusals };
      });
      void written.then(() => {
        if (owner.state.store.pending[key]) {
          setState(owner, { kept: withKeys(owner.state.kept, [key]) });
        }
        options.onQueued?.();
      });
      return deliver(owner, key, options.awaited ?? true);
    },

    /** "שליחה": a round that asked goes again now, its ten minutes from now. */
    answer(user: string, business: string, key: string): void {
      const owner = ownerOf(user, business);
      const round = owner.state.store.pending[key];
      if (!round) return;
      asked.delete(key);
      setState(owner, { asking: without(owner.state.asking, [key]) });
      void mutate(owner, (was) => ({
        ...was,
        store: {
          ...was.store,
          pending: {
            ...was.store.pending,
            [key]: { ...round, askFrom: deps.now() },
          },
        },
      }));
      void deliver(owner, key, false);
    },

    /** "הסרה מהטלפון": the round goes, and is returned for its "ביטול". */
    remove(user: string, business: string, key: string): OutboxRow | null {
      const owner = ownerOf(user, business);
      const round = owner.state.store.pending[key];
      if (!round) return null;
      const row = rowOf(owner, round);
      setState(owner, {
        asking: without(owner.state.asking, [key]),
        retrying: without(owner.state.retrying, [key]),
        kept: without(owner.state.kept, [key]),
      });
      void mutate(owner, (was) => {
        const { [key]: _, ...pending } = was.store.pending;
        return { ...was, store: { ...was.store, pending } };
      });
      naps.get(key)?.();
      return row;
    },

    /** The removal's "ביטול": back on the disk, asking as it was. */
    restore(row: OutboxRow): void {
      const owner = ownerOf(row.user, row.business);
      if (owner.state.store.pending[row.key]) return;
      setState(owner, { asking: withKeys(owner.state.asking, [row.key]) });
      void mutate(owner, (was) => ({
        ...was,
        store: {
          ...was.store,
          pending: { ...was.store.pending, [row.key]: roundOf(row) },
        },
      })).then(() => {
        if (owner.state.store.pending[row.key]) {
          setState(owner, { kept: withKeys(owner.state.kept, [row.key]) });
        }
      });
    },

    /**
     * One's own rounds as the sync read them: a round still kept whose key
     * is among them went (a last send on leaving), and settles as sent. One
     * a screen waits for settles by its own answer (a retry of the same key
     * answers the same round), so the toast says it once.
     */
    seenSent(user: string, business: string, mine: MyOrders): void {
      const owner = ownerOf(user, business);
      if (!owner.state.loaded) return;
      const rows = Object.values(owner.state.store.pending)
        .filter(
          (round) =>
            !inFlight.has(round.body.key) &&
            !deliveries.get(round.body.key)?.awaited,
        )
        .map((round) => rowOf(owner, round));
      for (const { row, ...sent } of sentAlready(rows, mine)) {
        void settleSent(owner, row, sent, false).then(() =>
          naps.get(row.key)?.(),
        );
      }
    },

    /** Online again, the page visible, or the app open: everything waiting goes now. */
    flush(): void {
      hidden.clear();
      keepaliveLeft = SEND_BODY_MAX;
      setOnline(deps.online());
      wakeAll();
      for (const owner of owners.values()) plan(owner);
    },

    setOnline,

    /**
     * The page hides: one last keepalive send of each round of the
     * session's that waits and is young, none mid-request, all under
     * keepalive's 64 KB until the page shows again, each once. The answer
     * isn't read: the round stays kept, and the next open settles it by
     * its key.
     */
    hide(): void {
      if (!session || session.viewing || closed()) return;
      const owner = owners.get(`${session.user}:${session.business}`);
      if (!owner?.state.loaded) return;
      for (const round of Object.values(owner.state.store.pending)) {
        const key = round.body.key;
        if (
          !owner.state.kept.has(key) ||
          inFlight.has(key) ||
          hidden.has(key) ||
          owner.state.asking.has(key) ||
          turnOf(owner, round) !== "send"
        ) {
          continue;
        }
        const text = JSON.stringify(round.body);
        if (text.length > keepaliveLeft) continue;
        keepaliveLeft -= text.length;
        hidden.add(key);
        void deps
          .fetch(ORDERS_SEND_PATH, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: text,
            keepalive: true,
            credentials: "same-origin",
          })
          .catch(() => undefined);
      }
    },

    /**
     * The mode on screen takes the news while it is (returns its
     * withdrawal); without it, the app's listeners do.
     */
    screen(listener: OutboxListener): () => void {
      screenListener = listener;
      return () => {
        if (screenListener === listener) screenListener = null;
      };
    },

    listen(listener: OutboxListener): () => void {
      appListeners.add(listener);
      return () => {
        appListeners.delete(listener);
      };
    },

    /** The newest menu heard, kept for the mode to open with: only a newer version. */
    saveMenu(user: string, business: string, menu: Menu): void {
      const who = { user: norm(user), business: norm(business) };
      void enqueue(async () => {
        if (closed()) return;
        const store = await db();
        await store.run(["menus"], "readwrite", async (tx) => {
          const was = menuRecordSchema.safeParse(
            await tx.get("menus", [who.user, who.business]),
          );
          if (was.success && was.data.version >= menu.version) return;
          tx.put("menus", {
            ...who,
            version: menu.version,
            menu,
            at: deps.now(),
          });
        });
      }).catch(() => undefined);
    },

    /** The menu kept for the person in the business, or null. */
    async menu(user: string, business: string): Promise<Menu | null> {
      try {
        const store = await db();
        const raw = await store.run(["menus"], "readonly", (tx) =>
          tx.get("menus", [norm(user), norm(business)]),
        );
        const record = menuRecordSchema.safeParse(raw);
        return record.success ? record.data.menu : null;
      } catch {
        return null;
      }
    },

    /** Another tab changed an owner's records: read them again. */
    heard(message: unknown): void {
      if (!message || typeof message !== "object") return;
      const { user, business } = message as Partial<OwnerMessage>;
      if (typeof user !== "string" || typeof business !== "string") return;
      const owner = owners.get(`${norm(user)}:${norm(business)}`);
      if (owner) reload(owner);
    },
  };
}

export type Outbox = ReturnType<typeof createOutbox>;

let page: Outbox | null = null;
let server: Outbox | null = null;

/**
 * The page's one outbox, with the browser's store, fetch, clock and tabs,
 * and its listeners added once: online and visible send what waits, hidden
 * sends it one last time. On the server, an inert one that is never
 * started (the screens draw with nothing on its way).
 */
export function ordersOutbox(): Outbox {
  if (typeof window === "undefined") {
    server ??= createOutbox({
      db: () => Promise.resolve(memoryOrdersDb()),
      fetch: () => Promise.reject(new Error("No sending on the server")),
      now: () => Date.now(),
      setTimeout: () => null,
      clearTimeout: () => {},
      online: () => true,
    });
    return server;
  }
  if (page) return page;
  let channel: OutboxDeps["channel"];
  try {
    const tabs = new BroadcastChannel(ORDERS_DB);
    channel = {
      post: (message) => tabs.postMessage(message),
      listen: (hear) => {
        tabs.onmessage = (event) => hear(event.data);
      },
    };
  } catch {
    channel = undefined;
  }
  const outbox = createOutbox({
    db: () => openOrdersDb().then((opened) => opened ?? memoryOrdersDb()),
    fetch: (input, init) => window.fetch(input, init),
    now: () => Date.now(),
    setTimeout: (run, ms) => window.setTimeout(run, ms),
    clearTimeout: (id) => window.clearTimeout(id as number),
    online: () => navigator.onLine,
    channel,
    closed: ordersClosed,
  });
  page = outbox;
  // P4 kept drafts in the tab; the phone's store keeps them now.
  forgetTabEntries();
  channel?.listen((message) => outbox.heard(message));
  ordersOnPage(outbox.db);
  window.addEventListener("online", () => outbox.flush());
  window.addEventListener("offline", () => outbox.setOnline(false));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") outbox.flush();
    else outbox.hide();
  });
  window.addEventListener("pagehide", () => outbox.hide());
  return outbox;
}
