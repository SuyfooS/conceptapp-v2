import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };

const t = he.landing;

test("a signed-out visitor gets the landing page, clean, with a way to write to us", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { level: 1, name: t.hero.title }),
  ).toBeVisible();

  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  const write = page.getByRole("link", { name: t.mail.action }).last();
  await expect(write).toHaveAttribute("href", /^mailto:/);
  await page.screenshot({
    path: testInfo.outputPath("landing.png"),
    fullPage: true,
  });

  // What is not built yet says so.
  await expect(page.getByText(t.features.soon.badge).first()).toBeVisible();

  await page
    .getByRole("link", { name: t.nav.signIn, exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/enter$/);
});
