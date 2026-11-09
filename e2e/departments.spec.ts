import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import {
  archiveDemoDepartment,
  demoDepartmentNames,
  demoDepartmentPhones,
} from "./db";
import { signIn } from "./session";

// The business's departments on /manage/departments (L2), while lists are on:
// add, rename, put people in and take them out, remove with undo, and the
// activity log's line. The test works on a department of its own, so the
// demo restaurant's kitchen, floor, bar and storeroom stay as they are.
const MANAGER = { local: "050-000-0002", e164: "+972500000002" };
const NOA = { name: "נועה כהן", e164: "+972500000003" };
const ADDED = "מחלקת בדיקה";
const RENAMED = "שטיפת כלים";

const d = he.app.manage.departments;
const fill = (text: string, values: Record<string, string>) =>
  Object.entries(values).reduce(
    (out, [key, value]) => out.replaceAll(`{${key}}`, value),
    text,
  );
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

test.afterEach(async () => {
  await archiveDemoDepartment(ADDED);
  await archiveDemoDepartment(RENAMED);
});

test("a manager adds a department, names it, puts people in it and removes it with undo", async ({
  page,
}, testInfo) => {
  await signIn(page, MANAGER);
  await page.goto("/manage");
  await page
    .getByRole("main")
    .getByRole("link", { name: new RegExp(`^${literal(d.title)}`) })
    .click();
  await expect(page).toHaveURL(/\/manage\/departments$/);
  await expect(
    page.getByRole("heading", { level: 1, name: d.title }),
  ).toBeVisible();
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("departments.png"),
    fullPage: true,
  });

  // Added from the row at the end.
  await page.getByLabel(d.newName).fill(ADDED);
  await page.getByRole("button", { name: d.add }).click();
  await expect(page.getByLabel(fill(d.nameOf, { name: ADDED }))).toHaveValue(
    ADDED,
  );
  await expect.poll(demoDepartmentNames).toContain(ADDED);

  // Named again in place.
  const field = page.getByLabel(fill(d.nameOf, { name: ADDED }));
  await field.fill(RENAMED);
  await field.press("Enter");
  await expect.poll(demoDepartmentNames).toContain(RENAMED);
  await expect(page.getByLabel(fill(d.nameOf, { name: RENAMED }))).toHaveValue(
    RENAMED,
  );

  // Noa in and out, each saved at once. The people button starts with what
  // it shows ("אין אנשים בשטיפת כלים").
  const inRenamed = fill(d.peopleIn.replace(/^.*\}\} /, ""), {
    name: RENAMED,
  });
  await page
    .getByRole("button", { name: new RegExp(`${literal(inRenamed)}$`) })
    .click();
  const noa = page
    .getByRole("switch", {
      name: fill(d.inDepartment, { name: NOA.name, department: RENAMED }),
    })
    .filter({ visible: true });
  await noa.click();
  await expect(noa).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => demoDepartmentPhones(RENAMED)).toEqual([NOA.e164]);
  await expectCleanPage(page);
  await noa.click();
  await expect(noa).toHaveAttribute("aria-checked", "false");
  await expect.poll(() => demoDepartmentPhones(RENAMED)).toEqual([]);
  // On a phone the people are in a sheet.
  await page.keyboard.press("Escape");

  // Removed, with the way back.
  await page
    .getByRole("button", { name: fill(d.remove, { name: RENAMED }) })
    .click();
  await expect.poll(demoDepartmentNames).not.toContain(RENAMED);
  await page
    .getByRole("status")
    .filter({ hasText: fill(d.removed, { name: RENAMED }) })
    .getByRole("button", { name: he.app.manage.undo })
    .click();
  await expect.poll(demoDepartmentNames).toContain(RENAMED);
  await page
    .getByRole("button", { name: fill(d.remove, { name: RENAMED }) })
    .click();
  await expect.poll(demoDepartmentNames).not.toContain(RENAMED);

  // The activity log says what changed.
  await page.goto("/manage/activity");
  await expect(
    page
      .getByText(he.app.manage.activity.actions.departments.change)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(
    page
      .getByText(
        fill(he.app.manage.activity.actions.departments.members, {
          department: RENAMED,
        }),
      )
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
});
