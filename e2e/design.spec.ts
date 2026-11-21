import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { createTranslator } from "next-intl";
import { restaurantWording } from "../app/design/order-taking/data";
import he from "../messages/he.json" with { type: "json" };
import { daysLeftToRight } from "../packages/domain/share";
import { type MessageTree, mergeWording } from "../packages/domain/wording";
import { before, buildScreen, HOLD_MS } from "./build-screen";
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
  // A worker who builds the schedule without publishing it (roles R3).
  "/design/shell/today/worker-builds",
  // A manager lowered to team none (roles R6): no team row on Today.
  "/design/shell/today/no-team",
  "/design/shell/today/scheduling-off",
  // The owner's first steps: a business a few days in, one on its first
  // day, and the team viewing as the owner.
  "/design/shell/today/first-steps",
  "/design/shell/today/first-steps?state=new",
  "/design/shell/today/first-steps?state=viewing",
  // Signed in again on the business's clock station: the reminder to lock it,
  // and a worker's card to sign out when done.
  "/design/shell/today/station",
  "/design/shell/today/station?state=worker",
  "/design/shell/schedule",
  // Next week, as the link in a shared schedule opens it.
  "/design/shell/schedule?week=2026-11-08",
  "/design/shell/schedule/worker",
  "/design/shell/schedule/swaps",
  "/design/shell/schedule/availability",
  // The team's answers, with the reminder before and after the due moment,
  // nobody sent yet, everyone sent (no reminder), and a team of no one.
  "/design/shell/schedule/availability/team",
  "/design/shell/schedule/availability/team?state=late",
  "/design/shell/schedule/availability/team?state=none",
  "/design/shell/schedule/availability/team?state=all",
  "/design/shell/schedule/availability/team?state=empty",
  "/design/shell/schedule/build",
  "/design/shell/schedule/build?state=meanwhile",
  "/design/shell/schedule/build?week=2026-11-01",
  // Building without publishing (roles R3): a draft, and a published week read.
  "/design/shell/schedule/build?publishes=no",
  "/design/shell/schedule/build?state=meanwhile&publishes=no",
  "/design/shell/schedule/build/running",
  "/design/shell/schedule/build/running?week=next",
  "/design/shell/schedule/shifts",
  "/design/shell/schedule/shifts?at=evening",
  "/design/shell/clock",
  "/design/shell/clock?estimate=off",
  "/design/shell/clock?state=working",
  "/design/shell/clock?state=break",
  "/design/shell/clock?state=left",
  "/design/shell/clock?code=on",
  "/design/shell/clock?state=working&code=on",
  "/design/shell/clock/code",
  // The clock station (#78 phase 5): running, refused a code while running,
  // a device that isn't one, one stopped, and someone signed in on it who
  // locks it again, can't with ten running, or doesn't.
  "/design/shell/station",
  "/design/shell/station?state=clockOff",
  "/design/shell/station?state=managerOnly",
  "/design/shell/station?state=new",
  "/design/shell/station?state=stopped",
  "/design/shell/station?state=signedIn",
  "/design/shell/station?state=signedInFull",
  "/design/shell/station?state=signedInWorker",
  "/design/shell/clock/history",
  "/design/shell/clock/history?state=empty",
  "/design/shell/clock/history?estimate=off",
  "/design/shell/clock/team",
  "/design/shell/clock/team/noa",
  "/design/shell/clock/team/yoav",
  // A shift being fixed with "ביטול המשמרת" under it, the step that cancels
  // it, and a cancelled one to bring back (the clock plan's PR4); Noa's was
  // still open when it was cancelled.
  "/design/shell/clock/team/yoav?state=edit",
  "/design/shell/clock/team/yoav?state=cancel",
  "/design/shell/clock/team/yoav?state=cancelled",
  "/design/shell/clock/team/noa?state=cancelled",
  // Fixing a break (the clock plan's PR5): one that ended, adding one, and a
  // shift whose break still runs.
  "/design/shell/clock/team/yoav?state=break",
  "/design/shell/clock/team/yoav?state=addBreak",
  "/design/shell/clock/team/yoav?state=openBreak",
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
  // The accountant signed in on the business's clock station: sign out when done.
  "/design/shell/today/accountant?state=station",
  "/design/shell/today/businesses",
  "/design/shell/today/businesses?state=left",
  "/design/shell/team",
  "/design/shell/team?state=demo",
  // A worker raised to see the team without editing it (roles R6).
  "/design/shell/team?state=view",
  "/design/shell/team/noa",
  "/design/shell/team/maya",
  "/design/shell/team/noa?state=clocked",
  "/design/shell/team/noa?state=former",
  // Someone nobody named: the title and the name row read "בלי שם".
  "/design/shell/team/noa?state=nameless",
  "/design/shell/team/uri?as=manager",
  "/design/shell/team/noa?as=viewer",
  // A worker raised to edit the team, who doesn't read the hours, and a
  // manager where managers hold pay (roles R6).
  "/design/shell/team/noa?as=editor",
  "/design/shell/team/noa?as=manager&state=pay",
  "/design/shell/team/invite?as=editor",
  "/design/shell/team/invite?as=paid",
  // Every role an owner's, for pay and for what it holds (roles R11c).
  "/design/shell/team/invite?as=held",
  "/design/shell/me",
  "/design/shell/me?state=empty",
  "/design/shell/me?state=demo",
  "/design/shell/me/businesses",
  "/design/shell/manage",
  // Someone at view on the management page (roles R7), and a module's
  // settings without the module's own edit.
  "/design/shell/manage?state=view",
  "/design/shell/manage/notifications?state=view",
  "/design/shell/manage/scheduling?state=module",
  "/design/shell/manage/business?state=view",
  "/design/shell/manage/departments?state=view",
  // A manager lowered to team none (roles R6): no team row, and none to the
  // owner's roles and pay.
  "/design/shell/manage?state=noTeam",
  "/design/shell/manage/business",
  "/design/shell/manage/activity",
  "/design/shell/manage/activity/empty",
  "/design/shell/manage/scheduling",
  "/design/shell/manage/time_clock",
  "/design/shell/manage/lists",
  "/design/shell/manage/notifications",
  "/design/shell/manage/departments",
  "/design/shell/manage/access",
  // Workers see pay too, and the shift lead still only by his own (R11e).
  "/design/shell/manage/access?state=named",
  "/design/shell/manage/roles",
  // The role the business named, opened first: on a phone, its own screen.
  "/design/shell/manage/roles?role=shift-lead",
  // Orel's case (L6b-2): "עובד בכיר" on workers, lists at view with fixing
  // closed lists on, also opened first.
  "/design/shell/manage/roles?state=senior",
  "/design/shell/manage/roles?state=senior&role=senior",
  "/design/shell/lists",
  "/design/shell/lists?sent=list-floor-opening",
  "/design/shell/lists?department=dep-bar",
  "/design/shell/lists?passed=dep-storeroom",
  "/design/shell/lists/worker",
  // A worker raised to lists edit without sending (R5): who sends.
  "/design/shell/lists/worker?state=edits",
  // Given fixing closed lists (L6b-2): yesterday's list still to fix.
  "/design/shell/lists/worker?state=fixable",
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
  // Each item's story (L6a): a reading changed after another's, a tick
  // taken back, and a list opened again and closed.
  "/design/shell/lists/list-kitchen-opening?state=history",
  "/design/shell/lists/list-weekly-cleaning?state=history",
  // A closed list fixed in place (L6b-1): being fixed, with its card, and
  // fixed, with its marks, also on the manager's day.
  "/design/shell/lists/list-kitchen-opening?state=fix",
  "/design/shell/lists/list-kitchen-opening?state=fixed",
  "/design/shell/lists/today?state=fixed",
  // The same close for someone given fixing closed lists (L6b-2), for a day.
  "/design/shell/lists/list-kitchen-opening?state=fix-worker",
  // A list to a role the business named (R11d).
  "/design/shell/lists/list-shift-opening",
  "/design/shell/lists/today",
  "/design/shell/lists/today?day=2026-11-01",
  "/design/shell/lists/today?state=empty",
  "/design/shell/lists/today?state=viewing",
  "/design/shell/lists/today?state=noSend",
  "/design/shell/lists/today?state=emptyNoSend",
  "/design/shell/lists/today?state=shiftGone",
  "/design/shell/lists/send",
  "/design/shell/lists/send?template=new",
  "/design/shell/lists/send?template=t-weekly-cleaning",
  "/design/shell/lists/send?template=t-bar-order",
  "/design/shell/lists/send?state=kitchenGone",
  "/design/shell/lists/send?template=t-shift-opening",
  "/design/shell/lists/send?template=t-shift-opening&state=roleGone",
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
  "/design/shell/lists/templates/t-shift-opening",
  "/design/shell/lists/templates/t-shift-opening?state=roleGone",
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
  "/design/chat/announcements?announces=no",
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
  "/design/chat/documents?as=manager&state=noSend",
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
  "/design/console/businesses/demo-restaurant/access",
  "/design/console/businesses/demo-restaurant/access?state=readOnly",
  // Roles and permissions from the console (R2): scheduling (R3), the time
  // clock (R4), lists (R5), the team (R6) and the management page (R7) open
  // and the rest closed, then every area open as each phase will open it,
  // and a team role that only reads.
  "/design/console/businesses/demo-restaurant/roles",
  "/design/console/businesses/demo-restaurant/roles?state=open",
  "/design/console/businesses/demo-restaurant/roles?state=readOnly",
  "/design/console/businesses/demo-restaurant/roles?state=lists",
  // A business nobody has joined yet: only an invite, and one that ran out.
  "/design/console/businesses/bar-hayam/access",
  // Waiter mode's mock screens (S0, #191): each screen and state the twin's
  // list names, the stations outside the mode's shell included.
  "/design/order-taking",
  "/design/order-taking/floor",
  "/design/order-taking/floor?state=quiet",
  "/design/order-taking/floor?state=offClock",
  "/design/order-taking/floor?state=staleShift",
  "/design/order-taking/floor?state=readyNow",
  "/design/order-taking/floor?state=noPlaces",
  "/design/order-taking/floor?state=viewing",
  "/design/order-taking/floor/order?place=table-6",
  "/design/order-taking/floor/order?place=table-6&state=draft",
  "/design/order-taking/floor/order?place=table-6&state=sent",
  "/design/order-taking/floor/order?place=table-6&state=pending",
  "/design/order-taking/floor/order?place=table-6&state=soldOut",
  "/design/order-taking/floor/order?place=table-6&state=taken",
  // P6: the burger's choices open, and a choice gone from the menu.
  "/design/order-taking/floor/order?place=table-6&state=choices",
  "/design/order-taking/floor/order?place=table-6&state=choicesChanged",
  "/design/order-taking/floor/order?place=table-4",
  "/design/order-taking/floor/order?place=takeaway-new",
  "/design/order-taking/floor/order?order=order-takeaway-1",
  "/design/order-taking/floor/till?order=order-4",
  "/design/order-taking/floor/till?order=order-4&state=byRound",
  "/design/order-taking/floor/till?order=order-3",
  // P5's fixes: table 4 after a cancel and a beer on the house, its till, a
  // takeaway cancelled whole, a reopen refused while the table is taken, the
  // kitchen striking the cancelled dish, and the owner's line.
  "/design/order-taking/floor/order?place=table-4&state=fixed",
  "/design/order-taking/floor/till?order=order-4&state=fixed",
  "/design/order-taking/floor/till?order=order-takeaway-2",
  "/design/order-taking/floor/till?order=order-3&state=reopenTaken",
  "/design/order-taking/prep?state=fixed",
  "/design/shell/manage/order_taking",
  "/design/order-taking/mine",
  "/design/order-taking/mine?state=nothingSent",
  "/design/order-taking/prep",
  "/design/order-taking/prep?state=nothingOpen",
  "/design/order-taking/prep?state=kitchen",
  "/design/order-taking/station/prep",
  "/design/order-taking/station/prep?state=open",
  "/design/order-taking/station/prep?state=offline",
  "/design/order-taking/station/prep?state=nothingOpen",
  "/design/order-taking/station/till",
  "/design/order-taking/menu",
  "/design/order-taking/menu?state=noMenu",
  "/design/order-taking/menu/import",
  // The real menu screens on the twin (P2): Yoav in the bar, a category whose
  // department went, a view as a manager, the categories, the places and a
  // business with none, and pastes with lines to fix and with items there
  // already; and the departments saying what each prepares.
  "/design/order-taking/menu?state=worker",
  "/design/order-taking/menu?state=noRoute",
  "/design/order-taking/menu?state=viewing",
  "/design/order-taking/menu/categories",
  "/design/order-taking/menu/categories?state=noDepartments",
  "/design/order-taking/menu/places",
  "/design/order-taking/menu/places?state=noPlaces",
  "/design/order-taking/menu/import?state=problems",
  "/design/order-taking/menu/import?state=known",
  "/design/shell/manage/departments?state=menu",
  "/design/shell/manage/departments?state=menuEmpty",
];

// The chat demo's states that open with a sheet (who confirmed, a message's
// actions, a picture shown whole, the attach sheet, a document's removal
// with its reasons), a person's hours on the clock demo open on a shift,
// and waiter mode's order opens on an item's choices: the sheet hides the
// page behind it from the accessibility tree. Lists' `?state=photo` opens
// none.
const OPENS_A_SHEET =
  /^\/design\/(chat\/.*[?&]state=(readers|actions|photo|attach|remove)|shell\/clock\/team\/[^?]+[?&]state=(edit|cancel|cancelled|break|addBreak|openBreak)|order-taking\/floor\/order\?.*[?&]state=choices)\b/;

async function expectCleanPage(
  page: Page,
  path = "",
  sheet = OPENS_A_SHEET.test(path),
) {
  await expect(page).toHaveTitle(/ConceptApp$/);
  // The title can arrive before a demo's streamed part: check the page itself,
  // or the sheet it opens with (or a test opened), checked once it is there.
  if (sheet) {
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

  // Moderating without announcing (the roles plan's R8): no main action,
  // and the line says who posts them.
  await page.goto("/design/chat/announcements?announces=no");
  await expect(
    visible(page.getByText(c.announcement.page.noAnnounce)),
  ).toBeVisible();
  await expect(
    visible(page.getByRole("button", { name: c.announcement.page.publish })),
  ).toHaveCount(0);
});

// A shift that has begun is no longer given away, as the database refuses
// it: Noa's Tuesday evening offers it at noon, and at 17:30, an hour and a
// half into it, neither its hero nor its sheet does.
test("the shifts demo offers no giving away once the shift has begun", async ({
  page,
}) => {
  const sw = he.app.shifts.swap;
  const evening = heT("app.shifts.shift", {
    name: "ערב",
    day: he.app.availability.weekdays.tue,
    date: "3.11",
  });
  const give = page
    .getByRole("button", { name: `${sw.buttons.give}, ${evening}` })
    .filter({ visible: true });

  await page.goto("/design/shell/schedule/shifts");
  await expect(give).toHaveCount(1);

  await page.goto("/design/shell/schedule/shifts?at=evening");
  const hero = page.getByRole("region", { name: evening, exact: true });
  await expect(hero).toContainText(he.app.shifts.yours);
  await expect(give).toHaveCount(0);
  await hero
    .getByRole("button", {
      name: heT("app.shifts.board.open", { shift: evening }),
    })
    .click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(sheet).not.toContainText(he.app.shifts.sheet.give);
  await expect(
    sheet.getByRole("button", { name: new RegExp(`^${sw.buttons.give}, `) }),
  ).toHaveCount(0);
});

