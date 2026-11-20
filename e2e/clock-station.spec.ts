import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import { expectCameraOff, standInCamera } from "./camera";
import {
  addDemoStations,
  clearDemoStations,
  clearPunchState,
  clearTimeEntries,
  demoActivityActions,
  demoEntryProofs,
  demoStationAdds,
  demoStations,
  pairingsSince,
  setDemoRequirePunchCode,
  stopDemoStations,
} from "./db";
import { secondPage, signIn } from "./session";
import { heT } from "./t";

// The clock station (#78 phase 5; Orel's lock of 17 November 2026): whoever
// shows the clock's code locks the business's tablet on it from /clock/code,
// and it signs out there, showing only the code, with nobody's account on it.
// The team clocks in by it, the team's hours list it and stop it, with an
// undo, and signing in on it again takes the SMS code to one's own phone.
// Everyone signed in on it is told on Home that it is the business's tablet,
// and signing out there brings its code back, not the door (Orel, 20
// November 2026). Seeded in supabase/seed.sql: the demo restaurant's owner,
// manager and a worker. The flows run on the phone only (CI minutes); the
// three widths are checked on the design twins (design.spec.ts). This file
// leaves no station and the code switched off, whatever happens.
const OWNER = {
  name: "אורי הדגמה",
  local: "050-000-0001",
  e164: "+972500000001",
};
const MANAGER = {
  name: "שירן הדגמה",
  local: "050-000-0002",
  e164: "+972500000002",
};
const NOA = { name: "נועה כהן", local: "050-000-0003", e164: "+972500000003" };
const BUSINESS = "מסעדת הדגמה";

const c = he.app.clock;
const lock = c.station.lock;
const listed = c.team.stations;
const s = he.station;
const fill = (text: string, values: Record<string, string>) =>
  Object.entries(values).reduce(
    (out, [key, value]) => out.replace(`{${key}}`, value),
    text,
  );

/** The digits a code screen or a station shows now. */
async function digitsOn(page: Page): Promise<string> {
  const shown = page.getByText(/^\d{3} \d{3}$/);
  await expect(shown).toBeVisible();
  return ((await shown.textContent()) ?? "").replace(/\D/g, "");
}

/** The circle, by the last words of its name: the time may come before them. */
const circle = (page: Page, name: string) =>
  page.getByRole("button", { name: new RegExp(`(^|\\s)${name}$`) });

async function expectCleanPage(page: Page) {
  // Metadata streams in after the body (see new-business.spec.ts).
  await expect(page).toHaveTitle(/ConceptApp$/);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.flatMap((v) =>
      v.nodes.map((n) => `${v.id}: ${n.target.join(" ")} ${n.failureSummary}`),
    ),
  ).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Locks the device `page` is on from the code screen, signed in as `person`. */
async function lockDevice(page: Page, name: string) {
  await page.goto("/clock/code");
  await page.getByRole("button", { name: lock.open }).click();
  const sheet = page.getByRole("dialog", { name: lock.title });
  await sheet.getByLabel(lock.name).fill(name);
  await sheet.getByRole("button", { name: lock.submit }).click();
  await expect(page).toHaveURL(/\/station$/);
  await expect(page.getByRole("img", { name: c.code.qrLabel })).toBeVisible();
}

async function startClean() {
  await setDemoRequirePunchCode(false);
  await clearPunchState();
  await clearDemoStations();
  for (const person of [OWNER, MANAGER, NOA]) {
    await clearTimeEntries(person.e164);
  }
}

test.beforeEach(async ({ page }, testInfo) => {
  void page;
  test.skip(
    testInfo.project.name !== "phone",
    "The flows run on the phone; design.spec.ts covers the three widths.",
  );
  await startClean();
});
test.afterAll(startClean);

