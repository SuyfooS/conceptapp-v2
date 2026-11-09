import {
  type Browser,
  expect,
  type Page,
  type TestInfo,
  test,
} from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import {
  closePushBusiness,
  notifyPushOwner,
  openPushBusiness,
  PUSH_PEOPLE,
  pushDevices,
} from "./db";
import { MockPushService } from "./mock-push";
import { secondPage, signIn } from "./session";

// Notifications on the phone. Headless Chromium can't subscribe for real (it
// needs Google's push service), so the page's PushManager is a fake, with an
// endpoint on the loopback mock push service, and the rest is real: saving
// the device, sending a push with VAPID after an action, the cron route, a
// device the service says is gone, and the service worker asking what to
// show. The worker's own PushManager is the browser's, which has no
// subscription, so the worker's half covers only the path without an
// endpoint; `note_push_fetch`'s `since` is covered in pgTAP. Needs the
// generated keys CI sets (VAPID_*, CRON_SECRET, PUSH_TEST_ORIGIN). Once, on
// the desktop project: the phone and tablet projects are Chromium too.

const ORIGIN = process.env.PUSH_TEST_ORIGIN ?? "";
const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? "";
const CRON_SECRET = process.env.CRON_SECRET ?? "";
// The demo shop's worker (supabase/seed.sql), in no other spec.
const DEMO_WORKER = { local: "050-000-0011", e164: "+972500000011" };

const p = he.app.notifications.push;
const sw = he.app.shifts.swap;
const sheet = he.app.shifts.sheet;

test.skip(
  !ORIGIN || !PUBLIC_KEY || !CRON_SECRET,
  "needs VAPID keys, CRON_SECRET and PUSH_TEST_ORIGIN (CI sets them)",
);

/** The page's PushManager, faked: a subscription on the mock push service. */
async function fakePushManager(page: Page) {
  await page.addInitScript((origin: string) => {
    const KEY = "e2e-push-subscription";
    const b64 = (bytes: Uint8Array) =>
      btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    const unb64 = (text: string) =>
      Uint8Array.from(
        atob(
          text.replace(/-/g, "+").replace(/_/g, "/") +
            "=".repeat((4 - (text.length % 4)) % 4),
        ),
        (c) => c.charCodeAt(0),
      );
    type Stored = {
      endpoint: string;
      key: string;
      p256dh: string;
      auth: string;
    };
    const make = (stored: Stored) => ({
      endpoint: stored.endpoint,
      expirationTime: null,
      options: {
        userVisibleOnly: true,
        applicationServerKey: unb64(stored.key).buffer,
      },
      getKey: (name: string) =>
        unb64(name === "p256dh" ? stored.p256dh : stored.auth).buffer,
      toJSON: () => ({
        endpoint: stored.endpoint,
        expirationTime: null,
        keys: { p256dh: stored.p256dh, auth: stored.auth },
      }),
      unsubscribe: async () => {
        localStorage.removeItem(KEY);
        return true;
      },
    });
    const proto = PushManager.prototype as unknown as {
      subscribe: (options: { applicationServerKey: BufferSource }) => unknown;
      getSubscription: () => unknown;
    };
    proto.subscribe = async (options) => {
      const key = options.applicationServerKey;
      const bytes =
        key instanceof ArrayBuffer
          ? new Uint8Array(key)
          : new Uint8Array(key.buffer, key.byteOffset, key.byteLength);
      const p256dh = crypto.getRandomValues(new Uint8Array(65));
      p256dh[0] = 4;
      const stored: Stored = {
        endpoint: `${origin}/push/${crypto.randomUUID()}`,
        key: b64(bytes),
        p256dh: b64(p256dh),
        auth: b64(crypto.getRandomValues(new Uint8Array(16))),
      };
      localStorage.setItem(KEY, JSON.stringify(stored));
      return make(stored);
    };
    proto.getSubscription = async () => {
      const raw = localStorage.getItem(KEY);
      return raw ? make(JSON.parse(raw) as Stored) : null;
    };
  }, ORIGIN);
}

/** Wait until the mock has had `count` pushes, and give them back. */
async function pushes(mock: MockPushService, count: number) {
  await expect.poll(() => mock.seen.length, { timeout: 15_000 }).toBe(count);
  return mock.seen;
}

test("notifications reach the phone, and the phone shows them", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "once, on the desktop");
  test.setTimeout(120_000);
  await openPushBusiness();
  const mock = new MockPushService(ORIGIN, PUBLIC_KEY);
  await mock.start();
  try {
    await phoneNotifications(page, browser, baseURL ?? "", testInfo, mock);
  } finally {
    await mock.stop();
    await closePushBusiness();
  }
});

