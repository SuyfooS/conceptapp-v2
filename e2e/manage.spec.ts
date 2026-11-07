import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import {
  type DemoDetails,
  demoBusinessDetails,
  demoDetailsLogged,
  demoModuleEnabled,
  demoModuleSettings,
  setDemoBusinessDetails,
  setDemoModuleSettings,
} from "./db";
import { signIn } from "./session";
import { setDemoModule } from "./sms";

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
    "/manage/business",
    "/manage/activity",
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
  await sheet.getByRole("button", { name: he.days.fri.long }).click();
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
  // QR stays out of every screen, by Orel's decision.
  await expect(page.getByText(/QR/)).toHaveCount(0);

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
