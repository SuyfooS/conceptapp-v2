import he from "../messages/he.json" with { type: "json" };
import { announcer, heardSoFar, noteStatusWords, saidSince } from "./announcer";
import { before, buildScreen, SHEET_CLOSES_MS } from "./build-screen";
import { heT } from "./t";
import { expect, type Locator, type Page, test } from "./test";

// Accessibility, part 4: the builder and availability, on their twins (the
// real screens with the demo's people and stand-in saves: no sign-in, and
// nothing stored or sent). Where the keyboard's focus is after each press
// that takes away what had it, and what the page's announcer says.

const tb = he.app.build;
const ta = he.app.availability;

/** Hours as plain words hold them in a sentence: in Unicode isolates. */
const isolated = (hours: string) => `⁦${hours}⁩`;

/** A list of people in the open shift's sheet, by its title: its heading. */
const listHeading = (page: Page, title: string) =>
  buildScreen(page)
    .group(title)
    .getByRole("heading", { name: title, exact: true });

// The twin's Sunday morning, 09:00–16:00 for three: Noa and Itai on it;
// Shiran available; Uri and Omer haven't answered; Yoav and Maya aren't
// available then; Shira is on the extra shift at the same time. Each "+" or
// "×" goes with its person into the other list: the focus goes to the next
// person's same button in that list, else the list's heading (the next
// list's, once a list is left empty), and the announcer says who went on or
// off and how many are on the shift now, in each one's own form of address.
test("the builder's sheet keeps the focus among the people, and says who went on or off", async ({
  page,
}) => {
  const screen = buildScreen(page);
  const { sheet } = screen;
  const polite = announcer(page, "polite");
  const morning = screen.card("בוקר");
  /** Presses a person's button from the keyboard, as a screen reader does. */
  const press = async (button: Locator) => {
    await button.focus();
    await heardSoFar(polite);
    await page.keyboard.press("Enter");
  };
  const said = (
    key: "added" | "removed",
    name: string,
    form: "f" | "m" | "x",
    assigned: number,
  ) =>
    saidSince(
      polite,
      heT(`app.build.${key}`, { name, form, assigned, needed: 3 }),
    );

  await page.goto("/design/shell/schedule/build");
  await morning.click();
  await expect(screen.group(tb.groups.available)).toContainText("שירן אלון");

  // Shiran, the only one available: her list goes, and the next list's
  // heading has the focus.
  await press(screen.addButton("שירן אלון"));
  await expect(screen.group(tb.groups.assigned)).toContainText("שירן אלון");
  await expect(screen.group(tb.groups.available)).toHaveCount(0);
  await expect(listHeading(page, tb.groups.noAnswer)).toBeFocused();
  await expect(said("added", "שירן אלון", "f", 3)).toHaveCount(1);

  // Uri, who chose no form of address: Omer's "+" next in the list.
  await press(screen.addButton("אורי בן דוד"));
  await expect(screen.addButton("עומר אזולאי")).toBeFocused();
  await expect(said("added", "אורי בן דוד", "x", 4)).toHaveCount(1);

  // Omer, the last who hasn't answered: on to the next list's heading.
  await heardSoFar(polite);
  await page.keyboard.press("Enter");
  await expect(screen.group(tb.groups.noAnswer)).toHaveCount(0);
  await expect(listHeading(page, tb.groups.unavailable)).toBeFocused();
  await expect(said("added", "עומר אזולאי", "x", 5)).toHaveCount(1);

  // Maya, last in her list with Yoav still before her: her list's heading.
  await press(screen.addButton("מאיה פרץ"));
  await expect(screen.group(tb.groups.unavailable)).toContainText("יואב לוי");
  await expect(listHeading(page, tb.groups.unavailable)).toBeFocused();
  await expect(said("added", "מאיה פרץ", "f", 6)).toHaveCount(1);

  // Off the shift: the next one's "×", and after the last the list's heading.
  await press(screen.removeButton("איתי מזרחי"));
  await expect(screen.group(tb.groups.assigned)).not.toContainText(
    "איתי מזרחי",
  );
  await expect(screen.removeButton("שירן אלון")).toBeFocused();
  await expect(said("removed", "איתי מזרחי", "m", 5)).toHaveCount(1);
  await press(screen.removeButton("מאיה פרץ"));
  await expect(listHeading(page, tb.groups.assigned)).toBeFocused();
  await expect(said("removed", "מאיה פרץ", "f", 4)).toHaveCount(1);

  // Escape with the focus on a "+": the sheet closes, and gives the focus
  // back to the shift's card, not to the page's title.
  await screen.addButton("יואב לוי").focus();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(morning).toBeFocused();
  // Noa, Shiran, Uri and Omer on it now; Yoav not, as Escape left him.
  await expect(morning).toContainText(
    tb.people.replace("{assigned}", "4").replace("{needed}", "3"),
  );
});