// A request whose shift has begun can only be declined, as the database
// refuses approving it: Maya took Omer's Tuesday morning, which began at
// 09:00, and at noon it says why, offers no approval and is not counted.
test("the swaps demo offers only declining once the shift has begun", async ({
  page,
}) => {
  const ap = he.app.swaps;
  const morning = heT("app.shifts.shift", {
    name: "בוקר",
    day: he.app.availability.weekdays.tue,
    date: "3.11",
  });
  const decision = (name: string) =>
    page
      .getByRole("button", { name: new RegExp(`^${name}, ${morning}:`) })
      .filter({ visible: true });

  await page.goto("/design/shell/schedule/swaps");
  const main = page.getByRole("main");
  await expect(
    main.getByText(ap.failures.started).filter({ visible: true }),
  ).toHaveCount(1);
  await expect(decision(ap.buttons.approve)).toHaveCount(0);
  await expect(decision(ap.buttons.decline)).toHaveCount(1);
  // The two taken requests still to come are counted, not the third.
  await expect(main).toContainText(heT("app.swaps.count", { count: 2 }));
});

// What became of Noa's requests that no longer wait (the twins' DEMO_ENDED):
// tonight's wasn't approved, so her hero says so and still offers it, until
// it begins; Thursday's the schedule cancelled, in its row; and the list has
// one row a shift, five of them, each saying what happened and with whom, and
// Yoav's Thursday morning, deleted since, that its shift was taken off.
// Friday's, withdrawn, she asked again, so its live request says where it
// stands; Monday's is before today.
test("the shifts demo says what happened to Noa's requests", async ({
  page,
}) => {
  const sw = he.app.shifts.swap;
  const past = he.app.shifts.past;
  const evening = heT("app.shifts.shift", {
    name: "ערב",
    day: he.app.availability.weekdays.tue,
    date: "3.11",
  });
  const hero = page.getByRole("region", { name: evening, exact: true });

  await page.goto("/design/shell/schedule/shifts");
  await expect(hero).toContainText(sw.declined);
  await expect(hero).toContainText(he.app.shifts.hero.giveAgain);
  await expect(
    hero.getByRole("button", { name: `${sw.buttons.give}, ${evening}` }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("list", { name: he.app.shifts.mine.title }),
  ).toContainText(sw.removed);
  const list = page.getByRole("list", { name: past.title });
  await expect(list.getByRole("listitem")).toHaveCount(5);
  await expect(list).toContainText(
    heT("app.shifts.past.declined", { name: "מאיה פרץ" }),
  );
  await expect(list).toContainText(
    heT("app.shifts.past.approvedFrom", { name: "שירה ביטון" }),
  );
  await expect(list).toContainText(
    heT("app.shifts.past.declined", { name: "עומר אזולאי" }),
  );
  const gone = list.getByRole("listitem").filter({ hasText: past.gone });
  await expect(gone).toHaveCount(1);
  await expect(gone).toContainText(
    heT("app.shifts.past.withdrawnTo", { name: "יואב לוי", form: "m" }),
  );
  await expect(list).toContainText(past.schedule);
  await expect(list).not.toContainText(past.withdrawnFrom);
  await expect(list).not.toContainText("2.11");

  await page.goto("/design/shell/schedule/shifts?at=evening");
  await expect(hero).toContainText(he.app.shifts.yours);
  await expect(hero).not.toContainText(sw.declined);
});

// Under the requests waiting, the four a colleague took that no longer wait,
// from today on, each saying who decided ("you" for Shiran) or why it was
// cancelled: cards on phones and tablets, a table on desktops. The count is
// still the waiting ones'.
test("the swaps demo lists the requests no longer waiting", async ({
  page,
}, testInfo) => {
  const ap = he.app.swaps;
  const desktop = testInfo.project.name === "desktop";
  await page.goto("/design/shell/schedule/swaps");
  const ended = (
    desktop
      ? page.getByRole("table", { name: ap.ended.title })
      : page.getByRole("list", { name: ap.ended.title })
  ).filter({ visible: true });
  await expect(
    desktop ? ended.locator("tbody tr") : ended.getByRole("listitem"),
  ).toHaveCount(4);
  await expect(ended).toContainText(ap.ended.approvedYou);
  await expect(ended).toContainText(ap.ended.declinedYou);
  await expect(ended).toContainText(
    heT("app.swaps.ended.declined", { name: "אורי בן דוד", form: "x" }),
  );
  await expect(ended).toContainText(
    heT("app.swaps.ended.withdrawn", { name: "יואב לוי", form: "m" }),
  );
  await expect(page.getByRole("main")).toContainText(
    heT("app.swaps.count", { count: 2 }),
  );
});

// The ways into the week under way on the Today twin (R4) open the
// restaurant's builder on that week, under its own title, not next week's.
test("the Today demo's open places this week open this week's builder", async ({
  page,
}) => {
  const thisWeek = "/design/shell/schedule/build?week=2026-11-01";
  await page.goto("/design/shell");
  const tile = page
    .getByRole("main")
    .locator(`a[href="${thisWeek}"]`)
    .filter({
      visible: true,
      hasText: heT("app.home.needs.gapsThisWeek", { count: 4 }),
    });
  await expect(tile).toHaveCount(1);
  await tile.click();
  await expect(page).toHaveURL(
    /\/design\/shell\/schedule\/build\?week=2026-11-01$/,
  );
  await expect(
    page.getByRole("heading", { level: 1, name: he.app.build.titleRunning }),
  ).toBeVisible();
});

// The owner's first steps on the Today demo: each row leads to its screen in
// the demo, "הסתרה" takes the card away with a way back, and the team
// viewing as the owner has no "הסתרה".
test("the Today demo's first steps lead into the demo and hide with a way back", async ({
  page,
}) => {
  const f = he.app.home.firstSteps;
  const card = page.getByRole("region", { name: f.title });
  await page.goto("/design/shell/today/first-steps");
  await expect(card).toContainText(
    heT("app.home.firstSteps.progress", { done: 2, total: 5 }),
  );
  await expect(card).toContainText(
    heT("app.home.firstSteps.next", { step: f.steps.departments.title }),
  );
  const links = card.getByRole("link");
  await expect(links).toHaveCount(6);
  for (const href of await links.evaluateAll((all) =>
    all.map((a) => a.getAttribute("href") ?? ""),
  )) {
    expect(href).toMatch(/^\/design\/shell\//);
  }

  const hide = card.getByRole("button", { name: f.hide });
  await hide.click();
  await expect(card).toHaveCount(0);
  const undo = page
    .getByRole("status")
    .filter({ hasText: f.hidden })
    .getByRole("button", { name: he.app.manage.undo });
  await expect(undo).toBeFocused();
  await undo.click();
  await expect(card).toBeVisible();
  await expect(hide).toBeFocused();

  await card
    .getByRole("link", { name: new RegExp(`^${f.steps.departments.title}`) })
    .click();
  await expect(page).toHaveURL(/\/design\/shell\/manage\/departments$/);

  await page.goto("/design/shell/today/first-steps?state=viewing");
  await expect(card).toBeVisible();
  await expect(card.getByRole("button", { name: f.hide })).toHaveCount(0);
});

// Signed in again on the business's clock station (#78 phase 5): Today says
// the device is the station, and "נעילת המכשיר" locks it again as that same
// station, with no new name, to the station's twin. Whoever may lock it isn't
// told to sign out instead. Anywhere else, Today says nothing of a station.
test("the Today demo on the clock station locks it again as the same station", async ({
  page,
}) => {
  const reminder = he.app.clock.station.reminder;
  const lock = he.app.clock.station.lock;
  const body = page.getByText(reminder.body);
  const signOutBody = page.getByText(reminder.signOutBody);
  const again = page.getByRole("button", { name: reminder.lock, exact: true });

  await page.goto("/design/shell");
  await expect(
    page.getByRole("heading", { level: 1 }).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(body).toHaveCount(0);
  await expect(signOutBody).toHaveCount(0);
  await expect(again).toHaveCount(0);

  await page.goto("/design/shell/today/station");
  await expect(body).toBeVisible();
  await expect(signOutBody).toHaveCount(0);
  await expect(page.getByRole("button", { name: he.app.signOut })).toHaveCount(
    0,
  );
  await again.click();
  const sheet = page.getByRole("dialog", { name: lock.title });
  await expect(
    sheet.getByText(
      heT("app.clock.station.lock.same", { name: "עמדת הכניסה" }),
    ),
  ).toBeVisible();
  await expect(sheet.getByLabel(lock.name)).toHaveCount(0);
  await sheet.getByRole("button", { name: lock.submit }).click();
  await expect(page).toHaveURL(/\/design\/shell\/station$/);
  await expect(
    page.getByRole("img", { name: he.app.clock.code.qrLabel }),
  ).toBeVisible();
});

// Signed in on the business's clock station by someone who doesn't lock it
// (Orel, 20 November 2026): Today says the device is the business's tablet,
// with no lock, and "יציאה מהחשבון" goes to the station's twin, as the device
// goes back to its code. The accountant's Home says the same.
test("the Today demo on the clock station tells whoever doesn't lock it to sign out, and goes to the station", async ({
  page,
}) => {
  const reminder = he.app.clock.station.reminder;
  const body = page.getByText(reminder.signOutBody);
  const again = page.getByRole("button", { name: reminder.lock, exact: true });
  const signOut = page.getByRole("button", { name: he.app.signOut });
  const qr = page.getByRole("img", { name: he.app.clock.code.qrLabel });

  await page.goto("/design/shell/today/station?state=worker");
  await expect(body).toBeVisible();
  await expect(page.getByText(reminder.body)).toHaveCount(0);
  await expect(again).toHaveCount(0);
  await signOut.click();
  await expect(page).toHaveURL(/\/design\/shell\/station$/);
  await expect(qr).toBeVisible();

  await page.goto("/design/shell/today/accountant?state=station");
  await expect(body).toBeVisible();
  await expect(again).toHaveCount(0);
  await signOut.click();
  await expect(page).toHaveURL(/\/design\/shell\/station$/);
  await expect(qr).toBeVisible();

  // Her Home anywhere else says nothing of a station.
  await page.goto("/design/shell/today/accountant");
  await expect(
    page.getByRole("heading", { level: 1 }).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(body).toHaveCount(0);
});

// A stale screen on the builder's demo (R1b), at every size: Omer gives his
// Sunday evening away, and Maya took Noa's Sunday morning. Taking Itay off the
// morning ends no request, so nothing is said; taking Omer off the evening
// ends his, and the line above "פרסום השינויים" says so first. Another
// manager approved Maya's meanwhile, so the publish is refused: the morning
// comes back as it is now, marked and named, the evening keeps its change,
// and publishing again goes out, with its own time on the status line. Each
// publish waits out its hold for "ביטול" first (R3b). The first is pressed
// from the keyboard: "ביטול" takes the focus, and the publish waits with the
// toast for as long as it stays there; once the focus moves on, the rest of
// the wait runs out and the publish goes, and refused, nothing of the held
// toast stays, its "ביטול" least of all.
test("the builder demo warns before ending a request, and puts back a shift changed meanwhile", async ({
  page,
}) => {
  // Its publishes wait out their holds for "ביטול" (`HOLD_MS` each), and the
  // first waits longer, stopped for the keyboard.
  test.setTimeout(90_000);
  const tb = he.app.build;
  const path = "/design/shell/schedule/build?state=meanwhile";
  const screen = buildScreen(page);
  const publish = page.getByRole("button", { name: tb.publishChanges });
  const warning = page.getByText(heT("app.build.swapsEnd", { count: 1 }));
  const morning = screen.card("בוקר");
  const evening = screen.card("ערב");
  const status = page.getByText(new RegExp(`^${before(tb.publishedAt)}`));

  await page.goto(path);
  await expect(morning).toContainText("נועה");
  // Published, with nothing new to send.
  await expect(publish).toHaveCount(0);

  await morning.click();
  await screen.removeButton("איתי מזרחי").click();
  await screen.closeSheet();
  await expect(publish).toBeVisible();
  await expect(warning).toHaveCount(0);

  await evening.click();
  await screen.removeButton("עומר אזולאי").click();
  await screen.closeSheet();
  await expect(warning).toBeVisible();

  // It waits for its undo first, and only then reaches the stand-in. From
  // the keyboard, the wait stops while the focus is on "ביטול".
  const refused = page.getByRole("alert").filter({
    hasText: heT("app.build.moved.changedOne", {
      name: "בוקר",
      day: he.app.availability.weekdays.sun,
    }),
  });
  await publish.focus();
  await page.keyboard.press("Enter");
  await expect(screen.held).toBeVisible();
  await expect(screen.undoHeld()).toBeFocused();
  await page.waitForTimeout(HOLD_MS + 1_000);
  await expect(screen.held).toBeVisible();
  await expect(publish).toBeDisabled();
  await expect(refused).toHaveCount(0);
  await page.keyboard.press("Tab");
  await expect(screen.undoHeld()).not.toBeFocused();
  await expect(screen.held).toHaveCount(0, { timeout: HOLD_MS + 5_000 });
  await expect(refused).toBeVisible();
  await expect(
    page
      .getByRole("status")
      .getByRole("button", { name: he.app.manage.undo, exact: true }),
  ).toHaveCount(0);
  // The morning as it is now: Maya in Noa's place, and Itay back on it.
  await expect(morning).toContainText(tb.meanwhile);
  await expect(morning).toContainText("מאיה");
  await expect(morning).toContainText("איתי");
  await expect(morning).not.toContainText("נועה");
  // The evening keeps its change, and Omer's request would still end.
  await expect(evening).not.toContainText("עומר");
  await expect(evening).not.toContainText(tb.meanwhile);
  await expect(warning).toBeVisible();
  await expectCleanPage(page, path);

  await screen.publishChanges();
  await expect(
    page.getByRole("status").filter({ hasText: tb.published }),
  ).toBeVisible();
  await expect(publish).toHaveCount(0);
  await expect(morning).not.toContainText(tb.meanwhile);
  // Published now, not when the demo week was first published (29.10).
  await expect(status).toBeVisible();
  await expect(status).not.toContainText("29.10");
});

/** The text a share sheet's WhatsApp link writes. */
async function sharedText(sheet: Locator): Promise<string> {
  const href = await sheet
    .getByRole("link", { name: he.ui.share.whatsapp })
    .getAttribute("href");
  return new URL(href ?? "").searchParams.get("text") ?? "";
}

// Sharing a published week, in the builder's dock once nothing is new: the
// message names the business and its week, and its link leads to the
// schedule tab's twin on that week. After the stand-in's publish, and at
// rest on a published week, also for someone who builds without publishing.
// From the keyboard, the sheet gives the focus back to what opened it.
test("the builder demo offers sharing once published", async ({ page }) => {
  const tb = he.app.build;
  const ts = he.app.shifts.share;
  const share = page.getByRole("button", { name: ts.action });
  const sheet = page.getByRole("dialog", { name: ts.title });

  await page.goto("/design/shell/schedule/build");
  await expect(page.getByRole("button", { name: tb.publish })).toBeVisible();
  await expect(share).toHaveCount(0);
  await page.getByRole("button", { name: tb.publish }).click();
  await expect(
    page.getByRole("status").filter({ hasText: tb.published }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: tb.publish })).toHaveCount(0);
  await share.click();
  await expect(sheet).toBeVisible();
  // The demo week, 1 to 7 November, in the browser's own words, its days
  // held left to right as the share holds them.
  const range = daysLeftToRight(
    await page.evaluate(() =>
      new Intl.DateTimeFormat("he", {
        day: "numeric",
        month: "long",
        timeZone: "UTC",
      }).formatRange(
        new Date("2026-11-01T00:00:00Z"),
        new Date("2026-11-07T00:00:00Z"),
      ),
    ),
  );
  expect(await sharedText(sheet)).toBe(
    `${heT("app.shifts.share.text", {
      business: "מסעדת הדגמה",
      range,
      kind: "other",
    })}\n${new URL(page.url()).origin}/design/shell/schedule?week=2026-11-01`,
  );
  await expectCleanPage(page, "", true);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(share).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(share).toBeFocused();

  // At rest on a published week, also only to read it.
  for (const path of [
    "/design/shell/schedule/build?state=meanwhile",
    "/design/shell/schedule/build?state=meanwhile&publishes=no",
  ]) {
    await page.goto(path);
    await expect(share).toBeVisible();
    await expect(
      page.getByRole("button", { name: tb.publishChanges }),
    ).toHaveCount(0);
  }

  // The shop's week under way, by the shop's own name.
  await page.goto("/design/shell/schedule/build/running");
  await share.click();
  expect(await sharedText(sheet)).toContain("חנות הדגמה");
});

// The link in a shared schedule names its week (`?week=`): the schedule tab's
// twin opens on next week with it, and on this week, Shiran's, without it or
// with a week that is neither. Only the published week offers sharing it.
test("the schedule demo opens on the week its link names", async ({ page }) => {
  const path = "/design/shell/schedule";
  const week = (key: "this" | "next") =>
    page.getByRole("button", { name: he.app.shifts.week[key], exact: true });
  const share = page.getByRole("button", { name: he.app.shifts.share.action });

  await page.goto(path);
  await expect(week("this")).toHaveAttribute("aria-pressed", "true");
  await expect(share).toBeVisible();

  await page.goto(`${path}?week=2026-11-08`);
  await expect(week("next")).toHaveAttribute("aria-pressed", "true");
  await expect(week("this")).toHaveAttribute("aria-pressed", "false");
  await expect(share).toHaveCount(0);

  await page.goto(`${path}?week=2026-11-15`);
  await expect(week("this")).toHaveAttribute("aria-pressed", "true");
});

// The reminder on the team's answers, while someone is missing: one message
// for the whole team with the week and the due moment, or that it is still
// not too late; nobody's name. None once everyone sent.
test("the team availability demo sends a reminder, and says it is late when it is", async ({
  page,
}) => {
  const tt = he.app.availability.team;
  const path = "/design/shell/schedule/availability/team";
  const remind = page.getByRole("button", { name: tt.remind.action });
  const sheet = page.getByRole("dialog", { name: tt.remind.title });
  // The demo week, 1 to 7 November, due on Wednesday 28 October at 18:00.
  // Its days held left to right, as the reminder holds them.
  const range = async () =>
    daysLeftToRight(
      await page.evaluate(() =>
        new Intl.DateTimeFormat("he", {
          day: "numeric",
          month: "long",
          timeZone: "UTC",
        }).formatRange(
          new Date("2026-11-01T00:00:00Z"),
          new Date("2026-11-07T00:00:00Z"),
        ),
      ),
    );
  const words = async () => ({
    business: "מסעדת הדגמה",
    range: await range(),
    day: he.app.availability.weekdays.wed,
    time: "18:00",
  });
  const link = () =>
    `${new URL(page.url()).origin}/design/shell/schedule/availability`;

  await page.goto(path);
  await remind.focus();
  await page.keyboard.press("Enter");
  await expect(sheet).toBeVisible();
  // The whole message, so nobody's name is in it.
  expect(await sharedText(sheet)).toBe(
    `${heT("app.availability.team.remind.text", await words())}\n${link()}`,
  );
  await expectCleanPage(page, path, true);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(remind).toBeFocused();

  await page.goto(`${path}?state=late`);
  await remind.click();
  expect(await sharedText(sheet)).toBe(
    `${heT("app.availability.team.remind.textLate", await words())}\n${link()}`,
  );

  await page.goto(`${path}?state=all`);
  await expect(
    page.getByRole("heading", { level: 1, name: tt.title }),
  ).toBeVisible();
  await expect(remind).toHaveCount(0);
});

// The running week's twin (R3a), at every size: the shop on Tuesday 17
// November at 11:20. The morning under way says so and only takes more
// people; Monday is over, muted, keeps Liya who left, and takes no new shift;
// the evening freed when she left takes Omer, with the line to check with its
// people directly, and goes out. Roni's request on Thursday evening, which
// nothing touches, is not counted. The switch to next week asks first while
// there is unsaved work. Publishing the changes waits for "ביטול" (R3b): the
// held state, let go once and then waited out.
test("the running week's demo locks what has begun and fills the freed evening", async ({
  page,
}, testInfo) => {
  // Its publishes wait out their holds for "ביטול" (`HOLD_MS` each).
  test.setTimeout(60_000);
  const tb = he.app.build;
  const running = tb.running;
  const path = "/design/shell/schedule/build/running";
  const screen = buildScreen(page);
  const tue = { day: he.app.availability.weekdays.tue, date: "17.11" };
  const mon = { day: he.app.availability.weekdays.mon, date: "16.11" };
  const publish = page.getByRole("button", { name: tb.publishChanges });
  const nextWeek = page.getByRole("button", {
    name: new RegExp(`^${he.app.shifts.week.next}`),
  });
  const warning = page.getByRole("dialog", { name: tb.leave.title });

  await page.goto(path);
  await expect(
    page.getByRole("heading", { level: 1, name: tb.titleRunning }),
  ).toBeVisible();
  // Published, with nothing new to send.
  await expect(publish).toHaveCount(0);

  const morning = screen.card("בוקר", tue);
  await expect(morning).toContainText(running.now);
  await morning.click();
  await expect(screen.sheet).toContainText(before(running.begunLine));
  await expect(screen.removeButton("תמר אברהם")).toHaveCount(0);
  await expect(
    screen.sheet.getByRole("button", {
      name: tb.edit.replace("{name}", "בוקר"),
    }),
  ).toHaveCount(0);
  await expect(screen.addButton("עומר הדגמה")).toBeVisible();
  await screen.closeSheet();

  // A day that is over takes no new shift; today does.
  await expect(screen.addOn(mon)).toHaveCount(0);
  await expect(screen.addOn(tue)).toBeVisible();
  if (testInfo.project.name !== "phone") {
    // The phone shows today; the others show Monday, muted, as it was.
    const over = screen.card("בוקר", mon);
    await expect(over).toContainText(he.app.shifts.former);
    await over.click();
    await expect(screen.sheet).toContainText(
      `${running.overLine} ${running.clockLine}`,
    );
    await expect(
      screen.sheet.getByRole("button", {
        name: new RegExp(`^${before(tb.addPerson)}`),
      }),
    ).toHaveCount(0);
    await screen.closeSheet();
  }

  const evening = screen.card("ערב", tue);
  await expect(evening).toContainText(heT("app.build.missing", { count: 1 }));
  await evening.click();
  await screen.addButton("עומר הדגמה").click();
  await screen.closeSheet();
  await expect(evening).toContainText("עומר");
  await expect(page.getByText(running.soon)).toBeVisible();
  await expect(
    page.getByText(heT("app.build.swapsEnd", { count: 1 })),
  ).toHaveCount(0);
  await expectCleanPage(page, path);

  // Unsaved work: the switch to next week asks first.
  await nextWeek.click();
  await expect(warning).toBeVisible();
  await warning.getByRole("button", { name: tb.leave.stay }).click();
  await expect(warning).toHaveCount(0);
  await expect(evening).toContainText("עומר");

  // Publishing the changes waits for "ביטול" first, with nothing sent: the
  // team still sees the week as it was. "ביטול" brings the work back.
  await publish.click();
  await expect(screen.held).toBeVisible();
  await expect(publish).toBeDisabled();
  await expect(page.getByText(tb.unpublished)).toBeVisible();
  await screen.undoHeld().click();
  await expect(
    page.getByRole("status").filter({ hasText: tb.hold.undone }),
  ).toBeVisible();
  await expect(publish).toBeEnabled();
  await expect(evening).toContainText("עומר");

  // Held again, and checked as it waits (should the checks outlast the hold,
  // it goes meanwhile, as it would); then it goes out.
  await publish.click();
  await expect(screen.held).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("schedule-build-held.png"),
    fullPage: true,
  });
  await expectCleanPage(page, path);
  await expect(screen.held).toHaveCount(0, { timeout: HOLD_MS + 5_000 });
  await expect(
    page.getByRole("status").filter({ hasText: tb.published }),
  ).toBeVisible();
  await expect(publish).toHaveCount(0);
  // "ביטול" had the focus and went with the toast: with no publish left to
  // press, the focus is on the line that says the week is published.
  await expect(
    page.getByText(new RegExp(`^${before(tb.publishedAt)}`)),
  ).toBeFocused();
  await expect(screen.card("בוקר", tue)).toContainText(running.now);

  // Nothing unsaved now: the switch just goes.
  await nextWeek.click();
  await expect(page).toHaveURL(/\/running\?week=next$/);
  await expect(
    page.getByRole("heading", { level: 1, name: tb.title }),
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
  // Nor deleting one: a demo business keeps its invites as its people.
  await expect(
    main.getByRole("button", { name: new RegExp(`^${tt.cancel.action}`) }),
  ).toHaveCount(0);
});

// Team changes on the demo (Orel, 14 November 2026): the owner deletes an
// invite and takes it back, changes Noa's role and changes it back, and takes
// her off the team, first with an undo, then for real; the page then says
// what came off her and leads back to the team. Nothing is stored.
test("the team demo deletes an invite, changes a role and takes someone off the team, each with an undo", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const tt = he.app.team;
  const tc = tt.changes;
  const undo = he.app.manage.undo;
  const main = page.getByRole("main");

  await page.goto("/design/shell/team");
  const dana = main
    .getByRole("button", {
      name: heT("app.team.cancel.label", { name: "דנה אברהם" }),
    })
    .filter({ visible: true });
  await expect(dana).toHaveCount(1);
  await dana.click();
  const deleted = main
    .getByRole("status")
    .filter({ hasText: heT("app.team.cancel.done", { name: "דנה אברהם" }) })
    .filter({ visible: true });
  await expect(deleted).toBeVisible();
  await expect(dana).toHaveCount(0);
  await deleted.getByRole("button", { name: undo }).click();
  await expect(dana).toHaveCount(1);

  await page.goto("/design/shell/team/noa");
  const role = main.getByRole("button", { name: new RegExp(`^${tc.role}`) });
  await expect(role).toContainText(tt.roles.worker);
  await role.click();
  await page
    .getByRole("dialog")
    .locator('input[name="member-role"][value="manager"]')
    .check();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: tc.roleSubmit })
    .click();
  await expect(role).toContainText(tt.roles.manager);
  await main
    .getByRole("status")
    .filter({
      hasText: heT("app.team.changes.roleChanged", {
        name: "נועה כהן",
        role: tt.roles.manager,
      }),
    })
    .getByRole("button", { name: undo })
    .click();
  await expect(role).toContainText(tt.roles.worker);

  const remove = main.getByRole("button", { name: tc.remove });
  // What it does, said beforehand: three shifts ahead and two in the draft.
  await expect(
    main.getByText(heT("app.team.changes.removeShifts", { count: 5 }), {
      exact: false,
    }),
  ).toBeVisible();
  await remove.click();
  const removed = main.getByRole("status").filter({
    hasText: heT("app.team.changes.removed", { name: "נועה כהן", form: "f" }),
  });
  await expect(removed).toBeVisible();
  await expect(remove).toHaveCount(0);
  await removed.getByRole("button", { name: undo }).click();
  await expect(remove).toBeVisible();

  await remove.click();
  await expect(
    main.getByRole("heading", {
      name: heT("app.team.changes.removedTitle", { name: "נועה כהן" }),
    }),
  ).toBeVisible({ timeout: 20_000 });
  // And after, the same counts: as many now need someone.
  await expect(
    main.getByText(heT("app.team.changes.removedShifts", { count: 3 })),
  ).toBeVisible();
  await expect(
    main.getByText(heT("app.team.changes.removedDrafts", { count: 2 })),
  ).toBeVisible();
  // The swap requests it settled: hers cancelled, the one she took open again.
  await expect(
    main.getByText(heT("app.team.changes.removedSwaps", { count: 1 })),
  ).toBeVisible();
  await expect(
    main.getByText(
      heT("app.team.changes.removedReopened", { count: 1, name: "נועה כהן" }),
    ),
  ).toBeVisible();
  await expectCleanPage(page);
  await main.getByRole("link", { name: tc.backToTeam }).click();
  await expect(page).toHaveURL(/\/design\/shell\/team$/);

  // On the clock now: not yet, and their hours instead.
  await page.goto("/design/shell/team/noa?state=clocked");
  await expect(main.getByRole("button", { name: tc.remove })).toHaveCount(0);
  await expect(
    main.getByText(heT("app.team.changes.clockedIn", { name: "נועה" })),
  ).toBeVisible();
  // A manager gets nothing on an owner.
  await page.goto("/design/shell/team/uri?as=manager");
  await expect(main.getByRole("button", { name: tc.remove })).toHaveCount(0);
  await expect(
    main.getByRole("button", { name: new RegExp(`^${tc.role}`) }),
  ).toHaveCount(0);
});

