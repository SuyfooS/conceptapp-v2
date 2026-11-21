import {
  draftRecordSchema,
  keepsRecord,
  menuRecordSchema,
  type OutboxWhere,
  outboxRowSchema,
  rowTouched,
} from "@domain/orders-outbox";
import { type OrdersDb, openOrdersDb } from "./orders-db";

/*
 * What a session's end does to waiter mode's records on the phone (P7):
 * signing out (app/sign-out-form.tsx) and locking a station
 * (app/(app)/clock/station/lock-station.tsx) say what hasn't gone and clear
 * it, without loading the mode: nothing here imports the outbox. Its
 * engine (outbox.ts) tells this page's store and person here, so a store
 * kept in memory where IndexedDB is blocked is cleared too; without one,
 * IndexedDB is opened only where it already holds something. Each also
 * removes P4's leftovers in sessionStorage (`orders:<user>:<business>`), and
 * from then on nothing more is written in this page (`closed`): it is
 * about to open a whole new one.
 */

/** P4's entries in sessionStorage, which only go now. */
export const STORE_PREFIX = "orders:";

let closed = false;
/** The person this page's outbox is for, or null where none started. */
let person: string | null = null;
/** This page's store, when its outbox opened one. */
let pageDb: (() => Promise<OrdersDb>) | null = null;

/** Nothing more is written in this page: a session ended here. */
export const ordersClosed = () => closed;

/** The outbox's store, for the clearing to reach the same. */
export function ordersOnPage(db: () => Promise<OrdersDb>): void {
  pageDb = db;
}

/** The outbox's person (`start`), whom signing out asks about. */
export function setOrdersPerson(user: string | null): void {
  person = user ? user.toLowerCase() : null;
}

export const ordersPerson = () => person;

const storeOnPage = (): Promise<OrdersDb | null> =>
  pageDb
    ? pageDb().catch(() => null)
    : openOrdersDb({ create: false }).catch(() => null);

/** What hasn't gone on this phone: how many rounds, and where. */
export type UnsentOnDevice = { count: number; places: OutboxWhere[] };

const NOTHING: UnsentOnDevice = { count: 0, places: [] };

/**
 * The rounds kept on this phone that haven't gone, the person's or (with
 * none named) everyone's, oldest first: for the sign-out's question and the
 * station lock's warning. Nothing kept, or storage blocked: none.
 */
export async function unsentOnDevice(user?: string): Promise<UnsentOnDevice> {
  try {
    const db = await storeOnPage();
    if (!db) return NOTHING;
    const raw = await db.run(["rounds"], "readonly", (tx) =>
      tx.getAll("rounds", user ? { user: user.toLowerCase() } : undefined),
    );
    const rows = raw
      .flatMap((one) => {
        const row = outboxRowSchema.safeParse(one);
        return row.success ? [row.data] : [];
      })
      .sort((a, b) => a.queuedAt - b.queuedAt);
    return { count: rows.length, places: rows.map((row) => row.where) };
  } catch {
    return NOTHING;
  }
}

/** P4's entries in this tab, whoever's: the outbox's first open, and a session's end. */
export function forgetTabEntries(): void {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const name = sessionStorage.key(i);
      if (name?.startsWith(STORE_PREFIX)) sessionStorage.removeItem(name);
    }
  } catch {
    // Blocked storage: nothing was kept.
  }
}

/**
 * Clears what the phone keeps, in one transaction that waits for the disk:
 * every record `drop` says goes, and every one expired whoever's.
 */
async function clearWhere(
  drop: (record: { user?: unknown }) => boolean,
): Promise<void> {
  closed = true;
  forgetTabEntries();
  const db = await storeOnPage();
  if (!db) return;
  const now = Date.now();
  await db
    .run(
      ["rounds", "drafts", "menus"],
      "readwrite",
      async (tx) => {
        for (const raw of await tx.getAll("rounds")) {
          const record = (raw ?? {}) as { key?: unknown; user?: unknown };
          const row = outboxRowSchema.safeParse(raw);
          const expired =
            !row.success ||
            !keepsRecord(
              "row",
              { user: row.data.user, at: rowTouched(row.data) },
              null,
              now,
            );
          if ((drop(record) || expired) && typeof record.key === "string") {
            tx.delete("rounds", record.key);
          }
        }
        for (const raw of await tx.getAll("drafts")) {
          const record = (raw ?? {}) as {
            user?: string;
            business?: string;
            draft?: string;
          };
          const draft = draftRecordSchema.safeParse(raw);
          const expired =
            !draft.success || !keepsRecord("draft", draft.data, null, now);
          if (drop(record) || expired) {
            tx.delete("drafts", [
              record.user ?? "",
              record.business ?? "",
              record.draft ?? "",
            ]);
          }
        }
        for (const raw of await tx.getAll("menus")) {
          const record = (raw ?? {}) as { user?: string; business?: string };
          const menu = menuRecordSchema.safeParse(raw);
          const expired =
            !menu.success || !keepsRecord("menu", menu.data, null, now);
          if (drop(record) || expired) {
            tx.delete("menus", [record.user ?? "", record.business ?? ""]);
          }
        }
      },
      "strict",
    )
    .catch(() => {
      // Storage gone meanwhile: nothing more to clear.
    });
}

/**
 * Signing out here: the person's rounds, drafts and menus go, in every
 * business, and whatever expired; another person's waiting rounds stay for
 * them. With nobody named (no outbox started in this page), only what
 * expired. Awaited before the page is left, so the clearing isn't lost.
 */
export function clearOrdersOnSignOut(user: string | null): Promise<void> {
  const who = user?.toLowerCase() ?? null;
  return clearWhere((record) => who !== null && record.user === who);
}

/**
 * Locking the device into the clock station: everything kept goes,
 * whoever's. A station is the business's device, and nobody sends from it.
 */
export function clearAllOrders(): Promise<void> {
  return clearWhere(() => true);
}
