import AxeBuilder from "@axe-core/playwright";
import { TYPING_MS } from "../app/(app)/manage/use-draft";
import he from "../messages/he.json" with { type: "json" };
import { announcer, heardSoFar, pastDrawing, saidSince } from "./announcer";
import { setPageHidden } from "./camera";
import {
  type DemoDetails,
  databaseNow,
  demoActivityActions,
  demoBusinessDetails,
  demoDetailsLogged,
  demoModuleEnabled,
  demoModuleSettings,
  setDemoBusinessDetails,
  setDemoModuleSettings,
} from "./db";
import { signIn } from "./session";
import { setDemoModule } from "./sms";
import { heT, undoNamed } from "./t";
import { expect, type Page, test } from "./test";

// Seeded in supabase/seed.sql: the demo restaurant's manager and a worker, and
// someone on the ConceptApp team, who is in no business.
const MANAGER = { local: "050-000-0002", e164: "+972500000002" };
const WORKER = { local: "050-000-0004", e164: "+972500000004" };
const ADMIN = { local: "050-000-0005", e164: "+972500000005" };

const m = he.app.manage;
const b = he.app.manage.business;
const a = he.app.manage.activity;
const s = he.modules.scheduling.settings;
const clock = he.modules.time_clock.settings;
const team = he.admin.settings;

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

/** What the database holds for the schedule, once a save has gone through. */
const stored = async () => {
  const settings = await demoModuleSettings("scheduling");
  return {
    shabbat: settings.closedOnShabbat,
    positions: (settings.positions as { name: string }[]).map((p) => p.name),
    shifts: (settings.shifts as { name: string }[]).map((p) => p.name),
  };
};

let scheduling: Record<string, unknown>;
let timeClock: Record<string, unknown>;
let details: DemoDetails;

test.beforeAll(async () => {
  scheduling = await demoModuleSettings("scheduling");
  timeClock = await demoModuleSettings("time_clock");
  details = await demoBusinessDetails();
});

test.afterEach(async () => {
  await setDemoModuleSettings("scheduling", scheduling);
  await setDemoModuleSettings("time_clock", timeClock);
  await setDemoModule("time_clock", true);
  await setDemoBusinessDetails(details);
});

test("signed-out visitors are sent to the door", async ({ page }) => {
  await page.goto("/manage/scheduling");
  await expect(page).toHaveURL(/\/enter$/);
});

test("a worker has no way in", async ({ page }) => {
  await signIn(page, WORKER);
  // The greeting follows the hour; the name does not.
  await expect(
    page.getByRole("heading", { level: 1, name: /, יואב$/ }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: m.row })).toHaveCount(0);
  for (const path of [
    "/manage",
    "/manage/scheduling",
    "/manage/notifications",
    "/manage/business",
    "/manage/activity",
    "/manage/roles",
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { level: 1, name: he.app.notFound.title }),
    ).toBeVisible();
  }
});

