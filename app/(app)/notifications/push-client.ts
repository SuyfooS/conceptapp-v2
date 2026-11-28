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

/**
 * localStorage: the steps to the home screen were put away in this browser
 * (`pushAskMark` in @domain/push). Kept by the browser alone, never for the
 * person: on an iPhone the app on the home screen has storage of its own, so
 * it still offers the switch once it is installed.
 */
export const INSTALL_PUT_AWAY_KEY = "conceptapp:push-install-put-away";

/** Whether the steps to the home screen were put away here; no when storage can't say. */
export function installPutAway(): boolean {
  try {
    return localStorage.getItem(INSTALL_PUT_AWAY_KEY) !== null;
  } catch {
    return false;
  }
}

/** Puts the steps to the home screen away in this browser, when storage lets it. */
export function putInstallAway(): void {
  try {
    localStorage.setItem(INSTALL_PUT_AWAY_KEY, new Date().toISOString());
  } catch {
    // Private browsing or blocked storage: they come again next time.
  }
}

/**
 * Today's "לא עכשיו" for the person, said in this page: held for its
 * "ביטול" (`useHeldWrite`) and sent only once Today is left or the wait
 * ends, so a screen drawn before it lands (the one being opened as Today is
 * left, or one Next keeps for the way back) still has the offer. While this
 * is set, a moment's card offers nothing (`usePushAskOnce`). In this page
 * only, never stored: every screen drawn after the write lands has no offer
 * anyway, and signing out loads a new page.
 */
let personPutAway = false;

/** Today's "לא עכשיו" for the person was said (true), or taken back with "ביטול" (false). */
export function holdPersonPutAway(said: boolean): void {
  personPutAway = said;
}

/** Whether Today's "לא עכשיו" for the person was said in this page. */
export function personPutAwayHere(): boolean {
  return personPutAway;
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

/** The line the worker shows when the app can't be reached, in our words. */
export type FallbackLine = {
  title: string;
  body: string;
  lang: string;
  dir: string;
};

/** Leave the worker the line it shows when the app can't be reached. */
export function leaveFallback(
  registration: ServiceWorkerRegistration,
  line: FallbackLine,
): void {
  registration.active?.postMessage({ type: "fallback", ...line });
}

/**
 * What turning notifications on came to: on, blocked by the browser, not
 * allowed this time (the person closed the question), a demo business, or
 * something that didn't go through.
 */
export type TurnOnAnswer = "on" | "denied" | "off" | "demo" | "failed";

/**
 * Turn notifications on in this browser for whoever is signed in, from
 * inside the press that asked for it (the push switch, the quiet card after
 * giving away a shift). With the worker here from before, it subscribes at
 * once. Otherwise it asks for permission first, while Safari still counts the
 * press, then registers the worker and subscribes. The app keeps the
 * subscription, or it is taken back. Answers with the worker, once there is
 * one, for the next press.
 */
export async function turnOnPush(
  known: ServiceWorkerRegistration | null,
  publicKey: string,
  fallback: FallbackLine,
): Promise<{
  answer: TurnOnAnswer;
  registration: ServiceWorkerRegistration | null;
}> {
  let registration = known;
  let subscription: PushSubscription;
  try {
    if (registration) {
      subscription = await subscribe(registration, publicKey);
    } else {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        return {
          answer: permission === "denied" ? "denied" : "off",
          registration,
        };
      }
      registration = await readyWorker();
      leaveFallback(registration, fallback);
      subscription = await subscribe(registration, publicKey);
    }
  } catch {
    return {
      answer: Notification.permission === "denied" ? "denied" : "failed",
      registration,
    };
  }
  const saved = await saveSubscription(subscription);
  if (saved !== "saved") await subscription.unsubscribe().catch(() => false);
  return {
    answer: saved === "saved" ? "on" : saved === "demo" ? "demo" : "failed",
    registration,
  };
}
