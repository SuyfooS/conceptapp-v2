import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import { demoConversation } from "./db";

// The console, the door to the app and the screens for when something is
// missing, on their demos: both appearances, no data and no sign-in. What they
// do with real data is in admin, new-business, sign-in, invite and view-as.
// Chat's screens are opened for real too, as a worker, a manager and an owner
// of the demo restaurant come in through the door: they only read, but for
// the owner's read mark on the one conversation opened. So are the
// documents' (chat C7), for the accountant too: their lists open no file.
const PAGES = [
  "/design/console",
  "/design/console?storage=high",
  "/design/console?storage=full",
  "/design/console/new",
  "/design/console/businesses/cafe-noa",
  "/design/console/businesses/demo-restaurant",
  "/design/console/businesses/bar-hayam",
  "/design/console/businesses/bar-hayam/people/new",
  "/design/console/businesses/demo-restaurant/wording",
  "/design/shell/team/invite",
  "/design/shell/view-as",
  "/design/shell/module",
  "/design/shell/unavailable",
  "/design/screens/skeleton",
  "/design/screens/sign-in",
  "/design/screens/enter",
  "/design/screens/join",
  "/design/screens/join-expired",
  "/design/screens/join-claimed",
  "/design/screens/no-business",
  "/design/screens/no-access",
  "/design/screens/error",
  "/design/screens/not-found",
];

async function expectAccessible(page: Page) {
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
        await expect(page).toHaveTitle(/ConceptApp$/);
        // The title can arrive with a streamed page's skeleton: wait for the
        // page itself before checking it.
        await expect(
          page.getByRole("heading", { level: 1 }).first(),
        ).toBeAttached();
        await expectAccessible(page);
      });
    }
  });
}

/** In through the door, as one of the demo restaurant's people. */
async function enterDemoAs(
  page: Page,
  key: "worker" | "manager" | "owner" | "accountant",
) {
  const door = he.auth.enter;
  await page.goto("/enter");
  await page
    .getByRole("region", { name: door.businesses.restaurant.name })
    .getByRole("button", { name: new RegExp(door.people[key].name) })
    .click();
  await expect(page).toHaveURL(/\/home$/);
}

// Chat's list (C2), and from C3 every announcement in the person's groups
// and a group's details (the phone's own page, which the tablet and the
// desktop show beside the list too): each of the restaurant's staff reads
// them, with no horizontal scroll and nothing for axe, whatever the width.
for (const key of ["worker", "manager", "owner"] as const) {
  test(`/chat is clean for the ${key}`, async ({ page }) => {
    await enterDemoAs(page, key);
    await page.goto("/chat");
    await expect(
      page.getByRole("heading", { level: 1, name: he.modules.chat.name }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: he.app.chat.list.groups,
        exact: true,
      }),
    ).toBeVisible();
    await expect(page).toHaveTitle(/ConceptApp$/);
    await expectAccessible(page);
  });

  test(`/chat/announcements and a group's details are clean for the ${key}`, async ({
    page,
  }) => {
    const c = he.app.chat;
    const team = await demoConversation({ kind: "team" });
    expect(team).not.toBeNull();
    await enterDemoAs(page, key);

    await page.goto("/chat/announcements");
    await expect(
      page.getByRole("heading", { level: 1, name: c.announcement.page.title }),
    ).toBeVisible();
    // The seeded announcement, pinned; management also has the main action.
    await expect(
      page.getByRole("heading", { name: c.announcement.page.pinnedTitle }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: c.announcement.page.publish }),
    ).toHaveCount(key === "worker" ? 0 : 1);
    await expect(page).toHaveTitle(/ConceptApp$/);
    await expectAccessible(page);

    await page.goto(`/chat/${team}/info`);
    await expect(
      page.getByRole("heading", { level: 1, name: c.info.open }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: c.details.members }),
    ).toBeVisible();
    await expect(page.getByRole("switch", { name: c.info.mute })).toBeVisible();
    await expect(page).toHaveTitle(/ConceptApp$/);
    await expectAccessible(page);
  });
}