// Fixing a name on the demo (ROADMAP "תיקון שם"): the owner fixes Noa's,
// shown at once in the title, with the fix back as its undo; someone nobody
// named reads "בלי שם"; whoever may not change the person gets no row.
// Nothing is stored.
test("the person demo fixes a name, with the change back as its undo", async ({
  page,
}) => {
  const tt = he.app.team;
  const tc = tt.changes;
  const main = page.getByRole("main");
  const nameRow = main
    .getByRole("button")
    .filter({ has: page.getByText(tc.name, { exact: true }) });
  const heading = (name: string) =>
    main.getByRole("heading", { level: 1, name, exact: true });

  await page.goto("/design/shell/team/noa");
  await expect(nameRow).toContainText("נועה כהן");
  await nameRow.click();
  const sheet = page.getByRole("dialog");
  await expect(
    sheet.getByRole("heading", { name: tc.nameSheet }),
  ).toBeVisible();
  await expectCleanPage(page, "", true);
  const field = sheet.getByLabel(tt.invite.name, { exact: true });
  await field.fill(" ");
  await sheet.getByRole("button", { name: tc.nameSubmit }).click();
  await expect(sheet).toContainText(tt.invite.errors.name.required);
  await field.fill("נועה  כהן-לוי");
  await sheet.getByRole("button", { name: tc.nameSubmit }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(heading("נועה כהן-לוי")).toBeVisible();
  await expect(nameRow).toContainText("נועה כהן-לוי");
  // The role row stays, in the same group.
  await expect(
    main.getByRole("button", { name: new RegExp(`^${tc.role}`) }),
  ).toBeVisible();
  await main
    .getByRole("status")
    .filter({
      hasText: heT("app.team.changes.nameChanged", { name: "נועה כהן-לוי" }),
    })
    .getByRole("button", { name: he.app.manage.undo })
    .click();
  await expect(heading("נועה כהן")).toBeVisible();
  await expect(
    page.getByText(heT("app.team.changes.nameBack", { name: "נועה כהן" })),
  ).toBeVisible();
  await expectCleanPage(page);

  // Someone nobody named.
  await page.goto("/design/shell/team/noa?state=nameless");
  await expect(heading(tt.noName)).toBeVisible();
  await expect(nameRow).toContainText(tt.noName);

  // Not on an owner for a manager, nor for whoever only sees the team.
  await page.goto("/design/shell/team/uri?as=manager");
  await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(nameRow).toHaveCount(0);
  await page.goto("/design/shell/team/noa?as=viewer");
  await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(nameRow).toHaveCount(0);
});

// Each person's page in the clock demo shows their own shifts, not Noa's.
test("a person's hours in the demo match their row in the team list", async ({
  page,
}) => {
  // Yoav's cancelled shift is listed and counts as none.
  for (const [person, shifts] of [
    ["yoav", "5 משמרות"],
    ["shiran", "3 משמרות"],
  ] as const) {
    await page.goto(`/design/shell/clock/team/${person}`);
    await expect(
      page.getByText(`שעות, ${shifts}`).filter({ visible: true }).first(),
    ).toBeVisible();
  }
});

// A cancelled shift (the clock plan's PR3) in every shape: "בוטלה" instead of
// its hours, and who cancelled it, when and why; the worker reads the same in
// her history, where it can't be pressed (a manager's opens it, below), and
// the pay demo lists it apart.
test("the clock demo lists a cancelled shift with who, when and why", async ({
  page,
}) => {
  const cancelled = (time: string, note: string) =>
    heT.markup("app.clock.history.cancelledBy", {
      ltr: (chunks: string) => chunks,
      name: "שירן הדגמה",
      time,
      note,
    });
  for (const [path, line] of [
    [
      "/design/shell/clock/team/yoav",
      cancelled("4.11, 15:10", "נרשמה פעמיים בטעות"),
    ],
    [
      "/design/shell/clock/team/noa",
      cancelled("08:20", "נכנסה בטעות ביום חופש"),
    ],
    [
      "/design/shell/clock/history",
      cancelled("08:20", "נכנסה בטעות ביום חופש"),
    ],
  ] as const) {
    await page.goto(path);
    const main = page.getByRole("main");
    await expect(
      main.getByText(line).filter({ visible: true }).first(),
    ).toBeVisible();
    await expect(
      main
        .getByText(he.app.clock.history.cancelled, { exact: true })
        .filter({ visible: true }),
    ).toHaveCount(1);
    if (path.endsWith("/history")) {
      await expect(
        main.getByRole("button").filter({ hasText: line }),
      ).toHaveCount(0);
    }
  }
  await page.goto("/design/shell/clock/pay/noa");
  await expect(
    page
      .getByRole("heading", { name: he.app.pay.person.cancelledTitle })
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("main")
      .getByText(
        cancelled("18.10, 09:40", "נרשמה בטעות, נועה לא עבדה ביום שישי"),
      )
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
});

// The clock station (#78 phase 5) on its twins: the code screen locks the
// device into a station, which shows the code with nobody's name and no
// frame, or says in words why there is none, and the team's hours stop a
// station at once with "ביטול".
test("the station demo locks the device on the code, and the team's hours stop a station with a way back", async ({
  page,
}) => {
  const lock = he.app.clock.station.lock;
  const listed = he.app.clock.team.stations;

  await page.goto("/design/shell/clock/code");
  await page.getByRole("button", { name: lock.open }).click();
  const sheet = page.getByRole("dialog", { name: lock.title });
  // Three run in the demo, the third called "עמדת שעון 3": the next is 4.
  await expect(sheet.getByLabel(lock.name)).toHaveValue(
    lock.defaultName.replace("{n}", "4"),
  );
  await expectCleanPage(page, "", true);
  await sheet.getByRole("button", { name: lock.submit }).click();
  await expect(page).toHaveURL(/\/design\/shell\/station$/);
  await expect(
    page.getByRole("img", { name: he.app.clock.code.qrLabel }),
  ).toBeVisible();
  await expect(page.getByText(/^\d{3} \d{3}$/)).toBeVisible();
  // No frame: nobody is signed in on a station to have one.
  await expect(
    page.getByRole("navigation", { name: he.ui.appShell.mainNav }),
  ).toHaveCount(0);

  // Running with a code, it says no refusal. Refused one while running (the
  // clock switched off, or codes on a manager's phone only), it says why in
  // words and shows no code: the twin's stand-in refuses as /station/code.
  const qr = page.getByRole("img", { name: he.app.clock.code.qrLabel });
  const digits = page.getByText(/^\d{3} \d{3}$/);
  const refused = he.station.refused;
  for (const words of [refused.clockOff, refused.managerOnly]) {
    await expect(page.getByText(words)).toHaveCount(0);
  }
  for (const state of ["clockOff", "managerOnly"] as const) {
    await page.goto(`/design/shell/station?state=${state}`);
    await expect(page.getByText(refused[state])).toBeVisible();
    await expect(qr).toHaveCount(0);
    await expect(digits).toHaveCount(0);
  }

  // Signed in on a device that is no station, with ten running: it says why
  // it can't be one, offers nothing it can't do, and home is the way on.
  const signedIn = he.station.signedIn;
  await page.goto("/design/shell/station?state=signedInFull");
  await expect(
    page.getByText(heT("app.clock.station.lock.full", { count: 10 })),
  ).toBeVisible();
  await expect(page.getByText(signedIn.lockNew)).toHaveCount(0);
  await expect(page.getByRole("button", { name: signedIn.lock })).toHaveCount(
    0,
  );
  await expect(page.getByRole("link", { name: signedIn.home })).toBeVisible();
  // Where it can be locked, it says so, and locking is the main action.
  await page.goto("/design/shell/station?state=signedIn");
  await expect(page.getByText(signedIn.lockAgain)).toBeVisible();
  await expect(page.getByRole("button", { name: signedIn.lock })).toBeVisible();

  await page.goto("/design/shell/clock/team");
  const name = "טאבלט המטבח";
  // Each says whether it shows the code now, or when it last did.
  const stations = page
    .getByRole("main")
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: listed.title }) });
  await expect(stations.getByText(listed.showing)).toBeVisible();
  await expect(stations.getByText("23:12")).toBeVisible();
  await expect(stations.getByText(listed.never)).toBeVisible();
  const stop = page.getByRole("button", {
    name: listed.stopLabel.replace("{name}", name),
  });
  await stop.click();
  const undo = page
    .getByRole("status")
    .filter({ hasText: listed.stopped.replace("{name}", name) })
    .getByRole("button", { name: listed.undo });
  await expect(undo).toBeVisible();
  await expect(stop).toHaveCount(0);
  await undo.click();
  await expect(
    page.getByText(listed.restarted.replace("{name}", name)),
  ).toBeVisible();
  await expect(stop).toBeVisible();
});

