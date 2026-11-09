import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type Request, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import { qrMatrix, qrPath } from "../packages/domain/qr";
import {
  allowCamera,
  expectCameraOff,
  expectCameraOn,
  film,
  qrDrawing,
  setPageHidden,
  standInCamera,
} from "./camera";
import {
  addOpenDemoEntry,
  clearPunchState,
  clearTimeEntries,
  demoActivityActions,
  demoEntryProofs,
  demoModuleSettings,
  demoPunchAttempts,
  endViewSessions,
  setDemoRequirePunchCode,
} from "./db";
import { secondPage, signIn } from "./session";

// The clock's code (issue #78): an owner asks for it, a manager shows it on
// their phone, and the team scans it inside the circle or types its digits to
// clock in and out, or goes ahead without a code for a manager to approve.
// Seeded in supabase/seed.sql: the demo restaurant's owner, manager and a
// worker, and the ConceptApp team's admin. The flows run on the phone only (CI
// minutes); the three widths are checked on the design demo (design.spec.ts).
// CI has no camera: the workers' pages get a stand-in (./camera.ts).
//
// This file runs before clock-team, clock, enter, modules and the rest, so it
// leaves the code switched off and nobody's typing blocked, whatever happens.
const OWNER = { local: "050-000-0001", e164: "+972500000001" };
const MANAGER = {
  name: "שירן הדגמה",
  local: "050-000-0002",
  e164: "+972500000002",
};
const NOA = { name: "נועה כהן", local: "050-000-0003", e164: "+972500000003" };
const ADMIN = { local: "050-000-0005", e164: "+972500000005" };

const c = he.app.clock;
const label = he.modules.time_clock.settings.requirePunchCode.label;
const confirmOne = "רישום אחד מחכה לאישור";
const approve = (name: string) =>
  c.team.confirm.approveLabel.replace("{name}", name);

const title = (page: Page, name: string) =>
  page.getByRole("heading", { level: 1, name });

/** The circle, by the last words of its name: the time may come before them. */
const circle = (page: Page, name: string) =>
  page.getByRole("button", { name: new RegExp(`(^|\\s)${name}$`) });

/** The digits the code screen shows now. */
async function digitsOn(page: Page): Promise<string> {
  const shown = page.getByText(/^\d{3} \d{3}$/);
  await expect(shown).toBeVisible();
  return ((await shown.textContent()) ?? "").replace(/\D/g, "");
}

/**
 * Presses the circle to come or go, which opens the camera, and goes on to
 * type the digits instead: the sheet for them, with the camera off.
 */
async function toTyping(page: Page, to: "in" | "out") {
  await circle(page, to === "in" ? c.circle.scanIn : c.circle.scanOut).click();
  await page.getByRole("button", { name: c.type.card }).click();
  await expectCameraOff(page);
  return page.getByRole("dialog", {
    name: to === "in" ? c.type.titleIn : c.type.titleOut,
  });
}

/** Text to find as it is, inside a pattern. */
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Goes to another screen through the tab bar, as a thumb would. */
async function throughTabBar(page: Page, name: string) {
  // At the top of the page the bar is full size, each tab one tap away.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator("nav[data-tab-compact]")).toHaveCount(0);
  await page
    .getByRole("navigation", { name: he.ui.appShell.mainNav })
    .filter({ visible: true })
    // The name, and Home's count of what needs the person when it has one.
    // The label and the count are blocks, so the name reads "היום , 2 ...".
    .getByRole("link", { name: new RegExp(`^${literal(name)}(\\s*,|$)`) })
    .click();
}

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

