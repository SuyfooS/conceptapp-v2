import AxeBuilder from "@axe-core/playwright";
import he from "../messages/he.json" with { type: "json" };
import {
  archiveDemoDepartment,
  demoDepartmentNames,
  demoDepartmentPhones,
} from "./db";
import { signIn } from "./session";
import { heT } from "./t";
import { expect, type Page, test } from "./test";

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

  // Noa in and out, each saved at once. The people button is named by what
  // it shows, then the department ("אין אנשים בשטיפת כלים").
  const nobody = heT("app.manage.departments.people", { count: 0 });
  const inRenamed = fill(d.peopleWhere, { name: RENAMED });
  await page
    .getByRole("button", {
      name: new RegExp(`^${literal(nobody)}\\s+${literal(inRenamed)}$`),
    })
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

// Accessibility, part 6, on the twin (/design/shell/manage/departments),
// which saves nothing: from a tablet up, whose people are shown beside the
// list is said on its button (aria-current), not only tinted, and a choice
// puts the focus on their title, which comes after the whole list; the
// moves are unavailable at the ends rather than disabled under the focus,
// which stays on them, and the department moved keeps its people shown. A
// phone opens them in a sheet, and marks none current.
test("the departments twin marks whose people are shown, takes the focus to them, and stops its moves at the ends", async ({
  page,
}, testInfo) => {
  const peopleIn = (name: string) =>
    page.getByRole("button", {
      name: new RegExp(`\\s${literal(fill(d.peopleWhere, { name }))}$`),
    });
  const names = page.getByRole("textbox", {
    name: new RegExp(`^${literal(fill(d.nameOf, { name: "" }))}`),
  });
  await page.goto("/design/shell/manage/departments");
  await page.waitForLoadState("networkidle");
  const kitchen = peopleIn("מטבח");
  const bar = peopleIn("בר");
  if (testInfo.project.name === "phone") {
    await expect(kitchen).not.toHaveAttribute("aria-current");
    await bar.click();
    await expect(
      page.getByRole("dialog", { name: fill(d.peopleOf, { name: "בר" }) }),
    ).toBeVisible();
    return;
  }

  // The first one's people at first, then the one chosen.
  await expect(kitchen).toHaveAttribute("aria-current", "true");
  await expect(bar).not.toHaveAttribute("aria-current");
  await bar.click();
  await expect(bar).toHaveAttribute("aria-current", "true");
  await expect(kitchen).not.toHaveAttribute("aria-current");
  const title = page.getByRole("heading", {
    level: 2,
    name: fill(d.peopleOf, { name: "בר" }),
  });
  await expect(title).toBeFocused();

  // Down to the end: "הזזה למטה" stays where it is, unavailable, with the
  // focus, and a press there moves nothing.
  const up = page.getByRole("button", { name: d.up, exact: true });
  const down = page.getByRole("button", { name: d.down, exact: true });
  await expect(up).not.toHaveAttribute("aria-disabled");
  await expect(down).not.toHaveAttribute("aria-disabled");
  await down.focus();
  await page.keyboard.press("Enter");
  await expect(names.last()).toHaveValue("בר");
  await expect(down).toHaveAttribute("aria-disabled", "true");
  await expect(down).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(names.last()).toHaveValue("בר");
  await expect(down).toBeFocused();
  await expect(title).toBeVisible();

  // Up to the top, the same; its people stay shown all the way.
  await up.focus();
  for (let step = 0; step < 3; step += 1) {
    await page.keyboard.press("Enter");
  }
  await expect(names.first()).toHaveValue("בר");
  await expect(up).toHaveAttribute("aria-disabled", "true");
  await expect(up).toBeFocused();
  await expect(down).not.toHaveAttribute("aria-disabled");
  await expect(title).toBeVisible();
  await expect(bar).toHaveAttribute("aria-current", "true");
});
