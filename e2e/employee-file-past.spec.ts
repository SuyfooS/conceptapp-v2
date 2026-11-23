import AxeBuilder from "@axe-core/playwright";
import en from "../messages/en.json" with { type: "json" };
import he from "../messages/he.json" with { type: "json" };
import {
  closePastJob,
  openPastJob,
  openPastJobElsewhere,
  PAST_PEOPLE,
  pastFileLog,
  setPastLocale,
} from "./db";
import { secondPage, signIn } from "./session";
import { setDemoModule } from "./sms";
import { heT } from "./t";
import { expect, type Page, test } from "./test";

// A worker who left reads their old file (profile H5c), at each width: a
// former worker of the local demo restaurant, which takes file writes
// ("fileWrites": true in supabase/seed.sql), made for each test with a
// made-up file and gone after; the module switched on here and off again;
// a second business of their own for the profile's way in. Noa, still in
// the restaurant, is from supabase/seed.sql.
const RESTAURANT = {
  id: "00000000-0000-4000-b000-000000000001",
  name: "מסעדת הדגמה",
};
const SHOP = "00000000-0000-4000-b000-000000000002";
const FORMER = PAST_PEOPLE.former;
const NOA = {
  id: "00000000-0000-4000-a000-000000000003",
  local: "050-000-0003",
  e164: "+972500000003",
};

const p = he.app.past;
const f = he.app.file;
const PAST_FILE = `/me/past/${RESTAURANT.id}`;

/** Text to find as it is, inside a pattern. */
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const title = (page: Page, name: string) =>
  page.getByRole("heading", { level: 1, name, exact: true });
/** "התיק שלי במסעדת הדגמה", the row under "עבודות קודמות". */
const pastRow = (page: Page) =>
  page
    .getByRole("link", {
      name: new RegExp(
        `^${literal(heT("app.me.file.title", { business: RESTAURANT.name }))}`,
      ),
    })
    .filter({ visible: true });

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

test.beforeEach(async () => {
  await openPastJob();
  await setDemoModule("employee_files", true);
});

test.afterEach(async () => {
  await setDemoModule("employee_files", false);
  await closePastJob();
});

test("a worker who left reads their old file", async ({ page }, testInfo) => {
  await signIn(page, FORMER);
  await page.waitForLoadState("networkidle");
  await expect(
    title(
      page,
      heT("app.noBusiness.left.title", { business: RESTAURANT.name }),
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: p.section, exact: true }),
  ).toBeVisible();
  await expect(pastRow(page)).toBeVisible();
  await expect(pastRow(page)).toHaveAttribute("href", PAST_FILE);
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("past-list.png"),
    fullPage: true,
  });

  await pastRow(page).click();
  await expect(page).toHaveURL(new RegExp(`${literal(PAST_FILE)}$`));
  await page.waitForLoadState("networkidle");
  await expect(
    title(page, heT("app.file.title", { business: RESTAURANT.name })),
  ).toBeVisible();
  const main = page.getByRole("main");
  await expect(main.getByText(p.subtitle.split("{")[0] ?? "")).toBeVisible();
  await expect(main.getByText("עדי", { exact: true })).toBeVisible();
  await expect(main.getByText("לשעבר", { exact: true })).toBeVisible();
  await expect(main.getByText("•••0018")).toBeVisible();
  await expect(main.getByText("000000018")).toHaveCount(0);
  // The ID's comes first, on every width.
  await main
    .getByRole("button", { name: f.masked.show, exact: true })
    .first()
    .click();
  await expect(main.getByText("000000018")).toBeVisible();
  await expect(
    main.getByText(heT("app.file.form101.status", { status: "handed_in" })),
  ).toBeVisible();
  await expect(main.getByText("איש קשר להדגמה")).toBeVisible();
  await expect(main.getByText(he.app.past.kept.emergency)).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: heT("app.past.kept.title", { business: RESTAURANT.name }),
    }),
  ).toBeVisible();
  // Read-only: nothing to press but a number's own.
  const buttons = await page
    .getByRole("button")
    .filter({ visible: true })
    .allInnerTexts();
  for (const name of buttons) {
    expect([f.masked.show, f.masked.hide]).toContain(name.trim());
  }
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("past-file.png"),
    fullPage: true,
  });
  // A person's own read and reveal are never logged.
  expect(await pastFileLog()).toBe(0);

  await page.getByRole("link", { name: p.section, exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
});