// Cancelling and bringing back (the clock plan's PR4), on the demo's
// stand-ins: "ביטול המשמרת" sits under fixing a shift; its step asks why,
// cancels at once and offers "ביטול" in the toast rather than asking first. A
// cancelled shift opens from its row on every shape, with "החזרת המשמרת":
// Yoav's copy can't come back over the evening left, Noa's comes back open.
test("the clock demo cancels a shift with a way back, and brings one back", async ({
  page,
}, testInfo) => {
  const team = he.app.clock.team;
  const desktop = testInfo.project.name === "desktop";

  await page.goto("/design/shell/clock/team/yoav?state=edit");
  const edit = page.getByRole("dialog", { name: team.sheet.editTitle });
  await edit.getByRole("button", { name: team.sheet.cancelShift }).click();
  const cancel = page.getByRole("dialog", { name: team.cancel.title });
  await expect(cancel.getByText(team.cancel.hint)).toBeVisible();
  const reason = cancel.getByLabel(team.cancel.reason);
  await expect(reason).toBeFocused();

  // Without why, nothing goes: the field says so, and has the focus.
  await cancel.getByRole("button", { name: team.cancel.save }).click();
  await expect(cancel.getByText(team.cancel.reasonNeeded)).toBeVisible();
  await expect(reason).toBeFocused();
  await expectCleanPage(page, "", true);

  // Back to fixing it, the focus where it left, and on again.
  await cancel.getByRole("button", { name: team.cancel.back }).click();
  await expect(
    edit.getByRole("button", { name: team.sheet.cancelShift }),
  ).toBeFocused();
  await edit.getByRole("button", { name: team.sheet.cancelShift }).click();
  await cancel.getByLabel(team.cancel.reason).fill("נרשמה פעמיים");
  await cancel.getByRole("button", { name: team.cancel.save }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  const toast = page.getByRole("status").filter({ hasText: team.done.cancel });
  const undo = toast.getByRole("button", { name: team.done.undo });
  await expect(undo).toBeVisible();
  await undo.click();
  await expect(
    page.getByRole("status").filter({ hasText: team.done.restore }),
  ).toBeVisible();

  // A cancelled shift opens from its row: the whole row on phones and
  // tablets, its "החזרה" on desktop.
  await page.goto("/design/shell/clock/team/yoav");
  const main = page.getByRole("main");
  const line = heT.markup("app.clock.history.cancelledBy", {
    ltr: (chunks: string) => chunks,
    name: "שירן הדגמה",
    time: "4.11, 15:10",
    note: "נרשמה פעמיים בטעות",
  });
  await (desktop
    ? main.getByRole("button", {
        name: new RegExp(before(he.app.clock.history.restoreShift)),
      })
    : main.getByRole("button").filter({ hasText: line })
  )
    .filter({ visible: true })
    .click();
  const cancelled = page.getByRole("dialog", { name: team.cancelled.title });
  await expect(cancelled.getByText(line)).toBeVisible();
  await cancelled.getByRole("button", { name: team.cancelled.restore }).click();
  await expect(cancelled.getByRole("alert")).toHaveText(team.failure.overlap);
  await expectCleanPage(page, "", true);

  // Noa's was still open when it was cancelled: it comes back open.
  await page.goto("/design/shell/clock/team/noa?state=cancelled");
  await expect(cancelled.getByText(team.cancelled.openHint)).toBeVisible();
  await cancelled.getByRole("button", { name: team.cancelled.restore }).click();
  await expect(cancelled).toBeHidden();
  await expect(
    page.getByRole("status").filter({ hasText: team.done.restore }),
  ).toBeVisible();
});

// Fixing breaks (the clock plan's PR5), on the demo's stand-ins: under the
// shift's times, a row for each break and "הוספת הפסקה"; a break's step
// refuses one over another break or outside the shift, in words, goes back
// with the focus on its row, saves, and removes at once with "ביטול" in the
// toast. A break still running opens nothing.
test("the clock demo fixes a shift's breaks, with a way back from a removal", async ({
  page,
}) => {
  const team = he.app.clock.team;
  await page.goto("/design/shell/clock/team/yoav?state=edit");
  const edit = page.getByRole("dialog", { name: team.sheet.editTitle });
  const breaks = edit.getByRole("group", { name: team.breaks.title });
  // Yoav's two breaks of that evening, and the way to add one.
  await expect(breaks.getByRole("button")).toHaveCount(3);
  const first = breaks.getByRole("button", { name: /18:30–18:45/ });
  await expect(first).toContainText(team.breaks.unpaid);
  await first.click();
  const step = page.getByRole("dialog", { name: team.breakStep.editTitle });
  const start = step.getByLabel(team.breakStep.start);
  await expect(start).toBeFocused();
  await expect(start).toHaveValue("18:30");

  // Over his other break, then before the shift began: refused in words.
  await step.getByLabel(team.breakStep.end).fill("21:05");
  await step.getByLabel(team.sheet.reason).fill("ההפסקה נמשכה יותר");
  await step.getByRole("button", { name: team.breakStep.save }).click();
  await expect(step.getByRole("alert")).toHaveText(team.failure.breakOverlap);
  await start.fill("15:00");
  await step.getByLabel(team.breakStep.end).fill("15:20");
  await step.getByRole("button", { name: team.breakStep.save }).click();
  await expect(step.getByRole("alert")).toHaveText(team.failure.breakOutside);
  await expectCleanPage(page, "", true);

  // Back to fixing the shift, the focus on the break's row; then saved.
  await step.getByRole("button", { name: team.breakStep.back }).click();
  await expect(first).toBeFocused();
  await first.click();
  await step.getByLabel(team.breakStep.end).fill("18:50");
  await step.getByLabel(team.sheet.reason).fill("ההפסקה נמשכה יותר");
  await step.getByRole("button", { name: team.breakStep.save }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.getByRole("status").filter({ hasText: team.done.changeBreak }),
  ).toBeVisible();

  // Removed at once, with "ביטול" in the toast, which brings it back.
  await page.goto("/design/shell/clock/team/yoav?state=break");
  await step.getByLabel(team.sheet.reason).fill("נלחצה בטעות");
  await step.getByRole("button", { name: team.breakStep.remove }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  const undo = page
    .getByRole("status")
    .filter({ hasText: team.done.removeBreak })
    .getByRole("button", { name: team.done.undo });
  await undo.click();
  await expect(
    page.getByRole("status").filter({ hasText: team.done.restoreBreak }),
  ).toBeVisible();

  // His break of today still runs: shown, and nothing to press but adding.
  await page.goto("/design/shell/clock/team/yoav?state=openBreak");
  await expect(breaks.getByText(team.breaks.running)).toBeVisible();
  await expect(breaks.getByRole("button")).toHaveCount(1);
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

// The activity demo names a role's permission as the roles screen does.
test("the activity demo says which permission a role gained or lost", async ({
  page,
}) => {
  await page.goto("/design/shell/manage/activity");
  const lines = [
    heT("app.manage.activity.actions.rolePermission.editOn", {
      role: "worker",
      area: he.modules.scheduling.name,
    }),
    heT("app.manage.activity.actions.rolePermission.extraOff", {
      role: "manager",
      extra: he.app.manage.roles.extras.schedule.publish.phrase,
    }),
  ];
  for (const line of lines) {
    await expect(
      page.getByText(line).filter({ visible: true }).first(),
    ).toBeVisible();
  }
});

// The activity demo says whose name was fixed, by who they are now, never the
// name it had or was given.
test("the activity demo says whose name was fixed", async ({ page }) => {
  await page.goto("/design/shell/manage/activity");
  await expect(
    page
      .getByText(
        heT("app.manage.activity.actions.member.name", { person: "נועה כהן" }),
      )
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
});

// The activity demo says what was cancelled at table 12 (waiter mode P3): the
// line's quantity and unit price, the price in an LTR span, the department
// after a separator, why and who sent it, and never a total.
test("the activity demo says what was cancelled, with its price", async ({
  page,
}) => {
  const o = he.app.manage.activity.actions.order;
  await page.goto("/design/shell/manage/activity");
  await expect(
    page
      .getByText(
        heT("app.manage.activity.actions.order.cancel", { name: "שניצל" }),
      )
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(
    page
      .getByText(
        heT.markup("app.manage.activity.actions.order.quantity", {
          ltr: (chunks: string) => chunks,
          quantity: 2,
          price: "62.00 ₪",
        }),
      )
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(
    page
      .locator('span[dir="ltr"]')
      .filter({ hasText: "62.00 ₪" })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  for (const note of [
    heT("app.manage.activity.actions.order.place", { name: "12" }),
    heT("app.manage.activity.actions.order.department", {
      department: "מטבח",
    }),
    heT("app.manage.activity.actions.order.reason", {
      reason: o.reasons.guest,
    }),
    heT("app.manage.activity.actions.order.sender", { person: "יואב לוי" }),
  ]) {
    await expect(
      page.getByText(note).filter({ visible: true }).first(),
    ).toBeVisible();
  }
  // Two at 62.00 ₪ are never added up.
  await expect(page.getByText("124.00").filter({ visible: true })).toHaveCount(
    0,
  );
});

// The activity demo names the app for what it did on its own: Sunday's floor
// opening, which nobody did, closed by the lists' job. On a computer the "who"
// cell is the app; on a phone or a tablet, the row's title over that line.
// Never "someone no longer in the app".
test("the activity demo names the app for a list it closed", async ({
  page,
}, testInfo) => {
  const a = he.app.manage.activity;
  const line = heT("app.manage.activity.actions.lists.missed", {
    name: "פתיחת אולם",
  });
  await page.goto("/design/shell/manage/activity");
  if (testInfo.project.name === "desktop") {
    await expect(
      page.getByRole("row").filter({ hasText: line }).getByRole("rowheader"),
    ).toHaveText(a.who.app);
  } else {
    await expect(
      page
        .getByText(a.who.app, { exact: true })
        .filter({ visible: true })
        .locator(".."),
    ).toContainText(line);
  }
  await expect(
    page.getByText(a.who.unknown).filter({ visible: true }),
  ).toHaveCount(0);
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
  // Nor a fix (L6b-1) while her own five minutes last.
  await expect(
    page.getByRole("button", { name: l.list.fix.action }),
  ).toHaveCount(0);
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
      name: l.filter.menu
        .replace("{label}", l.filter.label)
        .replace("{name}", l.filter.all),
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

// Each item's story on the demo (L6a): the line under the fridge names who
// changed its reading last (Itay, after Noa's), with how many more changes,
// and opens the sheet that lists all three with names and times; a tick
// taken back says so on its line. The sheet is clean in both appearances, and
// on a computer the readings table's "who" opens the same story.
for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`an item's story, ${colorScheme}`, () => {
    test.use({ colorScheme });

    test("the history demo opens an item's story from its line", async ({
      page,
    }, testInfo) => {
      const h = he.app.lists.list.history;
      const path = "/design/shell/lists/list-kitchen-opening?state=history";
      const literal = (text: string) =>
        text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const storyOf = (label: string) =>
        new RegExp(
          `^${literal(heT("app.lists.list.history.open", { label }))}:\\s`,
        );
      const main = page.getByRole("main");
      const sheet = page.getByRole("dialog", { name: h.title });

      await page.goto(path);
      // Under the item, with its time (the readings table's has none).
      const fridge = main
        .getByRole("button", { name: storyOf("מקרר ראשי") })
        .filter({ visible: true, hasText: "08:02" });
      await expect(fridge).toHaveCount(1);
      await expect(fridge).toContainText("איתי מזרחי");
      await expect(fridge).toContainText(
        heT("app.lists.list.history.more", { count: 2 }),
      );
      const surfaces = main
        .getByRole("button", { name: storyOf("ניקוי משטחי עבודה") })
        .filter({ visible: true });
      await expect(surfaces).toContainText(h.unchecked);
      await expect(surfaces).toContainText("08:08");
      await expect(surfaces).toContainText(
        heT("app.lists.list.history.more", { count: 1 }),
      );

      await fridge.click();
      await expect(sheet).toBeVisible();
      for (const text of [
        "נועה כהן",
        "07:42",
        "איתי מזרחי",
        "08:02",
        "08:05",
        "הדלת נשארה פתוחה",
      ]) {
        await expect(sheet).toContainText(text);
      }
      await expectCleanPage(page, path, true);
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();

      if (testInfo.project.name === "desktop") {
        const who = main
          .getByRole("table")
          .getByRole("button", { name: storyOf("מקרר ראשי") });
        await expect(who).toContainText("איתי מזרחי");
        await expect(who).toContainText(
          heT("app.lists.list.history.more", { count: 2 }),
        );
        await who.click();
        await expect(sheet).toContainText("נועה כהן");
        await expect(sheet).toContainText("08:05");
      }
    });
  });
}

// Fixing a closed list on the demo (L6b-1): Shiran, who runs the lists, has
// "תיקון הרשימה" where opening it again was; being fixed, the list says it
// stays closed, keeps a required tick, refuses to empty a required reading
// and saves a new one at once as a fix; "סיום התיקון" says it was saved.
// Fixed, the list says so after who closed it, the item names its fixer
// with the mark the sheet repeats, and the manager's day says it too.
test("the fix demo fixes a closed list in place and marks what was fixed", async ({
  page,
}) => {
  const l = he.app.lists.list;
  const main = page.getByRole("main");
  const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const plain = (text: string, values: Record<string, string>) =>
    Object.entries(values).reduce(
      (out, [key, value]) => out.replaceAll(`{${key}}`, value),
      text.replaceAll(/<\/?ltr>/g, ""),
    );

  await page.goto("/design/shell/lists/list-weekly-cleaning");
  await expect(main.getByRole("button", { name: l.fix.action })).toBeVisible();
  await expect(
    main.getByRole("button", { name: l.reopen, exact: true }),
  ).toHaveCount(0);

  await page.goto("/design/shell/lists/list-kitchen-opening?state=fix");
  const card = main.getByRole("region", { name: l.fix.title });
  await expect(card).toContainText("נועה כהן");
  await expect(
    card.getByRole("button", { name: l.fix.reopenAll }),
  ).toBeVisible();
  // A required tick taken back stays ticked, and says why.
  const surfaces = main.getByRole("checkbox", { name: "ניקוי משטחי עבודה" });
  await expect(surfaces).toBeChecked();
  await surfaces.click();
  await expect(
    page.getByRole("status").filter({ hasText: l.failed.keepRequired }),
  ).toBeVisible();
  await expect(surfaces).toBeChecked();
  const freezer = main.getByLabel(l.readingOf.replace("{label}", "מקפיא"));
  await freezer.fill("");
  await freezer.press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: l.failed.keepRequired }),
  ).toBeVisible();
  await expect(freezer).toHaveValue("12");
  await freezer.fill("19");
  await freezer.press("Enter");
  const story = main
    .getByRole("button", {
      name: new RegExp(
        `^${literal(heT("app.lists.list.history.open", { label: "מקפיא" }))}:\\s`,
      ),
    })
    .filter({ visible: true })
    .first();
  await expect(story).toContainText(l.fix.item);
  await page
    .getByRole("button", { name: l.fix.done })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: l.fix.saved }),
  ).toBeVisible();
  await expect(card).toHaveCount(0);
  // The keyboard is back where the fix began.
  await expect(main.getByRole("button", { name: l.fix.action })).toBeFocused();

  await page.goto("/design/shell/lists/list-kitchen-opening?state=fixed");
  const hero = main.getByRole("region", { name: l.progressLabel });
  await expect(hero).toContainText("נועה כהן");
  await expect(hero).toContainText(
    plain(he.app.lists.card.fixed, { time: "08:10" }),
  );
  const fixed = main
    .getByRole("button", {
      name: new RegExp(
        `^${literal(heT("app.lists.list.history.open", { label: "מקפיא" }))}:\\s`,
      ),
    })
    .filter({ visible: true, hasText: "08:10" });
  await expect(fixed).toHaveCount(1);
  await expect(fixed).toContainText(l.fix.item);
  await expect(fixed).toContainText("שירן");
  await fixed.click();
  const sheet = page.getByRole("dialog", { name: l.history.title });
  await expect(sheet).toContainText(l.fix.badge);
  await expect(sheet).toContainText("נועה כהן");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  await page.goto("/design/shell/lists/today?state=fixed");
  await expect(
    main
      .getByText(plain(he.app.lists.card.fixed, { time: "08:10" }))
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(
    main
      .getByText(new RegExp(`·\\s${literal(l.readings.fixed)}$`))
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
});

// Fixing closed lists at view (L6b-2), for Omer of the kitchen, in "עובד
// בכיר": the hero says until when, a day after Noa closed it; being fixed,
// the card has no way to open it again for everyone, and a required reading
// refused empty says to ask whoever runs the lists. His fix is his.
test("the fix demo for a role given fixing closed lists fixes for a day, never opening it for everyone", async ({
  page,
}) => {
  const l = he.app.lists.list;
  const main = page.getByRole("main");
  const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const plain = (text: string, values: Record<string, string>) =>
    Object.entries(values).reduce(
      (out, [key, value]) => out.replaceAll(`{${key}}`, value),
      text.replaceAll(/<\/?ltr>/g, ""),
    );
  const path = "/design/shell/lists/list-kitchen-opening?state=fix-worker";

  await page.goto(path);
  const hero = main.getByRole("region", { name: l.progressLabel });
  await expect(hero).toContainText("נועה כהן");
  await expect(hero).toContainText(
    plain(l.fix.untilOn, { date: "4.11", time: "08:05" }),
  );
  await expect(
    main.getByRole("button", { name: l.reopen, exact: true }),
  ).toHaveCount(0);
  await expectCleanPage(page, path);

  await main.getByRole("button", { name: l.fix.action }).click();
  const card = main.getByRole("region", { name: l.fix.title });
  await expect(card).toContainText("נועה כהן");
  await expect(card.getByRole("button", { name: l.fix.reopenAll })).toHaveCount(
    0,
  );
  const freezer = main.getByLabel(l.readingOf.replace("{label}", "מקפיא"));
  await freezer.fill("");
  await freezer.press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: l.failed.keepRequiredAsk }),
  ).toBeVisible();
  await expect(freezer).toHaveValue("12");
  await freezer.fill("19");
  await freezer.press("Enter");
  const story = main
    .getByRole("button", {
      name: new RegExp(
        `^${literal(heT("app.lists.list.history.open", { label: "מקפיא" }))}:\\s`,
      ),
    })
    .filter({ visible: true })
    .first();
  await expect(story).toContainText(l.fix.item);
  await expect(story).toContainText("עומר אזולאי");
  await expectCleanPage(page, path);
});

// "עוד אפשר לתקן" (L6b-2): Noa, given fixing closed lists, has yesterday's
// opening, which she closed, after today's closed lists, while its day
// lasts; without it there is no such section.
test("the lists demo keeps yesterday's closed list to fix for whoever may", async ({
  page,
}) => {
  const main = page.getByRole("main");
  const title = heT("app.lists.fixable.title", { count: 1 });
  // Yesterday's opening, apart from this morning's of the same name.
  const yesterday = main
    .locator('a[href$="/lists/list-kitchen-opening-mon"]')
    .filter({ visible: true });
  await page.goto("/design/shell/lists/worker?state=fixable");
  await expect(
    main
      .getByRole("heading", { level: 2, name: title })
      .filter({ visible: true }),
  ).toHaveCount(1);
  await expect(
    main.getByText(he.app.lists.fixable.hint).filter({ visible: true }),
  ).toHaveCount(1);
  await expect(yesterday).toHaveCount(1);
  // It says the day it closed, beside today's of the same name, and until
  // when it can be fixed, this morning.
  const plain = (text: string, values: Record<string, string>) =>
    Object.entries(values).reduce(
      (out, [key, value]) => out.replaceAll(`{${key}}`, value),
      text.replaceAll(/<\/?ltr>/g, ""),
    );
  await expect(
    main
      .getByText(
        plain(he.app.lists.card.finishedByOn, {
          date: "2.11",
          time: "08:20",
          name: "נועה כהן",
        }),
      )
      .filter({ visible: true }),
  ).toHaveCount(1);
  await expect(
    main
      .getByText(plain(he.app.lists.list.fix.until, { time: "08:20" }))
      .filter({ visible: true }),
  ).toHaveCount(1);
  await page.goto("/design/shell/lists/worker");
  await expect(
    main.getByRole("heading", { level: 1 }).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(main.getByText(title)).toHaveCount(0);
  await expect(yesterday).toHaveCount(0);
});

// Orel's case on the roles twin (L6b-2): "עובד בכיר" keeps lists at view
// with "תיקון רשימות שנסגרו" on, marked "שונה" against workers. The switch
// changes at view, with its own toast and undo; raising lists to edit holds
// it, on and locked, "כלול בעריכה", and says only what raising always said.
// Nothing is stored.
test("the roles demo gives a senior role fixing closed lists at view, which edit covers", async ({
  page,
}, testInfo) => {
  const r = he.app.manage.roles;
  const lists = he.modules.lists.name;
  const senior = "עובד בכיר";
  const main = page.getByRole("main");
  const fix = (role: string) =>
    main
      .getByRole("switch", {
        name: heT("app.manage.roles.extraLabel", {
          extra: r.extras.lists.fix.label,
          role,
        }),
      })
      .filter({ visible: true });
  const edit = main
    .getByRole("switch", {
      name: heT("app.manage.roles.editLabel", { area: lists, role: senior }),
    })
    .filter({ visible: true });
  const covered = main
    .getByText(r.coveredByEdit, { exact: true })
    .filter({ visible: true });
  const toast = (text: string) =>
    main.getByRole("status").filter({ hasText: text });

  const path = "/design/shell/manage/roles?state=senior&role=senior";
  await page.goto(path);
  await expect(edit).toHaveAttribute("aria-checked", "false");
  await expect(fix(senior)).toHaveAttribute("aria-checked", "true");
  await expect(fix(senior)).toBeEnabled();
  if (testInfo.project.name === "desktop") {
    // Workers start without it, live at view; managers hold it with edit.
    await expect(fix(he.app.team.roles.worker)).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await expect(fix(he.app.team.roles.worker)).toBeEnabled();
    await expect(fix(he.app.team.roles.manager)).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(fix(he.app.team.roles.manager)).toBeDisabled();
  }
  await expectCleanPage(page, path);

  await fix(senior).click();
  await expect(fix(senior)).toHaveAttribute("aria-checked", "false");
  const off = toast(
    heT("app.manage.roles.done.extraOff", {
      role: senior,
      extra: r.extras.lists.fix.phrase,
    }),
  );
  await expect(off).toBeVisible();
  await off.getByRole("button", { name: he.app.manage.undo }).click();
  await expect(toast(r.done.undone)).toBeVisible();
  await expect(fix(senior)).toHaveAttribute("aria-checked", "true");

  const coveredBefore = await covered.count();
  await edit.click();
  await expect(edit).toHaveAttribute("aria-checked", "true");
  await expect(fix(senior)).toHaveAttribute("aria-checked", "true");
  await expect(fix(senior)).toBeDisabled();
  await expect(covered).toHaveCount(coveredBefore + 1);
  await expect(
    toast(
      heT("app.manage.roles.done.editWith", {
        role: senior,
        area: lists,
        extras: r.extras.lists.send.phrase,
      }),
    ),
  ).toBeVisible();
  await expectCleanPage(page, path);
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

// A sender whose switch for sending documents is off (the roles plan's R8):
// what she sent stays under "שלחת", and a line says who sends now instead of
// the way to send one.
test("the documents demo keeps what a manager sent once she no longer sends", async ({
  page,
}) => {
  const d = he.app.chat.documents;
  await page.goto("/design/chat/documents?as=manager&state=noSend");
  await expect(
    page.getByRole("heading", { name: d.sent.title, exact: true }),
  ).toBeVisible();
  await expect(page.getByText(d.sent.noSend)).toBeVisible();
  await expect(
    page.getByRole("link", { name: d.sendToPeople, exact: true }),
  ).toHaveCount(0);
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
    // The row's button starts with the person it shows, then the document
    // and which way it went.
    await table
      .getByRole("button", {
        name: heT("app.chat.documents.office.table.rowLabel", {
          person: "נועה כהן",
          title: "אישור מחלה ליום שני",
          direction: d.office.directions.from_person,
        }),
        exact: true,
      })
      .click();
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

// Who sees pay from the console (its twin): the business's people lead there,
// the screen goes back to the business by its name, and a team role that only
// reads businesses sees the switches and can't change them, told why in the
// console's own words. A business nobody has joined yet says nobody sees pay,
// and that whoever joins shows up.
test("the console's twin leads to who sees pay, and back to the business", async ({
  page,
}) => {
  const a = he.app.manage.access;
  const addMenu = page.getByRole("button", {
    name: `${heT("app.manage.access.personal.addLabel", { add: a.personal.add })}: ${a.personal.choose}`,
  });
  const removeNoa = page.getByRole("button", {
    name: heT("app.manage.access.personal.removeLabel", {
      remove: a.personal.remove,
      name: "נועה כהן",
    }),
  });
  const shiran = page.getByRole("menuitemradio", { name: /שירן אלון/ });
  await page.goto("/design/console/businesses/demo-restaurant");
  await page
    .getByRole("main")
    .getByRole("link", { name: new RegExp(`^${a.title}`) })
    .click();
  await expect(page).toHaveURL(
    /\/design\/console\/businesses\/demo-restaurant\/access$/,
  );
  await expect(
    page.getByRole("heading", { level: 1, name: a.title }),
  ).toBeVisible();
  const managers = page.getByRole("switch", { name: a.roles.manager });
  await expect(managers).toBeEnabled();
  await expect(managers).toHaveAttribute("aria-checked", "false");
  // Noa sees pay on her own; Shiran, a manager, can be added.
  await expect(removeNoa).toBeEnabled();
  await addMenu.click();
  await expect(shiran).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(shiran).toHaveCount(0);
  await expect(page.getByText(he.admin.access.failure.viewOnly)).toHaveCount(0);

  await page.goto(
    "/design/console/businesses/demo-restaurant/access?state=readOnly",
  );
  await expect(page.getByText(he.admin.access.failure.viewOnly)).toBeVisible();
  await expect(page.getByText(a.failure.viewOnly)).toHaveCount(0);
  await expect(managers).toBeDisabled();
  await expect(removeNoa).toBeDisabled();
  await expect(addMenu).toHaveCount(0);
  await page.getByRole("link", { name: "מסעדת הדגמה", exact: true }).click();
  await expect(page).toHaveURL(
    /\/design\/console\/businesses\/demo-restaurant$/,
  );

  // Nobody in the business yet: nobody sees pay, and nobody is offered.
  await page.goto("/design/console/businesses/bar-hayam/access");
  await expect(
    page.getByText(heT("app.manage.access.count", { count: 0 })),
  ).toBeVisible();
  await expect(page.getByText(a.personal.noStaff)).toBeVisible();
  await expect(page.getByText(a.personal.nobody)).toHaveCount(0);
  await expect(page.getByText(he.admin.access.nobody)).toHaveCount(0);
  await expect(addMenu).toHaveCount(0);
});

// Roles and permissions, the owner's screen's twin (roles plan R0; Orel's
// answers of 15 November 2026): raising workers' lists to edit turns sending
// lists on with it and offers its undo, which puts both back, and a role
// added from the sheet joins the roles. A phone opens the role on a screen of
// its own and goes back to the list; a tablet has the role beside the list,
// and a computer every role in one table. Nothing is stored.
test("the roles demo raises workers' lists with sending, undoes it, and adds a role", async ({
  page,
}, testInfo) => {
  const r = he.app.manage.roles;
  const worker = he.app.team.roles.worker;
  const lists = he.modules.lists.name;
  const phone = testInfo.project.name === "phone";
  const desktop = testInfo.project.name === "desktop";
  const main = page.getByRole("main");
  const title = (name: string) =>
    page.getByRole("heading", { level: 1, name }).filter({ visible: true });

  await page.goto("/design/shell/manage/roles");
  await expect(title(r.title)).toBeVisible();
  if (!desktop) {
    await main
      .getByRole("button", { name: new RegExp(`^${worker}`) })
      .filter({ visible: true })
      .click();
  }
  if (phone) {
    await expect(title(worker)).toBeVisible();
    // A step in the history, so the phone's own back leads to the roles.
    await expect(page).toHaveURL(/[?&]role=worker\b/);
    await expectCleanPage(page);
  }

  const edit = main
    .getByRole("switch", {
      name: heT("app.manage.roles.editLabel", { area: lists, role: worker }),
    })
    .filter({ visible: true });
  const send = main
    .getByRole("switch", {
      name: heT("app.manage.roles.extraLabel", {
        extra: r.extras.lists.send.label,
        role: worker,
      }),
    })
    .filter({ visible: true });
  await expect(edit).toHaveAttribute("aria-checked", "false");
  await expect(send).toHaveAttribute("aria-checked", "false");
  await expect(send).toBeDisabled();

  await edit.click();
  await expect(edit).toHaveAttribute("aria-checked", "true");
  await expect(send).toHaveAttribute("aria-checked", "true");
  await expect(send).toBeEnabled();
  const raised = main.getByRole("status").filter({
    hasText: heT("app.manage.roles.done.editWith", {
      role: worker,
      area: lists,
      extras: r.extras.lists.send.phrase,
    }),
  });
  // By the keyboard: as the toast's button goes, the focus goes back to the
  // switch that was changed.
  await raised.getByRole("button", { name: he.app.manage.undo }).press("Enter");
  await expect(edit).toHaveAttribute("aria-checked", "false");
  await expect(edit).toBeFocused();
  await expect(send).toHaveAttribute("aria-checked", "false");
  await expect(send).toBeDisabled();
  await expect(
    main.getByRole("status").filter({ hasText: r.done.undone }),
  ).toBeVisible();

  if (phone) {
    // The screen's own way back, then the phone's forward and back.
    await main.getByRole("button", { name: r.title }).click();
    await expect(title(r.title)).toBeVisible();
    await page.goForward();
    await expect(title(worker)).toBeVisible();
    await page.goBack();
    await expect(title(r.title)).toBeVisible();
    await expect(page).not.toHaveURL(/[?&]role=/);
  }
  await main
    .getByRole("button", { name: r.add })
    .filter({ visible: true })
    .click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("textbox", { name: r.addSheet.name }).fill("אחראי בר");
  await sheet.getByRole("button", { name: r.addSheet.submit }).click();
  await expect(sheet).toHaveCount(0);
  await expect(
    main.getByRole("status").filter({
      hasText: heT("app.manage.roles.done.added", { name: "אחראי בר" }),
    }),
  ).toBeVisible();
  await expect(
    desktop
      ? main
          .getByRole("columnheader", { name: /^אחראי בר/ })
          .filter({ visible: true })
      : main
          .getByRole("button", { name: /^אחראי בר/ })
          .filter({ visible: true }),
  ).toBeVisible();
  await expectCleanPage(page);
});

// The roles plan's R10 (Orel, 16 November 2026): the shift lead, built on
// workers, differs from them in scheduling, lists and the team, each marked
// "שונה", and "חזרה להתחלה" puts all three back as workers are, with one
// toast whose undo brings them back. Nothing is stored.
test("the roles demo marks what differs from where a role started and puts it back", async ({
  page,
}) => {
  const r = he.app.manage.roles;
  const main = page.getByRole("main");
  await page.goto("/design/shell/manage/roles?role=shift-lead");
  const marks = main
    .getByText(r.changed, { exact: true })
    .filter({ visible: true });
  const reset = main
    .getByRole("button", { name: new RegExp(`^${r.reset.action}`) })
    .filter({ visible: true });
  await expect(marks).toHaveCount(3);
  await expect(reset).toHaveCount(1);
  await expect(
    main
      .getByText(
        heT("app.manage.roles.reset.hintNamed", {
          base: he.app.team.roles.worker,
        }),
      )
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expectCleanPage(page);

  await reset.click();
  const back = main.getByRole("status").filter({
    hasText: heT("app.manage.roles.done.reset", { role: "אחראי משמרת" }),
  });
  await expect(back).toBeVisible();
  await expect(marks).toHaveCount(0);
  await expect(reset).toHaveCount(0);
  await back.getByRole("button", { name: he.app.manage.undo }).click();
  await expect(marks).toHaveCount(3);
});

// The inbox's twin has pay access the ConceptApp team gave from the console:
// its line says so, and on a computer the "who" cell is the team itself (the
// line's note names the team too, so the cell alone is checked).
test("the inbox twin says the ConceptApp team gave pay access", async ({
  page,
}, testInfo) => {
  const n = he.app.notifications;
  const byTeam = n.kinds.access.pay_granted.byTeam;
  await page.goto("/design/shell/notifications");
  await expect(
    page.getByText(byTeam).filter({ visible: true }).first(),
  ).toBeVisible();
  if (testInfo.project.name === "desktop") {
    await expect(
      page.getByRole("row").filter({ hasText: byTeam }).getByRole("rowheader"),
    ).toHaveText(n.who.team);
  }
});

/** Text to find as it is, inside a pattern. */
const asIs = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Goes to another screen of a demo through the tab bar, as a thumb would.
 * A long screen scrolled down shrinks the phone's bar to its current tab:
 * at the top it is full size again, each tab one tap away.
 */
async function throughTabBar(page: Page, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator("nav[data-tab-compact]")).toHaveCount(0);
  await page
    .getByRole("navigation", { name: he.ui.appShell.mainNav })
    .filter({ visible: true })
    // The name, and a count after it when the tab has one ("..., 2").
    .getByRole("link", { name: new RegExp(`^${asIs(name)}(\\s*,|$)`) })
    .click();
}

/** The twin's restaurant's words: the app's, with its template's sentences. */
const rt = createTranslator({
  locale: "he",
  messages: mergeWording(he as MessageTree, restaurantWording) as typeof he,
}) as typeof heT;

/**
 * The "ביטול" of the mode's toast that says `text`: the twin runs orders, so
 * its order screen has "ביטול ההזמנה" too, a button whose name holds the word.
 */
const orderUndo = (page: Page, text: string) =>
  page
    .getByRole("status")
    .filter({ hasText: text })
    .getByRole("button", { name: rt("app.orders.toast.undo"), exact: true });

// Waiter mode's twin (S0, #191) as a waiter times it on a phone: a free
// table opens on its items, two taps add two, one sends them, and the
// kitchen's part is on the prep screen. Marked ready there, it comes back
// ready on the floor, is served from the order with its undo, and the
// order's list for the till has both items and no total. One page, so the
// store in memory carries it all.
test("the waiter mode demo sends to the prep screen and comes back ready", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the walk is timed on a phone");
  const shown = (locator: Locator) => locator.filter({ visible: true });
  // Since P4 the mode's screens are the app's, in the restaurant's words.
  const table6 = rt("app.orders.place.numbered", { name: "6" });
  // The tile shows "שולחן" small above its large "6": its name starts so.
  const tile6 = new RegExp(`^${rt("app.orders.place.kind")}\\s*6(?!\\d)`);
  const kitchen = "מטבח";

  await page.goto("/design/order-taking/floor");
  await expect(
    page.getByRole("heading", { level: 1, name: rt("app.orders.floor.title") }),
  ).toBeVisible();
  await shown(page.getByRole("link", { name: tile6 })).click();
  await expect(page).toHaveURL(/place=table-6$/);
  await expect(
    page.getByRole("heading", { level: 1, name: table6 }),
  ).toBeVisible();

  await shown(page.getByRole("button", { name: /^לימונדה/ }))
    .first()
    .click();
  await shown(page.getByRole("button", { name: /^פוקאצ'ה/ }))
    .first()
    .click();
  const send = shown(
    page.getByRole("button", {
      name: new RegExp(`^${rt("app.orders.send.label")}`),
    }),
  );
  await expect(send).toHaveCount(1);
  await send.click();
  await expect(
    page.getByText(rt("app.orders.toast.sent", { place: table6 })),
  ).toBeVisible();
  // The round is on the order now, its kitchen part not yet on a screen.
  await expect(
    shown(page.getByRole("heading", { level: 3 })).filter({
      hasText: /^סבב 1/,
    }),
  ).toBeVisible();
  await expect(
    shown(page.getByText(rt("app.orders.ticketState.sent"), { exact: true })),
  ).toHaveCount(2);

  await throughTabBar(page, rt("modules.order_taking.mode.prep"));
  await expect(page).toHaveURL(/\/design\/order-taking\/prep$/);
  const ticket = page.getByRole("article", {
    name: rt("app.orders.prep.label", { place: table6, department: kitchen }),
  });
  await expect(ticket).toBeVisible();
  await expect(ticket.getByText(/פוקאצ'ה/)).toBeVisible();
  await ticket
    .getByRole("button", { name: rt("app.orders.prep.ready") })
    .click();
  await expect(
    page.getByText(
      rt("app.orders.toast.ready", { place: table6, department: kitchen }),
    ),
  ).toBeVisible();
  await expect(ticket).toHaveCount(0);

  // Table 6's ticket is the newest, far down the list: the page scrolled to
  // it, and the bar shrank.
  await throughTabBar(page, rt("modules.order_taking.mode.places"));
  const tile = shown(page.getByRole("link", { name: tile6 }));
  await expect(tile).toContainText(rt("app.orders.floor.state.ready"));
  await tile.click();
  // The phone's switch between the items and the order: a Segmented, whose
  // options are buttons with aria-pressed.
  await shown(
    page.getByRole("button", {
      name: new RegExp(`^${rt("app.orders.order.view.order")}`),
    }),
  )
    .first()
    .click();
  await shown(
    page.getByRole("button", {
      name: new RegExp(`^${rt("app.orders.order.serve")}.*${kitchen}`),
    }),
  ).click();
  const served = rt("app.orders.toast.served", {
    place: table6,
    department: kitchen,
  });
  await expect(page.getByText(served)).toBeVisible();
  await orderUndo(page, served).click();
  await expect(page.getByText(served)).toHaveCount(0);

  await shown(
    page.getByRole("link", { name: rt("app.orders.rounds.till") }),
  ).click();
  await expect(page).toHaveURL(/\/floor\/till\?order=/);
  // The app's own till since P5, in the restaurant's words.
  await expect(shown(page.getByText(rt("app.orders.till.note")))).toBeVisible();
  const list = shown(
    page.getByRole("list", { name: rt("app.orders.till.byItem") }),
  );
  await expect(list.getByText("לימונדה")).toBeVisible();
  await expect(list.getByText("פוקאצ'ה")).toBeVisible();
  await expectCleanPage(page);
});

// A burger has a doneness to choose (P6): its row opens its choices,
// "הוספה" waits for one, the draft reads them with the price they make, and
// the kitchen's ticket reads them under the burger. One page, so the store
// in memory carries it all.
test("the waiter mode demo adds a burger through its choices", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the walk is timed on a phone");
  const shown = (locator: Locator) => locator.filter({ visible: true });
  const table6 = rt("app.orders.place.numbered", { name: "6" });

  await page.goto(
    "/design/order-taking/floor/order?place=table-6&state=service",
  );
  await expect(
    page.getByRole("heading", { level: 1, name: table6 }),
  ).toBeVisible();
  const burger = shown(page.getByRole("button", { name: /^המבורגר/ })).first();
  await expect(burger).toContainText(rt("app.orders.picker.needsChoice"));
  await burger.click();
  const sheet = page.getByRole("dialog", { name: "המבורגר" });
  const add = sheet.getByRole("button", {
    name: rt("app.orders.choice.add", { count: 1 }),
    exact: true,
  });
  await expect(add).toBeDisabled();
  await sheet.getByRole("radio", { name: "מדיום", exact: true }).check();
  await sheet.getByRole("switch", { name: "גבינה", exact: true }).click();
  await expect(sheet).toContainText("74.00");
  await expect(add).toBeEnabled();
  await add.click();
  await expect(sheet).toHaveCount(0);

  await shown(
    page.getByRole("button", {
      name: new RegExp(`^${rt("app.orders.order.view.order")}`),
    }),
  )
    .first()
    .click();
  await expect(shown(page.getByText("מדיום · גבינה")).first()).toBeVisible();
  await expect(shown(page.getByText("74.00")).first()).toBeVisible();
  await shown(
    page.getByRole("button", {
      name: new RegExp(`^${rt("app.orders.send.label")}`),
    }),
  ).click();
  await expect(
    page.getByText(rt("app.orders.toast.sent", { place: table6 })),
  ).toBeVisible();

  await throughTabBar(page, rt("modules.order_taking.mode.prep"));
  const ticket = page.getByRole("article", {
    name: rt("app.orders.prep.label", { place: table6, department: "מטבח" }),
  });
  await expect(ticket.getByText("מדיום · גבינה")).toBeVisible();
  await expectCleanPage(page);
});

// The menu's twin gives the pasta a group of choices (P6), and on the
// floor its row opens them.
test("the waiter mode demo's menu gives an item a group of choices", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "one run is enough");
  const shown = (locator: Locator) => locator.filter({ visible: true });
  const m = he.app.orders.menu;
  await page.goto("/design/order-taking/menu?state=service");
  await shown(page.getByRole("button", { name: /^פסטה/ }))
    .first()
    .click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: m.groups.add }).click();
  await sheet.getByLabel(m.group.name, { exact: true }).fill("רוטב");
  await sheet
    .getByLabel(rt("app.orders.menu.group.option", { n: 1 }), { exact: true })
    .fill("עגבניות");
  await sheet.getByRole("button", { name: m.group.addOption }).click();
  await sheet
    .getByLabel(rt("app.orders.menu.group.option", { n: 2 }), { exact: true })
    .fill("שמנת");
  await expectCleanPage(page, "", true);
  await sheet.getByRole("button", { name: m.sheet.save }).click();
  await expect(sheet).toHaveCount(0);
  // Its row counts it.
  await expect(
    shown(page.getByRole("button", { name: /^פסטה/ })).first(),
  ).toContainText(rt("app.orders.menu.choices", { count: 1 }));

  await throughTabBar(page, rt("modules.order_taking.mode.places"));
  await shown(
    page.getByRole("link", {
      name: new RegExp(`^${rt("app.orders.place.kind")}\\s*6(?!\\d)`),
    }),
  ).click();
  await shown(page.getByRole("button", { name: /^פסטה/ }))
    .first()
    .click();
  const choices = page.getByRole("dialog", { name: "פסטה" });
  await expect(choices.getByText("רוטב", { exact: true })).toBeVisible();
  await expect(
    choices.getByText(rt("app.orders.choice.rule.one")),
  ).toBeVisible();
});

// A ticket of Shiran's turns ready while she looks at the floor: the mode's
// one toast says so, and its "פתיחה" leads to the order (P4).
test("the waiter mode demo says what turned ready, and opens it", async ({
  page,
}) => {
  await page.goto("/design/order-taking/floor?state=readyNow");
  const ready = rt("app.orders.toast.ready", {
    place: rt("app.orders.place.numbered", { name: "4" }),
    department: "מטבח",
  });
  await expect(page.getByText(ready)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: rt("app.orders.toast.open") }).click();
  await expect(page).toHaveURL(/floor\/order\?order=order-4$/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: rt("app.orders.place.numbered", { name: "4" }),
    }),
  ).toBeVisible();
});

// The fish ran out after it was chosen: the send says so by its name, and
// the draft stays as it was, to take it off and send again (P4).
test("the waiter mode demo refuses a dish sold out meanwhile and keeps the draft", async ({
  page,
}, testInfo) => {
  await page.goto(
    "/design/order-taking/floor/order?place=table-6&state=soldOut",
  );
  if (testInfo.project.name === "phone") {
    await page
      .getByRole("button", {
        name: new RegExp(`^${rt("app.orders.order.view.order")}`),
      })
      .filter({ visible: true })
      .first()
      .click();
  }
  await page
    .getByRole("button", {
      name: new RegExp(`^${rt("app.orders.send.label")}`),
    })
    .filter({ visible: true })
    .first()
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({
        hasText: rt("app.orders.failed.unavailable", { items: "דג היום" }),
      })
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("heading", { name: rt("app.orders.draft.title") })
      .filter({ visible: true }),
  ).toBeVisible();
});

// Off a shift, the floor waits and leads to the clock (P4).
test("the waiter mode demo offers the clock off a shift", async ({ page }) => {
  await page.goto("/design/order-taking/floor?state=offClock");
  await expect(
    page.getByRole("heading", { name: rt("app.orders.offClock.title") }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: rt("app.orders.offClock.action") }),
  ).toHaveAttribute("href", "/design/shell/clock");
});

