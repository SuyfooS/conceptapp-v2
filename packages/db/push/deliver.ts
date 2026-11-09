import "server-only";
import { type PushOutcome, pushTtl } from "@domain/push";
import { isMissingFunction } from "../missing";
import { createAdminClient } from "../supabase/admin";
import { pushConfig, pushTestOrigin } from "./env";
import { type PushResult, sendPush } from "./send";

/** One push to send, as `public.claim_due_pushes` gives it. */
export type DueDelivery = {
  delivery: string;
  notification: string;
  kind: string;
  /** When the line stops mattering, or null. */
  validUntil: string | null;
  device: string;
  endpoint: string;
};

export type DeliveryOutcome = {
  delivery: string;
  outcome: PushOutcome;
  wait?: number;
};

export type DeliverDeps = {
  claim: (maxRows: number) => Promise<DueDelivery[]>;
  finish: (outcomes: DeliveryOutcome[]) => Promise<void>;
  send: (endpoint: string, ttl: number) => Promise<PushResult>;
  now: () => number;
};

/** What one run did, in counts: never an endpoint, a key or a line. */
export type DeliverySummary = {
  devices: number;
  ok: number;
  gone: number;
  refused: number;
  retry: number;
  /** Why push services refused, by how often, as they said it. */
  reasons: Record<string, number>;
};

/** Pushes claimed at a time. */
export const CLAIM_ROWS = 200;
/** Pushes on their way at once. */
export const CONCURRENCY = 8;
/** Claims in one run, so a run ends well inside its function's time. */
export const ROUNDS = 5;

async function inPool<T>(
  items: readonly T[],
  size: number,
  run: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      if (item !== undefined) await run(item);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, worker),
  );
}

/**
 * Send what is due: claim it, send each device one push however many lines
 * wait for it (its service worker fetches them all), eight at a time, and say
 * how each went. Again while a claim comes back full, a few times at most.
 */
export async function deliverWith(
  deps: DeliverDeps,
  limits: { rows?: number; rounds?: number; concurrency?: number } = {},
): Promise<DeliverySummary> {
  const rows = limits.rows ?? CLAIM_ROWS;
  const summary: DeliverySummary = {
    devices: 0,
    ok: 0,
    gone: 0,
    refused: 0,
    retry: 0,
    reasons: {},
  };
  for (let round = 0; round < (limits.rounds ?? ROUNDS); round += 1) {
    const due = await deps.claim(rows);
    if (due.length === 0) break;

    const byDevice = new Map<string, DueDelivery[]>();
    for (const item of due) {
      const list = byDevice.get(item.device);
      if (list) list.push(item);
      else byDevice.set(item.device, [item]);
    }

    const outcomes: DeliveryOutcome[] = [];
    await inPool(
      [...byDevice.values()],
      limits.concurrency ?? CONCURRENCY,
      async (items) => {
        const first = items[0];
        if (!first) return;
        const ttl = pushTtl(
          items.map((item) => item.validUntil),
          deps.now(),
        );
        let result: PushResult;
        try {
          result = await deps.send(first.endpoint, ttl);
        } catch {
          result = { outcome: "retry", status: null };
        }
        summary.devices += 1;
        summary[result.outcome] += 1;
        if (result.reason) {
          summary.reasons[result.reason] =
            (summary.reasons[result.reason] ?? 0) + 1;
        }
        for (const item of items) {
          outcomes.push(
            result.wait === undefined
              ? { delivery: item.delivery, outcome: result.outcome }
              : {
                  delivery: item.delivery,
                  outcome: result.outcome,
                  wait: result.wait,
                },
          );
        }
      },
    );
    await deps.finish(outcomes);
    if (due.length < rows) break;
  }
  return summary;
}

/** The database's half, with the secret key. */
function databaseDeps(): Pick<DeliverDeps, "claim" | "finish"> {
  const admin = createAdminClient();
  return {
    async claim(maxRows) {
      const { data, error } = await admin.rpc("claim_due_pushes", {
        max_rows: maxRows,
      });
      if (error) {
        // Before the migration reaches the project there is nothing to send.
        if (isMissingFunction(error)) return [];
        throw error;
      }
      return (data ?? []).map((row) => ({
        delivery: row.delivery,
        notification: row.notification,
        kind: row.what,
        validUntil: row.valid_until ?? null,
        device: row.device,
        endpoint: row.push_endpoint,
      }));
    },
    async finish(outcomes) {
      if (outcomes.length === 0) return;
      const { error } = await admin.rpc("finish_pushes", {
        outcomes,
      });
      if (error) throw error;
    },
  };
}

/**
 * Send every push that is due, from anywhere in the app: after an action that
 * notifies, the test button, or the database's minute job. Nothing without
 * the VAPID settings. Logs counts only.
 */
export async function deliverDuePushes(): Promise<DeliverySummary | null> {
  const config = pushConfig();
  if (!config) return null;
  const testOrigin = pushTestOrigin();
  try {
    const summary = await deliverWith({
      ...databaseDeps(),
      send: (endpoint, ttl) => sendPush(endpoint, config, { ttl, testOrigin }),
      now: Date.now,
    });
    if (summary.devices > 0) {
      const { reasons, ...counts } = summary;
      console.info("pushes", JSON.stringify(counts), JSON.stringify(reasons));
    }
    return summary;
  } catch (error) {
    console.error("pushes failed", (error as Error).message);
    return null;
  }
}
