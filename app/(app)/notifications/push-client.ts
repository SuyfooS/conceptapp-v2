import type { BrowserFacts } from "@domain/push";

/**
 * The browser's half of notifications on the phone, shared by the push switch
 * and the quiet check the app makes on each visit. Only for client components.
 */

/** The service worker, at the root, never fetched from a cache. */
export const WORKER = "/sw.js";

/** What the browser can tell about itself. */
export function browserFacts(): BrowserFacts {
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standalone,
    canPush:
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window,
  };
}

/** The application server key, as `pushManager.subscribe` takes it. */
export function keyBytes(publicKey: string): Uint8Array<ArrayBuffer> {
  const base64 = publicKey.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Whether a subscription was made with this key: a rotated key needs a new one. */
export function madeWith(
  subscription: PushSubscription,
  publicKey: string,
): boolean {
  const key = subscription.options?.applicationServerKey;
  if (!key) return false;
  const have = new Uint8Array(key);
  const want = keyBytes(publicKey);
  return (
    have.length === want.length && have.every((byte, i) => byte === want[i])
  );
}

/** Subscribe with the app's key; the browser asks for permission if it must. */
export function subscribe(
  registration: ServiceWorkerRegistration,
  publicKey: string,
): Promise<PushSubscription> {
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes(publicKey),
  });
}

export type SaveAnswer = "saved" | "demo" | "failed";

/**
 * Tell the app this browser's subscription, for the person signed in, and
 * the endpoint it replaces, when it does.
 */
export async function saveSubscription(
  subscription: PushSubscription,
  replaces?: string,
): Promise<SaveAnswer> {
  try {
    const response = await fetch("/push/subscription", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        replaces
          ? { ...subscription.toJSON(), replaces }
          : subscription.toJSON(),
      ),
    });
    if (response.ok) return "saved";
    return response.status === 409 ? "demo" : "failed";
  } catch {
    return "failed";
  }
}

/** Tell the app to forget this browser's subscription. */
export async function forgetSubscription(
  subscription: PushSubscription,
): Promise<boolean> {
  try {
    const response = await fetch("/push/subscription", {
      method: "DELETE",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * The app's worker, when this browser registered it before (someone turned
 * notifications on here); null otherwise. Registers nothing.
 */
export async function ourWorker(): Promise<ServiceWorkerRegistration | null> {
  const registration = await navigator.serviceWorker.getRegistration("/");
  const script =
    registration?.active?.scriptURL ??
    registration?.waiting?.scriptURL ??
    registration?.installing?.scriptURL;
  return registration && script?.endsWith(WORKER) ? registration : null;
}

/**
 * The worker, registered now if it isn't, and ready: only once the person
 * has turned notifications on.
 */
export async function readyWorker(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register(WORKER, {
    scope: "/",
    updateViaCache: "none",
  });
  return navigator.serviceWorker.ready;
}

/** Leave the worker the line it shows when the app can't be reached. */
export function leaveFallback(
  registration: ServiceWorkerRegistration,
  line: { title: string; body: string; lang: string; dir: string },
): void {
  registration.active?.postMessage({ type: "fallback", ...line });
}