test("a manager fits the schedule to the business, and it stays", async ({
  page,
}, testInfo) => {
  await signIn(page, MANAGER);
  const main = page.getByRole("main");
  await main.getByRole("link", { name: new RegExp(m.row) }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: m.title }),
  ).toBeVisible();
  await expectCleanPage(page);

  await main
    .getByRole("link", { name: new RegExp(he.modules.scheduling.name) })
    .click();
  await expect(page).toHaveURL(/\/manage\/scheduling$/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: he.modules.scheduling.name,
    }),
  ).toBeVisible();
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("manage-scheduling.png"),
    fullPage: true,
  });

  // What only the team changes isn't here.
  await expect(page.getByText(s.weekStartsOn.label)).toHaveCount(0);
  // The week's hours the fill from availability gives anyone, the
  // business's, drawn by itself from the manifest at its default.
  await expect(
    page.getByRole("spinbutton", { name: s.fillWeekHours.label }),
  ).toHaveValue("42");

  // A setting saves itself, and a fresh load still has it.
  const shabbat = page.getByRole("switch", { name: s.closedOnShabbat.label });
  await expect(shabbat).toHaveAttribute("aria-checked", "true");
  await shabbat.click();
  await expect(page.getByText(m.saved, { exact: true })).toBeVisible();
  await expect.poll(async () => (await stored()).shabbat).toBe(false);
  await page.reload();
  await expect(shabbat).toHaveAttribute("aria-checked", "false");

  // A new position, in the business's own words.
  const newPosition = page.getByRole("textbox", {
    name: m.positions.newName,
  });
  await newPosition.fill("קופאי/ת");
  await newPosition.press("Enter");
  await expect(newPosition).toHaveValue("");
  await expect
    .poll(async () => (await stored()).positions)
    .toContain("קופאי/ת");
  const nameOf = (name: string) =>
    page.getByRole("textbox", {
      name: m.positions.nameOf.replace("{name}", name),
    });
  await expect(nameOf("קופאי/ת")).toHaveValue("קופאי/ת");

  // The same name twice is refused, and says why.
  const taken = page.getByText(m.positions.taken.replace("{name}", "קופאי/ת"));
  await newPosition.fill("קופאי/ת");
  await newPosition.press("Enter");
  await expect(taken).toBeVisible();
  await newPosition.fill("");
  await expect(taken).toHaveCount(0);

  // Typing over a name renames it.
  await nameOf("קופאי/ת").fill("קופה");
  await nameOf("קופאי/ת").press("Enter");
  await expect.poll(async () => (await stored()).positions).toContain("קופה");

  // Removing it offers the way back.
  await page
    .getByRole("button", {
      name: m.positions.remove.replace("{name}", "קופה"),
    })
    .click();
  await expect(nameOf("קופה")).toHaveCount(0);
  await expect
    .poll(async () => (await stored()).positions)
    .not.toContain("קופה");
  await page.getByRole("button", { name: m.undo }).click();
  await expect(nameOf("קופה")).toBeVisible();
  await expect.poll(async () => (await stored()).positions).toContain("קופה");

  // A new shift: the sheet says what's missing.
  await page.getByRole("button", { name: m.shifts.add }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: m.shifts.create }).click();
  await expect(sheet.getByText(m.shifts.problem.name)).toBeVisible();
  await expectCleanPage(page);
  await sheet.getByLabel(m.shifts.name).fill("פתיחה");
  await sheet.getByLabel(m.shifts.start).fill("22:00");
  await sheet.getByLabel(m.shifts.end).fill("01:00");
  await expect(sheet.getByText(m.shifts.nextDay)).toBeVisible();
  // The day as it shows, then in full ("ו׳, שישי").
  await sheet
    .getByRole("button", {
      name: `${he.days.fri.short}, ${he.days.fri.long}`,
      exact: true,
    })
    .click();
  await sheet.getByRole("button", { name: m.shifts.create }).click();
  await expect(sheet).toBeHidden();
  await expect.poll(async () => (await stored()).shifts).toContain("פתיחה");

  const row = page.getByRole("button", { name: /^פתיחה/ });
  await expect(row).toContainText("22:00–01:00");
  await page.reload();
  await expect(row).toContainText("22:00–01:00");

  // It opens with what it holds, and goes with a way back.
  await row.click();
  await expect(sheet.getByLabel(m.shifts.name)).toHaveValue("פתיחה");
  await sheet.getByRole("button", { name: m.shifts.remove }).click();
  await expect(sheet).toBeHidden();
  await expect(row).toHaveCount(0);
  await expect.poll(async () => (await stored()).shifts).not.toContain("פתיחה");
  await page.getByRole("button", { name: m.undo }).click();
  await expect(row).toContainText("22:00–01:00");
  await expect.poll(async () => (await stored()).shifts).toContain("פתיחה");
});