// The running week's twin: the shop on Tuesday at 11:20, its evening from
// 15:00 with Roni on it, and Omer and Michal free for it. The twin's clock
// goes on once a minute from 11:20 by the time gone since the screen came
// (`useBuilderClock`), so moving the page's clock on to 15:01 with the
// evening's sheet open begins the evening there: its details go, and the
// sheet draws its people again, as a shift under way. The focus on Omer's
// "+" stays on him, as he can still join, not on the next one's "+". Where
// the screen's own change went back as it began (Roni taken off it), the
// line in the sheet that says so takes the focus, so the reason is heard.
const runningWeek = "/design/shell/schedule/build/running";
const tuesday = { day: ta.weekdays.tue, date: "17.11" };
/** From 11:20 to 15:01 on the twin's clock. */
const toEvening = "03:41:00";

test("a shift that begins with its sheet open keeps the focus on the person it was on", async ({
  page,
}) => {
  const screen = buildScreen(page);
  const omer = screen.addButton("עומר הדגמה");

  await page.clock.install();
  await page.goto(runningWeek);
  await screen.card("ערב", tuesday).click();
  await expect(omer).toBeVisible();
  await omer.focus();
  await page.clock.fastForward(toEvening);
  await expect(screen.sheet).toContainText(before(tb.running.begunLine));
  await expect(omer).toBeFocused();
});

// With nothing changed and the focus on Roni's "×", the only one on the
// evening: as it begins he is kept on it as read, his "×" goes and nobody's
// is left, so the line that says it has begun has the focus, above the
// list's heading, and says why.
test("a shift that begins takes the focused × away and puts the focus on the line that says it began", async ({
  page,
}) => {
  const screen = buildScreen(page);
  const roni = screen.removeButton("רוני שלום");
  const begun = screen.sheet.locator("[data-running-line]");

  await page.clock.install();
  await page.goto(runningWeek);
  await screen.card("ערב", tuesday).click();
  await roni.focus();
  await page.clock.fastForward(toEvening);
  await expect(begun).toBeFocused();
  await expect(begun).toContainText(before(tb.running.begunLine));
  await expect(roni).toHaveCount(0);
});

test("a shift that begins with changes on the screen puts the focus on why they went back", async ({
  page,
}) => {
  const screen = buildScreen(page);
  const omer = screen.addButton("עומר הדגמה");
  const roni = "רוני שלום";
  const notice = screen.sheet
    .getByRole("status")
    .filter({ hasText: before(tb.running.errors.shiftStarted) });

  await page.clock.install();
  await page.goto(runningWeek);
  await screen.card("ערב", tuesday).click();
  await screen.removeButton(roni).click();
  await expect(screen.group(tb.groups.assigned)).not.toContainText(roni);
  await omer.focus();
  await page.clock.fastForward(toEvening);
  await expect(notice).toBeFocused();
  // Back on it as it was read, and kept there now that it has begun.
  await expect(screen.group(tb.groups.assigned)).toContainText(roni);
  await expect(screen.removeButton(roni)).toHaveCount(0);
});

