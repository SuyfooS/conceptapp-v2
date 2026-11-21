/*
 * Waiter mode's store on the phone (P7): IndexedDB `conceptapp-orders`,
 * which outlives the tab and a killed app, where sessionStorage went with
 * the tab (P4). Three stores, each record with its person and business:
 * `rounds` (the outbox, by each round's key), `drafts` (by person, business
 * and draft, with the refusal of the draft's last send) and `menus` (the
 * newest menu heard, by person and business). Nothing else imported, so
 * signing out and locking a station (orders-storage.ts) clear it without
 * loading the mode.
 *
 * Everything read back is checked by its schema in the engine (outbox.ts):
 * what is kept on the phone is a boundary. Where IndexedDB is missing or
 * blocked (an old private window), `memoryOrdersDb` keeps the same in this
 * page alone; the tests use it too.
 */

export const ORDERS_DB = "conceptapp-orders";
export const ORDERS_DB_VERSION = 1;

export type StoreName = "rounds" | "drafts" | "menus";

/** One person's records in one business, or all of one person's. */
export type OrdersQuery =
  | { owner: readonly [user: string, business: string] }
  | { user: string };

/** A transaction's reads and writes. Values come back as `unknown`. */
export interface OrdersTx {
  get(store: StoreName, key: IDBValidKey): Promise<unknown>;
  getAll(store: StoreName, by?: OrdersQuery): Promise<unknown[]>;
  put(store: StoreName, value: unknown): void;
  delete(store: StoreName, key: IDBValidKey): void;
  /** Nothing of the transaction is written, and `run` rejects. */
  abort(): void;
}

export interface OrdersDb {
  /**
   * One transaction over `stores`: resolves with what `work` returned once
   * it is written (`complete`), rejects when it aborts or fails. `work`
   * only chains the transaction's own requests, with no other await, so the
   * transaction stays open (Safari closes it on any other). `strict` waits
   * for the disk, for a round before it says "עוד לא נשלח"; a browser
   * without the option ignores it.
   */
  run<T>(
    stores: StoreName[],
    mode: "readonly" | "readwrite",
    work: (tx: OrdersTx) => Promise<T> | T,
    durability?: "strict" | "relaxed",
  ): Promise<T>;
  close(): void;
}

/** Each store's key, and the fields its indexes read. */
const KEYS: Record<StoreName, string | string[]> = {
  rounds: "key",
  drafts: ["user", "business", "draft"],
  menus: ["user", "business"],
};

/** A request's result, as a promise. */
function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function wrap(db: IDBDatabase): OrdersDb {
  function run<T>(
    stores: StoreName[],
    mode: "readonly" | "readwrite",
    work: (tx: OrdersTx) => Promise<T> | T,
    durability: "strict" | "relaxed" = "relaxed",
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let tx: IDBTransaction;
      try {
        tx = db.transaction(stores, mode, { durability });
      } catch (error) {
        reject(error);
        return;
      }
      let result: T;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () =>
        reject(tx.error ?? new DOMException("Aborted", "AbortError"));
      const api: OrdersTx = {
        get: (store, key) => done(tx.objectStore(store).get(key)),
        getAll: (store, by) => {
          const source = tx.objectStore(store);
          if (!by) return done(source.getAll());
          if ("owner" in by) {
            return done(
              source.index("owner").getAll(IDBKeyRange.only([...by.owner])),
            );
          }
          return done(source.index("user").getAll(IDBKeyRange.only(by.user)));
        },
        put: (store, value) => void tx.objectStore(store).put(value),
        delete: (store, key) => void tx.objectStore(store).delete(key),
        abort: () => tx.abort(),
      };
      try {
        Promise.resolve(work(api)).then(
          (value) => {
            result = value;
          },
          (error) => {
            try {
              tx.abort();
            } catch {
              // Already over.
            }
            reject(error);
          },
        );
      } catch (error) {
        try {
          tx.abort();
        } catch {
          // Already over.
        }
        reject(error);
      }
    });
  }
  return { run, close: () => db.close() };
}

/**
 * Opens the phone's store, or null where there is none to have: no
 * IndexedDB, storage blocked, or another page holds an older version open.
 * `create: false` never makes one where none was kept (signing out, locking
 * a station): an upgrade from nothing is aborted, which leaves none.
 */
