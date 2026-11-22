import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import { clearFileRows, logFileRows } from "./db";
import { signIn } from "./session";
import { heT } from "./t";

// The hiring file's lines in the activity log (profile H4). The demo
// restaurant's module is off and its files are made up, so the spec writes
// two of the log's rows as the file's functions would (logFileRows): Galit
// changed Noa's ID, and Shiran's view of Noa's file was refused. The owner,
// who holds the files, reads both, named by their parts and never a value;
// Shiran, a manager without the files, reads neither, though she reads the
// rest of the log. At each width: the same list, the same words.
const URI = { local: "050-000-0001", e164: "+972500000001" };
const SHIRAN = { local: "050-000-0002", e164: "+972500000002" };

const a = he.app.manage.activity;
const e = a.actions.employee;

const detailsLine = heT("app.manage.activity.actions.employee.details", {
  person: "נועה כהן",
  fields: e.fields.identity,
});
const refusedLine = heT("app.manage.activity.actions.employee.viewDenied", {
  person: "נועה כהן",
  reason: "not_holder",
});

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

let rows: number[] = [];

test.beforeEach(async () => {
  rows = await logFileRows();
});

test.afterEach(async () => {
  await clearFileRows(rows);
  rows = [];
});

test("the owner reads the file's lines by their parts, never a value", async ({
  page,
}) => {
  await signIn(page, URI);
  await page.goto("/manage/activity");
  await expect(
    page.getByRole("heading", { level: 1, name: a.title }),
  ).toBeVisible();
  const details = page.getByText(detailsLine).filter({ visible: true }).first();
  await expect(details).toBeVisible();
  await expect(details).toContainText(e.fields.identity);
  await expect(details).not.toContainText(/\d/);
  await expect(
    page.getByText(refusedLine).filter({ visible: true }).first(),
  ).toBeVisible();
  await expectCleanPage(page);
});

test("a manager without the files reads neither line", async ({ page }) => {
  await signIn(page, SHIRAN);
  await page.goto("/manage/activity");
  await expect(
    page.getByRole("heading", { level: 1, name: a.title }),
  ).toBeVisible();
  await expect(page.getByText(detailsLine)).toHaveCount(0);
  await expect(page.getByText(refusedLine)).toHaveCount(0);
});
