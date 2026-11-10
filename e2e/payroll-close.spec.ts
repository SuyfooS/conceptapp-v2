import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import {
  correctShopShift,
  reopenShopMonth,
  resetDemoShop,
  seededPayMonth,
  shopActivityDetails,
  shopLines,
  shopPayrollMonth,
} from "./db";
import { heT } from "./t";
import { readWorkbook, sheetCells, unzip } from "./unzip";

// Closing a month (payroll P9), in the demo shop as supabase/seed.sql starts
// it: last month's hours for its staff, and its accountant Galit, who closes
// and reopens. Hours are facts: a shift of the closed month is still
// corrected, she is told, and the next month's file holds the difference.
// Every visit names the seeded month. The shop goes back to how it starts
// after the spec, so the specs after it find the seeded month open and
// uncorrected.
const e = he.auth.enter;
const c = he.app.pay.close;
const r = he.app.pay.reopen;
const GALIT = { e164: "+972500000014", name: "גלית הדגמה" };
/** The shop's worker whose shift `correctShopShift` corrects, and why. */
const RONI = "רוני שלום";
const REASON = "e2e: stayed to close";

/** In through the door as Galit, in the shop: she keeps the books of both businesses (payroll P3b). */
async function enterAsAccountant(page: Page) {
  await page.goto("/enter");
  await page
    .getByRole("region", { name: e.businesses.shop.name })
    .getByRole("button", { name: new RegExp(e.people.accountant.name) })
    .click();
  await expect(page).toHaveURL(/\/home$/);
}