// The twin's list of screens opens each one afresh in the state its row
// names, whatever the last row left: the store above the screens lives on
// between them, and only a link with a state starts it again.
test("the waiter mode demo's list opens each row in its own state", async ({
  page,
}) => {
  const o = he.design.orderTaking;
  // A row is the link whose title reads exactly so: "השולחנות" and the
  // places' row share a start.
  const row = (title: string) =>
    page
      .getByRole("link")
      .filter({ has: page.getByText(title, { exact: true }) });
  const shownText = (text: string) =>
    page.getByText(text, { exact: true }).filter({ visible: true });

  await page.goto("/design/order-taking");
  await row(o.index.screens.quiet.title).click();
  await expect(page).toHaveURL(/\/floor$/);
  await expect(shownText(o.floor.status.free)).toBeVisible();

  // Back on the list, the evening as it is: two ready to serve, not quiet.
  await page.goBack();
  await row(o.index.screens.floor.title).click();
  await expect(page).toHaveURL(/\/floor$/);
  await expect(
    page
      .getByText(heT("design.orderTaking.floor.status.ready", { count: 2 }))
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(shownText(o.floor.status.free)).toHaveCount(0);

  // After a business with no menu, the menu has its items again.
  await page.goBack();
  await row(o.index.screens.noMenu.title).click();
  await expect(shownText(o.picker.noMenu.title)).toBeVisible();
  await page.goBack();
  await row(o.index.screens.menu.title).click();
  await expect(page).toHaveURL(/\/menu$/);
  await expect(shownText(o.picker.noMenu.title)).toHaveCount(0);

  // After the quiet evening, table 4's list for the till is there.
  await page.goBack();
  await row(o.index.screens.quiet.title).click();
  await expect(page).toHaveURL(/\/floor$/);
  await page.goBack();
  await row(o.index.screens.tillItem.title).click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: rt("app.orders.till.title", {
        place: rt("app.orders.place.numbered", { name: "4" }),
      }),
    }),
  ).toBeVisible();
});

