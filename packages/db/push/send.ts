import "server-only";
import { type PushOutcome, pushOutcome, retryAfterSeconds } from "@domain/push";
import { pushEndpointOf } from "@domain/push-endpoint";
import type { PushConfig } from "./env";
import { vapidAuthorization } from "./vapid";

export type PushResult = {
  outcome: PushOutcome;
  /** Seconds the push service asked to wait, when it did. */
  wait?: number;
  /** The status, or null when nothing answered: for counting, never an endpoint. */
  status: number | null;
  /** Why a push service refused, when it said in a word (Apple's `reason`). */
  reason?: string;
};

/** A refusal's reason, as Apple gives it ({"reason": "BadJwtToken"}), or null. */
async function reasonOf(response: Response): Promise<string | null> {
  try {
    const text = (await response.text()).slice(0, 500);
    const reason: unknown = JSON.parse(text)?.reason;
    return typeof reason === "string" && /^[A-Za-z]{1,40}$/.test(reason)
      ? reason
      : null;
  } catch {
    return null;
  }
}

export type SendOptions = {
  /** Seconds the push service keeps it for a phone that is off. */
  ttl: number;
  urgency?: "very-low" | "low" | "normal" | "high";
  /** The browser tests' mock push service, when there is one. */
  testOrigin?: string | null;
  fetch?: typeof fetch;
  now?: number;
};

/** How long one push may take. */
export const SEND_TIMEOUT_MS = 10_000;

/**
 * One empty push to one device (RFC 8030): no body, so no encryption and
 * nothing of the line on the push service; the service worker asks the app
 * what to show. The endpoint is checked against the push services we know
 * again here, not only when it was saved. Pending pushes to a device share
 * one topic, so a phone that was off wakes once.
 */
export async function sendPush(
  endpoint: string,
  config: PushConfig,
  options: SendOptions,
): Promise<PushResult> {
  const url = pushEndpointOf(endpoint, { testOrigin: options.testOrigin });
  // Nowhere we may send: it can never go, so the device is forgotten.
  if (!url) return { outcome: "gone", status: null };
  const now = options.now ?? Date.now();
  const fetchImpl = options.fetch ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: vapidAuthorization(url, config, now),
        TTL: String(Math.max(0, Math.floor(options.ttl))),
        Urgency: options.urgency ?? "normal",
        Topic: "inbox",
      },
      // Empty, with no Content-Encoding: Apple takes an empty push without it.
      body: new Uint8Array(0),
      redirect: "error",
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return { outcome: "retry", status: null };
  }
  const outcome = pushOutcome(response.status);
  if (outcome === "refused") {
    const reason = await reasonOf(response);
    return reason
      ? { outcome, status: response.status, reason }
      : { outcome, status: response.status };
  }
  // Nothing else is read from an answer but its status and Retry-After.
  await response.body?.cancel().catch(() => {});
  if (outcome !== "retry") return { outcome, status: response.status };
  const wait = retryAfterSeconds(response.headers.get("retry-after"), now);
  return wait === null
    ? { outcome, status: response.status }
    : { outcome, status: response.status, wait };
}