// The fill's week's hours, typed (filling from availability, part 5, after
// review). Its hint is read with it. Nothing saves while digits are typed,
// however long the pause between them: 60 starts as 6, inside its ends, so
// "6" waits too, and once it reads 60 the field says its ends, read with it.
// Enter keeps 60 and the focus, and says the ends (after the second
// review); leaving the field goes back to 42, says that it didn't save, and
// saves nothing. 42 to 50 by way of 4, an empty field and 5 saves once, as
// 50, on Enter, and only then. A press of "+" still saves by itself soon
// after (the cap's test in schedule-build.spec.ts).
test("a typed number saves once it is left, never half typed", async ({
  page,
}) => {
  const words = s.fillWeekHours;
  const between = heT("app.manage.between", { min: 4, max: 58 });
  const settled = () => page.waitForTimeout(TYPING_MS + 500);
  const before = (await demoModuleSettings("scheduling")).fillWeekHours;
  await signIn(page, MANAGER);
  await page.goto("/manage/scheduling");
  const hours = page.getByRole("spinbutton", { name: words.label });
  await expect(hours).toHaveValue("42");
  await expect(hours).toHaveAccessibleDescription(words.hint);
  const since = await databaseNow();

  await hours.fill("6");
  await settled();
  await hours.fill("60");
  await expect(hours).toHaveAttribute("aria-invalid", "true");
  await expect(hours).toHaveAccessibleDescription(between);
  await settled();
  const polite = announcer(page, "polite");
  await heardSoFar(polite);
  await hours.press("Enter");
  await expect(saidSince(polite, between)).toHaveCount(1);
  await expect(hours).toBeFocused();
  await expect(hours).toHaveValue("60");
  await expect(hours).toHaveAttribute("aria-invalid", "true");
  await heardSoFar(polite);
  await hours.press("Tab");
  await expect(
    saidSince(
      polite,
      heT("app.manage.numberNotSaved", {
        name: words.label,
        min: 4,
        max: 58,
        value: 42,
      }),
    ),
  ).toHaveCount(1);
  await expect(hours).not.toBeFocused();
  await expect(hours).toHaveValue("42");
  await expect(hours).not.toHaveAttribute("aria-invalid", "true");
  await expect(hours).toHaveAccessibleDescription(words.hint);
  await settled();
  expect((await demoModuleSettings("scheduling")).fillWeekHours).toBe(before);
  expect(await demoActivityActions("module.settings", since)).toBe(0);

  for (const typed of ["4", "", "5", "50"]) {
    await hours.fill(typed);
    await settled();
  }
  expect((await demoModuleSettings("scheduling")).fillWeekHours).toBe(before);
  expect(await demoActivityActions("module.settings", since)).toBe(0);
  await hours.press("Enter");
  await expect(page.getByText(m.saved, { exact: true })).toBeVisible();
  await expect
    .poll(async () => (await demoModuleSettings("scheduling")).fillWeekHours)
    .toBe(50);
  await settled();
  expect(await demoActivityActions("module.settings", since)).toBe(1);
  await page.reload();
  await expect(hours).toHaveValue("50");
});

// What's typed and not left yet saves all the same as the page is hidden
// (another app in front, the phone locked) and as the screen is left inside
// the app by the way back, the focus still in the field (after the second
// review): a screen reader's cursor moves on without it, and no blur may
// come. Once each, and the screen kept for the way forward shows what's
// stored.
test("a typed number saves as the page hides or the screen is left", async ({
  page,
}) => {
  const words = s.fillWeekHours;
  const hoursStored = async () =>
    (await demoModuleSettings("scheduling")).fillWeekHours;
  await signIn(page, MANAGER);
  const main = page.getByRole("main");
  await main.getByRole("link", { name: new RegExp(m.row) }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: m.title }),
  ).toBeVisible();
  await main
    .getByRole("link", { name: new RegExp(he.modules.scheduling.name) })
    .click();
  await expect(page).toHaveURL(/\/manage\/scheduling$/);
  const hours = page.getByRole("spinbutton", { name: words.label });
  await expect(hours).toHaveValue("42");
  const since = await databaseNow();

  await hours.fill("50");
  await expect(hours).toBeFocused();
  await setPageHidden(page, true);
  await expect.poll(hoursStored).toBe(50);
  await setPageHidden(page, false);
  await expect(hours).toBeFocused();
  await expect(hours).toHaveValue("50");

  await hours.fill("52");
  await expect(hours).toBeFocused();
  await page.goBack();
  await expect(
    page.getByRole("heading", { level: 1, name: m.title }),
  ).toBeVisible();
  await expect.poll(hoursStored).toBe(52);
  await page.waitForTimeout(TYPING_MS + 500);
  expect(await demoActivityActions("module.settings", since)).toBe(2);
  await page.goForward();
  await expect(page).toHaveURL(/\/manage\/scheduling$/);
  await expect(hours).toHaveValue("52");
});

