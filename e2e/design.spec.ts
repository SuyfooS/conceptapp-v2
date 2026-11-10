import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import { heT } from "./t";

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
  "/design/shell/clock?estimate=off",
  "/design/shell/clock?state=working",
  "/design/shell/clock?state=break",
  "/design/shell/clock?state=left",
  "/design/shell/clock?code=on",
  "/design/shell/clock?state=working&code=on",
  "/design/shell/clock/code",
  "/design/shell/clock/history",
  "/design/shell/clock/history?state=empty",
  "/design/shell/clock/history?estimate=off",
  "/design/shell/clock/team",
  "/design/shell/clock/team/noa",
  "/design/shell/clock/team/yoav",
  "/design/shell/clock/pay",
  "/design/shell/clock/pay?person=yoav",
  "/design/shell/clock/pay?show=noWage",
  "/design/shell/clock/pay?show=noNumber",
  "/design/shell/clock/pay?estimate=off",
  "/design/shell/clock/pay?person=yoav&estimate=off",
  "/design/shell/clock/pay/noa",
  "/design/shell/clock/pay/noa?estimate=off",
  "/design/shell/clock/pay/shiran",
  "/design/shell/clock/pay/yoav",
  "/design/shell/clock/pay/yoav?estimate=off",
  "/design/shell/clock/pay/maya",
  "/design/shell/today/accountant",
  "/design/shell/today/accountant?estimate=off",
  "/design/shell/today/accountant?state=checked",
  "/design/shell/today/accountant?state=empty",
  "/design/shell/today/accountant?state=off",
  "/design/shell/team",
  "/design/shell/team/noa",
  "/design/shell/team/maya",
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
  "/design/shell/manage/access",
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

