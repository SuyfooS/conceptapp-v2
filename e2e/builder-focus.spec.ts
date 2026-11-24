import he from "../messages/he.json" with { type: "json" };
import { announcer, heardSoFar, saidSince } from "./announcer";
import { buildScreen } from "./build-screen";
import { heT } from "./t";
import { expect, type Locator, type Page, test } from "./test";

// Accessibility, part 4: the builder and availability, on their twins (the
// real screens with the demo's people and stand-in saves: no sign-in, and
// nothing stored or sent). Where the keyboard's focus is after each press
// that takes away what had it, and what the page's announcer says.

const tb = he.app.build;
const ta = he.app.availability;

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

// A draft saved and a week's first publish go at once, and the pressed
// button goes with the focus: the dock's save button once nothing is
// unsaved, and the dock itself, which sharing takes the place of. The focus
// goes to the line that says where the week stands, and after a first
// publish to sharing it.
test("after saving the draft the focus is on where the week stands, after a first publish on sharing it", async ({
  page,
}) => {
  const screen = buildScreen(page);
  const save = page.getByRole("button", { name: tb.submit });
  const publish = page.getByRole("button", { name: tb.publish });
  const status = page.locator("[data-builder-status]");

  await page.goto("/design/shell/schedule/build");
  await screen.card("בוקר").click();
  await screen.addButton("שירן אלון").click();
  await screen.closeSheet();
  await expect(page.getByText(tb.unsaved)).toBeVisible();

  await save.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: tb.saved }),
  ).toBeVisible();
  await expect(save).toHaveCount(0);
  await expect(status).toBeFocused();

  await publish.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: tb.published }),
  ).toBeVisible();
  await expect(publish).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: he.app.shifts.share.action }),
  ).toBeFocused();
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
  await expect(undo).toHaveAccessibleDescription(/09:00–17:00/);
  await expect(sheet.getByRole("status")).toContainText("09:00–17:00");

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
