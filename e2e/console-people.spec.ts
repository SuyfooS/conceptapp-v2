import AxeBuilder from "@axe-core/playwright";
import { createTranslator } from "next-intl";
import he from "../messages/he.json" with { type: "json" };
import { isolateName } from "../packages/domain/bidi";
import { shareText } from "../packages/domain/share";
import {
  demoInvite,
  inviteToDemo,
  removeDemoInvites,
  setDemoWording,
} from "./db";
import { signIn } from "./session";
import { heT } from "./t";
import { expect, type Page, test } from "./test";

// The ConceptApp team sets up people from the console (Orel, 7 November
// 2026): it renews an invite that ran out and adds a person in any role, an
// owner only to a business with none (Orel, 8 November 2026). The seeded
// platform admin (supabase/seed.sql) does it for the demo restaurant, which
// has an owner.
// One number per screen size, since the local database keeps each one.
const PLATFORM_ADMIN = { local: "050-000-0005", e164: "+972500000005" };
const EXPIRED = {
  phone: { name: "רונית פגה", e164: "+972500000941" },
  tablet: { name: "רונית פגה טאבלט", e164: "+972500000942" },
  desktop: { name: "רונית פגה מחשב", e164: "+972500000943" },
} as const;
const ADDED = {
  phone: { name: "עדי חדשה", local: "050-000-0944", e164: "+972500000944" },
  tablet: { name: "עדי טאבלט", local: "050-000-0945", e164: "+972500000945" },
  desktop: { name: "עדי מחשב", local: "050-000-0946", e164: "+972500000946" },
} as const;
// The demo shop's owner (supabase/seed.sql), active in another business.
const IN_THE_SHOP = { local: "050-000-0007" };

const a = he.admin;
const inv = he.admin.setup.invite;
const ti = he.app.team.invite;

type Size = keyof typeof EXPIRED;

/**
 * A link made here goes out on WhatsApp to the number it was made for, with
 * the team's sentence for anyone but an owner (closing the pilot, PR 4):
 * read here, never opened. `label` names the link's field; `message` is the
 * sentence, the app's unless the business has its own.
 */
async function expectWhatsapp(
  page: Page,
  person: { name: string; e164: string },
  label: string,
  message: string = he.app.team.pending.message,
) {
  const whatsapp = page
    .getByRole("link", {
      name: heT("app.team.pending.whatsappFor", { name: person.name }),
    })
    .filter({ visible: true });
  const link = await page
    .getByLabel(label)
    .filter({ visible: true })
    .inputValue();
  const href = new URL((await whatsapp.getAttribute("href")) ?? "");
  expect(`${href.origin}${href.pathname}`).toBe(
    `https://wa.me/${person.e164.slice(1)}`,
  );
  const sentence = createTranslator({ locale: "he", messages: { message } });
  expect(href.searchParams.get("text")).toBe(
    shareText(
      sentence("message", { business: isolateName("מסעדת הדגמה") }),
      link,
    ),
  );
  await expect(whatsapp).toHaveAttribute("target", "_blank");
  await expect(whatsapp).toHaveAttribute("rel", /noopener/);
}

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

test.afterEach(async () => {
  await removeDemoInvites([
    ...Object.values(EXPIRED).map((p) => p.e164),
    ...Object.values(ADDED).map((p) => p.e164),
  ]);
});

