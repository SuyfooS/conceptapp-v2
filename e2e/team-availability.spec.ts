import AxeBuilder from "@axe-core/playwright";
import he from "../messages/he.json" with { type: "json" };
import {
  availabilityDueAt,
  dateIn,
  nextWeekStart,
  weekdayOf,
} from "../packages/domain/availability";
import { WEEKDAY_KEYS } from "../packages/domain/availability-form";
import { ISRAEL_TIME_ZONE, timeIn } from "../packages/domain/shabbat";
import { daysLeftToRight } from "../packages/domain/share";
import {
  clearAvailability,
  clearSchedule,
  demoModuleSettings,
  scheduleDemoSunday,
  sendDemoAvailability,
} from "./db";
import { signIn } from "./session";
import { heT } from "./t";
import { expect, type Page, test } from "./test";

// Seeded in supabase/seed.sql: the demo restaurant's manager, and its two
// workers. Noa has sent next week's availability, Yoav has not.
const MANAGER = { local: "050-000-0002", e164: "+972500000002" };
const NOA = { name: "נועה כהן", e164: "+972500000003" };
const YOAV = { name: "יואב לוי", local: "050-000-0004", e164: "+972500000004" };
const OWNER_NAME = "אורי הדגמה";
const BUSINESS = "מסעדת הדגמה";
const NOTE = "מבחן ביום שלישי";