// A draft saved and a week's first publish go at once, and the pressed
// button goes with the focus: the dock's save button once nothing is
// unsaved, and the dock itself, which sharing takes the place of. The focus
// goes to the line that says where the week stands, which says it is saved
// (the twin stores nothing, and says so from what its save answered), and
// after a first publish to sharing it. Pressed in the floating dock from
// the foot of the page, the page stays where it was: that line is above
// the board. That line says it was saved as the focus reaches it, so the
// toast only shows: its words come in with its region off, never polite
// first (`noteStatusWords`); after a first publish, with the focus on
// sharing, they come in polite and the toast says it. The page's clock
// stops as the sheet closes, so its own refocus, a moment after
// (`SHEET_CLOSES_MS`), is still to come as the save is pressed, however long
// the steps between take; moved on past it with the save held on its way,
// the dock's button, busy meanwhile, keeps the focus, and the card doesn't
// take it back.
test("after saving the draft the focus is on where the week stands, after a first publish on sharing it", async ({
  page,
}) => {
  const screen = buildScreen(page);
  const morning = screen.card("בוקר");
  const save = page.getByRole("button", { name: tb.submit });
  const publish = page.getByRole("button", { name: tb.publish });
  const status = page.locator("[data-builder-status]");
  const scrolled = () => page.evaluate(() => window.scrollY);
  let answer = () => {};
  const answered = new Promise<void>((go) => {
    answer = go;
  });
  await page.route(
    (url) => url.pathname === "/design/shell/schedule/build",
    async (route) => {
      // The stand-in save is a server action: a POST to the page itself.
      if (route.request().method() === "POST") await answered;
      await route.fallback();
    },
  );

  await page.clock.install();
  await page.goto("/design/shell/schedule/build");
  const cameIn = await noteStatusWords(page);
  await morning.click();
  await screen.addButton("שירן אלון").click();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));
  await screen.closeSheet();
  // Radix gives the focus back as the sheet goes, on a timeout of its own.
  await page.clock.runFor(SHEET_CLOSES_MS / 4);
  await expect(page.getByText(tb.unsaved)).toBeVisible();
  // The sheet gave the focus back to the card: nothing moves the page now.
  await expect(morning).toBeFocused();
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  const atFoot = await scrolled();

  await save.focus();
  await page.keyboard.press("Enter");
  await expect(save).toBeDisabled();
  await page.clock.runFor(SHEET_CLOSES_MS);
  // The sheet's close timer, which the press cancelled, would have put the
  // focus back on the card by now. (The busy button itself doesn't keep it:
  // Chromium lets a focused button that turns disabled drop it to the page.)
  expect(
    await morning.evaluate((card) => card.contains(document.activeElement)),
  ).toBe(false);
  await page.clock.resume();
  answer();
  const saved = page.getByRole("status").filter({ hasText: tb.saved });
  await expect(saved).toBeVisible();
  await expect(save).toHaveCount(0);
  await expect(status).toBeFocused();
  await expect(status).toContainText(before(tb.savedAt));
  await expect(status).not.toContainText(tb.draft);
  expect(await cameIn()).toContainEqual({ live: "off", words: tb.saved });
  expect(await cameIn()).not.toContainEqual({
    live: "polite",
    words: tb.saved,
  });
  // Never up to that line; longer words above may push the page on a little.
  expect(await scrolled()).toBeGreaterThanOrEqual(atFoot);

  await publish.focus();
  await page.keyboard.press("Enter");
  const published = page.getByRole("status").filter({ hasText: tb.published });
  await expect(published).toBeVisible();
  await expect(publish).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: he.app.shifts.share.action }),
  ).toBeFocused();
  expect(await cameIn()).toContainEqual({
    live: "polite",
    words: tb.published,
  });
});

// A day's sheet on the availability twin: Sunday has 09:00–17:00. Removing
// a range takes its "×" away: "ביטול" takes the focus, described by what it
// brings back, and undone, the focus is in the range back in its place.
// Closing the sheet from "ביטול" (Escape) brings the day back as it was, and
// the focus back to the day.
test("removing hours in a day's sheet puts the focus on its undo, and undone on the hours", async ({
  page,
}) => {
  const day = page.getByRole("button", {
    name: ta.dayName.replace("{day}", ta.weekdays.sun),
  });
  const sheet = page.getByRole("dialog", {
    name: new RegExp(`^${ta.day.split("{day}")[0]}${ta.weekdays.sun},`),
  });
  const starts = sheet.getByLabel(ta.start);
  const removeMorning = sheet.getByRole("button", {
    name: ta.removeRange.replace("{from}", "09:00").replace("{to}", "17:00"),
  });
  const undo = sheet.getByRole("button", {
    name: he.ui.undoRow.undo,
    exact: true,
  });

  await page.goto("/design/shell/schedule/availability");
  await day.click();
  await expect(starts).toHaveValue("09:00");
  await sheet.getByRole("button", { name: ta.addRange }).click();
  await expect(starts).toHaveCount(2);

  await removeMorning.click();
  await expect(starts).toHaveCount(1);
  await expect(undo).toBeFocused();
  // The hours held left to right inside the sentence, in Unicode isolates.
  await expect(undo).toHaveAccessibleDescription(
    new RegExp(isolated("09:00–17:00")),
  );
  await expect(sheet.getByRole("status")).toContainText(
    isolated("09:00–17:00"),
  );

  // Undone from the keyboard: the range is back first, with the focus.
  await page.keyboard.press("Enter");
  await expect(undo).toHaveCount(0);
  await expect(starts).toHaveCount(2);
  await expect(starts.first()).toHaveValue("09:00");
  await expect(starts.first()).toBeFocused();

  // Removed again, and the sheet closed from "ביטול": the day as it was.
  await removeMorning.click();
  await expect(undo).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(day).toBeFocused();
  await expect(day).toContainText("09:00–17:00");
});

// Hours that can't be sent: the line above Send points at the words each
// such day carries, never at a colour, and those words are on the days.
test("the availability's error names the words on the days to fix", async ({
  page,
}) => {
  await page.goto("/design/shell/schedule/availability?state=invalid");
  await page.getByRole("button", { name: ta.submit }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: ta.fix }),
  ).toBeVisible();
  expect(ta.fix).toContain(ta.dayProblem);
  // Monday's two ranges overlap, and Friday's goes past candle lighting.
  await expect(
    page
      .getByRole("button")
      .filter({ hasText: ta.dayProblem })
      .filter({ visible: true }),
  ).toHaveCount(2);
});