test("the console renews an invite that ran out", async ({
  page,
}, testInfo) => {
  const person = EXPIRED[testInfo.project.name as Size];
  await inviteToDemo({
    name: person.name,
    phone: person.e164,
    role: "manager",
    expiresInDays: -1,
  });
  await signIn(page, PLATFORM_ADMIN, /\/admin$/);

  // The list says the business has an invite nobody can use any more.
  // (One, or more if another spec left one behind.)
  await expect(
    page
      .getByText(/הזמנה אחת פגה|הזמנות פגו/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();

  await page.goto("/admin/businesses/demo-restaurant");
  await expect(
    page.getByText(a.setup.people.expired).filter({ visible: true }).first(),
  ).toBeVisible();
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("console-expired.png"),
    fullPage: true,
  });

  await page
    .getByRole("button", {
      name: inv.renewFor.replace("{name}", person.name),
    })
    .filter({ visible: true })
    .click();
  // The new link stays on screen while the page reads the invite again.
  const field = page
    .getByLabel(inv.linkFor.replace("{name}", person.name))
    .filter({ visible: true });
  await expect(field).toHaveValue(/\/join\/[A-Za-z0-9_-]{43}$/);
  // On WhatsApp to their number, with the sentence; or copied.
  await expectWhatsapp(
    page,
    person,
    inv.linkFor.replace("{name}", person.name),
  );
  await expect
    .poll(async () => (await demoInvite(person.e164))?.open)
    .toBe(true);
  // Open again: the badge says so, and the link is still there to copy.
  await expect(
    page.getByText(a.setup.people.invited).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(field).toHaveValue(/\/join\/[A-Za-z0-9_-]{43}$/);
});

test("the console adds a person, with a link to send, and no second owner", async ({
  page,
}, testInfo) => {
  const person = ADDED[testInfo.project.name as Size];
  await signIn(page, PLATFORM_ADMIN, /\/admin$/);
  await page.goto("/admin/businesses/demo-restaurant");
  await page
    .getByRole("link", { name: a.setup.people.add })
    .filter({ visible: true })
    .click();
  await expect(page).toHaveURL(
    /\/admin\/businesses\/demo-restaurant\/people\/new$/,
  );
  await expect(
    page.getByRole("heading", { level: 1, name: a.addPerson.title }),
  ).toBeVisible();
  await expectCleanPage(page);

  await page.getByLabel(ti.name).fill(person.name);
  await page.getByLabel(ti.phone).fill(person.local);
  // The restaurant has its owner, who invites another one.
  await page
    .getByRole("radio", { name: new RegExp(he.app.team.roles.owner) })
    .check();
  await page.getByRole("button", { name: ti.submit }).click();
  await expect(page.getByText(ti.errors.hasOwner)).toBeVisible();
  expect(await demoInvite(person.e164)).toBeNull();

  // With its hint: "מנהל/ת" is also the start of the accountant's name.
  await page
    .getByRole("radio", {
      name: new RegExp(
        `${he.app.team.roles.manager}.*${he.app.team.invite.roleHint.manager}`,
      ),
    })
    .check();
  await page.getByRole("button", { name: ti.submit }).click();
  await expect(
    page.getByRole("heading", {
      name: ti.ready.replace("{name}", person.name),
    }),
  ).toBeVisible();
  // Its link on WhatsApp to the number added, with the team's sentence.
  await expectWhatsapp(
    page,
    person,
    he.app.team.link.linkFor.replace("{name}", person.name),
  );
  await page.screenshot({
    path: testInfo.outputPath("console-added.png"),
    fullPage: true,
  });
  expect(await demoInvite(person.e164)).toEqual({
    role: "manager",
    open: true,
    byTeam: true,
  });

  // Back on the business, they are there, invited.
  await page
    .getByRole("link", {
      name: a.addPerson.back.replace("{name}", "מסעדת הדגמה"),
    })
    .click();
  await expect(page).toHaveURL(/\/admin\/businesses\/demo-restaurant$/);
  await expect(
    page.getByText(person.name).filter({ visible: true }).first(),
  ).toBeVisible();
});

test("someone working in another business is not added", async ({ page }) => {
  await signIn(page, PLATFORM_ADMIN, /\/admin$/);
  await page.goto("/admin/businesses/demo-restaurant/people/new");
  await page.getByLabel(ti.name).fill("מיכל");
  await page.getByLabel(ti.phone).fill(IN_THE_SHOP.local);
  await page.getByRole("button", { name: ti.submit }).click();
  await expect(page.getByText(ti.errors.elsewhere)).toBeVisible();
});

test("the checklist opens the right way to fix a missing owner", async ({
  page,
}) => {
  const owner = new RegExp(a.setup.checklist.items.owner.title);
  // On the design console (no sign-in): a business with nobody yet invites
  // its owner as an owner, and one whose owner's invite ran out renews it.
  await page.goto("/design/console/businesses/cafe-noa");
  await expect(page.getByRole("link", { name: owner })).toHaveAttribute(
    "href",
    /\/people\/new\?role=owner$/,
  );
  await page.goto("/design/console/businesses/bar-hayam");
  await expect(page.getByRole("link", { name: owner })).toHaveAttribute(
    "href",
    "#people",
  );

  // The real form starts on the role it was opened for.
  await signIn(page, PLATFORM_ADMIN, /\/admin$/);
  await page.goto("/admin/businesses/demo-restaurant/people/new?role=owner");
  await expect(
    page.getByRole("radio", { name: new RegExp(he.app.team.roles.owner) }),
  ).toBeChecked();
  await page.goto("/admin/businesses/demo-restaurant/people/new");
  await expect(
    page.getByRole("radio", { name: new RegExp(he.app.team.roles.worker) }),
  ).toBeChecked();
});

// A business may reword the sentence its invites go out with (the wording
// page, `app.team.pending.message`): a link from the console goes with it
// too, on the business's page and from "הוספת אדם", as /team sends it.
// Written straight to the database, and cleared after.
test("the console's links go out in the business's own sentence", async ({
  page,
}, testInfo) => {
  const renewed = EXPIRED[testInfo.project.name as Size];
  const added = ADDED[testInfo.project.name as Size];
  const ours =
    "{business} מחכים לך בצוות. הקישור אישי, בתוקף 14 יום, ונפתח מהטלפון הזה.";
  const base = he.app.team.pending.message;
  await inviteToDemo({
    name: renewed.name,
    phone: renewed.e164,
    role: "manager",
    expiresInDays: -1,
  });
  await setDemoWording("app.team.pending.message", ours, base);
  try {
    await signIn(page, PLATFORM_ADMIN, /\/admin$/);
    await page.goto("/admin/businesses/demo-restaurant");
    await page
      .getByRole("button", {
        name: inv.renewFor.replace("{name}", renewed.name),
      })
      .filter({ visible: true })
      .click();
    const label = inv.linkFor.replace("{name}", renewed.name);
    await expect(page.getByLabel(label).filter({ visible: true })).toHaveValue(
      /\/join\/[A-Za-z0-9_-]{43}$/,
    );
    await expectWhatsapp(page, renewed, label, ours);

    await page.goto("/admin/businesses/demo-restaurant/people/new");
    await page.getByLabel(ti.name).fill(added.name);
    await page.getByLabel(ti.phone).fill(added.local);
    await page.getByRole("button", { name: ti.submit }).click();
    await expect(
      page.getByRole("heading", {
        name: ti.ready.replace("{name}", added.name),
      }),
    ).toBeVisible();
    await expectWhatsapp(
      page,
      added,
      he.app.team.link.linkFor.replace("{name}", added.name),
      ours,
    );
  } finally {
    await setDemoWording("app.team.pending.message", null, base);
  }
});

// On the console's "הוספת אדם", an owner's link goes with the owner's own
// sentence, anyone else's with the team's. On its twin (no data, no
// sign-in), whose WhatsApp asks whom to send to.
test("the console's add-person twin sends an owner the owner's sentence, anyone else the team's", async ({
  page,
}) => {
  const named = { business: isolateName("קפה נועה") };
  await page.goto("/design/console/businesses/cafe-noa/people/new");
  await page.waitForLoadState("networkidle");
  const sent = async (who: string, role: string, message: string) => {
    await page.getByLabel(ti.name, { exact: true }).fill(who);
    await page.getByLabel(ti.phone, { exact: true }).fill("050-123-4567");
    await page.getByRole("radio", { name: new RegExp(role) }).check();
    await page.getByRole("button", { name: ti.submit }).click();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: ti.ready.replace("{name}", who),
      }),
    ).toBeVisible();
    const link = await page
      .getByLabel(he.app.team.link.linkFor.replace("{name}", who))
      .inputValue();
    const whatsapp = page.getByRole("link", {
      name: heT("app.team.pending.whatsappFor", { name: who }),
    });
    const href = new URL((await whatsapp.getAttribute("href")) ?? "");
    expect(`${href.origin}${href.pathname}`).toBe("https://wa.me/");
    expect(href.searchParams.get("text")).toBe(shareText(message, link));
  };

  await sent(
    "תמר בדיקה",
    he.app.team.roles.owner,
    heT("admin.setup.invite.ownerMessage", named),
  );
  await page.getByRole("button", { name: ti.another }).click();
  await sent(
    "רון בדיקה",
    he.app.team.roles.worker,
    heT("app.team.pending.message", named),
  );
});
