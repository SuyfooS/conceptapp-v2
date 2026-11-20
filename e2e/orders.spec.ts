import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import { demoModuleSettings, setDemoModuleSettings } from "./db";
import { signIn } from "./session";

// Taking orders (waiter mode). P3 has no screen of its own: the module's
// settings are drawn from its manifest in the console, where the team sets
// when orders may be taken while the module is still off. P4 and P5 add the
// send, the kitchen and the till here. Seeded in supabase/seed.sql: someone
// on the ConceptApp team, who is in no business.
const ADMIN = { local: "050-000-0005", e164: "+972500000005" };

const m = he.app.manage;
const o = he.modules.order_taking.settings;

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

test("the team chooses when orders may be taken in the console", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one run is enough");
  const stored = await demoModuleSettings("order_taking");
  try {
    await signIn(page, ADMIN, /\/admin$/);
    await page.goto("/admin/businesses/demo-restaurant/settings");
    // Its four fields, while the module is still off; who takes orders
    // waits for P4's departments.
    for (const label of [
      o.onlyOnTheClock.label,
      o.takeBackMinutes.label,
      o.lateAfterMinutes.label,
      o.dayEndsAt.label,
    ]) {
      await expect(
        page.getByText(label).filter({ visible: true }).first(),
      ).toBeVisible();
    }
    await expect(page.getByText(o.takerDepartments.label)).toHaveCount(0);
    await expectCleanPage(page);

    // Orders off a shift too.
    await page
      .getByRole("switch", { name: new RegExp(o.onlyOnTheClock.label) })
      .click();
    await expect(
      page.getByText(m.saved, { exact: true }).first(),
    ).toBeVisible();
    await expect
      .poll(
        async () => (await demoModuleSettings("order_taking")).onlyOnTheClock,
      )
      .toBe(false);

    // Five minutes to take an item back.
    await page
      .getByRole("button", { name: new RegExp(o.takeBackMinutes.label) })
      .click();
    await page
      .getByRole("menuitemradio", { name: o.takeBackMinutes.options[5] })
      .click();
    await expect
      .poll(
        async () => (await demoModuleSettings("order_taking")).takeBackMinutes,
      )
      .toBe(5);
    await expectCleanPage(page);
  } finally {
    await setDemoModuleSettings("order_taking", stored);
  }
});