async function startClean() {
  await setDemoRequirePunchCode(false);
  await clearPunchState();
  for (const person of [OWNER, MANAGER, NOA]) {
    await clearTimeEntries(person.e164);
  }
  await endViewSessions(ADMIN.e164);
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

test("an owner asks for a code to clock in, and a manager doesn't see the switch", async ({
  page,
}) => {
  await signIn(page, OWNER);
  await page.goto("/manage/time_clock");
  const ask = page.getByRole("switch", { name: new RegExp(label) });
  await expect(ask).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText(he.app.manage.ownerOnly)).toBeVisible();
  await expectCleanPage(page);
  await ask.click();
  await expect(
    page.getByText(he.app.manage.saved, { exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => (await demoModuleSettings("time_clock")).requirePunchCode)
    .toBe(true);

  // The log says what changed.
  await page.goto("/manage/activity");
  await expect(
    page.getByRole("main").getByText(label).filter({ visible: true }).first(),
  ).toBeVisible();

  // An owner needs no code: one press, as before, and the clock offers the code.
  await page.goto("/clock");
  await expect(
    page.getByRole("link", { name: new RegExp(c.showCode.title) }),
  ).toBeVisible();
  await circle(page, c.circle.in).click();
  await expect(title(page, c.title.working)).toBeVisible();
  expect(await demoEntryProofs(OWNER.e164)).toEqual([
    { inProof: "owner", outProof: null, confirmed: false },
  ]);

  // A manager can't change it, and doesn't see it.
  await page.context().clearCookies();
  await signIn(page, MANAGER);
  await page.goto("/manage/time_clock");
  await expect(
    page.getByRole("switch", {
      name: he.modules.time_clock.settings.unpaidBreaks.label,
    }),
  ).toBeVisible();
  await expect(page.getByText(label)).toHaveCount(0);
});

test("a manager shows the code, and a worker clocks in and out by typing its digits", async ({
  page,
  browser,
}, testInfo) => {
  await setDemoRequirePunchCode(true);
  await signIn(page, MANAGER);
  await page.goto("/clock/team");
  await page.getByRole("link", { name: c.showCode.title }).click();
  await expect(page).toHaveURL(/\/clock\/code$/);
  await expect(page.getByRole("img", { name: c.code.qrLabel })).toBeVisible();
  await expect(page.getByText(c.code.notCounted)).toBeVisible();
  await digitsOn(page);
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("clock-code.png"),
    fullPage: true,
  });

  const noa = await secondPage(browser, testInfo);
  try {
    // Her camera sees no code: she types the digits instead.
    await standInCamera(noa, "film");
    await signIn(noa, NOA);
    await noa.goto("/clock");
    await expect(noa.getByText(c.line.idleScan)).toBeVisible();
    const typeIn = await toTyping(noa, "in");
    await expect(typeIn.getByLabel(c.type.label)).toBeFocused();
    await expectCleanPage(noa);
    await noa.screenshot({ path: testInfo.outputPath("clock-type.png") });
    await typeIn.getByLabel(c.type.label).fill(await digitsOn(page));
    await expect(noa.getByText(c.done.in, { exact: true })).toBeVisible();
    await expect(title(noa, c.title.working)).toBeVisible();
    await expect(typeIn).toBeHidden();

    // A break needs no code.
    await expect(noa.getByText(c.breakNote)).toBeVisible();
    await noa.getByRole("button", { name: c.startBreak }).click();
    await expect(title(noa, c.title.break)).toBeVisible();
    await circle(noa, c.circle.back).click();
    await expect(title(noa, c.title.working)).toBeVisible();

    // Leaving does, with the digits shown now.
    const typeOut = await toTyping(noa, "out");
    await typeOut.getByLabel(c.type.label).fill(await digitsOn(page));
    await expect(noa.getByText(c.done.out, { exact: true })).toBeVisible();
    await expect(title(noa, c.title.off)).toBeVisible();

    expect(await demoEntryProofs(NOA.e164)).toEqual([
      { inProof: "typed", outProof: "typed", confirmed: false },
    ]);
  } finally {
    await noa.context().close();
  }
});

