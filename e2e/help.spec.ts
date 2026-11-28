import AxeBuilder from "@axe-core/playwright";
import he from "../messages/he.json" with { type: "json" };
import { isolateName } from "../packages/domain/bidi";
import {
  closeHelpBusiness,
  HELP_BUSINESS,
  HELP_PEOPLE,
  openHelpBusiness,
} from "./db";
import { signIn } from "./session";
import { heT } from "./t";
import { expect, type Page, test } from "./test";

// "עזרה" on /me (closing the pilot, PR 15), in a real business of its own
// (e2e/db.ts, `HELP_BUSINESS`): a worker asks the manager, who may edit the
// clock, in chat; the manager asks the owner; with the clock off, the worker
// asks the owner; an owner with nobody above them has the row only for
// ConceptApp's team. ConceptApp's team on WhatsApp comes only where the
// deployment names its number (`SUPPORT_WHATSAPP`), which CI's e2e doesn't:
// these tests read the same setting the server does and expect either, and
// the twin (/design/shell/me, mock data) draws the team's part, its WhatsApp
// to no number. Each sheet is checked open, with axe, at 390, 820 and 1440,
// the clock off at 390.

const { owner: OWNER, manager: MANAGER, worker: WORKER } = HELP_PEOPLE;
const h = he.app.me.help;

/**
 * ConceptApp's WhatsApp on the server under test, as `parseSupportWhatsapp`
 * (packages/db/env.ts) reads it: E.164 or none. The tests and the server run
 * with the same settings (CI writes them for the whole job).
 */
const SUPPORT = (() => {
  const raw = (process.env.SUPPORT_WHATSAPP ?? "").trim();
  return /^\+[1-9]\d{7,14}$/.test(raw) ? raw : null;
})();

const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const main = (page: Page) => page.getByRole("main");
/** "עזרה" on the profile, named by its title and what it reaches. */
const helpRow = (page: Page) =>
  main(page).getByRole("button", { name: new RegExp(`^${literal(h.row)}`) });
const sheetOf = (page: Page) => page.getByRole("dialog", { name: h.title });

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
 * "עזרה" says `hint`, and names ConceptApp's team only when `hint` does: a
 * hint without the team is the start of the one with it, so containing it
 * alone would pass a row that wrongly offers the team.
 */
async function expectHint(row: ReturnType<typeof helpRow>, hint: string) {
  await expect(row).toContainText(hint);
  if (!hint.includes("ConceptApp")) {
    await expect(row).not.toContainText("ConceptApp");
  }
}

/** Opens "עזרה" on /me, which says whom it reaches, and returns its sheet. */
async function openHelp(page: Page, hint: string) {
  await page.goto("/me");
  const row = helpRow(page);
  await expect(row).toBeVisible();
  await expectHint(row, hint);
  await row.click();
  const sheet = sheetOf(page);
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(h.subtitle)).toBeVisible();
  return sheet;
}

/** The sheet's link to `person`'s private chat. */
const askLink = (sheet: ReturnType<typeof sheetOf>, name: string) =>
  sheet.getByRole("link", {
    name: new RegExp(literal(heT("app.me.help.ask", { name }))),
  });

/** ConceptApp's team in the sheet: there with its WhatsApp, or not at all. */
async function expectTeam(sheet: ReturnType<typeof sheetOf>, shown: boolean) {
  const whatsapp = sheet.getByRole("link", { name: h.team.whatsapp });
  if (!shown) {
    await expect(whatsapp).toHaveCount(0);
    await expect(sheet.getByText(h.team.title)).toHaveCount(0);
    return;
  }
  await expect(
    sheet.getByRole("heading", { name: h.team.title }),
  ).toBeVisible();
  await expect(sheet.getByText(h.team.hours)).toBeVisible();
  await expect(whatsapp).toHaveAttribute("target", "_blank");
  const href = new URL((await whatsapp.getAttribute("href")) ?? "");
  expect(href.origin).toBe("https://wa.me");
  expect(href.pathname).toBe(SUPPORT ? `/${SUPPORT.slice(1)}` : "/");
  // The sentence names the business, nobody.
  expect(href.searchParams.get("text")).toContain(HELP_BUSINESS.name);
}

test.afterEach(async () => {
  await closeHelpBusiness();
});

test("a worker asks the manager from 'עזרה' on the profile, in chat, and ConceptApp's team is never theirs", async ({
  page,
}, testInfo) => {
  await openHelpBusiness();
  await signIn(page, WORKER);
  const ask = heT("app.me.help.ask", { name: MANAGER.name });
  const sheet = await openHelp(
    page,
    heT("app.me.help.hint.one", { name: MANAGER.name }),
  );

  // Whoever may edit the clock, not the owner, and never ConceptApp's team.
  await expect(askLink(sheet, MANAGER.name)).toHaveAttribute(
    "href",
    `/chat/with/${MANAGER.id}`,
  );
  await expect(sheet.getByRole("link")).toHaveCount(1);
  await expect(sheet.getByText(OWNER.name)).toHaveCount(0);
  await expectTeam(sheet, false);
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("help-worker.png"),
    fullPage: true,
  });

  // Closed, the focus is back on the row.
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(helpRow(page)).toBeFocused();

  // The press opens their private chat with the manager, empty until the
  // worker writes; nothing was sent.
  await helpRow(page).click();
  await sheetOf(page)
    .getByRole("link", { name: new RegExp(literal(ask)) })
    .click();
  await expect(page).toHaveURL(new RegExp(`/chat/with/${MANAGER.id}$`));
  await expect(
    page
      .getByRole("heading", { level: 1, name: MANAGER.name })
      .filter({ visible: true }),
  ).toBeVisible();
});