export function openOrdersDb({
  create = true,
}: {
  create?: boolean;
} = {}): Promise<OrdersDb | null> {
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      if (typeof indexedDB === "undefined") {
        resolve(null);
        return;
      }
      request = indexedDB.open(ORDERS_DB, ORDERS_DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = (event) => {
      if (!create && event.oldVersion === 0) {
        request.transaction?.abort();
        return;
      }
      const db = request.result;
      for (const store of Object.keys(KEYS) as StoreName[]) {
        if (db.objectStoreNames.contains(store)) continue;
        const created = db.createObjectStore(store, { keyPath: KEYS[store] });
        created.createIndex("owner", ["user", "business"]);
        created.createIndex("user", "user");
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // A newer version opened elsewhere: this one steps aside.
      db.onversionchange = () => db.close();
      resolve(wrap(db));
    };
    request.onerror = (event) => {
      // An upgrade aborted on purpose lands here too.
      event.preventDefault();
      resolve(null);
    };
    request.onblocked = () => resolve(null);
  });
}

/** A record's key, as its store's key path reads it. */
function keyOf(store: StoreName, value: unknown): string {
  const path = KEYS[store];
  const record = (value ?? {}) as Record<string, unknown>;
  return JSON.stringify(
    typeof path === "string" ? record[path] : path.map((name) => record[name]),
  );
}

const copy = <T>(value: T): T => structuredClone(value);

/**
 * The same interface over maps, in this page alone: where IndexedDB is
 * missing or blocked, and in the tests. A run is atomic and one at a time,
 * as IndexedDB's are over the same stores: a throw or `abort()` puts back
 * everything it wrote. Values are copied in and out, as IndexedDB copies
 * them.
 */
export function memoryOrdersDb(): OrdersDb & {
  /** What a store holds now, for the tests. */
  dump: (store: StoreName) => unknown[];
} {
  const stores: Record<StoreName, Map<string, unknown>> = {
    rounds: new Map(),
    drafts: new Map(),
    menus: new Map(),
  };
  let queue: Promise<unknown> = Promise.resolve();
  const matches = (value: unknown, by?: OrdersQuery) => {
    if (!by) return true;
    const record = (value ?? {}) as Record<string, unknown>;
    if ("owner" in by) {
      return record.user === by.owner[0] && record.business === by.owner[1];
    }
    return record.user === by.user;
  };
  function run<T>(
    names: StoreName[],
    mode: "readonly" | "readwrite",
    work: (tx: OrdersTx) => Promise<T> | T,
  ): Promise<T> {
    const turn = queue.then(async (): Promise<T> => {
      const before = Object.fromEntries(
        names.map((name) => [name, new Map(stores[name])]),
      ) as Partial<Record<StoreName, Map<string, unknown>>>;
      let aborted = false;
      const writable = () => {
        if (mode !== "readwrite") throw new Error("ReadOnlyError");
        if (aborted) throw new Error("TransactionInactiveError");
      };
      const tx: OrdersTx = {
        get: async (store, key) => {
          const value = stores[store].get(JSON.stringify(key));
          return value === undefined ? undefined : copy(value);
        },
        getAll: async (store, by) =>
          [...stores[store].values()]
            .filter((value) => matches(value, by))
            .map(copy),
        put: (store, value) => {
          writable();
          stores[store].set(keyOf(store, value), copy(value));
        },
        delete: (store, key) => {
          writable();
          stores[store].delete(JSON.stringify(key));
        },
        abort: () => {
          aborted = true;
        },
      };
      const rollBack = () => {
        for (const name of names) {
          const was = before[name];
          if (was) stores[name] = was;
        }
      };
      try {
        const result = await work(tx);
        if (aborted) {
          rollBack();
          throw new DOMException("Aborted", "AbortError");
        }
        return result;
      } catch (error) {
        rollBack();
        throw error;
      }
    });
    queue = turn.catch(() => undefined);
    return turn;
  }
  return {
    run,
    close: () => {},
    dump: (store) => [...stores[store].values()].map(copy),
  };
}
