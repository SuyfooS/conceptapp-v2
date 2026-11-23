import AxeBuilder from "@axe-core/playwright";
import he from "../messages/he.json" with { type: "json" };
import {
  ageAvatar,
  avatarStored,
  clearDemoProfile,
  clearSchedule,
  demoActivityActions,
  demoOwnName,
  demoPhotoPath,
  demoProfile,
  resetDemoShop,
  scheduleDemoSunday,
  scheduleDemoToday,
  setDemoAddressForm,
  setDemoBio,
  takenDemoSwap,
  waitOutDemoMidnight,
} from "./db";
import { cameraPhoto, hasExif } from "./photo";
import { secondPage, signIn } from "./session";
import { STORAGE_SKIP, storageAnswers } from "./storage";
import { heT } from "./t";
import { expect, type Page, test } from "./test";

// The profile (#82): a photo, who sees it, and the way out (H1); a line about
// yourself, a cover and how the app addresses you (H2); one's own name
// ("השם שלי", known issue 20). People from supabase/seed.sql. The demo
// restaurant is opened to profile changes for these tests ("profiles":
// true); the demo shop keeps its people as they are, like the hosted demo
// businesses.
const NOA = {
  id: "00000000-0000-4000-a000-000000000003",
  name: "נועה כהן",
  local: "050-000-0003",
  e164: "+972500000003",
};
const SHIRAN = {
  id: "00000000-0000-4000-a000-000000000002",
  local: "050-000-0002",
  e164: "+972500000002",
};
const YOAV = { name: "יואב לוי", local: "050-000-0004", e164: "+972500000004" };
const TAMAR = { local: "050-000-0010", e164: "+972500000010" };

const m = he.app.me;
const p = he.ui.photoPicker;
// The daily clean-up's bearer, which CI makes fresh for each run.
const CRON_SECRET = process.env.CRON_SECRET ?? "";

const main = (page: Page) => page.getByRole("main");
/** Today's avatar. On desktop the sidebar's foot says the same words, outside main. */
const profileLink = (page: Page) =>
  main(page).getByRole("link", { name: m.open, exact: true });
/** A stored photo, which the app serves from /photos (`profilePhotoSrc`). */
const photosIn = (page: Page) => main(page).locator('img[src^="/photos/"]');

async function expectCleanPage(page: Page) {
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

/** Choose a phone's photo in the sheet and save it; returns where it shows. */
async function setPhoto(page: Page, button: string): Promise<string> {
  const photo = await cameraPhoto(page);
  await main(page).getByRole("button", { name: button, exact: true }).click();
  const sheet = page.getByRole("dialog", { name: p.title });
  await expect(sheet).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await sheet.getByRole("button", { name: p.choose }).click();
  await (await chooser).setFiles({
    name: "photo.jpg",
    mimeType: "image/jpeg",
    buffer: photo,
  });
  await sheet.getByRole("button", { name: p.save }).click();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole("status").filter({ hasText: p.saved }),
  ).toBeVisible();
  const shown = photosIn(page).first();
  await expect(shown).toHaveAttribute("src", new RegExp(`^/photos/${NOA.id}/`));
  return (await shown.getAttribute("src")) ?? "";
}

// Specs run one after another on one database: shift-swaps.spec.ts, after
// this one, expects the neutral words and no photos.
test.afterEach(async () => {
  for (const person of [NOA, YOAV, TAMAR]) {
    await clearDemoProfile(person.e164);
  }
  await clearSchedule();
});

/** A row of "עליי", by its title: its name goes on with its subtitle. */
const row = (page: Page, title: string) =>
  main(page).getByRole("button", { name: new RegExp(`^${title} `) });

