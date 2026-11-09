// ConceptApp's service worker: notifications on the phone, and nothing else.
// No fetch handler and no cache of the app: pages, assets and server actions
// never pass through it, so it can never serve a stale app or break a deploy.
// A push carries no payload; the worker asks /push/inbox, under the session of
// whoever is signed in on the phone, what to show. It holds no words of its
// own: they come from the app's messages (/push/inbox, and the line the page
// leaves it for when there is no network). Registered only once someone
// turns notifications on, never before.
// Version 2: change this line with every edit, so browsers take the new file.

const FALLBACK_CACHE = "conceptapp-push";
const FALLBACK_KEY = "/push/fallback";
const INBOX = "/notifications";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);

/** A path inside the app, or the inbox. */
const appPath = (url) =>
  typeof url === "string" &&
  url.startsWith("/") &&
  !url.startsWith("//") &&
  !url.includes("\\")
    ? url
    : INBOX;

/** The line the page left for when the app can't be reached. */
async function fallback() {
  try {
    const cache = await caches.open(FALLBACK_CACHE);
    const stored = await cache.match(FALLBACK_KEY);
    const line = stored ? await stored.json() : null;
    if (line && typeof line.title === "string") {
      return {
        tag: "conceptapp",
        title: line.title,
        body: typeof line.body === "string" ? line.body : undefined,
        url: INBOX,
        lang: line.lang,
        dir: line.dir,
      };
    }
  } catch {
    // Nothing kept: the plain name below.
  }
  return { tag: "conceptapp", title: "ConceptApp", url: INBOX };
}

/** What to show: asked of the app, in four seconds at most. */
async function whatToShow() {
  const subscription = await self.registration.pushManager.getSubscription();
  const response = await fetch("/push/inbox", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription?.endpoint ?? null }),
    // Safari takes the permission away from a site whose pushes show nothing
    // at once, so a slow answer gives way to the kept line.
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error(`inbox ${response.status}`);
  return response.json();
}

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let lines = [];
      let unread = null;
      try {
        const answer = await whatToShow();
        lines = Array.isArray(answer.notifications)
          ? answer.notifications.slice(0, 4)
          : [];
        if (typeof answer.unread === "number") unread = answer.unread;
      } catch {
        // Offline, or the app didn't answer in time: still show something.
      }
      if (lines.length === 0) lines = [await fallback()];
      await Promise.all(
        lines.map((line) => {
          const tag = String(line.tag || "conceptapp");
          const silent = line.silent === true;
          return self.registration.showNotification(String(line.title), {
            body: typeof line.body === "string" ? line.body : undefined,
            tag,
            // A line told again keeps its tag (its row in the app), and would
            // replace the one showing without a sound: it sounds again, unless
            // it is shown again on purpose, quietly. Never both, which the
            // browser refuses.
            renotify: !silent,
            lang: line.lang,
            dir: line.dir,
            silent,
            icon: "/icon-192.png",
            badge: "/badge-96.png",
            timestamp:
              typeof line.timestamp === "number" ? line.timestamp : undefined,
            data: { url: appPath(line.url) },
          });
        }),
      );
      // The home-screen icon's count (installed apps that have one).
      if (unread !== null && "setAppBadge" in self.navigator) {
        await (unread > 0
          ? self.navigator.setAppBadge(unread)
          : self.navigator.clearAppBadge()
        ).catch(() => {});
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    appPath(event.notification.data?.url),
    self.location.origin,
  ).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const open = windows.find(
        (client) => new URL(client.url).origin === self.location.origin,
      );
      if (open) {
        await open.focus();
        try {
          await open.navigate(target);
          return;
        } catch {
          // Not controlled by this worker yet: open a window instead.
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

// A browser that replaces a subscription by itself (Firefox, some Chromes):
// the new one is saved in place of the old.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const key = event.oldSubscription?.options?.applicationServerKey;
      if (!key) return;
      const fresh = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
      await fetch("/push/subscription", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...fresh.toJSON(),
          replaces: event.oldSubscription.endpoint,
        }),
      });
    })(),
  );
});

// The page leaves the line to show when the app can't be reached, in the
// app's own words, and its language.
self.addEventListener("message", (event) => {
  const line = event.data;
  // Only the app's own pages can reach its worker.
  if (line?.type !== "fallback" || typeof line.title !== "string") {
    return;
  }
  event.waitUntil(
    caches.open(FALLBACK_CACHE).then((cache) =>
      cache.put(
        FALLBACK_KEY,
        new Response(
          JSON.stringify({
            title: line.title.slice(0, 120),
            body: typeof line.body === "string" ? line.body.slice(0, 200) : "",
            lang: line.lang === "en" ? "en" : "he",
            dir: line.dir === "ltr" ? "ltr" : "rtl",
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      ),
    ),
  );
});