test("an owner locks the business's tablet on the code, and it shows only the code", async ({
  page,
  browser,
}, testInfo) => {
  // Two sign-ins of one person (the second waits out the SMS cooldown), two
  // axe runs and two screenshots.
  test.setTimeout(60_000);
  // The log keeps earlier runs' lines on the same local database.
  const since = new Date(Date.now() - 2000);
  // The owner's own phone, signed in too: it stays so.
  const phone = await secondPage(browser, testInfo);
  try {
    await signIn(phone, OWNER);
    await signIn(page, OWNER);
    await page.goto("/clock/code");
    await expect(page.getByText(lock.hint)).toBeVisible();
    await page.getByRole("button", { name: lock.open }).click();
    const sheet = page.getByRole("dialog", { name: lock.title });
    // What locking does, said before it is pressed.
    for (const line of [lock.onlyCode, lock.signInAgain, lock.ownPhone]) {
      await expect(sheet.getByText(line)).toBeVisible();
    }
    await expect(sheet.getByLabel(lock.name)).toHaveValue(
      fill(lock.defaultName, { n: "1" }),
    );
    await expectCleanPage(page);
    await page.screenshot({ path: testInfo.outputPath("station-lock.png") });

    // A name is needed: nothing is made without one.
    await sheet.getByLabel(lock.name).fill("   ");
    await sheet.getByRole("button", { name: lock.submit }).click();
    await expect(sheet.getByRole("alert")).toHaveText(lock.failure.name);
    expect(await demoStations()).toEqual([]);

    await sheet.getByLabel(lock.name).fill("עמדת הכניסה");
    await sheet.getByRole("button", { name: lock.submit }).click();

    // The station: the business, the code, how to use it, and nobody's name.
    await expect(page).toHaveURL(/\/station$/);
    await expect(
      page.getByRole("heading", { level: 1, name: BUSINESS }),
    ).toBeVisible();
    await expect(page.getByRole("img", { name: c.code.qrLabel })).toBeVisible();
    await digitsOn(page);
    await expect(page.getByText(s.how)).toBeVisible();
    await expect(
      page.getByText(fill(s.name, { name: "עמדת הכניסה" })),
    ).toBeVisible();
    await expect(page.getByText(OWNER.name)).toHaveCount(0);
    await expectCleanPage(page);
    await page.screenshot({
      path: testInfo.outputPath("station.png"),
      fullPage: true,
    });
    expect(await demoStations()).toEqual([
      {
        name: "עמדת הכניסה",
        stopped: false,
        seen: true,
        createdBy: OWNER.e164,
      },
    ]);

    // Its cookie is for the server only, and kept long.
    const cookie = (await page.context().cookies()).find(
      (one) => one.name === "ca_station",
    );
    expect(cookie).toMatchObject({
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
    });
    expect((cookie?.expires ?? 0) * 1000 - Date.now()).toBeGreaterThan(
      399 * 24 * 3_600_000,
    );

    // Signed out here: the owner's screens lead to the door.
    await page.goto("/clock");
    await expect(page).toHaveURL(/\/enter$/);
    await page.goto("/station");
    await expect(page.getByRole("img", { name: c.code.qrLabel })).toBeVisible();

    // And nowhere else: the owner's own phone still shows the code.
    await phone.goto("/clock/code");
    await expect(
      phone.getByRole("img", { name: c.code.qrLabel }),
    ).toBeVisible();
    await expect(phone).toHaveURL(/\/clock\/code$/);
  } finally {
    await phone.context().close();
  }

  // The log says who left which device: one line, this test's, the owner's.
  // The refused try without a name left none.
  await expect
    .poll(() => demoStationAdds(since))
    .toEqual([{ name: "עמדת הכניסה", by: OWNER.e164 }]);
});