// Enter on 60 keeps it, outside its ends, and the focus, beside its minus
// (after the second review). A press of minus then steps from 60, into its
// ends, 58, with the focus still in the field, and saves it soon after;
// never "it stays 42" and then 41, from a blur that put 42 back before the
// press (after the third check).
test("minus on a number outside its ends steps from it", async ({ page }) => {
  const words = s.fillWeekHours;
  const between = heT("app.manage.between", { min: 4, max: 58 });
  await signIn(page, MANAGER);
  await page.goto("/manage/scheduling");
  const hours = page.getByRole("spinbutton", { name: words.label });
  await expect(hours).toHaveValue("42");
  const since = await databaseNow();
  const polite = announcer(page, "polite");

  await hours.fill("60");
  await heardSoFar(polite);
  await hours.press("Enter");
  await expect(saidSince(polite, between)).toHaveCount(1);
  await expect(hours).toBeFocused();
  await expect(hours).toHaveValue("60");
  await heardSoFar(polite);
  await page
    .getByRole("button", {
      name: heT("app.manage.decrease", { name: words.label }),
    })
    .click();
  await expect(hours).toHaveValue("58");
  await expect(hours).toBeFocused();
  await expect(hours).not.toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText(m.saved, { exact: true })).toBeVisible();
  await expect
    .poll(async () => (await demoModuleSettings("scheduling")).fillWeekHours)
    .toBe(58);
  await expect(
    saidSince(
      polite,
      heT("app.manage.numberNotSaved", {
        name: words.label,
        min: 4,
        max: 58,
        value: 42,
      }),
    ),
  ).toHaveCount(0);
  await page.waitForTimeout(TYPING_MS + 500);
  expect(await demoActivityActions("module.settings", since)).toBe(1);
});

// An address typed and not left saves as the page is hidden; that save
// failing (no signal) keeps the address typed, with its failure. Leaving the
// field once the page is back sends it again (after the third check), where
// it sent nothing until a letter changed: the save that went as the page
// hid held back every later one.
test("an address refused as the page hid saves as its field is left", async ({
  page,
}) => {
  const ADDRESS = "רחוב הבדיקה 5, חיפה";
  const business = "/manage/business";
  const saves = (url: URL) => url.pathname === business;
  await signIn(page, MANAGER);
  await page.goto(business);
  const address = page.getByLabel(b.address.label, { exact: true });
  await expect(address).toBeVisible();

  let refused = 0;
  await page.route(saves, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    refused += 1;
    await route.abort();
  });
  await address.fill(ADDRESS);
  await expect(address).toBeFocused();
  await setPageHidden(page, true);
  const failed = page
    .getByRole("alert")
    .filter({ hasText: `${b.address.label}: ${m.failed.failed}` });
  await expect(failed).toBeVisible();
  await page.unroute(saves);
  await setPageHidden(page, false);
  await expect(address).toBeFocused();
  await expect(address).toHaveValue(ADDRESS);
  expect(refused).toBe(1);

  await address.press("Enter");
  await expect(address).not.toBeFocused();
  await expect(page.getByText(m.saved, { exact: true })).toBeVisible();
  await expect
    .poll(async () => (await demoBusinessDetails()).address)
    .toBe(ADDRESS);
  await expect(failed).toHaveCount(0);
  expect(refused).toBe(1);
});

// A shift's undo refused, its save dropped while the shift it brought back
// has the focus (accessibility, part 8): the screen goes back to what is
// stored, read again since the removal, so the row goes again, and its
// "ביטול", there again, takes the focus, which says what went (the
// announcer doesn't, too); never the body.
test("a shift's refused undo gives the focus back to its 'ביטול'", async ({
  page,
}) => {
  const NAME = "משמרת בדיקה";
  const scheduling = "/manage/scheduling";
  const saves = (url: URL) => url.pathname === scheduling;
  await signIn(page, MANAGER);
  await page.goto(scheduling);

  // A shift of its own, with a new shift's days and times.
  const sheet = page.getByRole("dialog");
  await page.getByRole("button", { name: m.shifts.add }).click();
  await sheet.getByLabel(m.shifts.name).fill(NAME);
  await sheet.getByRole("button", { name: m.shifts.create }).click();
  await expect(sheet).toBeHidden();
  await expect.poll(async () => (await stored()).shifts).toContain(NAME);

  const row = page.getByRole("button", { name: new RegExp(`^${NAME}`) });
  const removed = m.shifts.removed.replace("{name}", NAME);
  const undo = page
    .getByRole("status")
    .filter({ hasText: removed })
    .getByRole("button", { name: m.undo });
  const removal = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && saves(new URL(response.url())),
  );
  await row.click();
  await sheet.getByRole("button", { name: m.shifts.remove }).click();
  await expect(sheet).toBeHidden();
  await expect(undo).toBeFocused();
  // Stored without it, and the page read again so.
  await removal;
  await expect.poll(async () => (await stored()).shifts).not.toContain(NAME);
  await pastDrawing(page);

  // The undo's save held while `held` waits, then dropped.
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = () => resolve();
  });
  await page.route(saves, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    await held;
    await route.abort();
  });
  const polite = announcer(page, "polite");
  await heardSoFar(polite);
  await page.keyboard.press("Enter");
  await expect(row).toBeFocused();
  release();
  await expect(
    page.getByRole("alert").filter({ hasText: m.failed.failed }),
  ).toBeVisible();
  await expect(row).toHaveCount(0);
  await expect(undo).toBeFocused();
  await expect(undo).toHaveAccessibleName(undoNamed(removed));
  await pastDrawing(page);
  await expect(saidSince(polite, removed)).toHaveCount(0);
  await page.unroute(saves);
  expect((await stored()).shifts).not.toContain(NAME);
});