test("the code changes every 20 seconds, and the one before still works", async ({
  page,
  browser,
}, testInfo) => {
  await setDemoRequirePunchCode(true);
  await signIn(page, MANAGER);
  // Before the page loads: the fake clock comes in through an init script,
  // performance.now() included.
  await page.clock.install();
  await page.goto("/clock/code");
  const before = await digitsOn(page);

  await page.clock.fastForward("00:21");
  await expect.poll(() => digitsOn(page)).not.toBe(before);

  // The database's minute runs on real time, so the code before is still live.
  const noa = await secondPage(browser, testInfo);
  try {
    await standInCamera(noa, "film");
    await signIn(noa, NOA);
    await noa.goto("/clock");
    await (await toTyping(noa, "in")).getByLabel(c.type.label).fill(before);
    await expect(noa.getByText(c.done.in, { exact: true })).toBeVisible();
    expect(await demoEntryProofs(NOA.e164)).toEqual([
      { inProof: "typed", outProof: null, confirmed: false },
    ]);
  } finally {
    await noa.context().close();
  }
});

test("a manager's own code doesn't count for them", async ({ page }) => {
  await setDemoRequirePunchCode(true);
  await signIn(page, MANAGER);
  await page.goto("/clock/code");
  const digits = await digitsOn(page);

  const own = await page.context().newPage();
  await standInCamera(own, "film");
  await own.goto("/clock");
  const sheet = await toTyping(own, "in");
  await sheet.getByLabel(c.type.label).fill(digits);
  await expect(sheet.getByRole("alert")).toHaveText(c.failure.ownCode);

  // Nor when the phone scans it: the camera reads on, for another manager's.
  await sheet
    .getByRole("button", { name: he.app.clock.team.sheet.close })
    .click();
  await circle(own, c.circle.scanIn).click();
  await film(own, await qrDrawing(page, c.code.qrLabel));
  await expect(own.getByRole("main").getByRole("alert")).toHaveText(
    c.failure.ownCode,
  );
  await expect(own.getByText(c.scan.aim)).toBeVisible();
  expect(await demoEntryProofs(MANAGER.e164)).toEqual([]);
  await own.close();
});

test("wrong digits block typing, and the worker goes ahead without a code", async ({
  page,
}, testInfo) => {
  await setDemoRequirePunchCode(true);
  const since = new Date(Date.now() - 2000);
  await standInCamera(page, "film");
  await signIn(page, NOA);
  await page.goto("/clock");
  const sheet = await toTyping(page, "in");
  const slots = sheet.getByLabel(c.type.label);

  // Nobody is showing a code, so any digits are wrong. Five tries say so.
  for (let tries = 1; tries <= 5; tries += 1) {
    await slots.fill("135790");
    await expect.poll(() => demoPunchAttempts(NOA.e164)).toBe(tries);
    await expect(slots).not.toHaveAttribute("aria-busy", "true");
    await expect(sheet.getByRole("alert")).toHaveText(c.failure.code);
  }

  // The sixth is blocked: the slots go, and going ahead without a code is
  // next, with scanning, which the block doesn't stop, beside it.
  await slots.fill("135790");
  await expect(sheet.getByRole("alert")).toHaveText(c.failure.codeLocked);
  await expect(slots).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: c.none.open })).toBeVisible();
  await expectCleanPage(page);
  await page.screenshot({ path: testInfo.outputPath("clock-locked.png") });
  await expect
    .poll(() => demoActivityActions("clock.code.locked", since))
    .toBe(1);

  // Back to the camera from there, and on without a code from under it: the
  // camera turns off.
  await sheet.getByRole("button", { name: c.none.back }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText(c.scan.aim)).toBeVisible();
  await expectCameraOn(page);
  await page.getByRole("button", { name: c.none.open }).click();
  const without = page.getByRole("dialog", { name: c.none.titleIn });
  await expect(without.getByText(c.none.body)).toBeVisible();
  await expectCameraOff(page);
  // A typing block doesn't stop scanning: the way back leads there.
  await expect(
    without.getByRole("button", { name: c.none.back }),
  ).toBeVisible();
  await expectCleanPage(page);
  await without.getByRole("button", { name: c.none.confirmIn }).click();
  await expect(page.getByText(c.done.inNone)).toBeVisible();
  await expect(title(page, c.title.working)).toBeVisible();
  expect(await demoEntryProofs(NOA.e164)).toEqual([
    { inProof: "none", outProof: null, confirmed: false },
  ]);

  // The block holds when the sheet opens again, to leave: no slots to retry.
  const leaving = await toTyping(page, "out");
  await expect(leaving.getByRole("alert")).toHaveText(c.failure.codeLocked);
  await expect(leaving.getByLabel(c.type.label)).toHaveCount(0);

  // The owner sees the block in the business's log.
  await page.context().clearCookies();
  await signIn(page, OWNER);
  await page.goto("/manage/activity");
  await expect(
    page
      .getByRole("main")
      .getByText(he.app.manage.activity.actions.clock.codeLocked)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
});

