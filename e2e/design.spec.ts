import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import { minimalPdf } from "./pdf";
import { cameraPhoto } from "./photo";
import { heT } from "./t";
import { readWorkbook, unzip } from "./unzip";

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
  "/design/shell/clock/pay?file=sent",
  "/design/shell/clock/pay?file=changed",
  "/design/shell/clock/pay?close=closed",
  "/design/shell/clock/pay?close=changed",
  "/design/shell/clock/pay?close=manager",
  "/design/shell/clock/pay?close=before",
  "/design/shell/clock/pay?close=empty",
  "/design/shell/clock/pay/noa",
  "/design/shell/clock/pay/noa?close=closed",
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
  "/design/shell/today/businesses",
  "/design/shell/team",
  "/design/shell/team?state=demo",
  "/design/shell/team/noa",
  "/design/shell/team/maya",
  "/design/shell/me",
  "/design/shell/me?state=empty",
  "/design/shell/me?state=demo",
  "/design/shell/me/businesses",
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
  "/design/shell/lists?department=dep-bar",
  "/design/shell/lists?passed=dep-storeroom",
  "/design/shell/lists/worker",
  "/design/shell/lists/empty",
  "/design/shell/lists/empty?as=business",
  "/design/shell/lists/list-kitchen-opening",
  "/design/shell/lists/list-kitchen-opening?state=finished",
  "/design/shell/lists/list-bar-order",
  "/design/shell/lists/list-bar-order?state=passed",
  "/design/shell/lists/list-kitchen-closing-mon",
  "/design/shell/lists/list-weekly-cleaning",
  "/design/shell/lists/list-weekly-cleaning?state=photo",
  "/design/shell/lists/list-weekly-cleaning?state=demo",
  "/design/shell/lists/list-weekly-cleaning?state=gone",
  "/design/shell/lists/today",
  "/design/shell/lists/today?day=2026-11-01",
  "/design/shell/lists/today?state=empty",
  "/design/shell/lists/today?state=viewing",
  "/design/shell/lists/today?state=shiftGone",
  "/design/shell/lists/send",
  "/design/shell/lists/send?template=new",
  "/design/shell/lists/send?template=t-weekly-cleaning",
  "/design/shell/lists/send?template=t-bar-order",
  "/design/shell/lists/send?state=kitchenGone",
  "/design/shell/lists/templates",
  "/design/shell/lists/templates?removed=t-stock-count",
  "/design/shell/lists/templates?state=empty",
  "/design/shell/lists/templates?as=viewing",
  "/design/shell/lists/templates?state=empty&as=viewing",
  "/design/shell/lists/templates/t-kitchen-opening",
  "/design/shell/lists/templates/t-kitchen-opening?changed=1",
  "/design/shell/lists/templates/t-kitchen-opening?as=viewing",
  "/design/shell/lists/templates/t-bar-order",
  "/design/shell/lists/templates/t-bar-order?state=barGone",
  "/design/shell/lists/templates/t-bar-closing",
  "/design/shell/lists/templates/t-bar-closing?state=shiftGone",
  "/design/shell/lists/templates/t-weekly-cleaning",
  "/design/shell/lists/templates/t-weekly-cleaning?state=demo",
  "/design/shell/lists/templates/t-stock-count",
  "/design/shell/lists/templates/new",
  "/design/shell/notifications",
  "/design/shell/notifications/empty",
  "/design/shell/notifications/settings",
  "/design/shell/notifications/settings?state=quiet",
  "/design/shell/notifications/settings?state=demo",
  "/design/chat",
  "/design/chat?state=empty",
  "/design/chat?state=demo",
  "/design/chat/team",
  "/design/chat/team?state=confirmed",
  "/design/chat/team?state=readers",
  "/design/chat/team?state=actions",
  "/design/chat/team?announce=1",
  "/design/chat/team/info",
  "/design/chat/kitchen/info",
  "/design/chat/noa/info",
  "/design/chat/announcements",
  "/design/chat/floor",
  "/design/chat/kitchen",
  "/design/chat/kitchen?state=photo",
  "/design/chat/kitchen?state=attach",
  "/design/chat/kitchen?state=uploading",
  "/design/chat/kitchen?state=pdfFailed",
  "/design/chat/desserts",
  "/design/chat/noa",
  "/design/chat/noa?state=failed",
  "/design/chat/uri",
  "/design/chat/documents",
  "/design/chat/documents?state=seen",
  "/design/chat/documents?person=noa",
  "/design/chat/documents?state=empty",
  "/design/chat/documents?as=staff",
  "/design/chat/documents?as=staff&state=empty",
  "/design/chat/documents?as=manager",
  "/design/chat/documents/send",
  "/design/chat/documents/send?to=people",
  "/design/chat/documents/send?state=demo",
  "/design/chat/documents/sick-note",
  "/design/chat/documents/sick-note?state=remove",
  "/design/chat/documents/sick-note?state=removed",
  "/design/chat/documents/sick-note?as=staff&state=sent",
  "/design/chat/documents/procedure",
  "/design/chat/documents/procedure?as=manager",
  "/design/chat/documents/payslip?as=staff",
  "/design/chat/documents/maya-other",
  "/design/console/businesses/demo-restaurant/settings",
  "/design/console/businesses/demo-restaurant/lists",
  "/design/console/businesses/demo-restaurant/lists/t-kitchen-opening",
];

// The chat demo's states that open with a sheet (who confirmed, a message's
// actions, a picture shown whole, the attach sheet, a document's removal
// with its reasons): the sheet hides the page behind it from the
// accessibility tree. Lists' `?state=photo` opens none.
const OPENS_A_SHEET =
  /^\/design\/chat\/.*[?&]state=(readers|actions|photo|attach|remove)\b/;