test("it answers private, no-store, only for a business they left", async ({
  page,
  browser,
}, testInfo) => {
  await signIn(page, FORMER);
  const response = await page.goto(PAST_FILE);
  const cache = response?.headers()["cache-control"] ?? "";
  expect(cache).toContain("private");
  expect(cache).toContain("no-store");
  await page.waitForLoadState("networkidle");
  await expect(
    title(page, heT("app.file.title", { business: RESTAURANT.name })),
  ).toBeVisible();

  // A business they never were in, and an address that is no id.
  for (const path of [`/me/past/${SHOP}`, "/me/past/not-an-id"]) {
    await page.goto(path);
    await expect(title(page, he.errors.notFound.title)).toBeVisible();
  }

  // Noa is still on the restaurant's team: her file is /me/file's.
  const noa = await secondPage(browser, testInfo);
  try {
    await signIn(noa, NOA);
    await noa.goto(PAST_FILE);
    await expect(title(noa, he.errors.notFound.title)).toBeVisible();
  } finally {
    await noa.context().close();
  }
});

test("in English for someone who chose it", async ({ page }) => {
  await setPastLocale("en");
  await signIn(page, FORMER);
  await page.goto(PAST_FILE);
  await page.waitForLoadState("networkidle");
  const english = page.locator('[dir="ltr"][lang="en"]');
  await expect(
    english.getByRole("heading", {
      level: 1,
      name: en.app.file.title.replace("{business}", RESTAURANT.name),
    }),
  ).toBeVisible();
  await expect(
    english.getByRole("heading", {
      level: 2,
      name: en.app.past.kept.title.replace("{business}", RESTAURANT.name),
    }),
  ).toBeVisible();
  await english
    .getByRole("button", { name: en.app.file.masked.show, exact: true })
    .first()
    .click();
  await expect(english.getByText("000000018")).toBeVisible();
  await expectCleanPage(page);
});

test("with the file off in the business, it is closed and not listed", async ({
  page,
}) => {
  await setDemoModule("employee_files", false);
  await signIn(page, FORMER);
  await page.waitForLoadState("networkidle");
  await expect(
    title(
      page,
      heT("app.noBusiness.left.title", { business: RESTAURANT.name }),
    ),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: p.section })).toHaveCount(0);

  await page.goto(PAST_FILE);
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByText(heT("app.past.off", { business: RESTAURANT.name })),
  ).toBeVisible();
  // The way back, under the words and at the top.
  await expect(
    page
      .getByRole("main")
      .getByRole("link", { name: p.section, exact: true })
      .filter({ visible: true }),
  ).toHaveCount(2);
  await expectCleanPage(page);
});

test("someone in another business finds it on the profile", async ({
  page,
}) => {
  await openPastJobElsewhere();
  await signIn(page, FORMER);
  await page.goto("/me");
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("heading", { level: 2, name: p.section, exact: true }),
  ).toBeVisible();
  await expectCleanPage(page);
  await pastRow(page).click();
  await expect(page).toHaveURL(new RegExp(`${literal(PAST_FILE)}$`));
  await page.waitForLoadState("networkidle");
  await expect(
    title(page, heT("app.file.title", { business: RESTAURANT.name })),
  ).toBeVisible();
  await page.getByRole("link", { name: f.back, exact: true }).click();
  await expect(page).toHaveURL(/\/me$/);
});
