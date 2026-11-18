import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import {
  clearNotifications,
  clearSchedule,
  decideDemoSwap,
  requestDemoSwap,
  scheduleDemoSunday,
  takeDemoSwap,
} from "./db";
import { secondPage, signIn } from "./session";
import { heT } from "./t";

// Notifications in the app (N1): the database writes a line from what
// happened, the person sees the bell and the inbox, and opening a line marks it
// read and goes where it leads. The demo restaurant is a demo business, so this
// is also what a visitor sees: lines in the app, nothing on a phone. Other
// specs leave lines for the same people, so each test first removes theirs:
// it finds the line it made by its title, which only that line has.
const NOA = { name: "נועה כהן", local: "050-000-0003", e164: "+972500000003" };
const YOAV = { name: "יואב לוי", local: "050-000-0004", e164: "+972500000004" };
const MANAGER = { local: "050-000-0002", e164: "+972500000002" };

const words = he.app.notifications;
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** What the Home tab adds to its name when something needs the person. */
const NEEDS = (he.ui.appShell.needsAction.split("}")[1] ?? "").trim();

const bell = (page: Page) =>
  page
    .getByRole("main")
    .getByRole("link", { name: new RegExp(`^${literal(words.bell)}`) });
const homeTab = (page: Page) =>
  page
    .getByRole("navigation", { name: he.ui.appShell.mainNav })
    .filter({ visible: true })
    .getByRole("link", { name: new RegExp(`^${literal(he.app.nav.home)}`) });
/** A line of the inbox, by its title. */
const line = (page: Page, title: string | RegExp) =>
  page.getByRole("button", {
    name: typeof title === "string" ? new RegExp(literal(title)) : title,
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

test.beforeEach(async () => {
  await clearSchedule();
});

test.afterEach(async () => {
  await clearSchedule();
});

test("a published week reaches the worker's bell, and opening it reads it", async ({
  page,
}, testInfo) => {
  // Nothing yet: the inbox says what will come.
  await clearNotifications(NOA.e164);
  await signIn(page, NOA);
  await expect(bell(page)).toHaveAccessibleName(words.bell);
  await bell(page).click();
  await expect(page).toHaveURL(/\/notifications$/);
  await expect(
    page.getByRole("heading", { level: 1, name: words.title }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: words.inbox.empty.title }),
  ).toBeVisible();
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("notifications-empty.png"),
    fullPage: true,
  });

  // The manager publishes next week with Noa on Sunday morning.
  await scheduleDemoSunday(
    { morning: [[NOA.e164, "waiter"]], evening: [] },
    true,
  );
  await page.goto("/home");
  // The count as the badge shows it, in digits: "התראות, 1 חדשה".
  await expect(bell(page)).toHaveAccessibleName(
    `${words.bell}, ${heT("app.notifications.bellCount", { count: 1 })}`,
  );
  // A published week is news, not something to do: Home stays quiet.
  await expect(homeTab(page)).not.toHaveAccessibleName(new RegExp(NEEDS));

  await bell(page).click();
  const [before = "", after = ""] =
    words.kinds.schedule.published.title.split("{date}");
  const published = line(
    page,
    new RegExp(`${literal(before)}\\d{1,2}\\.\\d{1,2}${literal(after)}`),
  );
  await expect(published).toBeVisible();
  await expect(published).toContainText(
    words.kinds.schedule.published.body.replace(/.*one \{([^}]*)\}.*/, "$1"),
  );
  await expect(published).toHaveAccessibleName(
    new RegExp(literal(words.inbox.unread)),
  );
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("notifications-inbox.png"),
    fullPage: true,
  });

  // Opening it goes to her shifts, and it is read.
  await published.click();
  await expect(page).toHaveURL(/\/schedule\/shifts$/);
  await page.goto("/home");
  await expect(bell(page)).toHaveAccessibleName(words.bell);
  await page.goto("/notifications");
  await expect(
    page.getByRole("heading", { level: 2, name: words.inbox.earlier }),
  ).toBeVisible();
  await expect(page.getByText(words.inbox.caughtUp)).toBeVisible();
  await expect(published).not.toHaveAccessibleName(
    new RegExp(literal(words.inbox.unread)),
  );
});

test("each step of a swap reaches the people it concerns", async ({
  page,
  browser,
}, testInfo) => {
  await scheduleDemoSunday(
    {
      morning: [[YOAV.e164, "bartender"]],
      evening: [[NOA.e164, "waiter"]],
    },
    true,
  );
  // Read lines stay in the inbox under the same titles: remove them.
  for (const person of [NOA, YOAV, MANAGER]) {
    await clearNotifications(person.e164);
  }

  // Noa gives away her evening: Yoav could take it, so Home counts it.
  await requestDemoSwap("evening", NOA.e164);
  await signIn(page, YOAV);
  await expect(homeTab(page)).toHaveAccessibleName(new RegExp(NEEDS));
  await page.goto("/notifications");
  const offer = line(
    page,
    words.kinds.swap.offered.title.replace("{name}", NOA.name),
  );
  await expect(offer).toBeVisible();
  await expect(offer).toContainText(words.kinds.swap.offered.note);
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("notifications-offer.png"),
    fullPage: true,
  });
  await offer.click();
  await expect(page).toHaveURL(/\/schedule\/shifts$/);

  // He takes it: the manager is asked to approve, and is led there.
  await takeDemoSwap(YOAV.e164);
  const manager = await secondPage(browser, testInfo);
  await signIn(manager, MANAGER);
  await manager.goto("/notifications");
  const waiting = line(manager, words.kinds.swap.waiting.title);
  await expect(waiting).toBeVisible();
  await expect(waiting).toContainText(
    words.kinds.swap.waiting.people
      .replace("{to}", YOAV.name)
      .replace("{from}", NOA.name),
  );
  await expectCleanPage(manager);
  await waiting.click();
  await expect(manager).toHaveURL(/\/schedule\/swaps$/);
  await manager.context().close();

  // Approved: Noa reads who works it instead of her, in place of "taken".
  await decideDemoSwap(true);
  const noa = await secondPage(browser, testInfo);
  await signIn(noa, NOA);
  await noa.goto("/notifications");
  await expect(
    line(noa, words.kinds.swap.approved.titleFrom.replace("{name}", YOAV.name)),
  ).toBeVisible();
  await expect(
    line(noa, words.kinds.swap.taken.title.replace("{name}", YOAV.name)),
  ).toHaveCount(0);

  // Marking everything read empties "new".
  await noa
    .getByRole("button", { name: words.inbox.markAll, exact: true })
    .click();
  await expect(noa.getByText(words.inbox.caughtUp)).toBeVisible();
  await expectCleanPage(noa);
  await noa.context().close();
});