// The activity demo draws the breaks a correction changed: one cut, one removed.
test("the activity demo says which breaks a correction changed", async ({
  page,
}) => {
  await page.goto("/design/shell/manage/activity");
  // The headline up to its day, which the screen formats by the device.
  const [headline = ""] = heT("app.manage.activity.actions.clock.breakFit", {
    kind: "other",
    count: 2,
    person: "יואב לוי",
    day: "\u0000",
  }).split("\u0000");
  await expect(
    page.getByText(headline).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(
    page
      .getByText(he.app.manage.activity.actions.clock.breakRemoved)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
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

// The pay demo's wage (payroll P4): under the minimum warns in words and
// still saves, and the sheet's button says from when.
test("the pay demo sets a wage, and warns under the minimum", async ({
  page,
}) => {
  await page.goto("/design/shell/clock/pay/noa");
  await page
    .getByRole("button", { name: he.app.pay.wage.change })
    .filter({ visible: true })
    .click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel(he.app.pay.wage.sheet.amount).fill("30");
  const warning = heT.markup("app.pay.wage.warning", {
    ltr: (chunks: string) => chunks,
    band: "adult",
    from: "1.4.2026",
    minimum: "35.40 ₪",
  });
  await expect(sheet.getByText(warning)).toBeVisible();
  // The sheet hides the page from screen readers, heading and all: axe alone.
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  await sheet
    .getByRole("button", {
      name: heT("app.pay.wage.sheet.save", { date: "1.11" }),
    })
    .click();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole("status").filter({
      hasText: heT("app.pay.wage.done", { date: "1.11.2026" }),
    }),
  ).toBeVisible();
});

// The pay demo's details (payroll P5): a start copied from joining is marked,
// a minor's birth date says what it makes of her age and is never kept, and
// a period that overlaps another is refused in words.
test("the pay demo's details: a joined start, a birth date, and periods that never overlap", async ({
  page,
}) => {
  const d = he.app.pay.details;
  const parts = he.app.pay.dateParts;
  await page.goto("/design/shell/clock/pay/noa");
  await expect(
    page.getByText(d.joined).filter({ visible: true }).first(),
  ).toBeVisible();

  await page.goto("/design/shell/clock/pay/maya");
  await expect(
    page.getByText(d.numberMissing, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: d.edit })
    .filter({ visible: true })
    .click();
  const sheet = page.getByRole("dialog", {
    name: heT("app.pay.details.sheet.title", { name: "מאיה פרץ" }),
  });
  const birth = sheet.getByRole("group", { name: d.sheet.birth });
  await birth.getByLabel(parts.day, { exact: true }).fill("15");
  await birth.getByLabel(parts.month, { exact: true }).fill("4");
  await birth.getByLabel(parts.year, { exact: true }).fill("2009");
  await expect(
    sheet.getByText(
      heT.markup("app.pay.details.sheet.birthYouth", {
        ltr: (chunks: string) => chunks,
        until: "4.2027",
      }),
    ),
  ).toBeVisible();
  // The sheet hides the page from screen readers, heading and all: axe alone.
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  await sheet.getByRole("button", { name: d.sheet.save }).click();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole("status").filter({ hasText: d.done }),
  ).toBeVisible();

  // Yoav worked here from June to December 2024: October 2024 overlaps.
  await page.goto("/design/shell/clock/pay/yoav");
  await page
    .getByRole("button", { name: d.addPeriod })
    .filter({ visible: true })
    .click();
  const period = page.getByRole("dialog", {
    name: heT("app.pay.details.period.titleNew", { name: "יואב לוי" }),
  });
  const from = period.getByRole("group", { name: d.period.from });
  await from.getByLabel(parts.day, { exact: true }).fill("1");
  await from.getByLabel(parts.month, { exact: true }).fill("10");
  await from.getByLabel(parts.year, { exact: true }).fill("2024");
  const to = period.getByRole("group", { name: d.period.to });
  await to.getByLabel(parts.day, { exact: true }).fill("31");
  await to.getByLabel(parts.month, { exact: true }).fill("10");
  await to.getByLabel(parts.year, { exact: true }).fill("2024");
  await period.getByRole("button", { name: d.period.save }).click();
  await expect(
    period.getByText(
      heT("app.pay.details.period.errors.overlap", { name: "יואב לוי" }),
    ),
  ).toBeVisible();
});

// The pay demo by the hours engine (payroll P7): Yoav's election day not
// worked is paid, with what to check; Maya's short breaks are in words; the
// way it is worked out opens in a sheet, with how each of Yoav's weeks was
// read, and the clock's own estimate has the worker's words, without them.
test("the pay demo's rates: a day not worked paid, remarks in words, and how it is worked out", async ({
  page,
}) => {
  const p = he.app.pay;
  const flat = (key: Parameters<typeof heT.markup>[0], values = {}) =>
    heT.markup(key, { ltr: (chunks: string) => chunks, ...values });
  await page.goto("/design/shell/clock/pay/yoav");
  await expect(
    page
      .getByText(
        flat("app.pay.holidayPay.oneOff", {
          day: he.modules.time_clock.oneOffRestDays.knesset_2026,
          date: "27.10",
        }),
      )
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(
    page
      .getByText(heT("app.pay.holidayPay.checks.wasScheduled", { form: "m" }))
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByText(p.estimate.label, { exact: true }).filter({ visible: true }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: p.method.open })
    .filter({ visible: true })
    .click();
  const sheet = page.getByRole("dialog", { name: p.method.title });
  await expect(sheet.getByText(p.method.weeks.title)).toBeVisible();
  // The sheet hides the page from screen readers, heading and all: axe alone.
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  await sheet.getByRole("button", { name: p.method.close }).click();
  await expect(sheet).toBeHidden();

  // Without amounts: the rates stay, and no estimate.
  await page.goto("/design/shell/clock/pay/yoav?estimate=off");
  await expect(
    page.getByText(p.estimate.offShort).filter({ visible: true }),
  ).toHaveCount(1);
  await expect(
    page.getByText(p.estimate.label, { exact: true }).filter({ visible: true }),
  ).toHaveCount(0);

  // The month's card names Maya's short breaks, first of the minors.
  await page.goto("/design/shell/clock/pay");
  await expect(
    page
      .getByText(
        flat("modules.time_clock.payroll.flags.minorBreak", {
          date: "1.10",
          minutes: 30,
        }),
      )
      .first(),
  ).toBeVisible();

  // The clock: Noa's own month, before tax, and the way it is worked out
  // without what waits for an accountant.
  await page.goto("/design/shell/clock");
  await expect(
    page.getByText(he.app.clock.ownPay.label, { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: p.method.open }).click();
  const own = page.getByRole("dialog", { name: p.method.title });
  await expect(own.getByText(p.method.excluded)).toBeVisible();
  await expect(own.getByText(p.method.readings)).toHaveCount(0);
  await page.goto("/design/shell/clock?estimate=off");
  await expect(
    page.getByText(he.app.clock.ownPay.label, { exact: true }),
  ).toHaveCount(0);
});

// What the hours list counts and what the rates leave out agree in words: a
// shift still open is said apart, holiday pay is listed where it is counted,
// and "nothing to check" waits for both shifts and remarks.
test("the pay demo says what it counts: open shifts, holiday pay and remarks", async ({
  page,
}) => {
  const p = he.app.pay;
  const flat = (key: Parameters<typeof heT.markup>[0], values = {}) =>
    heT.markup(key, { ltr: (chunks: string) => chunks, ...values });
  // Shiran's shift left open: in the month's hours, not yet in the rates.
  await page.goto("/design/shell/clock/pay");
  await expect(
    page
      .getByText(heT("app.pay.beforePayroll.open", { count: 1 }))
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await page.goto("/design/shell/clock/pay/shiran");
  await expect(
    page
      .getByText(heT("app.pay.beforePayroll.open", { count: 1 }))
      .filter({ visible: true }),
  ).toHaveCount(1);

  // Yoav's election day not worked is in his remarks, where it is counted.
  await page.goto("/design/shell/clock/pay/yoav");
  await expect(
    page
      .getByText(
        flat("app.pay.remarks.oneOff", {
          day: he.modules.time_clock.oneOffRestDays.knesset_2026,
          date: "27.10",
        }),
      )
      .filter({ visible: true }),
  ).toHaveCount(1);
  await expect(
    page.getByText(p.remarks.none).filter({ visible: true }),
  ).toHaveCount(0);

  // Every shift approved and closed, remarks still to check: the hero names
  // the people and the remarks, and no "nothing to check".
  await page.goto("/design/shell/today/accountant?state=checked");
  const escapeText = (text: string) =>
    text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const people = escapeText(heT("app.pay.captionParts.people", { count: 4 }));
  const remarks = escapeText(
    heT("app.pay.captionParts.remarks", { count: 2 }),
  ).replace("2", "\\d+");
  await expect(
    page.getByText(new RegExp(`^${people} · ${remarks}$`)),
  ).toBeVisible();
  await expect(
    page.getByText(new RegExp(escapeText(p.captionParts.nothing))),
  ).toHaveCount(0);

  // At work, Noa's own card says the shift she is in counts once it ends.
  await page.goto("/design/shell/clock?state=working");
  await expect(
    page.getByText(heT("app.clock.ownPay.openShift", { count: 1 })),
  ).toBeVisible();
});
