import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import { seededPayMonth, shopActivityActions } from "./db";
import { heT } from "./t";
import { readWorkbook, sheetCells, unzip } from "./unzip";

// The file for payroll (payroll P8), in the demo shop as supabase/seed.sql
// starts it: last month's hours for its staff, with its accountant Galit.
// Every visit names the seeded month. The file is read back with the test's
// own reader (./unzip), as an unzipper and Excel would open it.
const e = he.auth.enter;
const f = he.app.pay.file;

/**
 * In through the door, as one of the demo's people. Galit keeps the books of
 * both businesses (payroll P3b), so the door offers her in each: here, in the
 * shop.
 */
async function enterAs(page: Page, key: keyof typeof e.people) {
  await page.goto("/enter");
  const door =
    key === "accountant"
      ? page.getByRole("region", { name: e.businesses.shop.name })
      : page;
  await door
    .getByRole("button", { name: new RegExp(e.people[key].name) })
    .click();
  await expect(page).toHaveURL(/\/home$/);
}

/** A month in words, as the file and the screen write it: "אוקטובר 2026". */
const monthWords = (month: string) =>
  new Intl.DateTimeFormat("he", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-15T12:00:00Z`));

/** Excel's serial day number back to `YYYY-MM-DD`. */
const fromSerial = (serial: number) =>
  new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000)
    .toISOString()
    .slice(0, 10);

const escapeText = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Every file the demo shop's log holds, by anyone, ever: a test counts from
 * what it found, so a row another test just wrote is never counted as its own.
 */
const exportRows = () => shopActivityActions("payroll.export", new Date(0));

/** What a cell would hold if the file's words had failed: a message's key, an ICU argument, an `<ltr>` tag. */
const NOT_WORDS = /^(app|modules|cities)\.|[{}]|<\/?ltr>/;

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

test("the month's file is the pay screen's main action, at every size", async ({
  page,
}) => {
  const month = await seededPayMonth();
  await enterAs(page, "accountant");
  await page.goto(`/clock/pay?month=${month}`);
  const action = page.getByRole("link", { name: f.download });
  await expect(action).toBeVisible();
  // A plain download, with nothing in the address but the month.
  await expect(action).toHaveAttribute("download", "");
  await expect(action).toHaveAttribute(
    "href",
    `/clock/pay/export?month=${month}`,
  );
  await expect(page.getByText(f.what).filter({ visible: true })).toBeVisible();
  await expectCleanPage(page);
});

test("a pay holder downloads the month's file: four sheets, right to left, the seeded month, logged first", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one download is enough");
  const month = await seededPayMonth();
  await enterAs(page, "accountant");
  await page.goto(`/clock/pay?month=${month}`);
  const before = await exportRows();

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: f.download }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.xlsx$/);
  await expect(
    page.getByRole("status").filter({ hasText: f.downloading }),
  ).toBeVisible();
  const path = await file.path();
  const bytes = readFileSync(path);
  await file.saveAs(testInfo.outputPath(`payroll-${month}.xlsx`));

  // A ZIP, starting with its first local header.
  expect(bytes.readUInt32LE(0)).toBe(0x04034b50);
  const { sheets, strings } = readWorkbook(unzip(bytes));
  expect(sheets.map((sheet) => sheet.name)).toEqual([
    f.sheets.summary,
    f.sheets.daily,
    f.sheets.check,
    f.sheets.about,
  ]);
  for (const sheet of sheets) {
    expect(sheet.xml, sheet.name).toContain('rightToLeft="1"');
    expect(sheet.xml, sheet.name).toContain('state="frozen"');
    expect(sheet.xml, sheet.name).not.toContain("<f>");
  }

  // The seeded month: the sheet about the file names it, and every shift of
  // the daily sheet is in it.
  expect(strings).toContain(monthWords(month));
  const daily = sheetCells(sheets[1]?.xml ?? "", strings);
  const days = [...daily]
    .filter(([ref]) => /^C\d+$/.test(ref) && ref !== "C1")
    .map(([, cell]) => fromSerial(Number(cell.value)));
  expect(days.length).toBeGreaterThan(0);
  for (const day of days) expect(day.startsWith(month), day).toBe(true);
  // Tamar's correction, with its reason.
  expect(strings).toContain("שכחה לצאת");
  // And never an estimate, not even inside a sentence, nor a message's key
  // or an argument left unfilled.
  expect(
    strings.filter((text) => text.includes(he.app.pay.estimate.label)),
  ).toEqual([]);
  expect(strings.filter((text) => NOT_WORDS.test(text))).toEqual([]);

  // Logged before it went out: one file, by the accountant.
  await expect.poll(exportRows).toBe(before + 1);

  // The screen then says when the last file went out.
  const last = heT.markup("app.pay.file.last", {
    ltr: (chunks: string) => chunks,
    month: monthWords(month),
    date: "DATE",
    time: "TIME",
  });
  await expect(
    page
      .getByText(
        new RegExp(
          escapeText(last).replace("DATE", "\\S+").replace("TIME", "\\S+"),
        ),
      )
      .filter({ visible: true }),
  ).toBeVisible({ timeout: 10_000 });

  // Its headers: a download, never kept on the way, named in ASCII and in
  // UTF-8. (Asking again is another file, and another row.)
  const response = await page.request.get(`/clock/pay/export?month=${month}`);
  expect(response.status()).toBe(200);
  const headers = response.headers();
  expect(headers["content-type"]).toBe(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  expect(headers["cache-control"]).toBe("private, no-store");
  expect(headers["content-disposition"]).toMatch(
    new RegExp(
      `^attachment; filename="hours-demo-shop-${month}\\.xlsx"; filename\\*=UTF-8''\\S+\\.xlsx$`,
    ),
  );
  await expect.poll(exportRows).toBe(before + 2);
});

test("a worker without pay access gets no file, and nothing is logged", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one run is enough");
  const month = await seededPayMonth();
  await enterAs(page, "shopWorker");
  const before = await exportRows();
  const response = await page.request.get(`/clock/pay/export?month=${month}`);
  expect(response.status()).toBe(404);
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  expect(await exportRows()).toBe(before);
});

test("a pay holder gets no file for a month that isn't one, nor from a HEAD or another site's link", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one run is enough");
  const month = await seededPayMonth();
  await enterAs(page, "accountant");
  const before = await exportRows();
  for (const asked of [
    "",
    "?month=2026-13",
    "?month=10-2026",
    "?month=2999-01",
  ]) {
    const response = await page.request.get(`/clock/pay/export${asked}`);
    expect(response.status(), asked).toBe(404);
  }
  // A HEAD would build a file that never goes out: only GET takes it.
  const head = await page.request.head(`/clock/pay/export?month=${month}`);
  expect(head.status()).toBe(405);
  // Another site's link would log a file for whoever follows it.
  for (const site of ["cross-site", "same-site"]) {
    const response = await page.request.get(
      `/clock/pay/export?month=${month}`,
      { headers: { "sec-fetch-site": site } },
    );
    expect(response.status(), site).toBe(404);
    expect(response.headers()["cache-control"], site).toBe("private, no-store");
  }
  expect(await exportRows()).toBe(before);
});