test("a manager changes the business's own details", async ({
  page,
}, testInfo) => {
  await setDemoBusinessDetails({ ...details, shabbatCity: null });
  const logged = await demoDetailsLogged();
  await signIn(page, MANAGER);
  await page.goto("/manage");

  // A business closed on Shabbat that hasn't said where it is is told so.
  const row = page
    .getByRole("main")
    .getByRole("link", { name: new RegExp(b.title) });
  await expect(row).toContainText(b.noCity);
  await row.click();
  await expect(page).toHaveURL(/\/manage\/business$/);
  await expect(
    page.getByRole("heading", { level: 1, name: b.title }),
  ).toBeVisible();
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("manage-business.png"),
    fullPage: true,
  });

  // The name saves on leaving the field, tidied.
  const name = page.getByLabel(b.name.label, { exact: true });
  await name.fill("  מסעדת   מבחן ");
  await name.press("Enter");
  await expect(page.getByText(m.saved, { exact: true })).toBeVisible();
  await expect
    .poll(async () => (await demoBusinessDetails()).name)
    .toBe("מסעדת מבחן");
  await expect(name).toHaveValue("מסעדת מבחן");

  // An empty name says why, and isn't saved.
  await name.fill("");
  await expect(page.getByText(b.name.required)).toBeVisible();
  await name.press("Enter");
  await expect(name).toHaveValue("מסעדת מבחן");

  // A colour saves at a tap.
  await page.getByTitle(he.ui.accentPicker.presets.teal).click();
  await expect
    .poll(async () => (await demoBusinessDetails()).accent)
    .toBe("#0f766e");

  // The city, with this coming Shabbat's times in it.
  await page
    .getByRole("button", { name: new RegExp(b.shabbatCity.label) })
    .click();
  await page.getByRole("menuitemradio", { name: he.cities.jerusalem }).click();
  await expect
    .poll(async () => (await demoBusinessDetails()).shabbatCity)
    .toBe("jerusalem");
  await expect(
    page.getByText(
      b.city.times.split(":")[0]?.replace("{city}", he.cities.jerusalem) ?? "",
    ),
  ).toBeVisible();
  await expectCleanPage(page);

  // All of it stays, and each change is in the log.
  await page.reload();
  await expect(name).toHaveValue("מסעדת מבחן");
  expect(await demoDetailsLogged()).toBe(logged + 3);
  await page.goto("/manage");
  await expect(row).not.toContainText(b.noCity);

  // The log says who changed what: one change, from where it began.
  await page
    .getByRole("main")
    .getByRole("link", { name: new RegExp(a.title) })
    .click();
  await expect(page).toHaveURL(/\/manage\/activity$/);
  await expect(
    page.getByRole("heading", { level: 1, name: a.title }),
  ).toBeVisible();
  const main = page.getByRole("main");
  await expect(
    main.getByText("שירן הדגמה").filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(
    main
      .getByRole("link", { name: new RegExp(a.actions.business.details) })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  for (const words of [
    `${b.name.label}: מסעדת מבחן`,
    `${b.shabbatCity.label}: ${he.cities.jerusalem}`,
  ]) {
    await expect(
      main.getByText(words).filter({ visible: true }).first(),
    ).toBeVisible();
  }
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("manage-activity.png"),
    fullPage: true,
  });
});

// Bigger teams: chat's settings say how full the business's spaces for
// documents and chat files are, to whoever sees the management page. Only
// read: the used part moves with what other specs send, so the spaces are
// matched (the seed's defaults, 50 and 100 MB).
test("a manager sees how full the business's spaces for files are", async ({
  page,
}) => {
  const f = m.fileSpace;
  await signIn(page, MANAGER);
  await page.goto("/manage/chat");
  await expect(
    page.getByRole("heading", { level: 1, name: he.modules.chat.name }),
  ).toBeVisible();
  const section = page.locator("section").filter({
    has: page.getByRole("heading", { level: 2, name: f.title }),
  });
  await expect(section).toBeVisible();
  await expect(section.getByText(f.documents, { exact: true })).toBeVisible();
  await expect(section.getByText(f.chat, { exact: true })).toBeVisible();
  await expect(section.getByText(/מתוך 50 מגה/)).toBeVisible();
  await expect(section.getByText(/מתוך 100 מגה/)).toBeVisible();
  await expectCleanPage(page);
});