test("with ten stations running a lock is refused before it pairs, and leaves nothing pairing", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await addDemoStations(
    Array.from({ length: 9 }, (_, i) =>
      fill(lock.defaultName, { n: String(i + 1) }),
    ),
  );
  await signIn(page, OWNER);
  await page.goto("/clock/code");
  // Nine run: a tenth is offered.
  await page.getByRole("button", { name: lock.open }).click();
  const sheet = page.getByRole("dialog", { name: lock.title });
  await expect(sheet.getByLabel(lock.name)).toHaveValue(
    fill(lock.defaultName, { n: "10" }),
  );

  // Another device is locked meanwhile, the tenth. The refusal comes before
  // any pairing starts: the table of devices pairing, which every business
  // shares, is left as it was.
  await addDemoStations(["טאבלט המטבח"]);
  const since = new Date(Date.now() - 2000);
  await sheet.getByRole("button", { name: lock.submit }).click();
  await expect(sheet.getByRole("alert")).toHaveText(
    heT("app.clock.station.lock.failure.tooManyStations", { count: 10 }),
  );
  expect(await pairingsSince(since)).toBe(0);
  expect(await demoStations()).toHaveLength(10);
  // Nothing was locked: still signed in, on the code screen.
  await expect(page).toHaveURL(/\/clock\/code$/);
});

test("only the business's station gets codes, and never beside an account", async ({
  page,
  browser,
}, testInfo) => {
  const noStore = (response: { headers(): Record<string, string> }) =>
    expect(response.headers()["cache-control"]).toContain("no-store");

  // A device that is no station.
  await page.goto("/station");
  await expect(
    page.getByRole("heading", { level: 1, name: s.notStation.title }),
  ).toBeVisible();
  await expectCleanPage(page);
  const none = await page.request.post("/station/code");
  expect(none.status()).toBe(403);
  expect(await none.json()).toEqual({ ok: false, failure: "notStation" });
  noStore(none);

  await signIn(page, OWNER);
  await lockDevice(page, "עמדת הכניסה");
  const own = await page.request.post("/station/code");
  expect(own.status()).toBe(200);
  expect(await own.json()).toMatchObject({
    ok: true,
    short: expect.stringMatching(/^\d{6}$/),
  });
  noStore(own);
  const crossSite = await page.request.post("/station/code", {
    headers: { "sec-fetch-site": "cross-site" },
  });
  expect(crossSite.status()).toBe(403);

  // Someone signs in on it: no code shows, and the route makes none.
  await page.getByRole("link", { name: s.signIn }).click();
  await expect(page).toHaveURL(/\/enter$/);
  await signIn(page, NOA);
  const signedIn = await page.request.post("/station/code");
  expect(signedIn.status()).toBe(409);
  expect(await signedIn.json()).toEqual({ ok: false, failure: "signedIn" });
  await page.goto("/station");
  await expect(
    page.getByRole("heading", { level: 1, name: s.signedIn.title }),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: c.code.qrLabel })).toHaveCount(0);
  // A worker doesn't lock it: home is the way on.
  await expect(page.getByRole("button", { name: s.signedIn.lock })).toHaveCount(
    0,
  );
  await expect(page.getByRole("link", { name: s.signedIn.home })).toBeVisible();
  await expectCleanPage(page);

  // Another device of the same business, with no cookie, gets nothing.
  const other = await secondPage(browser, testInfo);
  try {
    const refused = await other.request.post("/station/code");
    expect(await refused.json()).toEqual({ ok: false, failure: "notStation" });
  } finally {
    await other.context().close();
  }
});

