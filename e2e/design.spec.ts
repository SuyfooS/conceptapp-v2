import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };

// The design system in both appearances, on the demos: no data, no sign-in.
const PAGES = [
  "/design",
  "/design/shell",
  "/design/shell/today/on-shift",
  "/design/shell/today/availability-missing",
  "/design/shell/today/owner",
  "/design/shell/today/worker",
  "/design/shell/today/not-published",
  "/design/shell/today/worker-not-published",
  "/design/shell/today/scheduling-off",
  "/design/shell/schedule",
  "/design/shell/schedule/worker",
  "/design/shell/schedule/swaps",
  "/design/shell/schedule/availability",
  "/design/shell/schedule/build",
  "/design/shell/schedule/shifts",
  "/design/shell/clock",
  "/design/shell/clock?state=working",
  "/design/shell/clock?state=break",
  "/design/shell/clock?state=left",
  "/design/shell/clock?code=on",
  "/design/shell/clock?state=working&code=on",
  "/design/shell/clock/code",
  "/design/shell/clock/history",
  "/design/shell/clock/history?state=empty",
  "/design/shell/clock/team",
  "/design/shell/clock/team/noa",
  "/design/shell/clock/team/yoav",
  "/design/shell/team",
  "/design/shell/team/noa",
  "/design/shell/me",
  "/design/shell/me?state=empty",
  "/design/shell/me?state=demo",
  "/design/shell/manage",
  "/design/shell/manage/business",
  "/design/shell/manage/activity",
  "/design/shell/manage/activity/empty",
  "/design/shell/manage/scheduling",
  "/design/shell/manage/time_clock",
  "/design/shell/manage/lists",
  "/design/shell/manage/departments",
  "/design/shell/lists",
  "/design/shell/lists?sent=list-floor-opening",
  "/design/shell/lists/worker",
  "/design/shell/lists/empty",
  "/design/shell/lists/empty?as=business",
  "/design/shell/lists/list-kitchen-opening",
  "/design/shell/lists/list-kitchen-opening?state=finished",
  "/design/shell/lists/list-bar-order",
  "/design/shell/lists/send",
  "/design/shell/notifications",
  "/design/shell/notifications/empty",
  "/design/console/businesses/demo-restaurant/settings",
];

async function expectCleanPage(page: Page) {
  await expect(page).toHaveTitle(/ConceptApp$/);
  // The title can arrive before a demo's streamed part: check the page itself.
  await expect(
    page.getByRole("heading", { level: 1 }).filter({ visible: true }).first(),
  ).toBeVisible();
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

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(colorScheme, () => {
    test.use({ colorScheme });

    for (const path of PAGES) {
      test(`${path} is clean`, async ({ page }) => {
        await page.goto(path);
        await expectCleanPage(page);
      });
    }

    test("the page follows the device", async ({ page }) => {
      await page.goto("/design");
      const color = await page.evaluate(
        () => getComputedStyle(document.documentElement).backgroundColor,
      );
      expect(color).toBe(
        colorScheme === "dark" ? "rgb(8, 9, 11)" : "rgb(238, 239, 242)",
      );
    });
  });
}

// Each person's page in the clock demo shows their own shifts, not Noa's.
test("a person's hours in the demo match their row in the team list", async ({
  page,
}) => {
  for (const [person, shifts] of [
    ["yoav", "4 משמרות"],
    ["shiran", "3 משמרות"],
  ] as const) {
    await page.goto(`/design/shell/clock/team/${person}`);
    await expect(
      page.getByText(`שעות, ${shifts}`).filter({ visible: true }).first(),
    ).toBeVisible();
  }
});

// The lists demo sends and takes a sending back, keeps its five minutes to
// take a finish back after it hydrates, and reads a freezer below zero.
test("the lists demo sends, takes back, and keeps a finished list as it was", async ({
  page,
}) => {
  const l = he.app.lists;
  await page.goto("/design/shell/lists/send");
  await page
    .getByRole("button", {
      name: l.send.submit.department.replace("{name}", "מטבח"),
    })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(
    /\/design\/shell\/lists\?sent=list-floor-opening$/,
  );
  await page
    .getByRole("status")
    .filter({ hasText: l.send.sent.replace("{to}", "לאולם") })
    .getByRole("button", { name: he.app.manage.undo })
    .click();
  await expect(page).toHaveURL(/\/design\/shell\/lists$/);
  await expect(
    page.getByRole("status").filter({ hasText: l.send.cancelled }),
  ).toBeVisible();

  await page.goto("/design/shell/lists/list-kitchen-opening?state=finished");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: l.list.finished })
      .getByRole("button", { name: he.app.manage.undo }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: l.list.reopen })).toHaveCount(
    0,
  );
  await expect(
    page.getByLabel(l.list.readingOf.replace("{label}", "מקפיא")),
  ).toHaveValue("-19");
});
