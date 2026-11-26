import AxeBuilder from "@axe-core/playwright";
import he from "../messages/he.json" with { type: "json" };
import { shareText } from "../packages/domain/share";
import { CAPTCHA_FRAME, captchaSettled } from "./captcha";
import {
  closePendingLinksBusiness,
  notificationsIn,
  openPendingLinksBusiness,
  PENDING_LINKS,
  type PendingLinksBusiness,
  pendingLinkStates,
  roleIn,
} from "./db";
import { secondPage } from "./session";
import { codesSince, lastCodeId, latestCode } from "./sms";
import { heT } from "./t";
import { expect, type Page, test } from "./test";

// "עוד לא קיבלו קישור" (inviting from a list, part 2; Orel, 25 November
// 2026): the console's wizard saves its staff with no link, and the owner
// makes each one's link on /team at the moment of sending, "יצירת קישור",
// then WhatsApp to that number or a copy, and the focus goes on to the next
// person. The app sends nothing: no code reaches anyone until they ask for
// one at /join themselves. A demo business never has these invites, so each
// screen size opens a real business of its own (e2e/db.ts), through the
// wizard's own function, and the owner joins it through the console's link.
// WhatsApp's link is read, never opened.

type Size = keyof typeof PENDING_LINKS;

const j = he.auth.join;
const tt = he.app.team;
const f = he.app.home.firstSteps;

const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function expectCleanPage(page: Page) {
  // Metadata streams in after the body (see new-business.spec.ts).
  await expect(page).toHaveTitle(/ConceptApp$/);
  // Cloudflare's "אני לא רובוט" box isn't the app's to fix.
  const { violations } = await new AxeBuilder({ page })
    .exclude(CAPTCHA_FRAME)
    .analyze();
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
 * Joins the business through `link` with the code the dev SMS hook stored
 * for the number, as the invited person does at /join, and lands on Today.
 */
async function joinThrough(
  page: Page,
  link: string,
  business: PendingLinksBusiness,
  person: { e164: string },
): Promise<void> {
  await page.goto(link);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: j.title.replace("{business}", business.name),
    }),
  ).toBeVisible();
  const since = new Date(Date.now() - 1000);
  await captchaSettled(page);
  await page.getByRole("button", { name: j.send }).click();
  const code = page.getByLabel(j.codeLabel);
  await expect(code).toBeVisible();
  await code.fill(await latestCode(person.e164, since));
  await expect(page).toHaveURL(/\/home$/);
}