// The real menu screens on the twin (waiter mode P2), in the restaurant's
// words, on S0's routes and its one store: sold out with its undo, and once
// marked the floor's picker greys the item; a price changed in place on a
// computer; a new item in the category chosen for it, which the picker then
// offers; an item's choices shown as they are.

test("the waiter mode demo's menu marks sold out for the floor's picker, and adds and edits items", async ({
  page,
}, testInfo) => {
  const main = page.getByRole("main");
  const project = testInfo.project.name;
  const o = he.design.orderTaking;
  const m = he.app.orders.menu;
  const shown = (locator: Locator) => locator.filter({ visible: true });
  const toast = (text: string) =>
    page.getByRole("status").filter({ hasText: text });
  /** A category's own section: on a phone each one, on a tablet the chosen one. */
  const section = (name: string) =>
    shown(
      main.locator("section").filter({
        has: page.getByRole("heading", { name, exact: true }),
      }),
    );
  const choose = async (category: string) => {
    if (project === "tablet") {
      await shown(
        main.getByRole("button", { name: new RegExp(`^${asIs(category)}`) }),
      ).click();
    }
  };

  await page.goto("/design/order-taking/menu?state=service");
  await choose("עיקריות");
  const pasta = shown(
    main.getByRole("switch", {
      name: rt("app.orders.menu.soldOutFor", { name: "פסטה" }),
    }),
  );
  await pasta.click();
  await expect(pasta).toHaveAttribute("aria-checked", "true");
  await toast(rt("app.orders.menu.toast.soldOut", { name: "פסטה" }))
    .getByRole("button", { name: m.toast.undo })
    .click();
  await expect(pasta).toHaveAttribute("aria-checked", "false");
  // Marked again, for the floor to see.
  await pasta.click();
  await expect(pasta).toHaveAttribute("aria-checked", "true");

  if (project === "desktop") {
    // In place, on the table.
    const price = main.getByLabel(
      rt("app.orders.menu.priceFor", { name: "שניצל" }),
    );
    await price.fill("64");
    await price.press("Enter");
    await expect(
      toast(rt("app.orders.menu.toast.price", { name: "שניצל" })),
    ).toBeVisible();
    await expect(price).toHaveValue("64");
  }

  await shown(main.getByRole("button", { name: /^המבורגר/ }))
    .first()
    .click();
  const sheet = page.getByRole("dialog");
  // Its groups of choices, edited in place since P6: the first's name in
  // its field, and its rule as it reads now.
  await expect(
    sheet.getByLabel(rt("app.orders.menu.group.name"), { exact: true }).first(),
  ).toHaveValue("מידת עשייה");
  await expect(
    sheet.getByText(rt("app.orders.menu.sheet.rule.one")),
  ).toBeVisible();
  await expectCleanPage(page, "", true);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);

  // A new item, in the category chosen for it.
  await shown(
    page.getByRole("button", { name: rt("app.orders.menu.add") }),
  ).click();
  await sheet.getByLabel(rt("app.orders.menu.sheet.name")).fill("סורבה");
  await sheet.getByLabel(m.sheet.price, { exact: true }).fill("28");
  await sheet
    .getByRole("button", { name: new RegExp(`^${asIs(m.sheet.category)}:`) })
    .click();
  await page.getByRole("menuitemradio", { name: /^קינוחים/ }).click();
  await sheet.getByRole("button", { name: m.sheet.add }).click();
  await expect(
    toast(rt("app.orders.menu.toast.added", { name: "סורבה" })),
  ).toBeVisible();
  await choose("קינוחים");
  if (project === "desktop") {
    await expect(
      main.getByRole("row").filter({ hasText: "סורבה" }),
    ).toContainText("קינוחים");
  } else {
    await expect(
      section("קינוחים").getByRole("button", { name: /^סורבה/ }),
    ).toBeVisible();
  }

  // On the floor the twin's one store has both: the pasta greyed in the
  // picker, which can't add it, and the new item there to add.
  await throughTabBar(page, o.nav.places);
  await expect(page).toHaveURL(/\/design\/order-taking\/floor$/);
  await shown(
    page.getByRole("link", {
      name: new RegExp(`^${o.place.tableWord}\\s*6(?!\\d)`),
    }),
  )
    .first()
    .click();
  await expect(page).toHaveURL(/place=table-6$/);
  const search = page.getByLabel(o.picker.search);
  const found = page.getByRole("list", { name: o.picker.found });
  await search.fill("פסטה");
  const pastaRow = found.getByRole("button", { name: /^פסטה/ });
  await expect(pastaRow).toBeDisabled();
  await expect(pastaRow).toContainText(o.picker.soldOut);
  await search.fill("סורבה");
  await expect(found.getByRole("button", { name: /^סורבה/ })).toBeEnabled();
});