test("a worker clocks in by the station's digits, and the team's hours stop it with an undo", async ({
  page,
  browser,
}, testInfo) => {
  // Three people sign in, and the station's own asks (every 20 seconds) are
  // waited for twice.
  test.setTimeout(120_000);
  await setDemoRequirePunchCode(true);
  const since = new Date(Date.now() - 2000);
  await signIn(page, OWNER);
  await lockDevice(page, "עמדת הכניסה");

  const manager = await secondPage(browser, testInfo);
  const noa = await secondPage(browser, testInfo);
  try {
    // The team's hours list it as showing the code now.
    await signIn(manager, MANAGER);
    await manager.goto("/clock/team");
    await expect(
      manager.getByRole("heading", { level: 2, name: listed.title }),
    ).toBeVisible();
    await expect(manager.getByText("עמדת הכניסה")).toBeVisible();
    await expect(manager.getByText(listed.showing)).toBeVisible();
    await expect(manager.getByText(listed.howTo)).toBeVisible();
    await expectCleanPage(manager);
    await manager.screenshot({
      path: testInfo.outputPath("station-team.png"),
      fullPage: true,
    });

    // A worker types the digits the station shows.
    await standInCamera(noa, "film");
    await signIn(noa, NOA);
    await noa.goto("/clock");
    await circle(noa, c.circle.scanIn).click();
    await noa.getByRole("button", { name: c.type.card }).click();
    await expectCameraOff(noa);
    const sheet = noa.getByRole("dialog", { name: c.type.titleIn });
    await sheet.getByLabel(c.type.label).fill(await digitsOn(page));
    await expect(noa.getByText(c.done.in, { exact: true })).toBeVisible();
    expect(await demoEntryProofs(NOA.e164)).toEqual([
      { inProof: "typed", outProof: null, confirmed: false },
    ]);

    // The code no longer asked (the module's default), and the team's hours
    // read again: its one station is listed all the same.
    const stop = manager.getByRole("button", {
      name: fill(listed.stopLabel, { name: "עמדת הכניסה" }),
    });
    await setDemoRequirePunchCode(false);
    await manager.reload();
    await expect(stop).toBeVisible();

    // Stopped, and taken back from the toast.
    await stop.click();
    const undo = manager
      .getByRole("status")
      .filter({ hasText: fill(listed.stopped, { name: "עמדת הכניסה" }) })
      .getByRole("button", { name: listed.undo });
    await expect(undo).toBeVisible();
    await expect
      .poll(async () => (await demoStations())[0]?.stopped)
      .toBe(true);
    // The page came back with no station running: the list stays, saying
    // how to leave one, and the toast's way back with it.
    await expect(
      manager.getByRole("heading", { level: 2, name: listed.title }),
    ).toBeVisible();
    await expect(manager.getByText(listed.howTo)).toBeVisible();
    await expect(undo).toBeVisible();
    await undo.click();
    await expect(
      manager.getByText(fill(listed.restarted, { name: "עמדת הכניסה" })),
    ).toBeVisible();
    await expect
      .poll(async () => (await demoStations())[0]?.stopped)
      .toBe(false);
    await expect(stop).toBeVisible();
    // The station shows the code, also if it asked while it was stopped.
    await expect(page.getByRole("img", { name: c.code.qrLabel })).toBeVisible({
      timeout: 30_000,
    });

    // Stopped for good: the station says so on its next ask.
    await stop.click();
    await expect(
      manager.getByText(fill(listed.stopped, { name: "עמדת הכניסה" })),
    ).toBeVisible();
    await expect(stop).toHaveCount(0);
    await expect(manager.getByText(listed.howTo)).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: s.stopped.title }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("img", { name: c.code.qrLabel })).toHaveCount(
      0,
    );
    await expectCleanPage(page);

    // The log names the station on each line.
    expect(await demoActivityActions("clock.station.stop", since)).toBe(2);
    expect(await demoActivityActions("clock.station.restart", since)).toBe(1);
    await manager.goto("/manage/activity");
    await expect(
      manager
        .getByRole("main")
        .getByText(
          fill(he.app.manage.activity.actions.clock.stationStop, {
            name: "עמדת הכניסה",
          }),
        )
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
  } finally {
    await manager.context().close();
    await noa.context().close();
  }
});