test("a manager asks the owner, and reaches ConceptApp's team only where the deployment names its number", async ({
  page,
}, testInfo) => {
  await openHelpBusiness();
  await signIn(page, MANAGER);
  const sheet = await openHelp(
    page,
    heT(SUPPORT ? "app.me.help.hint.oneOrTeam" : "app.me.help.hint.one", {
      name: OWNER.name,
    }),
  );
  await expect(askLink(sheet, OWNER.name)).toHaveAttribute(
    "href",
    `/chat/with/${OWNER.id}`,
  );
  await expectTeam(sheet, SUPPORT !== null);
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("help-manager.png"),
    fullPage: true,
  });
});

test("an owner with nobody above them has 'עזרה' only for ConceptApp's team", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the owner, at 390");
  await openHelpBusiness();
  await signIn(page, OWNER);
  await page.goto("/me");
  await expect(
    main(page).getByRole("heading", { level: 1, name: OWNER.name }),
  ).toBeVisible();
  if (!SUPPORT) {
    await expect(helpRow(page)).toHaveCount(0);
    return;
  }
  const sheet = await openHelp(page, h.hint.team);
  await expect(sheet.getByRole("link")).toHaveCount(1);
  await expectTeam(sheet, true);
  await expectCleanPage(page);
});

test("with the clock off, a worker asks the owner", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the clock off, at 390");
  await openHelpBusiness({ clock: false });
  await signIn(page, WORKER);
  const sheet = await openHelp(
    page,
    heT("app.me.help.hint.one", { name: OWNER.name }),
  );
  await expect(askLink(sheet, OWNER.name)).toHaveAttribute(
    "href",
    `/chat/with/${OWNER.id}`,
  );
  await expect(sheet.getByText(MANAGER.name)).toHaveCount(0);
  await expectTeam(sheet, false);
  await expectCleanPage(page);
});

test("the profile's twin draws 'עזרה' with ConceptApp's team, without its number, and without it", async ({
  page,
}) => {
  const uri = "אורי בן דוד";
  const team = (sheet: ReturnType<typeof sheetOf>) =>
    sheet.getByRole("link", { name: h.team.whatsapp });

  // Shiran, a manager: Uri, the owner, in the chat demo, and ConceptApp's
  // team, its WhatsApp to no number, so WhatsApp asks whom to.
  await page.goto("/design/shell/me");
  await helpRow(page).click();
  let sheet = sheetOf(page);
  await expect(askLink(sheet, uri)).toHaveAttribute("href", "/design/chat");
  await expect(sheet.getByText(h.team.hours)).toBeVisible();
  const href = new URL((await team(sheet).getAttribute("href")) ?? "");
  expect(href.origin + href.pathname).toBe("https://wa.me/");
  expect(href.searchParams.get("text")).toBe(
    heT("app.me.help.team.message", {
      business: isolateName("מסעדת הדגמה"),
    }),
  );
  await expectCleanPage(page);

  // A deployment with no number: only Uri.
  await page.goto("/design/shell/me?support=off");
  await expectHint(helpRow(page), heT("app.me.help.hint.one", { name: uri }));
  await helpRow(page).click();
  sheet = sheetOf(page);
  await expect(askLink(sheet, uri)).toBeVisible();
  await expect(team(sheet)).toHaveCount(0);

  // Chat off: Uri only named, the team still there, so the sheet has
  // something to press and its body takes no focus of its own.
  await page.goto("/design/shell/me?help=name");
  await helpRow(page).click();
  sheet = sheetOf(page);
  await expect(
    sheet.getByText(heT("app.me.help.named", { names: uri })),
  ).toBeVisible();
  await expect(sheet.getByRole("link", { name: new RegExp(uri) })).toHaveCount(
    0,
  );
  await expect(team(sheet)).toBeVisible();
  await expect(sheet.getByRole("region", { name: h.title })).toHaveCount(0);
  await expectCleanPage(page);

  // Chat off with no number, as the accountant and a business with chat off
  // have it until a deployment names one: only Uri's name, nothing to press,
  // so the sheet's body takes the keyboard to scroll by keys.
  await page.goto("/design/shell/me?help=name&support=off");
  await helpRow(page).click();
  sheet = sheetOf(page);
  await expect(
    sheet.getByText(heT("app.me.help.named", { names: uri })),
  ).toBeVisible();
  await expect(sheet.getByRole("link")).toHaveCount(0);
  await expect(sheet.getByRole("region", { name: h.title })).toHaveAttribute(
    "tabindex",
    "0",
  );
  await expectCleanPage(page);

  // A demo business: never ConceptApp's team.
  await page.goto("/design/shell/me?state=demo");
  await helpRow(page).click();
  sheet = sheetOf(page);
  await expect(askLink(sheet, uri)).toBeVisible();
  await expect(team(sheet)).toHaveCount(0);
});