const ta = he.app.availability;
const tt = ta.team;
const us = he.ui.share;
// The text of a message up to its first placeholder or tag.
const before = (message: string) => message.split(/[<{]/)[0] ?? message;
const callYoav = tt.call.replace("{name}", YOAV.name);
// The table's link shows the number, and its name starts with it.
const callYoavNumber = tt.callNumber
  .replace("{number}", YOAV.local)
  .replace("{name}", YOAV.name);
// Any form of an ICU plural message, with # as a number.
const plural = (message: string) =>
  new RegExp(
    [...message.matchAll(/\{([^{}]+)\}/g)]
      .map((m) => (m[1] ?? "").replace("#", "\\d+"))
      .join("|"),
  );

async function expectCleanPage(page: Page) {
  // Metadata streams in after the body (see new-business.spec.ts).
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

/**
 * The reminder as the screen writes it for next week at the demo
 * restaurant: before or after its due moment, by its settings (the
 * scheduling manifest's defaults where none are stored), the week in the
 * browser's own words, and the link to where each person sends theirs.
 */
async function expectedReminder(page: Page): Promise<string> {
  const settings = await demoModuleSettings("scheduling");
  const zone = ISRAEL_TIME_ZONE;
  const start = nextWeekStart(
    new Date(),
    zone,
    settings.weekStartsOn === 1 ? 1 : 0,
  );
  const due = availabilityDueAt(
    start,
    {
      day:
        typeof settings.availabilityDueDay === "number"
          ? settings.availabilityDueDay
          : 3,
      time:
        typeof settings.availabilityDueTime === "string"
          ? settings.availabilityDueTime
          : "18:00",
    },
    zone,
  );
  // The days of one month held left to right, as the reminder holds them.
  const range = daysLeftToRight(
    await page.evaluate((first) => {
      const day = new Date(`${first}T00:00:00Z`);
      return new Intl.DateTimeFormat("he", {
        day: "numeric",
        month: "long",
        timeZone: "UTC",
      }).formatRange(day, new Date(day.getTime() + 6 * 86_400_000));
    }, start),
  );
  const words = {
    business: BUSINESS,
    range,
    day: ta.weekdays[WEEKDAY_KEYS[weekdayOf(dateIn(due, zone))] ?? "sun"],
    time: timeIn(due, zone),
  };
  const message =
    due.getTime() < Date.now()
      ? heT("app.availability.team.remind.textLate", words)
      : heT("app.availability.team.remind.text", words);
  return `${message}\n${new URL(page.url()).origin}/schedule/availability`;
}

test.beforeEach(async () => {
  await clearAvailability(NOA.e164);
  await clearAvailability(YOAV.e164);
  await sendDemoAvailability(NOA.e164, NOTE);
});

test.afterEach(async () => {
  await clearAvailability(NOA.e164);
});

test("a manager sees who has not sent availability", async ({
  page,
}, testInfo) => {
  await signIn(page, MANAGER);
  await page.goto("/schedule");
  const entry = page.getByRole("link", { name: new RegExp(tt.title) });
  await expect(entry).toContainText(plural(tt.missing.count));
  await expectCleanPage(page);
  await entry.click();
  await expect(page).toHaveURL(/\/schedule\/availability\/team$/);
  await expect(
    page.getByRole("heading", { level: 1, name: tt.title }),
  ).toBeVisible();
  // The hero counts the answers on every device. Anchored, because the list's
  // own line carries the same count after what is still missing.
  await expect(
    page.getByText(
      new RegExp(
        `^${tt.progress.replace("{sent}", "\\d+").replace("{total}", "\\d+")}$`,
      ),
    ),
  ).toBeVisible();

  const desktop = (page.viewportSize()?.width ?? 0) >= 1280;
  if (desktop) {
    // One table: a row per person, a column per day.
    const table = page.getByRole("table", { name: tt.everyone });
    const yoav = table.getByRole("row", { name: new RegExp(YOAV.name) });
    await expect(yoav).toContainText(tt.notSent);
    await expect(
      yoav.getByRole("link", { name: callYoavNumber, exact: true }),
    ).toHaveAttribute("href", `tel:${YOAV.e164}`);
    const noa = table.getByRole("row", { name: new RegExp(NOA.name) });
    await expect(noa).toContainText(before(tt.sentAt));
    await expect(noa).toContainText("09:00–17:00");
    await expect(noa).toContainText(NOTE);
    await expect(table).not.toContainText(OWNER_NAME);
  } else {
    const missing = page.getByRole("list", { name: tt.missing.title });
    const sent = page.getByRole("list", { name: tt.sent.title });
    await expect(missing).toContainText(YOAV.name);
    await expect(missing).not.toContainText(NOA.name);
    await expect(missing.getByRole("link", { name: callYoav })).toHaveAttribute(
      "href",
      `tel:${YOAV.e164}`,
    );
    // Owners plan the schedule; they are not waited for.
    await expect(missing).not.toContainText(OWNER_NAME);
    const noa = sent.getByRole("listitem").filter({ hasText: NOA.name });
    await expect(noa).toContainText(before(tt.sentAt));
    await expect(noa).toContainText("09:00–17:00");
    await expect(noa).toContainText(NOTE);
  }
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("team-availability.png"),
    fullPage: true,
  });

  // While someone is missing, the screen's main action reminds the whole
  // team, and never says who.
  const remind = page.getByRole("button", { name: tt.remind.action });
  await expect(remind).toBeVisible();
  await remind.click();
  const sheet = page.getByRole("dialog", { name: tt.remind.title });
  await expect(sheet).toBeVisible();
  const href = await sheet
    .getByRole("link", { name: us.whatsapp })
    .getAttribute("href");
  const text = new URL(href ?? "").searchParams.get("text") ?? "";
  expect(text).toBe(await expectedReminder(page));
  expect(text).not.toContain(YOAV.name);
  expect(text).not.toContain(NOA.name);
  expect(text).not.toContain("+972");
  await expectCleanPage(page);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(remind).toBeFocused();
});

// Once next week is published, a reminder to send availability for it no
// longer helps: the screen offers none, though Yoav still hasn't sent.
test("the reminder goes once next week is published", async ({ page }) => {
  await scheduleDemoSunday({ morning: [[NOA.e164, null]], evening: [] }, true);
  try {
    await signIn(page, MANAGER);
    await page.goto("/schedule/availability/team");
    await expect(
      page.getByRole("heading", { level: 1, name: tt.title }),
    ).toBeVisible();
    await expect(
      page
        .getByText(plural(tt.missing.count))
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: tt.remind.action }),
    ).toHaveCount(0);
  } finally {
    await clearSchedule();
  }
});

test("a worker has no team availability screen", async ({ page }) => {
  await signIn(page, YOAV);
  await page.goto("/schedule");
  await expect(
    page.getByRole("link", { name: new RegExp(ta.title) }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: new RegExp(tt.title) }),
  ).toHaveCount(0);
  await page.goto("/schedule/availability/team");
  await expect(
    page.getByRole("heading", { level: 1, name: he.app.notFound.title }),
  ).toBeVisible();
});