test("a manager approves an entry made without a code, and their own waits for the owner", async ({
  page,
}, testInfo) => {
  await setDemoRequirePunchCode(true);
  await addOpenDemoEntry(NOA.e164, 2, "none");
  await standInCamera(page, "film");
  await signIn(page, MANAGER);

  // Today says so before anyone asks, and leads to where it's approved.
  await page.goto("/home");
  const row = page.getByRole("main").locator('a[href="/clock/team"]');
  await expect(row).toContainText(confirmOne);
  await row.click();
  await expect(page).toHaveURL(/\/clock\/team$/);
  await expect(page.getByRole("heading", { name: confirmOne })).toBeVisible();
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("clock-confirm.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: approve(NOA.name) }).click();
  await expect(page.getByText(c.team.confirm.done)).toBeVisible();
  await expect(page.getByRole("heading", { name: confirmOne })).toHaveCount(0);
  expect(await demoEntryProofs(NOA.e164)).toEqual([
    { inProof: "none", outProof: null, confirmed: true },
  ]);

  // Her shifts say how it was made.
  await page
    .getByRole("main")
    .getByRole("link", { name: new RegExp(NOA.name) })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(NOA.name);
  await expect(
    page
      .getByText(c.history.proofInline.noneConfirmed)
      .filter({ visible: true }),
  ).not.toHaveCount(0);

  // The manager's own, without a code, isn't theirs to approve. It is one
  // press away from the camera.
  await page.goto("/clock");
  await circle(page, c.circle.scanIn).click();
  await page.getByRole("button", { name: c.none.open }).click();
  await page
    .getByRole("dialog", { name: c.none.titleIn })
    .getByRole("button", { name: c.none.confirmIn })
    .click();
  await expect(page.getByText(c.done.inNone)).toBeVisible();
  await page.goto("/clock/team");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    c.team.title,
  );
  await expect(page.getByRole("heading", { name: confirmOne })).toHaveCount(0);

  // The owner's.
  await page.context().clearCookies();
  await signIn(page, OWNER);
  await page.goto("/clock/team");
  await expect(page.getByRole("heading", { name: confirmOne })).toBeVisible();
  await page.getByRole("button", { name: approve(MANAGER.name) }).click();
  await expect(page.getByText(c.team.confirm.done)).toBeVisible();
  await expect
    .poll(async () => (await demoEntryProofs(MANAGER.e164))[0]?.confirmed)
    .toBe(true);
});