// The real import screen on the twin: a line a PDF turned around turned
// back; lines to fix hold the import and say how many; and a café's paste
// added with each new category's department chosen, which the menu and the
// categories then show.
test("the waiter mode demo's paste turns lines back, holds what needs fixing, and adds each category where it is prepared", async ({
  page,
}) => {
  const main = page.getByRole("main");
  const i = he.app.orders.import;
  const shownText = (text: string) =>
    page.getByText(text, { exact: true }).filter({ visible: true });
  // The import's button, whatever it counts.
  const anyImport = new RegExp(
    asIs(rt("app.orders.import.action", { count: 7 })).replace("7", "\\d+"),
  );

  await page.goto("/design/order-taking/menu/import?state=reversed");
  const paste = page.getByLabel(i.paste);
  await expect(shownText(i.problem.reversed)).toBeVisible();
  await expect(page.getByRole("button", { name: anyImport })).toHaveCount(0);
  await page.getByRole("button", { name: i.unreverse }).click();
  await expect(paste).toHaveValue(/15 שוקו חם/);
  await expect(shownText(i.problem.reversed)).toHaveCount(0);
  await expect(page.getByRole("button", { name: anyImport })).toHaveCount(1);

  await page.goto("/design/order-taking/menu/import?state=problems");
  await expect(
    shownText(rt("app.orders.import.blocked", { count: 2 })),
  ).toBeVisible();
  await expect(shownText(i.problem.noPrice)).toBeVisible();
  await expect(page.getByRole("button", { name: anyImport })).toHaveCount(0);

  await page.goto("/design/order-taking/menu/import?state=service");
  await page
    .getByRole("button", {
      name: new RegExp(
        `^${asIs(heT("app.orders.import.department", { category: "ארוחות בוקר" }))}`,
      ),
    })
    .filter({ visible: true })
    .click();
  await page.getByRole("menuitemradio", { name: /^בר/ }).click();
  await page
    .getByRole("button", { name: rt("app.orders.import.action", { count: 5 }) })
    .click();
  await expect(
    page.getByText(rt("app.orders.import.done", { items: 5, categories: 2 })),
  ).toBeVisible();
  // The done card's way on: the app's words, apart from the back link's.
  await main.getByRole("link", { name: i.toMenu, exact: true }).click();
  await expect(page).toHaveURL(/\/design\/order-taking\/menu$/);
  await expect(
    page.getByText("ארוחות בוקר").filter({ visible: true }).first(),
  ).toBeVisible();
  await main
    .getByRole("link", {
      name: new RegExp(`^${asIs(rt("app.orders.menu.categoriesRow"))}`),
    })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/design\/order-taking\/menu\/categories$/);
  await expect(
    main.getByRole("button", {
      name: `${heT("app.orders.categories.department", { name: "ארוחות בוקר" })}: בר`,
    }),
  ).toBeVisible();
});

