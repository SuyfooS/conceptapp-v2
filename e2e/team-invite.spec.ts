import AxeBuilder from "@axe-core/playwright";
import he from "../messages/he.json" with { type: "json" };
import { isolateName } from "../packages/domain/bidi";
import { shareText } from "../packages/domain/share";
import { announcer, heardSoFar, saidSince } from "./announcer";
import { invitesBySlug, inviteToDemo, removeDemoInvites } from "./db";
import { signIn } from "./session";
import { heT } from "./t";
import { expect, type Page, test } from "./test";

// The seeded manager of the demo restaurant (supabase/seed.sql) invites
// from the Team screen. One new number per screen size; a seeded worker's
// number for "already in the team".
const MANAGER = { local: "050-000-0002", e164: "+972500000002" };
const MEMBER = { local: "050-000-0003", name: "נועה כהן" };
const NEW = {
  phone: { name: "תמר חדשה", local: "050-000-0911", e164: "+972500000911" },
  tablet: { name: "תמר טאבלט", local: "050-000-0912", e164: "+972500000912" },
  desktop: { name: "תמר מחשב", local: "050-000-0913", e164: "+972500000913" },
} as const;
const EXPIRED = { name: "אלון פג", phone: "+972500000921" };
const OWNER_INVITE = { name: "שותף ממתין", phone: "+972500000922" };

const tt = he.app.team;
const ti = tt.invite;
const tl = tt.link;
const BUSINESS = "מסעדת הדגמה";

/** A person's "וואטסאפ", in whichever shape is on screen. */
const whatsappFor = (page: Page, name: string) =>
  page
    .getByRole("link", { name: heT("app.team.pending.whatsappFor", { name }) })
    .filter({ visible: true });

/**
 * Each invite's link goes out on WhatsApp to the number it was made for,
 * with the sentence that says what it is (closing the pilot, PR 4): read
 * here, never opened.
 */
async function expectWhatsapp(page: Page, name: string, e164: string) {
  const whatsapp = whatsappFor(page, name);
  const field = page.getByLabel(tl.linkFor.replace("{name}", name)).filter({
    visible: true,
  });
  const link = await field.inputValue();
  const href = new URL((await whatsapp.getAttribute("href")) ?? "");
  expect(`${href.origin}${href.pathname}`).toBe(
    `https://wa.me/${e164.slice(1)}`,
  );
  expect(href.searchParams.get("text")).toBe(
    shareText(
      heT("app.team.pending.message", { business: isolateName(BUSINESS) }),
      link,
    ),
  );
  expect(href.searchParams.get("text")).not.toContain(name);
  await expect(whatsapp).toHaveAttribute("target", "_blank");
  await expect(whatsapp).toHaveAttribute("rel", /noopener/);
}

/** Where a test keeps the refusal's line it saw before, on the page's window. */
type SeenLine = { seenLine?: Element };

const allPhones = [
  ...Object.values(NEW).map((p) => p.e164),
  EXPIRED.phone,
  OWNER_INVITE.phone,
];

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

test.beforeEach(async () => {
  await removeDemoInvites(allPhones);
});

test.afterEach(async () => {
  await removeDemoInvites(allPhones);
});