async function phoneNotifications(
  page: Page,
  browser: Browser,
  baseURL: string,
  testInfo: TestInfo,
  mock: MockPushService,
) {
  await page.context().grantPermissions(["notifications"], {
    origin: baseURL,
  });
  await fakePushManager(page);
  await signIn(page, PUSH_PEOPLE.owner);

  // The switch, off, saves the device when pressed.
  await page.goto("/notifications");
  const toggle = page.getByRole("switch", { name: /^התראות ל/ });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect
    .poll(async () => (await pushDevices(PUSH_PEOPLE.owner.id)).length)
    .toBe(1);
  const [device] = await pushDevices(PUSH_PEOPLE.owner.id);
  expect(device?.endpoint.startsWith(`${ORIGIN}/push/`)).toBe(true);
  expect(device?.label).toBe("computer");
  expect(mock.seen).toHaveLength(0);

  // A colleague gives a shift away: one push, signed as a push service
  // checks it, with nothing in it.
  const worker = await secondPage(browser, testInfo);
  await signIn(worker, PUSH_PEOPLE.worker);
  await worker.goto("/schedule/shifts");
  await worker
    .getByRole("button", { name: new RegExp(`^${sw.buttons.give}, `) })
    .filter({ visible: true })
    .click();
  const giving = worker.getByRole("dialog");
  await expect(giving).toContainText(sheet.give);
  await giving
    .getByRole("button", { name: new RegExp(`^${sw.buttons.give}, `) })
    .click();
  await expect(giving).toHaveCount(0);
  const [offered] = await pushes(mock, 1);
  expect(offered?.problems).toEqual([]);
  expect(offered?.path).toBe(new URL(device?.endpoint ?? "").pathname);
  await worker.context().close();

  // The test button sends another.
  await page.getByRole("button", { name: new RegExp(p.test.action) }).click();
  await expect(page.getByText(p.test.sent).first()).toBeVisible();
  const second = (await pushes(mock, 2))[1];
  expect(second?.problems).toEqual([]);

  // The service worker, woken by a push with no payload, asks the app and
  // shows the newest line: the test.
  const cdp = await page.context().newCDPSession(page);
  const registrationId = new Promise<string>((resolve) => {
    cdp.on("ServiceWorker.workerRegistrationUpdated", ({ registrations }) => {
      const mine = registrations.find(
        (r) => !r.isDeleted && r.scopeURL === `${baseURL}/`,
      );
      if (mine) resolve(mine.registrationId);
    });
  });
  // Where headless Chromium keeps no notifications, the worker's question
  // to the app is what shows it ran.
  const inboxAsked: string[] = [];
  page.context().on("request", (request) => {
    if (request.url().endsWith("/push/inbox")) inboxAsked.push(request.url());
  });
  await cdp.send("ServiceWorker.enable");
  await cdp.send("ServiceWorker.deliverPushMessage", {
    origin: baseURL,
    registrationId: await registrationId,
    data: "",
  });
  const shown = async () =>
    page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const list = await registration.getNotifications();
      return list.map((n) => ({
        title: n.title,
        url: (n.data as { url?: string } | null)?.url ?? "",
      }));
    });
  await expect
    .poll(async () => (await shown()).length > 0 || inboxAsked.length > 0, {
      timeout: 15_000,
    })
    .toBe(true);
  const notices = await shown();
  if (notices.length > 0) {
    // Headless Chromium kept it: the line itself, from the messages.
    expect(notices[0]?.title).toBe(he.app.notifications.kinds.push.test.title);
    expect(notices[0]?.url).toMatch(/^\/notifications\/open\/[0-9a-f-]{36}$/);
  }

  // The cron route sends what is due, only with the secret.
  await notifyPushOwner();
  const wrong = await page.request.post("/cron/notifications", {
    headers: { Authorization: `Bearer ${"x".repeat(64)}` },
  });
  expect(wrong.status()).toBe(401);
  expect(mock.seen).toHaveLength(2);
  // The service says the device is gone: it is forgotten.
  mock.status = 410;
  const right = await page.request.post("/cron/notifications", {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  expect(right.status()).toBe(202);
  await pushes(mock, 3);
  await expect
    .poll(async () => (await pushDevices(PUSH_PEOPLE.owner.id)).length)
    .toBe(0);
}

test("the service worker is served fresh, as JavaScript", async ({
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "once, on the desktop");
  const response = await request.get("/sw.js");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toMatch(/javascript/);
  expect(response.headers()["cache-control"]).toMatch(/no-cache/);
  const source = await response.text();
  // No fetch handler, so it never stands between the app and the network.
  expect(source).not.toMatch(/addEventListener\(\s*["']fetch["']/);
});

test("a demo business keeps its notifications in the app", async ({
  page,
  baseURL,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "once, on the desktop");
  await page.context().grantPermissions(["notifications"], {
    origin: baseURL ?? "",
  });
  await signIn(page, DEMO_WORKER);
  await page.goto("/notifications");
  await expect(page.getByText(p.demo).first()).toBeVisible();
  await expect(page.getByRole("switch")).toHaveCount(0);
  // And the app refuses to save a device for them.
  const status = await page.evaluate(async (origin: string) => {
    const response = await fetch("/push/subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: `${origin}/push/demo`,
        keys: { p256dh: `B${"A".repeat(86)}`, auth: "aW5zdGFudC1hdXRoLWtleQ" },
      }),
    });
    return response.status;
  }, ORIGIN);
  expect(status).toBe(409);
});