test("a worker scans the code inside the circle", async ({
  page,
  browser,
}, testInfo) => {
  await setDemoRequirePunchCode(true);
  // A code in the right shape that the business never showed: the gallery's.
  const viewer = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
  });
  const gallery = await viewer.newPage();
  await gallery.goto("/design");
  const stranger = await qrDrawing(gallery, c.code.qrLabel);
  await viewer.close();

  await signIn(page, MANAGER);
  await page.goto("/clock/code");
  await expect(page.getByRole("img", { name: c.code.qrLabel })).toBeVisible();

  const noa = await secondPage(browser, testInfo);
  try {
    await standInCamera(noa, "film");
    await signIn(noa, NOA);
    await noa.goto("/clock");
    await expect(noa.getByText(c.line.idleScan)).toBeVisible();

    // The circle turns into the camera, with typing and "without a code" under it.
    await circle(noa, c.circle.scanIn).click();
    await expect(noa.getByText(c.scan.aim)).toBeVisible();
    await expectCameraOn(noa);
    await expect(noa.getByRole("button", { name: c.type.card })).toBeVisible();
    await expect(noa.getByRole("button", { name: c.none.open })).toBeVisible();
    await expectCleanPage(noa);
    await noa.screenshot({ path: testInfo.outputPath("clock-scan.png") });

    // Stopping turns the camera off, and the focus goes back to the circle.
    await noa.getByRole("button", { name: c.scan.cancel }).click();
    await expect(circle(noa, c.circle.scanIn)).toBeFocused();
    await expectCameraOff(noa);

    // So does leaving the screen, and coming back shows the circle: the
    // camera waits for a press.
    await circle(noa, c.circle.scanIn).click();
    await expect(noa.getByText(c.scan.aim)).toBeVisible();
    await throughTabBar(noa, he.app.nav.home);
    await expect(noa).toHaveURL(/\/home$/);
    await expectCameraOff(noa);
    await throughTabBar(noa, he.modules.time_clock.name);
    await expect(noa).toHaveURL(/\/clock$/);
    await expect(circle(noa, c.circle.scanIn)).toBeVisible();
    await expectCameraOff(noa);

    // A hidden page (the phone locked, another app in front) turns it off,
    // and it opens again when the page shows.
    await circle(noa, c.circle.scanIn).click();
    await expect(noa.getByText(c.scan.aim)).toBeVisible();
    await expectCameraOn(noa);
    await setPageHidden(noa, true);
    await expectCameraOff(noa);
    await setPageHidden(noa, false);
    await expectCameraOn(noa);
    await expect(noa.getByText(c.scan.aim)).toBeVisible();

    // What reaches the server: a code that isn't the clock's never does, and
    // the stranger, refused, goes once: the camera reads on without sending
    // it again.
    let sent = 0;
    const count = (request: Request) => {
      if (request.method() === "POST" && request.headers()["next-action"]) {
        sent += 1;
      }
    };
    noa.on("request", count);
    try {
      await film(noa, qrPath(qrMatrix("https://example.com")));
      await expect(noa.getByText(c.scan.notOurs)).toBeVisible();
      expect(sent).toBe(0);

      await film(noa, stranger);
      await expect(noa.getByRole("main").getByRole("alert")).toHaveText(
        c.failure.codeScan,
      );
      await expect(noa.getByText(c.scan.aim)).toBeVisible();
      await expectCameraOn(noa);
      // Still pointed at it for a while: nothing more goes.
      await noa.waitForTimeout(2000);
      expect(sent).toBe(1);
    } finally {
      noa.off("request", count);
    }
    expect(await demoEntryProofs(NOA.e164)).toEqual([]);

    // Held up to the manager's code, it clocks in at once, and the camera
    // turns off.
    await film(noa, await qrDrawing(page, c.code.qrLabel));
    await expect(noa.getByText(c.scan.readIn)).toBeVisible();
    await expectCameraOff(noa);
    await expect(noa.getByText(c.done.in, { exact: true })).toBeVisible();
    await expect(title(noa, c.title.working)).toBeVisible();
    await film(noa, null);

    // And out, with the code shown now.
    await circle(noa, c.circle.scanOut).click();
    await expect(noa.getByText(c.scan.aim)).toBeVisible();
    await film(noa, await qrDrawing(page, c.code.qrLabel));
    await expect(noa.getByText(c.scan.readOut)).toBeVisible();
    await expectCameraOff(noa);
    await expect(title(noa, c.title.off)).toBeVisible();
    expect(await demoEntryProofs(NOA.e164)).toEqual([
      { inProof: "scan", outProof: "scan", confirmed: false },
    ]);
  } finally {
    await noa.context().close();
  }
});