test("availability closes at the business's own city's candle lighting", async ({
  page,
}) => {
  const ta = he.app.availability;
  const shabbatStarts = ta.candleLightingShort.split("<")[0] ?? "";
  const friday = page.getByRole("button", {
    name: ta.dayName.replace("{day}", ta.weekdays.fri),
  });
  // Friday's candle lighting on the screen, in minutes after midnight.
  const candles = async () => {
    await expect(friday).toContainText(shabbatStarts);
    const text = (await friday.textContent())?.split(shabbatStarts)[1] ?? "";
    const [, hours, minutes] = text.match(/(\d{2}):(\d{2})/) ?? [];
    return Number(hours) * 60 + Number(minutes);
  };

  await setDemoBusinessDetails({ ...details, shabbatCity: "telAviv" });
  await signIn(page, WORKER);
  await page.goto("/schedule/availability");
  const telAviv = await candles();

  // Jerusalem lights candles 40 minutes before sunset, not 20, and its sun
  // sets a minute or two before Tel Aviv's.
  await setDemoBusinessDetails({ ...details, shabbatCity: "jerusalem" });
  await page.reload();
  const earlier = telAviv - (await candles());
  expect(earlier).toBeGreaterThanOrEqual(19);
  expect(earlier).toBeLessThanOrEqual(25);
});

test("settings older than the manifest don't take the screen down", async ({
  page,
}) => {
  await setDemoModuleSettings("scheduling", {
    ...scheduling,
    availabilityDueTime: "not a time",
    removedLongAgo: true,
  });
  await signIn(page, MANAGER);
  await page.goto("/manage/scheduling");
  await expect(page.getByLabel(s.availabilityDueTime.label)).toHaveValue(
    "18:00",
  );
  // Saving something else leaves what it can't read alone.
  await page.getByRole("switch", { name: s.closedOnShabbat.label }).click();
  await expect(page.getByText(m.saved, { exact: true })).toBeVisible();
  const settings = await demoModuleSettings("scheduling");
  expect(settings.removedLongAgo).toBe(true);
});

test("the team sees every setting and switches modules", async ({
  page,
}, testInfo) => {
  await signIn(page, ADMIN, /\/admin$/);
  await page.goto("/admin/businesses/demo-restaurant");
  await page
    .getByRole("link", { name: new RegExp(he.admin.setup.settings.row) })
    .click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(
    page.getByRole("heading", { level: 1, name: team.title }),
  ).toBeVisible();
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("console-settings.png"),
    fullPage: true,
  });

  // The business's own details come first, its Shabbat city among them.
  await expect(
    page.getByRole("heading", { level: 2, name: team.details }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: new RegExp(b.shabbatCity.label) }),
  ).toBeVisible();

  // The advanced settings, which managers don't see.
  await expect(page.getByText(s.weekStartsOn.label)).toBeVisible();
  await expect(page.getByText(clock.roundToMinutes.label)).toBeVisible();
  // And the business's own, as on /manage: the fill's week's hours.
  await expect(
    page.getByRole("spinbutton", { name: s.fillWeekHours.label }),
  ).toHaveValue("42");
  // Whether a code is asked for, which managers don't see either.
  await expect(page.getByText(clock.requirePunchCode.label)).toBeVisible();

  // An advanced setting saves like any other.
  await page
    .getByRole("button", { name: new RegExp(clock.roundToMinutes.label) })
    .click();
  await page
    .getByRole("menuitemradio", { name: clock.roundToMinutes.options[15] })
    .click();
  await expect
    .poll(async () => (await demoModuleSettings("time_clock")).roundToMinutes)
    .toBe(15);

  // Switching a module off takes it from the business's people.
  const name = team.on.replace("{module}", he.modules.time_clock.name);
  await page.getByRole("switch", { name }).click();
  await expect.poll(() => demoModuleEnabled("time_clock")).toBe(false);
  await page.reload();
  await expect(page.getByRole("switch", { name })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await page.context().clearCookies();
  await signIn(page, MANAGER);
  await page.goto("/clock");
  await expect(
    page.getByRole("heading", { level: 1, name: he.app.notFound.title }),
  ).toBeVisible();
});