// The documents (chat C7) at each width: "המסמכים שלי" for the worker and
// the manager, who has no pay access in the restaurant (with "שלחת" for her,
// who sends), and the office's screen for the owner and the accountant, whose
// tab it is. Only lists: nothing here opens a document's file.
for (const key of ["worker", "manager", "owner", "accountant"] as const) {
  test(`/chat/documents is clean for the ${key}`, async ({ page }) => {
    const d = he.app.chat.documents;
    await enterDemoAs(page, key);
    await page.goto("/chat/documents");
    const office = key === "owner" || key === "accountant";
    await expect(
      page.getByRole("heading", { level: 1, name: office ? d.title : d.mine }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("main")
        .getByRole("link", {
          name: office ? d.sendToPeople : d.sendToBusiness,
        })
        .first(),
    ).toBeVisible();
    if (key === "manager") {
      await expect(
        page.getByRole("heading", { name: d.sent.title, exact: true }),
      ).toBeVisible();
    }
    await expect(page).toHaveTitle(/ConceptApp$/);
    await expectAccessible(page);
  });
}

// The notification settings in a demo business (N3), whose lines never
// reach a phone: they say so, with nothing to switch, at every width. What
// they offer in a real business is notification-settings.spec's.
test("/notifications/settings says a demo business has nothing to choose", async ({
  page,
}) => {
  const s = he.app.notifications.settings;
  await enterDemoAs(page, "worker");
  await page.goto("/notifications/settings");
  await expect(
    page.getByRole("heading", { level: 1, name: s.title }),
  ).toBeVisible();
  await expect(page.getByText(s.demo).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("switch")).toHaveCount(0);
  await expect(page).toHaveTitle(/ConceptApp$/);
  await expectAccessible(page);
});

// A conversation's details beside a phone's page of them (C3): on a tablet a
// sheet from the title, on a desktop the column beside the conversation,
// with mute in both; the owner's waiting announcement is pinned under the
// title. Opening the conversation marks it read for the owner, and nothing
// in these two widths counts that; the phone's page is chat-announce.spec's.
test("a group's details open from the title on a tablet and stay beside it on a desktop", async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;
  test.skip(project === "phone", "The phone opens a page of its own.");
  const c = he.app.chat;
  const team = await demoConversation({ kind: "team" });
  expect(team).not.toBeNull();
  await enterDemoAs(page, "owner");
  await page.goto(`/chat/${team}`);
  await expect(
    page.getByRole("log", { name: c.conversation.log }).filter({
      visible: true,
    }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("heading", { level: 2, name: c.announcement.label })
      .filter({ visible: true }),
  ).toBeVisible();
  const open = page
    .getByRole("button", { name: c.info.open, exact: true })
    .filter({ visible: true });
  await expect(
    page
      .getByRole("link", { name: c.info.open, exact: true })
      .filter({ visible: true }),
  ).toHaveCount(0);

  if (project === "tablet") {
    await open.click();
    const sheet = page.getByRole("dialog", { name: c.info.open });
    await expect(sheet).toBeVisible();
    await expect(
      sheet.getByRole("heading", { name: c.details.members }),
    ).toBeVisible();
    await expect(
      sheet.getByRole("switch", { name: c.info.mute }),
    ).toBeVisible();
    await expectAccessible(page);
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
  } else {
    await expect(open).toHaveCount(0);
    const column = page.getByRole("region", { name: c.details.label });
    await expect(column).toBeVisible();
    await expect(
      column.getByRole("switch", { name: c.info.mute }),
    ).toBeVisible();
    await expectAccessible(page);
  }
});

const e = he.errors;
const w = he.admin.newBusiness;

test("a failure shows a Hebrew screen, and trying again recovers", async ({
  page,
}) => {
  await page.goto("/design/screens/error-boundary");
  await page.getByRole("button", { name: he.design.errorDemoAction }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: e.title }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: e.home })).toHaveAttribute(
    "href",
    "/home",
  );
  await expectAccessible(page);

  await page.getByRole("button", { name: e.retry }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: he.design.errorDemoTitle }),
  ).toBeVisible();
});

test("an address that leads nowhere gets the Hebrew screen", async ({
  page,
}) => {
  await page.goto("/there-is-no-such-screen");
  await expect(
    page.getByRole("heading", { level: 1, name: e.notFound.title }),
  ).toBeVisible();
  await expectAccessible(page);
  await expect(page.getByRole("link", { name: e.home })).toHaveAttribute(
    "href",
    "/home",
  );
});

test("the wizard shows one step at a time and goes back to a taken address", async ({
  page,
}) => {
  await page.goto("/design/console/new");
  const next = page.getByRole("button", { name: w.actions.next });
  const step = (name: string) =>
    page.getByRole("heading", { level: 2, name, exact: true });

  // The first step has no way back but the link to the list.
  await expect(step(w.steps.template)).toBeVisible();
  await expect(page.getByRole("button", { name: w.actions.back })).toHaveCount(
    0,
  );
  await page
    .getByRole("radio", { name: new RegExp(w.templates["cafe-bar"].name) })
    .check();
  await next.click();

  await expect(step(w.steps.details)).toBeVisible();
  await expect(page.getByRole("radio").first()).toBeHidden();
  await page.getByLabel(w.fields.name.label, { exact: true }).fill("קפה בדיקה");
  await page
    .getByLabel(w.fields.slug.label, { exact: true })
    .fill("demo-restaurant");
  await next.click();

  await expect(step(w.steps.accent)).toBeVisible();
  await page.getByTitle(he.ui.accentPicker.presets.teal).click();
  await next.click();

  await expect(step(w.steps.staff)).toBeVisible();
  await page.getByRole("button", { name: w.actions.back }).click();
  await expect(step(w.steps.accent)).toBeVisible();
  await next.click();
  await page.getByRole("button", { name: w.actions.create }).click();

  await expect(page.getByText(w.errors.slug.taken)).toBeVisible();
  await expect(step(w.steps.details)).toBeVisible();
});