test("a person sets a photo from Today, and colleagues see it", async ({
  page,
  browser,
}, testInfo) => {
  // Three sign-ins and an upload.
  test.slow();
  // Noa's shift today is still today's when her manager reads who works
  // today on /home, tens of seconds on: never across midnight.
  await waitOutDemoMidnight(testInfo);
  // This week's first publish, whatever a run before left.
  await clearSchedule();
  await scheduleDemoToday([[NOA.e164, null]]);
  await signIn(page, NOA);
  await profileLink(page).click();
  await expect(page).toHaveURL(/\/me$/);
  await expect(
    page.getByRole("heading", { level: 1, name: NOA.name }),
  ).toBeVisible();
  await expect(photosIn(page)).toHaveCount(0);
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("me-empty.png"),
    fullPage: true,
  });

  const src = await setPhoto(page, p.add);
  // What the server keeps is the browser's own re-encoding: nothing from the
  // camera is left in it.
  const stored = await page.request.get(src);
  expect(stored.status()).toBe(200);
  expect(stored.headers()["content-type"]).toBe("image/webp");
  expect(stored.headers()["cache-control"]).toContain("private");
  expect(hasExif(await stored.body())).toBe(false);
  await expect(
    main(page).getByRole("button", { name: p.change, exact: true }),
  ).toBeVisible();
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("me-photo.png"),
    fullPage: true,
  });

  // Shiran, her manager, sees it on Team and on Today.
  const manager = await secondPage(browser, testInfo);
  await signIn(manager, SHIRAN);
  await manager.goto("/team");
  await expect(
    main(manager).locator(`img[src="${src}"]`).filter({ visible: true }),
  ).not.toHaveCount(0);
  await manager.goto("/home");
  const who = main(manager)
    .locator("section")
    .filter({
      has: manager.getByRole("heading", {
        level: 2,
        name: he.app.home.who.title,
      }),
    });
  await expect(who.locator(`img[src="${src}"]`).first()).toBeVisible();
  // A photo that isn't there is not there for a colleague either.
  expect(
    (await manager.request.get(`/photos/${NOA.id}/zzzzzzzzzzzz.webp`)).status(),
  ).toBe(404);
  await manager.context().close();

  // Tamar, in the shop, works with nobody here: no photo for her.
  const stranger = await secondPage(browser, testInfo);
  await signIn(stranger, TAMAR);
  expect((await stranger.request.get(src)).status()).toBe(404);
  expect(
    (await stranger.request.get("/photos/not-a-uuid/abcdefgh.webp")).status(),
  ).toBe(404);
  await stranger.context().close();
});