async function expectCleanPage(page: Page, path = "") {
  await expect(page).toHaveTitle(/ConceptApp$/);
  // The title can arrive before a demo's streamed part: check the page itself,
  // or the sheet it opens with, which is checked once it is there.
  if (OPENS_A_SHEET.test(path)) {
    await expect(page.getByRole("dialog")).toBeVisible();
  } else {
    await expect(
      page.getByRole("heading", { level: 1 }).filter({ visible: true }).first(),
    ).toBeVisible();
  }
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
        await expectCleanPage(page, path);
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

// The chat's mock screens (C2). On a phone a conversation takes the whole
// screen: no tab bar, the composer in its place, and the list it goes back to
// has its bar again (the conversation kept hidden for going back must not
// hide it). From tablet up the list stays beside the conversation, and the
// desktop adds its details. What is sent goes on its way and is answered.
test("the chat demo hides the phone's tab bar in a conversation, and sends", async ({
  page,
}, testInfo) => {
  const c = he.app.chat;
  const phone = testInfo.project.name === "phone";
  const desktop = testInfo.project.name === "desktop";
  const bar = page
    .getByRole("navigation", { name: he.ui.appShell.mainNav })
    .filter({ visible: true });
  const visible = (name: string | RegExp) =>
    page.getByRole("link", { name }).filter({ visible: true }).first();

  await page.goto("/design/chat");
  await expect(
    page.getByRole("heading", { level: 1, name: he.modules.chat.name }),
  ).toBeVisible();
  await expect(bar).toHaveCount(1);
  if (!phone) {
    await expect(
      page.getByRole("heading", { name: c.list.choose.title }),
    ).toBeVisible();
  }

  await visible(/נועה כהן/).click();
  await expect(page).toHaveURL(/\/design\/chat\/noa$/);
  await expect(
    page
      .getByRole("heading", { level: 1, name: "נועה כהן" })
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByText(c.conversation.privateNote).filter({ visible: true }),
  ).toHaveCount(desktop ? 2 : 1);
  // The phone's bar steps aside; the tablet keeps it, the desktop its sidebar.
  await expect(bar).toHaveCount(phone ? 0 : 1);
  await expect(
    page
      .getByRole("heading", { name: c.list.people })
      .filter({ visible: true }),
  ).toHaveCount(phone ? 0 : 1);
  await expect(page.getByRole("region", { name: c.details.label })).toBeVisible(
    { visible: desktop },
  );

  const field = page
    .getByRole("textbox", { name: c.conversation.placeholder })
    .filter({ visible: true });
  const send = page
    .getByRole("button", { name: c.conversation.send, exact: true })
    .filter({ visible: true });
  await expect(send).toBeDisabled();
  await field.fill("נתראה בשש");
  await send.click();
  await expect(field).toHaveValue("");
  const log = page
    .getByRole("log", { name: c.conversation.log })
    .filter({ visible: true });
  await expect(log.getByText("נתראה בשש")).toBeVisible();
  await expect(log.getByText("תודה רבה")).toBeVisible({ timeout: 10_000 });
  await expect(log.getByText(c.conversation.sending)).toHaveCount(0);
  await expect(log.getByText(c.conversation.seen)).toHaveCount(1);

  if (phone) {
    await visible(c.conversation.back).click();
  } else {
    await visible(/כל הצוות/).click();
  }
  await expect(page).toHaveURL(
    phone ? /\/design\/chat$/ : /\/design\/chat\/team$/,
  );
  await expect(bar).toHaveCount(1);
});

// A message that didn't go says so under it, and goes when tried again; a
// removed department reads, and says why nothing can be written.
test("the chat demo retries a message, and a removed department takes none", async ({
  page,
}) => {
  const c = he.app.chat;
  await page.goto("/design/chat/noa?state=failed");
  const log = page
    .getByRole("log", { name: c.conversation.log })
    .filter({ visible: true });
  await log.getByRole("button", { name: c.conversation.failed }).click();
  await expect(log.getByText(c.conversation.sending)).toBeVisible();
  await expect(
    log.getByRole("button", { name: c.conversation.failed }),
  ).toHaveCount(0);
  await expect(log.getByText(c.conversation.sending)).toHaveCount(0);

  await page.goto("/design/chat/desserts");
  await expect(
    page.getByText(c.conversation.closed).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("textbox", { name: c.conversation.placeholder })
      .filter({ visible: true }),
  ).toHaveCount(0);
});

// The whole team's group with the owner's announcement pinned (C3), in each
// shape: "קראתי" is counted, who confirmed opens, and a message management
// removes comes back from the toast. A phone and a tablet open a message's
// actions with a tap on it; a desktop with its button, shown while the
// pointer is on the message, and its details column mutes the group.
test("the chat demo confirms the pinned announcement, and a removed message comes back", async ({
  page,
}, testInfo) => {
  const c = he.app.chat;
  const desktop = testInfo.project.name === "desktop";
  const words = "אני כבר פה, אקבל אותו";
  const readBy = (count: number) =>
    new RegExp(
      `^${c.announcement.readBy
        .replace("<ltr>{count}</ltr>", String(count))
        .replace("<ltr>{total}</ltr>", "\\d+")}$`,
    );
  const log = page
    .getByRole("log", { name: c.conversation.log })
    .filter({ visible: true });
  const visibleButton = (name: string | RegExp) =>
    page
      .getByRole("button", {
        name,
        exact: typeof name === "string" ? true : undefined,
      })
      .filter({ visible: true });

  await page.goto("/design/chat/team");
  await expect(
    page
      .getByRole("heading", { level: 2, name: c.announcement.label })
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByText(c.announcement.whoSees).filter({ visible: true }),
  ).toBeVisible();
  await expect(visibleButton(readBy(2))).toBeVisible();
  await visibleButton(c.announcement.confirm).click();
  await expect(
    page.getByText(c.announcement.confirmed).filter({ visible: true }),
  ).toBeVisible();
  await expect(visibleButton(c.announcement.confirm)).toHaveCount(0);
  await expect(visibleButton(readBy(3))).toBeVisible();

  await visibleButton(readBy(3)).click();
  const readers = page.getByRole("dialog", {
    name: c.announcement.readers.title,
  });
  await expect(
    readers.getByRole("heading", {
      name: c.announcement.readers.confirmed,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    readers.getByRole("heading", {
      name: c.announcement.readers.waiting,
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(readers).toHaveCount(0);

  // Someone else's message: management copies or removes it.
  if (desktop) {
    const bubble = page.locator("[data-bubble]").filter({ hasText: words });
    await bubble.hover();
    await bubble.getByRole("button", { name: c.messageActions.open }).click();
  } else {
    await log.getByText(words, { exact: true }).click();
  }
  const sheet = page.getByRole("dialog", { name: c.messageActions.title });
  await expect(
    sheet.getByRole("button", {
      name: new RegExp(`^${c.messageActions.copy}`),
    }),
  ).toBeVisible();
  await sheet
    .getByRole("button", { name: new RegExp(`^${c.messageActions.remove}`) })
    .click();
  await expect(sheet).toHaveCount(0);
  await expect(log.getByText(c.message.removedByManager)).toBeVisible();
  await expect(log.getByText(words, { exact: true })).toHaveCount(0);
  const removed = page
    .getByRole("status")
    .filter({ hasText: c.messageActions.removed });
  await removed.getByRole("button", { name: c.messageActions.undo }).click();
  await expect(
    page.getByRole("status").filter({ hasText: c.messageActions.restored }),
  ).toBeVisible();
  await expect(log.getByText(words, { exact: true })).toBeVisible();
  await expect(log.getByText(c.message.removedByManager)).toHaveCount(0);

  // The details column, on a desktop only, mutes the group.
  const mute = page
    .getByRole("switch", { name: c.info.mute })
    .filter({ visible: true });
  await expect(mute).toHaveCount(desktop ? 1 : 0);
  if (desktop) {
    await mute.click();
    await expect(mute).toBeChecked();
  }
});

// A conversation's details from its title (C3): on a phone their own page,
// on a tablet a sheet over the conversation, which gives the focus back to
// the button once closed, on a desktop the column beside it. The
// announcements' main action asks for the group and opens its composer as
// "הודעה מההנהלה".
test("the chat demo opens a group's details from its title, and posts as management", async ({
  page,
}, testInfo) => {
  const c = he.app.chat;
  const phone = testInfo.project.name === "phone";
  const desktop = testInfo.project.name === "desktop";
  const visible = (locator: Locator) => locator.filter({ visible: true });

  await page.goto("/design/chat/team");
  if (phone) {
    await visible(
      page.getByRole("link", { name: c.info.open, exact: true }),
    ).click();
    await expect(page).toHaveURL(/\/design\/chat\/team\/info$/);
    await expect(
      page.getByRole("heading", { level: 1, name: c.info.open }),
    ).toBeVisible();
    await expect(
      visible(page.getByRole("switch", { name: c.info.mute })),
    ).toHaveCount(1);
    await visible(page.getByRole("link", { name: c.info.back })).click();
    await expect(page).toHaveURL(/\/design\/chat\/team$/);
  } else if (!desktop) {
    const open = visible(
      page.getByRole("button", { name: c.info.open, exact: true }),
    );
    await open.click();
    const sheet = page.getByRole("dialog", { name: c.info.open });
    await expect(
      sheet.getByRole("switch", { name: c.info.mute }),
    ).toBeVisible();
    await expect(
      sheet.getByRole("heading", { name: c.details.members }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(open).toBeFocused();
  } else {
    await expect(
      visible(page.getByRole("button", { name: c.info.open, exact: true })),
    ).toHaveCount(0);
    await expect(
      visible(page.getByRole("link", { name: c.info.open, exact: true })),
    ).toHaveCount(0);
  }

  await page.goto("/design/chat/announcements");
  await expect(
    page.getByRole("heading", { level: 1, name: c.announcement.page.title }),
  ).toBeVisible();
  await visible(
    page.getByRole("button", { name: c.announcement.page.publish }),
  ).click();
  const choose = page.getByRole("dialog", {
    name: c.announcement.page.chooseGroup,
  });
  await choose.getByRole("link", { name: c.list.team, exact: true }).click();
  await expect(page).toHaveURL(/\/design\/chat\/team\?announce=1$/);
  await expect(
    visible(page.getByRole("switch", { name: c.announcement.switch })),
  ).toBeChecked();
  await expect(
    visible(
      page.getByRole("button", { name: c.announcement.send, exact: true }),
    ),
  ).toBeVisible();
});

// A demo business takes no invites (#80): its Team screen offers none and
// says why, at every size; a real one keeps its invite and new links.
test("the team demo offers no invite in a demo business", async ({ page }) => {
  const tt = he.app.team;
  const main = page.getByRole("main");
  await page.goto("/design/shell/team");
  await expect(
    main.getByRole("link", { name: tt.inviteAction }).filter({ visible: true }),
  ).toHaveCount(1);
  await expect(
    main
      .getByRole("button", { name: new RegExp(`^${tt.link.new}`) })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(main.getByText(tt.invites.closed)).toHaveCount(0);

  await page.goto("/design/shell/team?state=demo");
  await expect(
    main.getByText(tt.invites.closed).filter({ visible: true }),
  ).toHaveCount(1);
  await expect(main.getByRole("link", { name: tt.inviteAction })).toHaveCount(
    0,
  );
  await expect(
    main.getByRole("button", { name: new RegExp(`^${tt.link.new}`) }),
  ).toHaveCount(0);
});

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

// The switcher's twins (payroll P3b): the demo's accountant keeps the books of
// the restaurant, where she is, and of a shop with two unread lines. A desktop
// switches from the sidebar's menu; phones and tablets from Home's list and
// the profile's sheet, with the same words.
test("the switcher's demo offers both businesses on every screen", async ({
  page,
}, testInfo) => {
  const b = he.ui.businesses;
  const shop = /חנות הדגמה/;
  const unread = heT("ui.businesses.unread", { count: 2 });
  await page.goto("/design/shell/today/businesses");
  if (testInfo.project.name === "desktop") {
    await expect(page.getByRole("heading", { name: b.title })).toBeHidden();
    // The sidebar is the accountant's own, with no staff tab.
    const sidebar = page.locator("aside");
    await expect(
      sidebar.getByRole("link", { name: /גלית הדגמה/ }),
    ).toBeVisible();
    await expect(
      sidebar.getByRole("link", { name: he.shell.nav.team, exact: true }),
    ).toHaveCount(0);
    // The shop's two lines show under the name before anything is pressed,
    // and the menu's name says them too.
    const elsewhere = { count: 2, businesses: 1 };
    await expect(
      page
        .getByText(heT("ui.businesses.unreadElsewhere", elsewhere))
        .filter({ visible: true }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: heT("ui.businesses.menuUnread", {
          name: "מסעדת הדגמה",
          ...elsewhere,
        }),
      })
      .click();
    await expect(
      page.getByRole("menuitemradio", { name: /מסעדת הדגמה/ }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("menuitemradio", { name: shop })).toContainText(
      unread,
    );
    // While it is open, Radix hides the rest of the page from screen readers:
    // the menu alone, then the whole page once it is closed.
    const open = await new AxeBuilder({ page })
      .include('[role="menu"]')
      .analyze();
    expect(open.violations.map((v) => v.id)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
    return;
  }
  await expect(
    page.getByRole("heading", { level: 2, name: b.title }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: shop }).filter({ visible: true }),
  ).toContainText(unread);
  await expect(
    page.getByText(b.here).filter({ visible: true }).first(),
  ).toBeVisible();

  await page.goto("/design/shell/me/businesses");
  await page.getByRole("button", { name: new RegExp(b.switch) }).click();
  const sheet = page.getByRole("dialog", { name: b.title });
  await expect(sheet.getByText(b.here)).toBeVisible();
  await expect(sheet.getByRole("button", { name: shop })).toBeVisible();
  // The sheet hides the page from screen readers, heading and all: axe alone.
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
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

// The template editor's demo (lists L3): an item added from its sheet saves
// itself and moves up, one already there opens in its own sheet, and an order
// whose asking department was removed holds its saves until another asks, or
// none (L5); the console's twin has nothing to send; a template whose
// department was removed sends to nobody until someone is chosen; a list
// typed now goes out from the send screen.
test("the template demo adds an item, moves it, and a typed list is sent", async ({
  page,
}) => {
  const l = he.app.lists;
  await page.goto("/design/shell/lists/templates/t-kitchen-opening");
  await page.getByRole("button", { name: l.items.add, exact: true }).click();
  const sheet = page.getByRole("dialog", { name: l.items.newTitle });
  await sheet
    .getByRole("button", { name: l.items.kinds.number, exact: true })
    .click();
  await sheet.getByLabel(l.items.label, { exact: true }).fill("מקרר משקאות");
  await sheet
    .getByRole("button", {
      name: l.items.minusOf.replace("{field}", l.items.min),
    })
    .click();
  await sheet.getByLabel(l.items.min, { exact: true }).fill("1");
  await sheet.getByLabel(l.items.max, { exact: true }).fill("4");
  // The sheet hides the page from screen readers: axe on it alone.
  const open = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .analyze();
  expect(open.violations.map((v) => v.id)).toEqual([]);
  await sheet
    .getByRole("button", { name: l.items.create, exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: he.app.manage.saved }),
  ).toBeVisible();
  await expect(
    page.getByText("−1 – 4").filter({ visible: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: l.items.up.replace("{label}", "מקרר משקאות"),
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: l.items.down.replace("{label}", "מקרר משקאות"),
    }),
  ).toBeEnabled();

  // An item already there opens in its sheet, with the way to remove it.
  await page.getByRole("button", { name: /^מקפיא/ }).click();
  const existing = page.getByRole("dialog", { name: "מקפיא" });
  await expect(
    existing.getByRole("button", { name: l.items.remove, exact: true }),
  ).toBeVisible();
  await expect(existing.getByLabel(l.items.min, { exact: true })).toHaveValue(
    "25",
  );
  const sheetOpen = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .analyze();
  expect(sheetOpen.violations.map((v) => v.id)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(existing).toBeHidden();

  // The bar's order after the bar was removed (L5): it says so and holds its
  // saves until another department asks, or none, which saves it as a list
  // of its own.
  await page.goto("/design/shell/lists/templates/t-bar-order?state=barGone");
  await expect(
    page.getByRole("status").filter({ hasText: l.templates.editor.askingGone }),
  ).toBeVisible();
  await expect(
    page.getByLabel(l.templates.editor.name, { exact: true }),
  ).toBeEnabled();
  // Named as it reads while the removed one holds it: still to choose.
  await page
    .getByRole("button", {
      name: `${l.templates.editor.asking}: ${l.templates.editor.choose}`,
    })
    .click();
  await page
    .getByRole("menuitemradio", {
      name: l.templates.editor.askingNone,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: he.app.manage.saved }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: l.templates.editor.askingGone }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: l.templates.editor.archive }),
  ).toBeVisible();

  await page.goto(
    "/design/console/businesses/demo-restaurant/lists/t-kitchen-opening",
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "פתיחת מטבח" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: l.templates.editor.sendNow }),
  ).toHaveCount(0);

  // The kitchen's opening list after the kitchen was removed: nobody is
  // chosen for it, and the screen says why.
  await page.goto("/design/shell/lists/send?state=kitchenGone");
  await expect(
    page.getByRole("status").filter({ hasText: l.send.gone }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("button", { name: l.send.choose, exact: true })
      .filter({ visible: true })
      .first(),
  ).toBeDisabled();

  await page.goto("/design/shell/lists/send?template=new");
  await page.getByLabel(l.send.typedName, { exact: true }).fill("בדיקת בר");
  await page.getByRole("button", { name: l.items.add, exact: true }).click();
  await page
    .getByRole("dialog", { name: l.items.newTitle })
    .getByLabel(l.items.label, { exact: true })
    .fill("מילוי קרח");
  await page
    .getByRole("dialog", { name: l.items.newTitle })
    .getByRole("button", { name: l.items.create, exact: true })
    .click();
  await page
    .getByRole("button", { name: l.send.kinds.shift, exact: true })
    .click();
  await page.getByRole("radio", { name: /^ערב/ }).check();
  await page
    .getByRole("button", {
      name: l.send.submit.shift.replace("{name}", "ערב"),
    })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(
    /\/design\/shell\/lists\?sent=list-floor-opening$/,
  );
});

// The order demo (lists L5): the bar's order at the storeroom says how many
// were given and how many are short, and passes on from its sheet, which
// names where it goes; passed back, its timeline keeps the note; Lists shows
// it waiting elsewhere, and the department filter keeps the bar's lists.
test("the order demo gives counts, passes the list on, and filters by department", async ({
  page,
}, testInfo) => {
  const l = he.app.lists;
  const one = (text: string) =>
    /one \{([^}]*)\}/.exec(text)?.[1] ?? text.replace(/\{.*\}/, "");
  await page.goto("/design/shell/lists/list-bar-order");
  await expect(
    page.getByRole("spinbutton", {
      name: l.list.givenOf.replace("{label}", "יין לבן"),
    }),
  ).toHaveValue("4");
  await expect(
    page
      .getByText(
        (/other \{([^}]*)\}/.exec(l.list.short)?.[1] ?? "").replace("#", "2"),
        { exact: true },
      )
      .first(),
  ).toBeVisible();
  await page.getByRole("button", { name: l.list.pass.action }).click();
  const sheet = page.getByRole("dialog", { name: l.list.pass.title });
  await sheet.getByRole("radio", { name: /^בר/ }).check();
  await sheet
    .getByLabel(l.list.pass.note, { exact: true })
    .fill("חסר יין לבן, יגיע מחר");
  const open = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .analyze();
  expect(open.violations.map((v) => v.id)).toEqual([]);
  await sheet
    .getByRole("button", { name: l.list.pass.submit.replace("{name}", "בר") })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: l.list.pass.passed.replace("{name}", "בר") }),
  ).toBeVisible();

  // Passed back from the storeroom, with its note. A phone folds what
  // happened at the end: it opens first.
  await page.goto("/design/shell/lists/list-bar-order?state=passed");
  if (testInfo.project.name === "phone") {
    await page
      .locator("summary")
      .filter({ hasText: l.list.timeline.title })
      .filter({ visible: true })
      .click();
  }
  // It was sent to the storeroom, and passed from there to the bar.
  const [sentBefore = ""] = l.list.timeline.sent.split("{name}");
  await expect(
    page
      .getByText(
        new RegExp(
          `^${sentBefore}.+ ${l.card.to.department.replace("{name}", "מחסן")},`,
        ),
      )
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(
    page
      .getByText(
        l.list.timeline.note.replace(
          "{note}",
          "יין לבן יגיע מחר בבוקר. השאר כאן.",
        ),
      )
      .filter({ visible: true })
      .first(),
  ).toBeVisible();

  // Lists: the bar's order waits at the storeroom; the bar's lists alone.
  await page.goto("/design/shell/lists");
  await expect(
    page.getByRole("heading", { name: one(l.asked) }).filter({ visible: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: l.filter.menu.replace("{name}", l.filter.all),
    })
    .filter({ visible: true })
    .click();
  await page.getByRole("menuitemradio", { name: "בר", exact: true }).click();
  await expect(page).toHaveURL(/\/design\/shell\/lists\?department=dep-bar$/);
  await expect(
    page
      .getByRole("main")
      .getByRole("link", { name: /^הזמנה מהבר למחסן/ })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(
    page
      .getByRole("main")
      .getByRole("link", { name: /^פתיחת אולם/ })
      .filter({ visible: true }),
  ).toHaveCount(0);
});

// Photos on a list (L6), on the weekly cleaning's demo: a photo taken from the
// phone's chooser shows at once and says it was saved; removing it offers an
// undo that brings it back; a demo business says it takes none, with no way
// to take one; one past the days the business keeps photos says so; and the
// finished list shows the photo with who took it.
test("the photo demo takes a photo, removes it and brings it back", async ({
  page,
}) => {
  const l = he.app.lists.list;
  const main = page.getByRole("main");
  const label = "צילום של המטבח אחרי הניקיון";
  const photo = main.getByRole("img", {
    name: l.photo.alt.replace("{label}", label),
  });

  await page.goto("/design/shell/lists/list-weekly-cleaning");
  await expect(photo).toBeVisible();
  await expect(
    main.getByRole("button", { name: new RegExp(`^${l.photo.take}`) }),
  ).toHaveCount(0);

  await page.goto("/design/shell/lists/list-weekly-cleaning?state=photo");
  await expect(photo).toHaveCount(0);
  const take = main.getByRole("button", { name: `${l.photo.take}: ${label}` });
  await expect(take).toBeVisible();
  await expect(main.getByText(l.photo.takeHint)).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await take.click();
  await (await chooser).setFiles({
    name: "photo.jpg",
    mimeType: "image/jpeg",
    buffer: await cameraPhoto(page),
  });
  await expect(
    page.getByRole("status").filter({ hasText: l.photo.saved }),
  ).toBeVisible();
  await expect(photo).toBeVisible();
  await expect(
    main.getByRole("button", { name: `${l.photo.replace}: ${label}` }),
  ).toBeVisible();
  const taken = await new AxeBuilder({ page }).analyze();
  expect(taken.violations.map((v) => v.id)).toEqual([]);

  await main
    .getByRole("button", { name: `${l.photo.remove}: ${label}` })
    .click();
  const undo = page.getByRole("status").filter({ hasText: l.photo.removed });
  await expect(undo).toBeVisible();
  await expect(photo).toHaveCount(0);
  await undo.getByRole("button", { name: he.app.manage.undo }).click();
  await expect(photo).toBeVisible();
  await expect(undo).toHaveCount(0);

  await page.goto("/design/shell/lists/list-weekly-cleaning?state=demo");
  await expect(main.getByText(l.photo.demo, { exact: true })).toBeVisible();
  await expect(
    main.getByRole("button", { name: new RegExp(`^${l.photo.take}`) }),
  ).toHaveCount(0);

  await page.goto("/design/shell/lists/list-weekly-cleaning?state=gone");
  await expect(
    main.getByText(heT("app.lists.list.photo.removedAfter")),
  ).toBeVisible();
  await expect(photo).toHaveCount(0);
});

// In a demo business, which takes no photos (L6), the template editor keeps a
// photo item optional, so its list can still be finished: "חובה" is off and
// still, and the sheet says why, for an item already there and a new one.
test("the template demo keeps a photo item optional in a demo business", async ({
  page,
}) => {
  const l = he.app.lists;
  const label = "צילום של המטבח אחרי הניקיון";
  await page.goto("/design/shell/lists/templates/t-weekly-cleaning?state=demo");
  await page.getByRole("button", { name: new RegExp(`^${label}`) }).click();
  const sheet = page.getByRole("dialog", { name: label });
  const required = sheet.getByRole("switch", {
    name: l.items.required,
    exact: true,
  });
  await expect(required).toBeDisabled();
  await expect(required).toHaveAttribute("aria-checked", "false");
  await expect(sheet.getByText(l.items.photoOptional)).toBeVisible();
  const open = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .analyze();
  expect(open.violations.map((v) => v.id)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  await page.getByRole("button", { name: l.items.add, exact: true }).click();
  const added = page.getByRole("dialog", { name: l.items.newTitle });
  await expect(
    added.getByRole("switch", { name: l.items.required, exact: true }),
  ).toBeEnabled();
  await added
    .getByRole("button", { name: l.items.kinds.photo, exact: true })
    .click();
  await expect(
    added.getByRole("switch", { name: l.items.required, exact: true }),
  ).toBeDisabled();
  await expect(added.getByText(l.items.photoOptional)).toBeVisible();
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

// The file for payroll on the demo (payroll P8): the main action downloads
// the demo's October, four sheets right to left, and says when the last file
// went out, warned once the hours changed since.
test("the pay demo's file: its action, what it holds, and the workbook", async ({
  page,
}, testInfo) => {
  const f = he.app.pay.file;
  await page.goto("/design/shell/clock/pay?file=changed");
  const action = page.getByRole("link", { name: f.download });
  await expect(action).toBeVisible();
  await expect(action).toHaveAttribute(
    "href",
    "/design/shell/clock/pay/export?month=2026-10",
  );
  await expect(page.getByText(f.what).filter({ visible: true })).toBeVisible();
  const changed = heT.markup("app.pay.file.changed", {
    ltr: (chunks: string) => chunks,
    month: "אוקטובר 2026",
    date: "3.11",
    time: "10:00",
  });
  await expect(page.getByText(changed).filter({ visible: true })).toBeVisible();

  if (testInfo.project.name !== "desktop") return;
  const download = page.waitForEvent("download");
  await action.click();
  const file = await download;
  const bytes = readFileSync(await file.path());
  const { sheets, strings } = readWorkbook(unzip(bytes));
  expect(sheets.map((sheet) => sheet.name)).toEqual([
    f.sheets.summary,
    f.sheets.daily,
    f.sheets.check,
    f.sheets.about,
  ]);
  for (const sheet of sheets) expect(sheet.xml).toContain('rightToLeft="1"');
  expect(strings).toContain("אוקטובר 2026");
  // Noa's payroll number stays text, and her correction keeps its reason.
  expect(strings).toContain("102");
  expect(strings).toContain("שכחה לצאת");
});

// Closing a month on the demo (payroll P9): the owner closes October beside
// its file, with no "are you sure"; once closed, the header says when and by
// whom, a day changed since says where it goes, and reopening asks why. A
// manager reads it closed, with nothing to press; the month after a closed
// and changed one has its differences in its file, even with no hours of its
// own; a wage can't start in a closed month, and the sheet says from when.
test("the pay demo closes a month, says so, and reopens it with a reason", async ({
  page,
}, testInfo) => {
  const c = he.app.pay.close;
  const r = he.app.pay.reopen;
  const flat = (key: Parameters<typeof heT.markup>[0], values = {}) =>
    heT.markup(key, { ltr: (chunks: string) => chunks, ...values });

  // Ended and not closed: the file first, closing beside it, and what then.
  await page.goto("/design/shell/clock/pay");
  await expect(
    page.getByRole("link", { name: he.app.pay.file.download }),
  ).toBeVisible();
  const close = page.getByRole("button", { name: c.action });
  await expect(close).toBeVisible();
  await expect(page.getByText(c.hint).filter({ visible: true })).toBeVisible();
  await close.click();
  await expect(
    page.getByRole("status").filter({
      hasText: heT("app.pay.close.done", { month: "אוקטובר 2026" }),
    }),
  ).toBeVisible();

  // Closed by Galit: the header says so, and closing gives way to reopening.
  await page.goto("/design/shell/clock/pay?close=closed");
  await expect(
    page
      .getByText(
        flat("app.pay.close.closedBy", { date: "3.11", name: "גלית הדגמה" }),
      )
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: c.action })).toHaveCount(0);
  await expect(page.getByText(c.hint)).toHaveCount(0);
  await page.getByRole("button", { name: r.action }).click();
  const sheet = page.getByRole("dialog", {
    name: heT("app.pay.reopen.title", { month: "אוקטובר 2026" }),
  });
  await expect(sheet).toBeVisible();
  // The sheet hides the page from screen readers, heading and all: axe alone.
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  // A reason is needed, said under its field.
  await sheet.getByRole("button", { name: r.save }).click();
  await expect(sheet.getByText(r.reasonNeeded)).toBeVisible();
  await sheet.getByLabel(r.reason).fill("חסרה משמרת של יואב");
  await sheet.getByRole("button", { name: r.save }).click();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole("status").filter({
      hasText: heT("app.pay.reopen.done", { month: "אוקטובר 2026" }),
    }),
  ).toBeVisible();

  // A day changed since it closed: it goes into November's file.
  await page.goto("/design/shell/clock/pay?close=changed");
  await expect(
    page
      .getByText(heT("app.pay.diff.changed", { count: 1, next: "נובמבר 2026" }))
      .filter({ visible: true }),
  ).toBeVisible();

  // A manager with pay access reads it closed, and presses nothing.
  await page.goto("/design/shell/clock/pay?close=manager");
  await expect(
    page
      .getByText(
        flat("app.pay.close.closedBy", { date: "3.11", name: "גלית הדגמה" }),
      )
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: r.action })).toHaveCount(0);
  await expect(page.getByRole("button", { name: c.action })).toHaveCount(0);

  // September closed and changed: October's file says it holds them, and
  // the demo's file does.
  const inFile = heT("app.pay.diff.inFile", {
    month: "ספטמבר 2026",
    count: 2,
  });
  const sheetsOf = async (href: string) => {
    const response = await page.request.get(href);
    expect(response.ok()).toBe(true);
    return readWorkbook(unzip(await response.body())).sheets.map(
      (one) => one.name,
    );
  };
  const names = he.app.pay.file.sheets;
  const withDifferences = [
    names.summary,
    names.daily,
    names.check,
    names.differences,
    names.about,
  ];
  await page.goto("/design/shell/clock/pay?close=before");
  await expect(page.getByText(inFile).filter({ visible: true })).toBeVisible();
  const before = page.getByRole("link", { name: he.app.pay.file.download });
  await expect(before).toHaveAttribute(
    "href",
    "/design/shell/clock/pay/export?close=before&month=2026-10",
  );
  if (testInfo.project.name === "desktop") {
    expect(
      await sheetsOf(
        "/design/shell/clock/pay/export?close=before&month=2026-10",
      ),
    ).toEqual(withDifferences);
    expect(
      await sheetsOf("/design/shell/clock/pay/export?month=2026-10"),
    ).not.toContain(names.differences);
  }

  // An October with no hours of its own still has its file, for them.
  await page.goto("/design/shell/clock/pay?close=empty");
  await expect(
    page
      .getByText(heT("app.pay.empty.title", { month: "אוקטובר 2026" }))
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByText(inFile).filter({ visible: true })).toBeVisible();
  const empty = page.getByRole("link", { name: he.app.pay.file.download });
  await expect(empty).toBeVisible();
  await expect(empty).toHaveAttribute(
    "href",
    "/design/shell/clock/pay/export?close=empty&month=2026-10",
  );
  await expect(page.getByRole("button", { name: c.action })).toHaveCount(0);
  if (testInfo.project.name === "desktop") {
    expect(
      await sheetsOf(
        "/design/shell/clock/pay/export?close=empty&month=2026-10",
      ),
    ).toEqual(withDifferences);
  }

  // A wage can't start in the closed month, in words, and the sheet says
  // from when it may.
  await page.goto("/design/shell/clock/pay/noa?close=closed");
  await page
    .getByRole("button", { name: he.app.pay.wage.change })
    .filter({ visible: true })
    .click();
  const wage = page.getByRole("dialog");
  await expect(
    wage.getByText(
      flat("app.pay.wage.sheet.fromHintClosed", {
        month: "אוקטובר 2026",
        date: "1.11.2026",
      }),
    ),
  ).toBeVisible();
  await wage.getByLabel(he.app.pay.wage.sheet.amount).fill("40");
  await wage.getByLabel(he.app.pay.wage.sheet.from).fill("2026-10-15");
  await wage.getByRole("button", { name: /^שמירת השכר/ }).click();
  await expect(
    wage.getByText(he.app.pay.wage.errors.from.closed),
  ).toBeVisible();
});

// A template's times in the editor's demo (lists L4): a saved time says when
// it is sent next, a paused one says so, and a time added in its sheet, here
// one that follows a shift, saves itself and says when it goes; the sheet is
// clean. The manager's day leads to a list from its table, late first, and
// the week on top opens a day of the history.
test("the times demo adds a time by a shift, and the day's overview reads its history", async ({
  page,
}) => {
  const ls = he.app.lists.schedules;
  const lo = he.app.lists.overview;
  await page.goto("/design/shell/lists/templates/t-kitchen-opening");
  // Tuesday at 08:12: today's opening went at 07:30, the next is tomorrow.
  await expect(
    page.getByRole("button", { name: /07:30/ }).filter({ hasText: "עד" }),
  ).toContainText(ls.next.tomorrow.replace("<ltr>{time}</ltr>", "07:30"));

  await page.getByRole("button", { name: ls.add, exact: true }).click();
  const sheet = page.getByRole("dialog", { name: ls.sheet.newTitle });
  await sheet
    .getByRole("button", { name: ls.sheet.anchors.shift, exact: true })
    .click();
  await expect(
    sheet
      .getByRole("button", { name: new RegExp(`^${ls.sheet.shift}`) })
      .first(),
  ).toBeVisible();
  const open = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .analyze();
  expect(open.violations.map((v) => v.id)).toEqual([]);
  await sheet
    .getByRole("button", { name: ls.sheet.create, exact: true })
    .click();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole("status").filter({ hasText: he.app.manage.saved }),
  ).toBeVisible();

  // The weekly cleaning's time is paused.
  await page.goto("/design/shell/lists/templates/t-weekly-cleaning");
  await expect(page.getByText(ls.next.paused).first()).toBeVisible();

  // With the evening gone from the settings, the bar's closing says on top
  // that its time holds the saves, and the way to it opens that time.
  await page.goto(
    "/design/shell/lists/templates/t-bar-closing?state=shiftGone",
  );
  const held = page.getByRole("status").filter({
    hasText: heT("app.lists.templates.editor.held", { count: 1 }),
  });
  await expect(held).toBeVisible();
  await held
    .getByRole("button", { name: he.app.lists.templates.editor.fixTime })
    .click();
  await expect(
    page.getByRole("dialog", { name: ls.sheet.title }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/design/shell/lists/today");
  await expect(
    page
      .getByText(heT("app.lists.overview.readings.outOfRange", { count: 1 }), {
        exact: true,
      })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  // Monday's dot says what it has to look at: last night's closing, late,
  // with its fridge out of range.
  await expect(
    page
      .getByRole("group", { name: lo.pick })
      .getByRole("button", { name: /^ב׳\s*2(\s|$)/ }),
  ).toContainText(heT("app.lists.overview.readings.outOfRange", { count: 1 }));
  // Sunday the 1st, five days before.
  await page
    .getByRole("group", { name: lo.pick })
    .getByRole("button", { name: /^א׳\s*1(\s|$)/ })
    .click();
  await expect(page).toHaveURL(
    /\/design\/shell\/lists\/today\?day=2026-11-01$/,
  );
  // Sunday's floor opening nobody did: a section of its own on a phone and
  // a tablet, a row in the table on a computer.
  await expect(
    page
      .getByText(heT("app.lists.overview.sections.missed", { count: 1 }))
      .first(),
  ).toBeAttached();
  await expect(
    page.getByText("פתיחת אולם").filter({ visible: true }).first(),
  ).toBeVisible();
});

// Pictures in the chat demo (C4): Noa's photo in the kitchen opens whole in a
// sheet, with what she wrote under it; one picked from the attach button is
// made ready on the page as the app makes it, shown over the field, and goes
// with the next message; the removed desserts group keeps a message whose
// picture is no longer kept, and says so.
test("the chat demo opens a picture whole, sends a picked photo, and says when a file is no longer kept", async ({
  page,
}) => {
  const c = he.app.chat;
  const log = page
    .getByRole("log", { name: c.conversation.log })
    .filter({ visible: true });
  const alt = c.image.alt.replace("{name}", "נועה כהן");

  await page.goto("/design/chat/kitchen");
  await log.getByRole("img", { name: alt }).click();
  const sheet = page.getByRole("dialog", { name: alt });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("ככה המטבח נראה עכשיו")).toBeVisible();
  // The sheet hides the page from screen readers while it is open: axe alone.
  const opened = await new AxeBuilder({ page }).analyze();
  expect(opened.violations.map((v) => v.id)).toEqual([]);
  await sheet.getByRole("button", { name: c.image.close }).click();
  await expect(sheet).toHaveCount(0);

  // The attach button opens the attach sheet; its picture row, the picker.
  await page
    .getByRole("button", { name: c.conversation.attach, exact: true })
    .filter({ visible: true })
    .click();
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("dialog", { name: c.attach.title })
    .getByRole("button", { name: new RegExp(`^${c.attach.photo}`) })
    .click();
  await (await chooser).setFiles({
    name: "photo.jpg",
    mimeType: "image/jpeg",
    buffer: await cameraPhoto(page),
  });
  const chosen = page
    .getByRole("img", { name: c.image.chosen })
    .filter({ visible: true });
  await expect(chosen).toBeVisible();
  await expectCleanPage(page);
  const send = page
    .getByRole("button", { name: c.conversation.send, exact: true })
    .filter({ visible: true });
  await expect(send).toBeEnabled();
  await send.click();
  await expect(log.getByRole("img", { name: c.image.altOwn })).toBeVisible();
  await expect(chosen).toHaveCount(0);

  await page.goto("/design/chat/desserts");
  await expect(
    log.getByText(c.message.fileGone, { exact: true }),
  ).toBeVisible();
});

// PDFs in the chat demo (C5): Omer's menu in the kitchen is a download; one
// picked from the attach sheet is checked for its name and size, shows over
// the field, goes up with its bar and becomes a download of the file picked;
// one too big is said over the field and goes nowhere; one part of the way up
// stops, and its words come back; one that didn't go tries again.
test("the chat demo sends a PDF from the attach sheet, stops one on its way, and tries one again", async ({
  page,
}) => {
  const c = he.app.chat;
  const log = page
    .getByRole("log", { name: c.conversation.log })
    .filter({ visible: true });
  const visibleButton = (name: string | RegExp) =>
    page
      .getByRole("button", {
        name,
        exact: typeof name === "string" ? true : undefined,
      })
      .filter({ visible: true });
  const pdfRow = () =>
    page
      .getByRole("dialog", { name: c.attach.title })
      .getByRole("button", { name: new RegExp(`^${c.attach.pdf}`) });

  await page.goto("/design/chat/kitchen");
  // Written without its ".pdf" (the line under it says PDF); saved with it.
  const menu = log.getByRole("link", { name: /תפריט סתיו 2026/ });
  await expect(menu).toBeVisible();
  expect(await menu.getAttribute("href")).toMatch(/^data:application\/pdf;/);
  expect(await menu.getAttribute("download")).toBe("תפריט סתיו 2026.pdf");

  // Too big: said over the field, and nothing is chosen.
  await visibleButton(c.conversation.attach).click();
  let chooser = page.waitForEvent("filechooser");
  await pdfRow().click();
  await (await chooser).setFiles({
    name: "big.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 0x20),
  });
  await expect(
    page
      .getByText(c.pdfFailure.tooBig.replace("<ltr>{max}</ltr>", "10"))
      .filter({ visible: true }),
  ).toBeVisible();

  // A PDF goes with the next message, up a bit at a time, then downloads.
  await visibleButton(c.conversation.attach).click();
  chooser = page.waitForEvent("filechooser");
  await pdfRow().click();
  await (await chooser).setFiles({
    name: "הזמנה.pdf",
    mimeType: "application/pdf",
    buffer: minimalPdf("ConceptApp design"),
  });
  await expect(visibleButton(c.pdf.remove)).toBeVisible();
  await expectCleanPage(page);
  await visibleButton(c.conversation.send).click();
  await expect(
    log.getByRole("progressbar", { name: c.pdf.progress }),
  ).toBeVisible();
  const sent = log.getByRole("link", { name: /הזמנה/ });
  await expect(sent).toBeVisible({ timeout: 10_000 });
  expect(await sent.getAttribute("href")).toMatch(/^blob:/);
  await expect(visibleButton(c.pdf.remove)).toHaveCount(0);

  // Part of the way up: its bar says how far; stopped, it goes, and says so.
  await page.goto("/design/chat/kitchen?state=uploading");
  const bar = log.getByRole("progressbar", { name: c.pdf.progress });
  await expect(bar).toHaveAttribute("aria-valuenow", "45");
  await log.getByRole("button", { name: c.pdf.cancel }).click();
  await expect(bar).toHaveCount(0);
  await expect(
    page.getByText(c.pdfFailure.cancelled).filter({ visible: true }),
  ).toBeVisible();

  // One that didn't go says so over the field, and goes when tried again.
  await page.goto("/design/chat/kitchen?state=pdfFailed");
  await expect(
    page.getByText(c.pdfFailure.failed).filter({ visible: true }),
  ).toBeVisible();
  await log.getByRole("button", { name: c.conversation.failed }).click();
  await expect(log.getByRole("link", { name: /הזמנה לספק/ })).toBeVisible({
    timeout: 10_000,
  });
});

// The documents' mock screens (chat C7): the office's three shapes, one thing
// at a time on a phone ("מחכה לך" or everyone by person), the people beside
// the chosen one's documents on a tablet, and the table with its filters and
// a preview on a desktop, which opens only the row chosen. Its notice to keep
// a copy goes once "הבנתי" is pressed.
test("the documents demo shows the office's documents in each device's shape", async ({
  page,
}, testInfo) => {
  const d = he.app.chat.documents;
  const project = testInfo.project.name;
  await page.goto("/design/chat/documents");
  await expect(
    page.getByRole("heading", { level: 1, name: d.title }),
  ).toBeVisible();
  const segments = page
    .getByRole("group", { name: d.office.segments })
    .filter({ visible: true });
  const table = page
    .getByRole("table", { name: d.office.table.caption })
    .filter({ visible: true });
  await expect(segments).toHaveCount(project === "phone" ? 1 : 0);
  await expect(table).toHaveCount(project === "desktop" ? 1 : 0);
  if (project === "phone") {
    await segments.getByRole("button", { name: d.office.all }).click();
    await expect(
      page
        .getByRole("link", { name: /^נועה כהן/ })
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
  } else if (project === "tablet") {
    await page
      .getByRole("link", { name: /^נועה כהן/ })
      .filter({ visible: true })
      .first()
      .click();
    await expect(page).toHaveURL(/\?person=noa$/);
    await expect(
      page
        .getByRole("heading", {
          name: d.office.personTitle.replace("{name}", "נועה כהן"),
        })
        .filter({ visible: true }),
    ).toBeVisible();
  } else {
    // Nothing opens until a row is chosen; then its preview shows the photo.
    await expect(
      page.locator('img[src$="/demo-documents/sick-note.webp"]'),
    ).toHaveCount(0);
    await table.getByRole("button", { name: /אישור מחלה ליום שני/ }).click();
    await expect(
      page
        .getByRole("complementary", { name: d.office.preview.title })
        .getByRole("img"),
    ).toBeVisible();
  }
  const notice = page.getByRole("heading", { name: d.notice.title });
  await expect(notice).toBeVisible();
  await page.getByRole("button", { name: d.notice.ok }).click();
  await expect(notice).toHaveCount(0);
});

// A document's file deleted with a reason from the list, and put back from
// the toast: the row stays, saying why its file went.
test("the documents demo deletes a file with a reason, and the toast puts it back", async ({
  page,
}) => {
  const d = he.app.chat.documents;
  await page.goto("/design/chat/documents/sick-note");
  await page.getByRole("button", { name: d.removeFile }).click();
  const sheet = page.getByRole("dialog", { name: d.page.removeTitle });
  await sheet.getByRole("radio", { name: d.reasons.duplicate }).check();
  await sheet.getByRole("button", { name: d.removeFile }).click();
  const removed = d.removed.replace("{reason}", d.reasons.duplicate);
  await expect(page.getByRole("main").getByText(removed).first()).toBeVisible();
  await page
    .getByRole("status")
    .filter({ hasText: d.page.removedToast })
    .getByRole("button", { name: d.page.undo })
    .click();
  await expect(page.getByRole("main").getByText(removed)).toHaveCount(0);
  await expect(
    page.getByRole("main").getByRole("img", { name: /אישור מחלה ליום שני/ }),
  ).toBeVisible();
});

// Noa's payslip asks for her "קראתי ואישרתי", the page's main action: once
// pressed, the page says she confirmed.
test("the documents demo confirms a document that asks for it", async ({
  page,
}) => {
  const d = he.app.chat.documents;
  await page.goto("/design/chat/documents/payslip?as=staff");
  await page.getByRole("button", { name: d.confirm }).click();
  await expect(
    page.getByRole("status").filter({ hasText: d.confirmedNow }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: d.confirm })).toHaveCount(0);
});
