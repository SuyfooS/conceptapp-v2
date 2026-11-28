import AxeBuilder from "@axe-core/playwright";
import he from "../messages/he.json" with { type: "json" };
import {
  ASK_FIX_DEPARTMENTS,
  ASK_FIX_OPEN_HOURS,
  ASK_FIX_PEOPLE,
  closeAskFixBusiness,
  openAskFixBusiness,
} from "./db";
import { signIn } from "./session";
import { heT } from "./t";
import { expect, type Page, test } from "./test";

// Whom a worker asks to correct their hours (closing the pilot, PR 8): a
// worker who forgot to clock out yesterday, in a real business of its own
// (e2e/db.ts, `ASK_FIX_BUSINESS`), reads on Today that the shift needs
// fixing, and sees under the clock's "open more than 24 hours" and beside
// "צריך תיקון" in their shifts a way to write to whoever
// may correct them: the one manager by name, a choice when there are two
// (the one in the worker's department first), or, with chat off, only their
// name. The press opens their private chat; nothing is sent from here. The
// first test runs at 390, 820 and 1440; the others, about the choice and
// chat off, at 390, the pilot's phones.

const {
  owner: OWNER,
  manager: MANAGER,
  near: NEAR,
  worker: WORKER,
} = ASK_FIX_PEOPLE;
const TZ = "Asia/Jerusalem";
const c = he.app.clock;
const a = c.history.askFix;

const main = (page: Page) => page.getByRole("main");
const shown = (page: Page, name: string) =>
  main(page).getByRole("link", { name }).filter({ visible: true });

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

/** The private chat with `person`, open on its own address. */
async function expectChatWith(
  page: Page,
  person: { id: string; name: string },
) {
  await expect(page).toHaveURL(new RegExp(`/chat/with/${person.id}$`));
  await expect(
    page
      .getByRole("heading", { level: 1, name: person.name })
      .filter({ visible: true }),
  ).toBeVisible();
}

test.afterEach(async () => {
  await closeAskFixBusiness();
});

test("a worker who forgot to clock out writes to the one manager, from the clock and from their shifts", async ({
  page,
}, testInfo) => {
  await openAskFixBusiness();
  await signIn(page, WORKER);
  const write = heT("app.clock.history.askFix.write", { name: MANAGER.name });

  // Today's clock row says the shift needs fixing, not since when it runs.
  const row = main(page).locator('a[href="/clock"]');
  await expect(row).toContainText(c.todayLine.ownOverdue);
  await expect(row).not.toContainText(c.todayLine.working.split("<")[0] ?? "");

  // The clock says the shift is open too long, and whom to ask, not the owner.
  await page.goto("/clock");
  await expect(
    main(page).getByRole("alert").filter({ hasText: c.failure.tooLong }),
  ).toBeVisible();
  await expect(shown(page, write)).toHaveCount(1);
  await expect(shown(page, write)).toHaveAttribute(
    "href",
    `/chat/with/${MANAGER.id}`,
  );
  await expect(
    main(page).getByText(new RegExp(OWNER.name)).filter({ visible: true }),
  ).toHaveCount(0);
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("clock-ask-fix.png"),
    fullPage: true,
  });

  // Their shifts say it beside "צריך תיקון", in the shape the screen draws:
  // the month the shift began in, last month's on the 1st.
  const month = new Intl.DateTimeFormat("en-CA", { timeZone: TZ })
    .format(new Date(Date.now() - ASK_FIX_OPEN_HOURS * 3_600_000))
    .slice(0, 7);
  await page.goto(`/clock/history?month=${month}`);
  await expect(
    main(page).getByText(c.history.needsFix).filter({ visible: true }),
  ).toHaveCount(1);
  await expect(shown(page, write)).toHaveCount(1);
  await expectCleanPage(page);

  // The press opens their private chat with the manager, empty until the
  // worker writes.
  await shown(page, write).click();
  await expectChatWith(page, MANAGER);
});

test("with two who may correct hours, the worker picks, the one in their department first", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the choice, at 390");
  await openAskFixBusiness({ near: true });
  await signIn(page, WORKER);
  await page.goto("/clock");

  const open = main(page).getByRole("button", { name: a.writeAny });
  await expect(open).toBeVisible();
  await expect(open).toHaveAttribute("aria-haspopup", "dialog");
  await open.click();
  const sheet = page.getByRole("dialog", { name: a.pickTitle });
  await expect(sheet.getByText(a.pickHint)).toBeVisible();
  // Maya shares the storeroom; Asaf, in the checkout, comes after her.
  const people = sheet.getByRole("link");
  await expect(people).toHaveCount(2);
  await expect(people.nth(0)).toHaveAttribute("href", `/chat/with/${NEAR.id}`);
  await expect(people.nth(0)).toContainText(NEAR.name);
  await expect(people.nth(0)).toContainText(ASK_FIX_DEPARTMENTS.storeroom);
  await expect(people.nth(1)).toHaveAttribute(
    "href",
    `/chat/with/${MANAGER.id}`,
  );
  await expect(people.nth(1)).toContainText(ASK_FIX_DEPARTMENTS.checkout);
  await expect(sheet.getByText(OWNER.name)).toHaveCount(0);
  await expectCleanPage(page);

  await people.nth(0).click();
  await expectChatWith(page, NEAR);
});

test("with chat off, the clock only names whom to ask", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "chat off, at 390");
  await openAskFixBusiness({ chat: false });
  await signIn(page, WORKER);
  await page.goto("/clock");

  await expect(
    main(page).getByRole("alert").filter({ hasText: c.failure.tooLong }),
  ).toBeVisible();
  await expect(
    main(page).getByText(
      heT("app.clock.history.askFix.named", { name: MANAGER.name }),
    ),
  ).toBeVisible();
  await expect(
    main(page).getByRole("link", { name: MANAGER.name }),
  ).toHaveCount(0);
  await expect(
    main(page).getByRole("link", { name: new RegExp(a.writeAny) }),
  ).toHaveCount(0);
  await expectCleanPage(page);
});