test("a manager invites a worker by phone and gets the link", async ({
  page,
}, testInfo) => {
  const person = NEW[testInfo.project.name as keyof typeof NEW] ?? NEW.phone;
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await signIn(page, MANAGER);
  await page.goto("/team");
  await page
    .getByRole("main")
    .getByRole("link", { name: tt.inviteAction })
    .click();
  await expect(page).toHaveURL(/\/team\/invite$/);
  await expect(
    page.getByRole("heading", { level: 1, name: ti.title }),
  ).toBeVisible();

  // A manager gives their own role or below; worker is the default.
  await expect(page.getByRole("radio", { name: tt.roles.owner })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("radio", { name: new RegExp(tt.roles.worker) }),
  ).toBeChecked();

  // An empty form says what is missing. The first field refused takes the
  // focus the busy press lost, and why is said after its read
  // (accessibility, part 6), out of its description meanwhile; the number
  // keeps its own, for when it is reached.
  const polite = announcer(page, "polite");
  await heardSoFar(polite);
  await page.getByRole("button", { name: ti.submit }).click();
  // On the screen: the announcer, outside it, holds the name's line too.
  const screen = page.getByRole("main");
  await expect(screen.getByText(ti.errors.name.required)).toBeVisible();
  await expect(screen.getByText(ti.errors.phone.required)).toBeVisible();
  const nameField = page.getByLabel(ti.name, { exact: true });
  await expect(nameField).toBeFocused();
  await expect(saidSince(polite, ti.errors.name.required)).toHaveCount(1);
  await expect(nameField).not.toHaveAttribute("aria-describedby");
  await expect(
    page.getByLabel(ti.phone, { exact: true }),
  ).toHaveAccessibleDescription(ti.errors.phone.required);
  await expectCleanPage(page);

  await page.getByLabel(ti.name).fill(person.name);
  await page.getByLabel(ti.phone).fill(person.local);
  await page.getByRole("button", { name: ti.submit }).click();

  // The link ready: its card's title takes the focus, and says so.
  const ready = page.getByRole("heading", {
    name: ti.ready.replace("{name}", person.name),
  });
  await expect(ready).toBeVisible();
  await expect(ready).toBeFocused();
  const field = page.getByLabel(tl.linkFor.replace("{name}", person.name));
  await expect(field).toHaveValue(/\/join\/[A-Za-z0-9_-]{43}$/);
  const link = await field.inputValue();
  // WhatsApp first, to the number invited; the copy is the second way.
  await expectWhatsapp(page, person.name, person.e164);
  await page.getByRole("button", { name: tl.copy }).click();
  await expect(page.getByRole("button", { name: tl.copied })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  expect(await invitesBySlug("demo-restaurant")).toContainEqual({
    name: person.name,
    phone: person.e164,
    role: "worker",
  });
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("team-invite-ready.png"),
    fullPage: true,
  });

  // Someone already in the team is not invited again. A fresh form starts
  // on the name; the refusal is a line of its own, and the press keeps the
  // focus. The same refusal again is a line drawn anew, so it is heard
  // again.
  await page.getByRole("button", { name: ti.another }).click();
  await expect(page.getByLabel(ti.name, { exact: true })).toBeFocused();
  const refusal = page.getByRole("main").getByRole("alert");
  const submit = page.getByRole("button", { name: ti.submit });
  await page.getByLabel(ti.name).fill(MEMBER.name);
  await page.getByLabel(ti.phone).fill(MEMBER.local);
  await submit.click();
  await expect(refusal).toHaveText(ti.errors.alreadyMember);
  await expect(submit).toBeFocused();
  await refusal.evaluate((line) => {
    (window as unknown as SeenLine).seenLine = line;
  });
  await page.getByLabel(ti.name).fill(MEMBER.name);
  await page.getByLabel(ti.phone).fill(MEMBER.local);
  await submit.click();
  await expect
    .poll(() =>
      refusal.evaluate(
        (line) => line !== (window as unknown as SeenLine).seenLine,
      ),
    )
    .toBe(true);
  await expect(refusal).toHaveText(ti.errors.alreadyMember);
  await expect(submit).toBeFocused();

  // Back on the team, the new invite is waiting.
  await page.goto("/team");
  await expect(
    page.getByText(person.name).filter({ visible: true }).first(),
  ).toBeVisible();
});

test("a new link opens an expired invite again", async ({ page }, testInfo) => {
  await inviteToDemo({ ...EXPIRED, role: "worker", expiresInDays: -1 });
  await inviteToDemo({ ...OWNER_INVITE, role: "owner" });
  await signIn(page, MANAGER);
  await page.goto("/team");
  const main = page.getByRole("main");
  await expect(main).toContainText("להזמנה אחת פג התוקף");

  // A manager cannot send an owner's invite.
  await expect(
    page.getByRole("button", {
      name: tl.newFor.replace("{name}", OWNER_INVITE.name),
    }),
  ).toHaveCount(0);

  await page
    .getByRole("button", { name: tl.newFor.replace("{name}", EXPIRED.name) })
    .filter({ visible: true })
    .click();
  const field = page
    .getByLabel(tl.linkFor.replace("{name}", EXPIRED.name))
    .filter({ visible: true });
  await expect(field).toHaveValue(/\/join\/[A-Za-z0-9_-]{43}$/);
  // The press went: "וואטסאפ" has the focus, and says whose link it sends
  // (accessibility, part 6), to the invite's number with the sentence; the
  // copy beside it says whose link it copies.
  const whatsapp = whatsappFor(page, EXPIRED.name);
  await expect(whatsapp).toBeFocused();
  await expectWhatsapp(page, EXPIRED.name, EXPIRED.phone);
  const copy = page
    .getByRole("button", { name: tl.copy })
    .filter({ visible: true });
  await expect(copy).toHaveAccessibleDescription(
    tl.linkFor.replace("{name}", EXPIRED.name),
  );

  // The screen re-reads: nothing has expired any more, the link stays, and
  // the focus with it.
  await expect(main).not.toContainText("להזמנה אחת פג התוקף");
  await expect(field).toBeVisible();
  await expect(whatsapp).toBeFocused();
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("team-new-link.png"),
    fullPage: true,
  });
});