test("signing in on the station unlocks it, and Home locks it again as the same station", async ({
  page,
}, testInfo) => {
  // Two people sign in, an axe run and a screenshot.
  test.setTimeout(60_000);
  await signIn(page, OWNER);
  await lockDevice(page, "עמדת הכניסה");

  // Signing in is the way to an account here: a whole sign-in, to the
  // person's own phone.
  await page.getByRole("link", { name: s.signIn }).click();
  await expect(page).toHaveURL(/\/enter$/);
  await signIn(page, MANAGER);

  // Home says this device is the station, and locks it again: whoever may
  // lock it isn't told to sign out instead.
  const reminder = page.getByText(c.station.reminder.body);
  await expect(reminder).toBeVisible();
  await expect(page.getByText(c.station.reminder.signOutBody)).toHaveCount(0);
  await expect(page.getByRole("button", { name: he.app.signOut })).toHaveCount(
    0,
  );
  await expectCleanPage(page);
  await page.screenshot({ path: testInfo.outputPath("station-home.png") });
  await page.getByRole("button", { name: c.station.reminder.lock }).click();
  const sheet = page.getByRole("dialog", { name: lock.title });
  await expect(
    sheet.getByText(fill(lock.same, { name: "עמדת הכניסה" })),
  ).toBeVisible();
  await expect(sheet.getByLabel(lock.name)).toHaveCount(0);
  await sheet.getByRole("button", { name: lock.submit }).click();
  await expect(page).toHaveURL(/\/station$/);
  await expect(page.getByRole("img", { name: c.code.qrLabel })).toBeVisible();

  // Still the one station, not a second.
  expect((await demoStations()).map((one) => one.name)).toEqual([
    "עמדת הכניסה",
  ]);
  await page.goto("/home");
  await expect(page).toHaveURL(/\/enter$/);
});

test("anyone signed in on the station is told to sign out, and signing out shows the code again", async ({
  page,
}, testInfo) => {
  // Three sign-ins (the last waits out the SMS cooldown), an axe run and a
  // screenshot.
  test.setTimeout(90_000);
  await signIn(page, OWNER);
  await lockDevice(page, "עמדת הכניסה");

  await page.getByRole("link", { name: s.signIn }).click();
  await expect(page).toHaveURL(/\/enter$/);
  await signIn(page, NOA);

  // Home says this device is the business's tablet, to sign out when done,
  // and offers no lock: a worker doesn't edit the clock.
  const told = page.getByText(c.station.reminder.signOutBody);
  const signOut = page.getByRole("button", { name: he.app.signOut });
  await expect(told).toBeVisible();
  await expect(page.getByText(c.station.reminder.body)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: c.station.reminder.lock }),
  ).toHaveCount(0);
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("station-home-worker.png"),
  });

  // Signing out brings the code back, not the door.
  await signOut.click();
  await expect(page).toHaveURL(/\/station$/);
  await expect(page.getByRole("img", { name: c.code.qrLabel })).toBeVisible();
  await digitsOn(page);

  // Signed out for real: no piece of the session is left, the station's
  // cookie stays, and Home leads to the door.
  const cookies = await page.context().cookies();
  expect(
    cookies.filter(
      (one) => /-auth-token(\.\d+)?$/.test(one.name) && one.value !== "",
    ),
  ).toEqual([]);
  expect(cookies.some((one) => one.name === "ca_station")).toBe(true);
  await page.goto("/home");
  await expect(page).toHaveURL(/\/enter$/);
  expect((await demoStations()).map((one) => one.name)).toEqual([
    "עמדת הכניסה",
  ]);

  // Once the station is stopped, Home says nothing of it, and signing out,
  // here from the profile, goes to the door.
  await signIn(page, NOA);
  await expect(told).toBeVisible();
  await stopDemoStations();
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1 }).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(told).toHaveCount(0);
  await page.goto("/me");
  await signOut.click();
  await expect(page).toHaveURL(/\/enter$/);
});

test("a station told it stopped, by a stop taken back at once, shows the code again without waiting", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await signIn(page, OWNER);
  await lockDevice(page, "עמדת הכניסה");

  // Its next ask hears "stopped", as one in the second between a stop and its
  // undo does, while the station runs again by the time the page is read.
  let told = 0;
  await page.route(
    "**/station/code",
    async (route) => {
      told += 1;
      await route.fulfill({
        status: 409,
        json: { ok: false, failure: "stopped" },
      });
    },
    { times: 1 },
  );
  await page.reload();
  await expect.poll(() => told).toBe(1);
  // Read again, the page is still the station: it asks again at once, rather
  // than waiting a minute on what it was told before.
  await expect(page.getByRole("img", { name: c.code.qrLabel })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(s.checking)).toHaveCount(0);
  await digitsOn(page);
});