test("the wizard's invites wait on /team for a link, made and sent one person at a time", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(150_000);
  const business = PENDING_LINKS[testInfo.project.name as Size];
  const [first, second, third] = business.staff;
  // What each staff number was ever sent, from before anything here.
  const before = new Map<string, number>();
  for (const person of business.staff) {
    before.set(person.e164, await lastCodeId(person.e164));
  }
  const sentSince = (person: { e164: string }) =>
    codesSince(person.e164, before.get(person.e164) ?? 0);

  const ownerToken = await openPendingLinksBusiness(business);
  try {
    // Every invite the wizard saved has no link; the console made the
    // owner's alone.
    expect(await pendingLinkStates(business)).toEqual({
      [business.owner.e164]: { pending: false, open: true },
      [first.e164]: { pending: true, open: true },
      [second.e164]: { pending: true, open: true },
      [third.e164]: { pending: true, open: true },
    });

    // The owner joins through the console's link.
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await joinThrough(page, `/join/${ownerToken}`, business, business.owner);

    // Today's first step says who is still waiting for a link, never
    // "invited", and leads to the Team screen.
    const teamStep = page
      .getByRole("region", { name: f.title })
      .getByRole("link", {
        name: new RegExp(`^${literal(f.steps.team.title)}`),
      });
    await expect(teamStep).toContainText(
      heT("app.home.firstSteps.steps.team.pending", { count: 3 }),
    );
    await expect(teamStep).toHaveAttribute("href", "/team");
    // Today's team row says them first too, before the invites waiting and
    // the team's size.
    const teamRow = page
      .getByRole("main")
      .getByRole("link", { name: new RegExp(`^${literal(tt.title)}`) })
      .filter({ visible: true });
    await expect(teamRow).toHaveAttribute("href", "/team");
    await expect(teamRow).toContainText(
      heT("app.team.pending.count", { count: 3 }),
    );
    await teamStep.click();
    await expect(page).toHaveURL(/\/team$/);
    await expect(
      page.getByRole("heading", { level: 1, name: tt.title }),
    ).toBeVisible();

    // The Team screen says the same, in the shape on screen.
    const main = page.getByRole("main");
    const left = (count: number) =>
      main
        .getByText(heT("app.team.pending.count", { count }), { exact: true })
        .filter({ visible: true });
    await expect(left(3)).toHaveCount(1);
    await expect(
      main.getByText(tt.pending.hint).filter({ visible: true }),
    ).toHaveCount(1);
    await expectCleanPage(page);
    await page.screenshot({
      path: testInfo.outputPath("team-pending-1-waiting.png"),
      fullPage: true,
    });
    // Nothing went to anyone, and nobody was told anything.
    for (const person of business.staff) {
      expect(await sentSince(person), person.name).toBe(0);
    }
    expect(await notificationsIn(business)).toBe(0);

    // The first person's link, made at the moment of sending.
    const create = (name: string) =>
      page
        .getByRole("button", {
          name: heT("app.team.pending.createFor", { name }),
        })
        .filter({ visible: true });
    await expect(create(first.name)).toBeVisible();
    await expect(create(second.name)).toBeVisible();
    await create(first.name).click();

    // WhatsApp to their own number takes the focus: the message and the
    // link written, no name in it, a real link opened by the press itself.
    const whatsapp = page
      .getByRole("link", {
        name: heT("app.team.pending.whatsappFor", { name: first.name }),
      })
      .filter({ visible: true });
    await expect(whatsapp).toBeFocused();
    const field = page
      .getByLabel(heT("app.team.link.linkFor", { name: first.name }))
      .filter({ visible: true });
    await expect(field).toHaveValue(/\/join\/[A-Za-z0-9_-]{43}$/);
    const link = await field.inputValue();
    const href = new URL((await whatsapp.getAttribute("href")) ?? "");
    expect(`${href.origin}${href.pathname}`).toBe(
      `https://wa.me/${first.e164.slice(1)}`,
    );
    expect(href.searchParams.get("text")).toBe(
      shareText(
        heT("app.team.pending.message", { business: business.name }),
        link,
      ),
    );
    expect(href.searchParams.get("text")).not.toContain(first.name);
    await expect(whatsapp).toHaveAttribute("target", "_blank");
    await expect(whatsapp).toHaveAttribute("rel", /noopener/);
    // The row stays where it was; one fewer has no link.
    await expect(left(2)).toHaveCount(1);
    expect((await pendingLinkStates(business))[first.e164]).toEqual({
      pending: false,
      open: true,
    });

    // Copied, and on to the next person, whose "יצירת קישור" has the focus.
    await page
      .getByRole("button", { name: tt.link.copy })
      .filter({ visible: true })
      .click();
    await expect(
      page.getByRole("button", { name: tt.link.copied }).filter({
        visible: true,
      }),
    ).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      link,
    );
    await expect(create(second.name)).toBeFocused();
    await expectCleanPage(page);
    await page.screenshot({
      path: testInfo.outputPath("team-pending-2-sent.png"),
      fullPage: true,
    });
    // Making a link sends nothing either.
    for (const person of business.staff) {
      expect(await sentSince(person), person.name).toBe(0);
    }
    expect(await notificationsIn(business)).toBe(0);

    // Loaded again, the link made is an open invite, with "קישור חדש";
    // the other two still wait for theirs.
    await page.reload();
    await expect(left(2)).toHaveCount(1);
    await expect(create(first.name)).toHaveCount(0);
    await expect(create(second.name)).toBeVisible();
    await expect(create(third.name)).toBeVisible();
    await expect(
      page
        .getByRole("button", {
          name: heT("app.team.link.newFor", { name: first.name }),
        })
        .filter({ visible: true }),
    ).toBeVisible();
    expect(await pendingLinkStates(business)).toMatchObject({
      [second.e164]: { pending: true, open: true },
      [third.e164]: { pending: true, open: true },
    });

    // The first person joins through the link on a phone of their own, with
    // the one code they asked for.
    const theirs = await secondPage(browser, testInfo);
    try {
      await joinThrough(theirs, link, business, first);
      expect(await roleIn(business, first.e164)).toBe("worker");
    } finally {
      await theirs.context().close();
    }
    expect(await sentSince(first)).toBe(1);
    for (const person of [second, third]) {
      expect(await sentSince(person), person.name).toBe(0);
    }

    // Today's first step is done now, and still says who has no link while
    // any are left (plan 3.1), leading to the Team screen.
    await page.goto("/home");
    await expect(teamStep).toContainText(
      heT("app.home.firstSteps.steps.team.donePending", {
        count: 1,
        pending: 2,
      }),
    );
    await expect(teamStep).toHaveAttribute("href", "/team");
    // And its team row the two still waiting for theirs, not the team's
    // size, now that one of the staff joined.
    await expect(teamRow).toContainText(
      heT("app.team.pending.count", { count: 2 }),
    );
  } finally {
    await closePendingLinksBusiness(business);
  }
});