/** A month in words, as the screens write it: "אוקטובר 2026". */
const monthWords = (month: string) =>
  new Intl.DateTimeFormat("he", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-15T12:00:00Z`));

const escapeText = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The header's line once closed, by Galit, whatever day it is. */
const closedLine = () =>
  new RegExp(
    escapeText(
      heT.markup("app.pay.close.closedBy", {
        ltr: (chunks: string) => chunks,
        date: "DATE",
        name: GALIT.name,
      }),
    ).replace("DATE", "\\S+"),
  );

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

/** Reopens the month through the screen's sheet, saying why: refused first without a reason. */
async function reopenOnScreen(page: Page, month: string, reason: string) {
  await page.getByRole("button", { name: r.action }).click();
  const sheet = page.getByRole("dialog", {
    name: heT("app.pay.reopen.title", { month: monthWords(month) }),
  });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: r.save }).click();
  await expect(sheet.getByText(r.reasonNeeded)).toBeVisible();
  await sheet.getByLabel(r.reason).fill(reason);
  await sheet.getByRole("button", { name: r.save }).click();
  await expect(sheet).toBeHidden();
}

test.afterAll(async () => {
  await resetDemoShop();
});

test("the accountant closes the month beside its file, and reopens it with a reason, at every size", async ({
  page,
}) => {
  const month = await seededPayMonth();
  try {
    await enterAsAccountant(page);
    await page.goto(`/clock/pay?month=${month}`);
    // The file stays the main action; closing is beside it, saying what then.
    await expect(
      page.getByRole("link", { name: he.app.pay.file.download }),
    ).toBeVisible();
    const close = page.getByRole("button", { name: c.action });
    await expect(close).toBeVisible();
    await expect(
      page.getByText(c.hint).filter({ visible: true }),
    ).toBeVisible();
    await expectCleanPage(page);

    // No "are you sure": it closes, and the header says when and by whom.
    await close.click();
    await expect(
      page.getByRole("status").filter({
        hasText: heT("app.pay.close.done", { month: monthWords(month) }),
      }),
    ).toBeVisible();
    await expect(
      page.getByText(closedLine()).filter({ visible: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: c.action })).toHaveCount(0);
    expect(await shopPayrollMonth(month)).toMatchObject({ reopenedAt: null });
    await expectCleanPage(page);

    // Reopening needs a reason, which the month and the log keep.
    await reopenOnScreen(page, month, "חסרה משמרת");
    await expect(page.getByRole("button", { name: c.action })).toBeVisible();
    await expect(page.getByText(closedLine())).toHaveCount(0);
    expect(await shopPayrollMonth(month)).toMatchObject({
      reopenReason: "חסרה משמרת",
    });
  } finally {
    await reopenShopMonth(month);
  }
});

test("a correction after the close goes through, says its month, tells the accountant, and goes into the next file", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one run is enough");
  const month = await seededPayMonth();
  const since = new Date();
  try {
    await enterAsAccountant(page);
    await page.goto(`/clock/pay?month=${month}`);
    // The button works once the page has hydrated.
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: c.action }).click();
    await expect(
      page.getByText(closedLine()).filter({ visible: true }),
    ).toBeVisible();
    expect(await shopActivityDetails("payroll.close", since)).toContainEqual(
      expect.objectContaining({ month }),
    );

    // Hours are facts: the manager still corrects a shift of the month, and
    // its row in the log names it.
    const before = await shopLines(GALIT.e164, "pay.after_close");
    expect(await correctShopShift(month)).toBe(month);
    await expect
      .poll(() => shopLines(GALIT.e164, "pay.after_close"))
      .toBe(before + 1);

    // Galit reads it in her inbox, in words, leading to that month, and
    // naming the month whose file takes the difference.
    const [year = 0, index = 1] = month.split("-").map(Number);
    const next = `${index === 12 ? year + 1 : year}-${String(
      index === 12 ? 1 : index + 1,
    ).padStart(2, "0")}`;
    await page.goto("/notifications");
    const line = page
      .getByText(
        heT("app.notifications.kinds.pay.after_close.title", {
          month: monthWords(month),
        }),
      )
      .filter({ visible: true })
      .first();
    await expect(line).toBeVisible();
    await expect(
      page
        .getByText(
          heT("app.notifications.kinds.pay.after_close.note", {
            next: monthWords(next),
          }),
        )
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await expectCleanPage(page);

    // The month says what changed since goes into the next month's file.
    // (How many days: the shift's own, and others when its week now works
    // out another way, so only the sentence's end is read.)
    await page.goto(`/clock/pay?month=${month}`);
    const where =
      heT("app.pay.diff.changed", { count: 1, next: monthWords(next) })
        .split(". ")
        .pop() ?? "";
    await expect(page.getByText(where).filter({ visible: true })).toBeVisible();

    // The next month's file holds them: a sheet of differences just before
    // the one about the file, with a row for Roni's corrected day naming the
    // month it belongs to and the reason given. (The next month is the one
    // it is now, so it has a file.)
    const response = await page.request.get(`/clock/pay/export?month=${next}`);
    expect(response.status()).toBe(200);
    const { sheets, strings } = readWorkbook(unzip(await response.body()));
    const names = sheets.map((sheet) => sheet.name);
    const f = he.app.pay.file.sheets;
    expect(names).toContain(f.differences);
    expect(names.indexOf(f.differences)).toBe(names.indexOf(f.about) - 1);
    const differences = sheets.find((sheet) => sheet.name === f.differences);
    const rows = new Map<string, string[]>();
    for (const [ref, cell] of sheetCells(differences?.xml ?? "", strings)) {
      const row = ref.replace(/^[A-Z]+/, "");
      rows.set(row, [...(rows.get(row) ?? []), cell.value]);
    }
    expect(
      [...rows.values()].some(
        (cells) =>
          cells.includes(RONI) &&
          cells.includes(monthWords(month)) &&
          cells.some((value) => value.includes(REASON)),
      ),
    ).toBe(true);

    // And the next month's screen says its file holds them.
    await page.goto(`/clock/pay?month=${next}`);
    const inFile =
      heT("app.pay.diff.inFile", { month: monthWords(month), count: 1 }).split(
        ": ",
      )[0] ?? "";
    await expect(
      page.getByText(inFile).filter({ visible: true }),
    ).toBeVisible();

    // And reopens with a reason, which the log keeps.
    await page.goto(`/clock/pay?month=${month}`);
    await page.waitForLoadState("networkidle");
    await reopenOnScreen(page, month, "תיקון של רוני");
    await expect
      .poll(async () =>
        (await shopActivityDetails("payroll.reopen", since)).map(
          (details) => details.reason,
        ),
      )
      .toContain("תיקון של רוני");
  } finally {
    await reopenShopMonth(month);
  }
});