test("removing the photo offers undo", async ({ page }) => {
  test.slow();
  await signIn(page, NOA);
  await page.goto("/me");
  const first = await setPhoto(page, p.add);

  // Remove it: the photo goes, and the way back is where the person looks.
  await main(page).getByRole("button", { name: p.change, exact: true }).click();
  const sheet = page.getByRole("dialog", { name: p.title });
  await sheet.getByRole("button", { name: p.remove }).click();
  await expect(sheet).toBeHidden();
  const undo = page.getByRole("status").filter({ hasText: m.photo.removed });
  await expect(undo).toBeVisible();
  await expect(photosIn(page)).toHaveCount(0);
  await expect.poll(() => demoPhotoPath(NOA.e164)).toBeNull();

  // Undo brings it back, under a new address.
  await undo.getByRole("button", { name: he.app.manage.undo }).click();
  await expect(undo).toBeHidden();
  const again = photosIn(page).first();
  await expect(again).toHaveAttribute("src", /^\/photos\//);
  expect(await again.getAttribute("src")).not.toBe(first);
  await expect.poll(() => demoPhotoPath(NOA.e164)).not.toBeNull();

  // Removed again, it stays gone.
  await main(page).getByRole("button", { name: p.change, exact: true }).click();
  await sheet.getByRole("button", { name: p.remove }).click();
  await expect(undo).toBeVisible();
  await expect(photosIn(page)).toHaveCount(0);
  await expect.poll(() => demoPhotoPath(NOA.e164)).toBeNull();
});

/** Her photo's address once it is no longer `before`, and the profile points at it. */
async function photoAfter(page: Page, before: string | null): Promise<string> {
  await expect
    .poll(() => photosIn(page).first().getAttribute("src"))
    .not.toBe(before);
  const src = (await photosIn(page).first().getAttribute("src")) ?? "";
  expect(src).toMatch(new RegExp(`^/photos/${NOA.id}/`));
  await expect
    .poll(() => demoPhotoPath(NOA.e164))
    .toBe(src.replace(/^\/photos\//, ""));
  return src;
}

// 20261127000300_files_server_only.sql: a photo is shown only while the
// profile points at it, so one replaced is nobody's, whatever address was
// kept, and Storage gives the person's own token nothing of any photo.
test("a replaced photo is nobody's, and Storage itself gives nothing of the current one", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "Once, on a computer: what the server serves is the same at every width",
  );
  // Two sign-ins and two uploads.
  test.slow();
  await signIn(page, NOA);
  await page.goto("/me");
  const first = await setPhoto(page, p.add);
  await setPhoto(page, p.change);
  const second = await photoAfter(page, first);
  expect((await page.request.get(first)).status()).toBe(404);
  expect((await page.request.get(second)).status()).toBe(200);

  // Nor her manager: only the one she has now.
  const manager = await secondPage(browser, testInfo);
  try {
    await signIn(manager, SHIRAN);
    expect((await manager.request.get(first)).status()).toBe(404);
    expect((await manager.request.get(second)).status()).toBe(200);
  } finally {
    await manager.context().close();
  }

  // Her own session, copied from the browser, gets nothing of it from
  // Storage: no signed link, no file, an empty folder.
  if (STORAGE_SKIP) {
    testInfo.annotations.push({ type: "skip", description: STORAGE_SKIP });
  } else {
    const asked = await storageAnswers(
      page,
      "avatars",
      second.replace(/^\/photos\//, ""),
    );
    expect(asked.sign.signed, asked.sign.body).toBe(false);
    expect(asked.download).not.toBe(200);
    expect(asked.list).toEqual([]);
  }
});

// The daily clean-up (/cron/list-photos) takes a profile photo a day old that
// no profile points at (what the door's reset leaves, or a removal Storage
// refused), and keeps the current one. It writes the shared demo's Storage.
test("the daily clean-up takes a profile photo nothing points at, and keeps the current one", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "Once, on a computer: it writes the shared demo's Storage",
  );
  test.skip(!CRON_SECRET, "needs CRON_SECRET (CI sets it)");
  test.slow();
  await signIn(page, NOA);
  await page.goto("/me");
  const left = await setPhoto(page, p.add);
  const leftPath = left.replace(/^\/photos\//, "");
  // The door's reset clears the profile and leaves the file.
  await clearDemoProfile(NOA.e164);
  await page.reload();
  await expect(photosIn(page)).toHaveCount(0);
  await setPhoto(page, p.add);
  const current = await photoAfter(page, left);
  const currentPath = current.replace(/^\/photos\//, "");
  expect(await avatarStored(leftPath)).toBe(true);
  expect((await page.request.get(left)).status()).toBe(404);

  // Both more than a day old: only the one nothing points at goes.
  await ageAvatar(leftPath, 2);
  await ageAvatar(currentPath, 2);
  const run = await page.request.post("/cron/list-photos", {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  expect(run.status()).toBe(202);
  await expect
    .poll(() => avatarStored(leftPath), { timeout: 15_000 })
    .toBe(false);
  expect(await avatarStored(currentPath)).toBe(true);
  expect((await page.request.get(current)).status()).toBe(200);
});

test("a demo business that keeps its people keeps their photos", async ({
  page,
}) => {
  await signIn(page, TAMAR);
  await page.goto("/me");
  await expect(page.getByText(m.photo.demo)).toBeVisible();
  await expect(
    main(page).getByRole("button", { name: p.add, exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("signing out is on the profile", async ({ page }) => {
  await signIn(page, NOA);
  await expect(page.getByRole("button", { name: he.app.signOut })).toHaveCount(
    0,
  );
  await profileLink(page).click();
  await expect(page).toHaveURL(/\/me$/);
  await page.getByRole("button", { name: he.app.signOut }).click();
  await expect(page).toHaveURL(/\/enter$/);
  await page.goto("/home");
  await expect(page).toHaveURL(/\/enter$/);
});

test("the sidebar leads to the profile", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "the sidebar is on desktop only; phones and tablets use Today's avatar",
  );
  await signIn(page, NOA);
  const block = page
    .getByRole("complementary")
    .getByRole("link", { name: new RegExp(NOA.name) });
  await block.click();
  await expect(page).toHaveURL(/\/me$/);
  await expect(block).toHaveAttribute("aria-current", "page");
});

test("Noa writes a line, picks a cover and how to address her; a manager sees them", async ({
  page,
  browser,
}, testInfo) => {
  test.slow();
  // Twelve characters.
  const line = "אוהבת קפה חם";
  await signIn(page, NOA);
  await page.goto("/me");

  // The line, from the quiet prompt under her name.
  await main(page)
    .getByRole("button", { name: m.bio.empty, exact: true })
    .click();
  const bioSheet = page.getByRole("dialog", { name: m.bio.row });
  await bioSheet.getByLabel(m.bio.label).fill(line);
  await expect(bioSheet).toContainText(heT("app.me.bio.count", { count: 12 }));
  await bioSheet.getByRole("button", { name: m.bio.save }).click();
  await expect(bioSheet).toBeHidden();
  await expect(main(page).getByText(line, { exact: true })).toBeVisible();

  // The cover: eight in the business's colour; the chosen one shows.
  await row(page, m.cover.row).click();
  const coverSheet = page.getByRole("dialog", { name: m.cover.sheetTitle });
  const dots = he.ui.profileCover.presets.dots;
  await expect(coverSheet.getByRole("radio")).toHaveCount(8);
  await coverSheet.locator("label").filter({ hasText: dots }).click();
  await expect(coverSheet.getByRole("radio", { name: dots })).toBeChecked();
  await coverSheet.getByRole("button", { name: m.cover.save }).click();
  await expect(coverSheet).toBeHidden();
  await expect(
    page.getByRole("status").filter({ hasText: m.cover.saved }),
  ).toBeVisible();
  await expect(main(page).locator('[data-cover="dots"]').first()).toBeVisible();

  // How to address her: nothing chosen until she chooses.
  await expect(row(page, m.form.row)).toContainText(
    heT("app.me.form.value", { form: "none" }),
  );
  await row(page, m.form.row).click();
  const formSheet = page.getByRole("dialog", { name: m.form.sheetTitle });
  await formSheet.getByRole("radio", { name: m.form.f }).check();
  await formSheet.getByRole("button", { name: m.form.save }).click();
  await expect(formSheet).toBeHidden();
  await expect(row(page, m.form.row)).toContainText(m.form.f);
  expect(await demoProfile(NOA.e164)).toEqual({
    bio: line,
    cover: "dots",
    addressForm: "f",
  });
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("me-about.png"),
    fullPage: true,
  });

  // A worker reads no colleague's page.
  await page.goto(`/team/${SHIRAN.id}`);
  await expect(
    page.getByRole("heading", { level: 1, name: he.app.notFound.title }),
  ).toBeVisible();

  // Shiran, her manager, opens her from Team: the line, in Noa's cover.
  const manager = await secondPage(browser, testInfo);
  await signIn(manager, SHIRAN);
  await manager.goto("/team");
  await main(manager).getByRole("link", { name: NOA.name }).click();
  await expect(manager).toHaveURL(new RegExp(`/team/${NOA.id}$`));
  await expect(
    manager.getByRole("heading", { level: 1, name: NOA.name }),
  ).toBeVisible();
  await expect(main(manager).getByText(line, { exact: true })).toBeVisible();
  await expect(main(manager).locator('[data-cover="dots"]')).toBeVisible();
  await expectCleanPage(manager);
  await manager.screenshot({
    path: testInfo.outputPath("team-person.png"),
    fullPage: true,
  });
  // Her own page is her profile.
  await manager.goto(`/team/${SHIRAN.id}`);
  await expect(manager).toHaveURL(/\/me$/);
  await manager.context().close();
});

test("the swap screen writes about Noa as she chose", async ({ page }) => {
  await scheduleDemoSunday(
    { morning: [[NOA.e164, "waiter"]], evening: [] },
    true,
  );
  await setDemoAddressForm(NOA.e164, "f");
  await setDemoAddressForm(YOAV.e164, "m");
  await takenDemoSwap("morning", NOA.e164, YOAV.e164);
  await signIn(page, SHIRAN);
  await page.goto("/schedule/swaps");

  const giving = (form: "f" | "x") => heT("app.swaps.handover.from", { form });
  const taking = heT("app.swaps.handover.to", { form: "m" });
  // Every size says it in the decision's name; phones and tablets also under
  // each face.
  const decision = (form: "f" | "x") =>
    page
      .getByRole("button", {
        name: new RegExp(`${NOA.name} ${giving(form)}, ${YOAV.name} ${taking}`),
      })
      .filter({ visible: true });
  const cards = page
    .getByRole("list", { name: he.app.swaps.list.title })
    .filter({ visible: true });
  await expect(decision("f").first()).toBeVisible();
  if ((await cards.count()) > 0) {
    await expect(cards.getByText(giving("f"), { exact: true })).toBeVisible();
    await expect(cards.getByText(taking, { exact: true })).toBeVisible();
  }

  // Until she chooses, the neutral words.
  await setDemoAddressForm(NOA.e164, null);
  await page.reload();
  await expect(decision("x").first()).toBeVisible();
  if ((await cards.count()) > 0) {
    await expect(cards.getByText(giving("x"), { exact: true })).toBeVisible();
  }
});

// "השם שלי": her own name, everywhere her team sees her, read afresh on each
// screen. A new first name on purpose, since cards show first names. The
// afterEach puts the demo's name back.
test("Noa changes her own name, and her team and the requests call her by it", async ({
  page,
  browser,
}, testInfo) => {
  test.slow();
  const RENAMED = "נועי כהן";
  await scheduleDemoSunday(
    { morning: [[NOA.e164, "waiter"]], evening: [] },
    true,
  );
  await takenDemoSwap("morning", NOA.e164, YOAV.e164);
  await signIn(page, NOA);
  await page.goto("/me");
  const heading = (name: string) =>
    page.getByRole("heading", { level: 1, name, exact: true });
  await expect(heading(NOA.name)).toBeVisible();
  await expect(row(page, m.name.row)).toContainText(NOA.name);
  await expectCleanPage(page);

  // The sheet holds her name, and asks for one.
  await row(page, m.name.row).click();
  const sheet = page.getByRole("dialog", { name: m.name.row });
  const field = sheet.getByLabel(he.app.team.invite.name, { exact: true });
  await expect(field).toHaveValue(NOA.name);
  await expect(sheet).toContainText(m.name.note);
  await expectCleanPage(page);
  await field.fill("   ");
  await sheet.getByRole("button", { name: m.name.save }).click();
  // Said as it shows, and the field takes the focus, read with it.
  const required = he.app.team.invite.errors.name.required;
  await expect(sheet.getByRole("alert")).toHaveText(required);
  await expect(field).toBeFocused();
  await expect(field).toHaveAccessibleDescription(required);

  // Saved as the team keeps names: one line, its spaces collapsed.
  await field.fill("  נועי   כהן ");
  await sheet.getByRole("button", { name: m.name.save }).click();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole("status").filter({ hasText: m.name.saved }),
  ).toBeVisible();
  await expect(heading(RENAMED)).toBeVisible();
  await expect(row(page, m.name.row)).toContainText(RENAMED);
  await expect.poll(() => demoOwnName(NOA.e164)).toBe(RENAMED);
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("me-name.png"),
    fullPage: true,
  });
  if (testInfo.project.name === "desktop") {
    // The sidebar's foot follows.
    await expect(
      page
        .getByRole("complementary")
        .getByRole("link", { name: new RegExp(RENAMED) }),
    ).toBeVisible();
  }

  // Her manager reads it on the team and in the request she made.
  const manager = await secondPage(browser, testInfo);
  try {
    await signIn(manager, SHIRAN);
    await manager.goto("/team");
    await expect(
      main(manager).getByRole("link", { name: RENAMED }).first(),
    ).toBeVisible();
    await expect(
      main(manager).getByRole("link", { name: NOA.name }),
    ).toHaveCount(0);
    await manager.goto("/schedule/swaps");
    const giving = heT("app.swaps.handover.from", { form: "x" });
    const taking = heT("app.swaps.handover.to", { form: "x" });
    await expect(
      manager
        .getByRole("button", {
          name: new RegExp(`${RENAMED} ${giving}, ${YOAV.name} ${taking}`),
        })
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
  } finally {
    await manager.context().close();
  }
});

test("a demo visitor picks a cover but writes no line", async ({ page }) => {
  await signIn(page, TAMAR);
  await page.goto("/me");
  await expect(page.getByText(m.bio.demo)).toBeVisible();
  await expect(
    main(page).getByRole("button", { name: m.bio.empty, exact: true }),
  ).toHaveCount(0);
  await expect(row(page, m.bio.row)).toHaveCount(0);
  // Nor a new name: the row says so and opens nothing.
  const name = await demoOwnName(TAMAR.e164);
  await expect(page.getByText(m.name.demo)).toBeVisible();
  await expect(row(page, m.name.row)).toHaveCount(0);

  await row(page, m.cover.row).click();
  const sheet = page.getByRole("dialog", { name: m.cover.sheetTitle });
  await sheet
    .locator("label")
    .filter({ hasText: he.ui.profileCover.presets.waves })
    .click();
  await sheet.getByRole("button", { name: m.cover.save }).click();
  await expect(sheet).toBeHidden();
  await expect
    .poll(() => demoProfile(TAMAR.e164).then((profile) => profile.cover))
    .toBe("waves");
  expect(await demoOwnName(TAMAR.e164)).toBe(name);

  // The door's reset puts it back for the next visitor.
  await resetDemoShop();
  expect((await demoProfile(TAMAR.e164)).cover).toBeNull();
});

test("a manager deletes an abusive line, with undo", async ({ page }) => {
  // A sign-in and the 8 s hold.
  test.slow();
  const line = "שורה לא יפה";
  const since = new Date(Date.now() - 5000);
  await setDemoBio(NOA.e164, line);
  await signIn(page, SHIRAN);
  await page.goto(`/team/${NOA.id}`);
  await expect(main(page).getByText(line, { exact: true })).toBeVisible();

  const remove = main(page).getByRole("button", {
    name: he.app.team.person.clearBio,
  });
  const undo = page.getByRole("status").filter({
    hasText: heT("app.team.person.bioCleared", { name: NOA.name }),
  });

  // Deleted on the screen at once, with the way back.
  await remove.click();
  await expect(undo).toBeVisible();
  await expect(main(page).getByText(line, { exact: true })).toHaveCount(0);
  await undo.getByRole("button", { name: he.app.manage.undo }).click();
  await expect(undo).toBeHidden();
  await expect(main(page).getByText(line, { exact: true })).toBeVisible();
  expect((await demoProfile(NOA.e164)).bio).toBe(line);

  // Deleted again, it goes once the hold is over, logged without the text.
  await remove.click();
  await expect(undo).toBeVisible();
  await expect
    .poll(() => demoProfile(NOA.e164).then((profile) => profile.bio), {
      timeout: 15_000,
    })
    .toBeNull();
  expect(await demoActivityActions("profile.bio_cleared", since)).toBe(1);
  await page.goto("/manage/activity");
  // Drawn twice (the list and, from desktop, the table), and kept from
  // earlier runs on the same database: the first one on screen.
  await expect(
    main(page)
      .getByText(
        heT("app.manage.activity.actions.profile.bioCleared", {
          person: NOA.name,
        }),
      )
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
});