// The categories on the twin: on a tablet the count chooses the category
// whose items show beside the list, apart from typing its name; with no
// department yet the screen says only what it can do, and leads to the
// departments; and the departments of a business that takes orders without
// lists say what a department is for there.
test("the waiter mode demo's categories show the chosen one's items, and send a business with no department to its departments", async ({
  page,
}, testInfo) => {
  const main = page.getByRole("main");
  const c = he.app.orders.categories;
  const d = he.app.manage.departments;
  const shownText = (text: string) =>
    page.getByText(text, { exact: true }).filter({ visible: true });

  await page.goto("/design/order-taking/menu/categories?state=service");
  if (testInfo.project.name === "tablet") {
    const desserts = main.getByRole("button", {
      name: new RegExp(
        `${asIs(heT("app.orders.categories.itemsWhere", { name: "קינוחים" }))}$`,
      ),
    });
    await desserts.click();
    await expect(desserts).toHaveAttribute("aria-current", "true");
    await expect(
      main.getByRole("heading", {
        name: heT("app.orders.categories.itemsOf", { name: "קינוחים" }),
      }),
    ).toBeVisible();
    await expect(shownText("עוגת שוקולד")).toBeVisible();
  }

  await page.goto("/design/order-taking/menu/categories?state=noDepartments");
  await expect(shownText(c.emptyView)).toBeVisible();
  await expect(page.getByText(c.empty, { exact: true })).toHaveCount(0);
  await expect(shownText(c.noDepartments)).toBeVisible();
  await expect(main.getByRole("link", { name: c.toDepartments })).toBeVisible();

  await page.goto("/design/shell/manage/departments?state=menuEmpty");
  await expect(shownText(d.subtitleMenu)).toBeVisible();
  await expect(shownText(d.emptyMenu)).toBeVisible();
  await expect(page.getByText(d.empty, { exact: true })).toHaveCount(0);
});

// The twin's places made at once for a business with none, and the app
// demo's departments saying what each prepares, and what goes nowhere once
// one is removed.
test("the waiter mode demo makes its tables at once, and its departments count the menu", async ({
  page,
}) => {
  await page.goto("/design/order-taking/menu/places?state=noPlaces");
  // Whatever is typed, the button names what it makes: 0 makes one, and a
  // cleared field the 10 it started with.
  const count = page.getByLabel(he.app.orders.places.quick.count);
  await count.fill("0");
  await expect(
    page.getByRole("button", {
      name: rt("app.orders.places.quick.action", { count: 1 }),
    }),
  ).toBeVisible();
  await count.fill("");
  await page
    .getByRole("button", {
      name: rt("app.orders.places.quick.action", { count: 10 }),
    })
    .click();
  await expect(
    page.getByLabel(rt("app.orders.places.nameOf", { name: "10" })),
  ).toHaveValue("10");
  await expect(
    page.getByLabel(rt("app.orders.places.nameOf", { name: "11" })),
  ).toHaveCount(0);

  await page.goto("/design/shell/manage/departments?state=menu");
  await expect(
    page
      .getByText(heT("app.manage.departments.menuItems", { count: 9 }))
      .filter({ visible: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: heT("app.manage.departments.remove", { name: "מטבח" }),
    })
    .click();
  const undo = page
    .getByRole("status")
    .filter({
      hasText: heT("app.manage.departments.removedMenu", {
        name: "מטבח",
        count: 9,
      }),
    })
    .getByRole("button", { name: he.app.manage.undo });
  await expect(undo).toBeFocused();
  await undo.click();
  await expect(
    page
      .getByText(heT("app.manage.departments.menuItems", { count: 9 }))
      .filter({ visible: true }),
  ).toBeVisible();
});

// The kitchen's screen opened offline stays offline once the state comes
// off the address, so the check of every page sees its banner.
test("the waiter mode demo's kitchen screen stays offline", async ({
  page,
}) => {
  const o = he.design.orderTaking;
  await page.goto("/design/order-taking/station/prep?state=offline");
  await expect(page).toHaveURL(/\/station\/prep$/);
  // The page's own alert, not the router's announcer.
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    o.station.offline,
  );
  await expect(
    page.getByText(o.station.offlineBadge, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(o.station.online, { exact: true })).toHaveCount(
    0,
  );
});

// The desktop's table of what Shiran still has to serve reads each line as
// the phone's cards do: table 4's held mains carry the burger's allergy,
// and its starters their note.
test("the waiter mode demo's desktop table shows each line's allergy", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the table is the desktop's");
  const o = he.design.orderTaking;
  await page.goto("/design/order-taking/mine");
  const table = page.getByRole("table", { name: o.mine.tableTitle });
  await expect(table).toBeVisible();
  await expect(
    table.getByText(
      heT("design.orderTaking.line.allergy", { allergy: "שומשום" }),
    ),
  ).toBeVisible();
  await expect(
    table.getByText(heT("design.orderTaking.line.note", { note: "בלי שום" })),
  ).toBeVisible();
});

// A week's dates under the title read left to right, as everywhere else, so
// the first day stands on the left: "1.11–7.11", never "7.11–1.11". The
// schedule tab names its week in words, "1–7 בנובמבר", with the days in an
// isolate (`weekRange`), as in the message its share sends.
const subtitleRange = (sentence: string) => (main: Locator) =>
  main
    .locator("p")
    .filter({ hasText: sentence.split("<")[0] ?? "" })
    .locator('span[dir="ltr"]')
    .first();
const DAY_MONTHS = /^\d{1,2}\.\d{1,2}–\d{1,2}\.\d{1,2}$/;
for (const [path, rangeOn, shape] of [
  [
    "/design/shell/schedule",
    (main: Locator) =>
      main.locator("header p").filter({ hasText: /\d–\d/ }).first(),
    /^\u2066\d{1,2}–\d{1,2}\u2069 \S+$/,
  ],
  [
    "/design/shell/schedule/build",
    subtitleRange(he.app.build.subtitle),
    DAY_MONTHS,
  ],
  [
    "/design/shell/schedule/availability",
    subtitleRange(he.app.availability.subtitle),
    DAY_MONTHS,
  ],
  [
    "/design/shell/schedule/availability/team",
    subtitleRange(he.app.availability.subtitle),
    DAY_MONTHS,
  ],
] as const) {
  test(`the week's dates read left to right on ${path}`, async ({ page }) => {
    await page.goto(path);
    const range = rangeOn(page.getByRole("main"));
    await expect(range).toHaveText(shape);
    // The first date is drawn to the left of the last one.
    const [first, last] = await range.evaluate((element) => {
      const text = element.firstChild;
      if (!text) return [0, 0];
      const words = element.textContent ?? "";
      const at = (start: number) => {
        const r = document.createRange();
        r.setStart(text, start);
        r.setEnd(text, start + 1);
        return r.getBoundingClientRect().left;
      };
      return [at(words.search(/\d/)), at(words.indexOf("–") + 1)];
    });
    expect(first).toBeLessThan(last);
  });
}

// P5 on the twin: a dish cancelled with its reason, kept by the toast's
// undo and cancelled again; the beer given on the house, which the till's
// list marks with its price struck, the cancelled dish left out of it.
test("the waiter mode demo cancels a dish with a reason and its undo, and the manager's on the house shows at the till", async ({
  page,
}, testInfo) => {
  const shown = (locator: Locator) => locator.filter({ visible: true }).first();
  const dialog = page.getByRole("dialog");
  await page.goto(
    "/design/order-taking/floor/order?place=table-4&state=service",
  );
  if (testInfo.project.name === "phone") {
    await shown(
      page.getByRole("button", {
        name: new RegExp(`^${rt("app.orders.order.view.order")}`),
      }),
    ).click();
  }
  const fixHummus = shown(
    page.getByRole("button", {
      name: rt("app.orders.line.fix", { name: "חומוס" }),
    }),
  );
  const mistake = rt("app.orders.reasons.line.mistake");
  await fixHummus.click();
  await expect(dialog).toBeVisible();
  await expectCleanPage(page, "", true);
  // Closed with no choice, the sheet gives the focus back to what opened it.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(fixHummus).toBeFocused();
  await fixHummus.click();
  await dialog.getByRole("button", { name: mistake, exact: true }).click();
  const cancelled = rt("app.orders.line.cancelledWhy", { reason: mistake });
  await expect(shown(page.getByText(cancelled))).toBeVisible();
  await orderUndo(
    page,
    rt("app.orders.toast.cancelled", { name: "חומוס" }),
  ).click();
  await expect(page.getByText(cancelled)).toHaveCount(0);
  await fixHummus.click();
  await dialog.getByRole("button", { name: mistake, exact: true }).click();
  await expect(shown(page.getByText(cancelled))).toBeVisible();

  // The beer, on the house: the cancel held before it goes now.
  await shown(
    page.getByRole("button", {
      name: rt("app.orders.line.fix", { name: "בירה מהחבית" }),
    }),
  ).click();
  await dialog
    .getByRole("button", {
      name: rt("app.orders.reasons.comp.make_good"),
      exact: true,
    })
    .click();
  await expect(
    shown(
      page.getByText(
        rt("app.orders.line.comped", {
          reason: rt("app.orders.reasons.comp.make_good"),
        }),
      ),
    ),
  ).toBeVisible();

  await shown(
    page.getByRole("link", { name: rt("app.orders.rounds.till") }),
  ).click();
  await expect(page).toHaveURL(/\/floor\/till\?order=order-4/);
  const list = shown(
    page.getByRole("list", { name: rt("app.orders.till.byItem") }),
  );
  await expect(list).toContainText(rt("app.orders.till.free"));
  await expect(list).not.toContainText("חומוס");
  await expectCleanPage(page);
});

// Table 2, all served, closed from its till: the floor lists it under
// "נסגרו היום", and its till opens it again.
test("the waiter mode demo closes a table from the till, lists it under נסגרו היום, and opens it again", async ({
  page,
}, testInfo) => {
  const shown = (locator: Locator) => locator.filter({ visible: true }).first();
  const table2 = rt("app.orders.place.numbered", { name: "2" });
  await page.goto(
    "/design/order-taking/floor/till?order=order-2&state=service",
  );
  await shown(
    page.getByRole("button", { name: rt("app.orders.close.place") }),
  ).click();
  await expect(
    page.getByText(rt("app.orders.toast.closed", { place: table2 })),
  ).toBeVisible();
  const reopen = shown(
    page.getByRole("button", { name: rt("app.orders.close.reopen") }),
  );
  await expect(reopen).toBeEnabled();

  await throughTabBar(page, rt("modules.order_taking.mode.places"));
  const closed = page
    .getByRole("main")
    .locator("section")
    .filter({
      has: page.getByRole("heading", {
        level: 2,
        name: rt("app.orders.floor.closed.title"),
      }),
    });
  await expect(closed).toBeVisible();
  await expectCleanPage(page);
  await shown(
    closed.getByRole(testInfo.project.name === "desktop" ? "button" : "link", {
      name: new RegExp(`^${asIs(table2)}(\\D|$)`),
    }),
  ).click();
  await expect(page).toHaveURL(/\/floor\/till\?order=order-2/);
  await reopen.click();
  await expect(
    page.getByText(rt("app.orders.toast.reopened", { place: table2 })),
  ).toBeVisible();
  await expect(
    shown(page.getByRole("button", { name: rt("app.orders.close.place") })),
  ).toBeVisible();
});

// Table 4 moves to table 6, free: its page goes there and says where from.
test("the waiter mode demo moves an order to a free table", async ({
  page,
}, testInfo) => {
  const shown = (locator: Locator) => locator.filter({ visible: true }).first();
  await page.goto(
    "/design/order-taking/floor/order?place=table-4&state=service",
  );
  if (testInfo.project.name === "phone") {
    await shown(
      page.getByRole("button", {
        name: new RegExp(`^${rt("app.orders.order.view.order")}`),
      }),
    ).click();
  }
  await shown(
    page.getByRole("button", {
      name: new RegExp(`^${asIs(rt("app.orders.order.actions.move"))}`),
    }),
  ).click();
  const dialog = page.getByRole("dialog");
  const table6 = rt("app.orders.place.numbered", { name: "6" });
  await expect(
    dialog.getByRole("button", {
      name: rt("app.orders.place.numbered", { name: "7" }),
      exact: true,
    }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: table6, exact: true }).click();
  await expect(page).toHaveURL(/place=table-6$/);
  await expect(
    page.getByRole("heading", { level: 1, name: table6 }),
  ).toBeVisible();
  const moved = rt("app.orders.toast.moved", { place: table6 });
  await expect(page.getByText(moved)).toBeVisible();
  await expect(orderUndo(page, moved)).toBeFocused();
  // Under the title, where it came from.
  const from = `${he.app.orders.order.movedFrom.split("{from}")[0] ?? ""}${rt(
    "app.orders.place.numbered",
    { name: "4" },
  )}`;
  await expect(
    shown(page.getByText(new RegExp(`^${asIs(from)}`))),
  ).toBeVisible();
});

// The kitchen strikes table 4's hummus, and still makes its focaccia. Its
// held mains are a ticket of their own, after it.
test("the waiter mode demo's kitchen strikes a cancelled dish", async ({
  page,
}) => {
  await page.goto("/design/order-taking/prep?state=fixed");
  const ticket = page
    .getByRole("article", {
      name: rt("app.orders.prep.label", {
        place: rt("app.orders.place.numbered", { name: "4" }),
        department: "מטבח",
      }),
    })
    .filter({ visible: true })
    .first();
  await expect(ticket).toContainText(rt("app.orders.line.cancelled"));
  await expect(ticket).toContainText("פוקאצ'ה");
});

// The owner's line on taking orders' settings: the day's counts, no shekels,
// leading to the activity log.
test("the owner's line counts the day's fixes", async ({ page }) => {
  await page.goto("/design/shell/manage/order_taking");
  const line = page.getByRole("link", {
    name: new RegExp(
      `^${asIs(heT("app.manage.orderFixes.today", { takenBack: 3, cancelled: 2, comped: 1 }))}`,
    ),
  });
  await expect(line.filter({ visible: true })).toBeVisible();
  await expect(line).toHaveAttribute("href", "/design/shell/manage/activity");
  await expect(line).not.toContainText("₪");
});