test("a refused camera leads to the digits, and to the camera once allowed", async ({
  page,
}, testInfo) => {
  await setDemoRequirePunchCode(true);
  await standInCamera(page, "refused");
  await signIn(page, NOA);
  await page.goto("/clock");
  await circle(page, c.circle.scanIn).click();
  await expect(page.getByText(c.scan.denied)).toBeVisible();
  await expect(page.getByRole("button", { name: c.scan.retry })).toBeVisible();
  await expectCleanPage(page);
  await page.screenshot({ path: testInfo.outputPath("clock-no-camera.png") });

  // Typing is the way on now, and "without a code" is still there.
  await expect(page.getByRole("button", { name: c.none.open })).toBeVisible();
  await page.getByRole("button", { name: c.type.open }).click();
  const sheet = page.getByRole("dialog", { name: c.type.titleIn });
  await expect(sheet.getByLabel(c.type.label)).toBeFocused();
  expect(await demoEntryProofs(NOA.e164)).toEqual([]);

  // Allowed in the browser's settings, "Try again" opens the camera.
  await sheet.getByRole("button", { name: c.team.sheet.close }).click();
  await circle(page, c.circle.scanIn).click();
  await expect(page.getByText(c.scan.denied)).toBeVisible();
  await allowCamera(page);
  await page.getByRole("button", { name: c.scan.retry }).click();
  await expect(page.getByText(c.scan.aim)).toBeVisible();
  await expectCameraOn(page);
  await page.getByRole("button", { name: c.scan.cancel }).click();
  await expectCameraOff(page);

  // A browser with no camera at all says so, with the same way on.
  const bare = await page.context().newPage();
  try {
    await standInCamera(bare, "missing");
    await bare.goto("/clock");
    await circle(bare, c.circle.scanIn).click();
    await expect(bare.getByText(c.scan.unavailable)).toBeVisible();
    await expect(bare.getByRole("button", { name: c.type.open })).toBeVisible();
  } finally {
    await bare.close();
  }
});

test("only the business's managers get codes", async ({ page }) => {
  const noStore = (response: { headers(): Record<string, string> }) =>
    expect(response.headers()["cache-control"]).toContain("no-store");

  // A worker.
  await signIn(page, NOA);
  const worker = await page.request.post("/clock/code/issue");
  expect(worker.status()).toBe(403);
  expect(await worker.json()).toEqual({ ok: false, failure: "noAccess" });
  noStore(worker);
  await page.goto("/clock/code");
  await expect(
    page.getByRole("heading", { level: 1, name: he.app.notFound.title }),
  ).toBeVisible();

  // A manager, but from another site.
  await page.context().clearCookies();
  await signIn(page, MANAGER);
  const crossSite = await page.request.post("/clock/code/issue", {
    headers: { "sec-fetch-site": "cross-site" },
  });
  expect(crossSite.status()).toBe(403);
  noStore(crossSite);
  const own = await page.request.post("/clock/code/issue");
  expect(own.status()).toBe(200);
  expect(await own.json()).toMatchObject({
    ok: true,
    short: expect.stringMatching(/^\d{6}$/),
  });
  noStore(own);

  // The ConceptApp team viewing as a manager sees the screen and gets no code.
  await page.context().clearCookies();
  await signIn(page, ADMIN, /\/admin$/);
  await page.goto("/admin/businesses/demo-restaurant");
  await page
    .getByRole("button", {
      name: he.admin.setup.viewAs.as.manager,
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/clock/code");
  await expect(page.getByText(c.code.viewOnly)).toBeVisible();
  await expect(page.getByRole("img", { name: c.code.qrLabel })).toHaveCount(0);
  const viewing = await page.request.post("/clock/code/issue");
  expect(viewing.status()).toBe(403);
  expect(await viewing.json()).toEqual({ ok: false, failure: "viewOnly" });
  noStore(viewing);
});
