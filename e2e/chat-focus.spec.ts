import he from "../messages/he.json" with { type: "json" };
import {
  announcer,
  focusWhenSaid,
  noteFocusWhenSaid,
  noteIfSaid,
  pastDrawing,
  saidSince,
  wasSaid,
} from "./announcer";
import { heT } from "./t";
import { expect, type Page, test } from "./test";

// Accessibility, part 7: chat and documents, on the gallery and the twins
// (the real documents screens with mock rows and stand-in writes: no
// sign-in, nothing stored or sent). Where the keyboard's focus is after
// each press that takes away what had it, what the page's announcer says,
// and what a control is read with. The real chat's own flows are in
// chat.spec.ts.

const c = he.app.chat;
const d = he.app.chat.documents;

/** A time in a button's name, as the app writes it: in Unicode isolates. */
const isolate = (chunks: string) => `⁦${chunks}⁩`;

/** The words of what has the keyboard's focus now, and what it is. */
const focused = (page: Page) =>
  page.evaluate(() => {
    const active = document.activeElement;
    return {
      tag: active?.tagName.toLowerCase() ?? null,
      words: active?.textContent?.trim() ?? "",
    };
  });

// The gallery's composer where nobody can write (a removed department):
// sending there closes the chat, as one removed while someone wrote. The
// line that says why takes the focus the field had, and isn't said twice;
// closed with the focus elsewhere (the gallery's own button), its words
// are said where the focus is, which stays.
test("the composer gives its line the focus when the chat closes while writing, and says it when the focus is elsewhere", async ({
  page,
}) => {
  await page.goto("/design");
  const toggle = page.getByRole("button", {
    name: he.design.chatClose,
    exact: true,
  });
  // Its part of the gallery: the line, the composer, and the button.
  const part = toggle.locator("xpath=..");
  const field = part.getByRole("textbox", { name: c.conversation.placeholder });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(part.getByText(c.conversation.closed)).toBeVisible();
  await expect(field).toHaveCount(0);

  // Open again, from the keyboard.
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(field).toBeVisible();

  // Written and sent: the chat closes, and its line has the focus.
  await field.fill("נתראה בשש");
  await noteIfSaid(page, c.conversation.closed);
  await part
    .getByRole("button", { name: c.conversation.send, exact: true })
    .click();
  await expect(field).toHaveCount(0);
  await expect
    .poll(() => focused(page))
    .toEqual({
      tag: "p",
      words: c.conversation.closed,
    });
  // Heard as the focus reads it, never a second time from a live line.
  await pastDrawing(page);
  expect(await wasSaid(page, c.conversation.closed)).toBe(false);

  // Opened and closed again from the button: the focus stays on it, and
  // the reason is said there.
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(field).toBeVisible();
  await noteIfSaid(page, c.conversation.closed);
  await page.keyboard.press("Enter");
  await expect(field).toHaveCount(0);
  await expect(toggle).toBeFocused();
  await expect.poll(() => wasSaid(page, c.conversation.closed)).toBe(true);
});

// A message's actions button: the tooltip's word for speech input, then
// whose message it is and when, so each reads apart in a list of the
// page's buttons.
test("each message's actions say whose message they are for, and when", async ({
  page,
}) => {
  await page.goto("/design");
  const bubble = page
    .locator("[data-bubble]")
    .filter({ hasText: he.design.chatSample6 });
  const actions = bubble.locator("[data-message-actions]");
  await expect(actions).toHaveAttribute(
    "aria-label",
    heT.markup("app.chat.messageActions.openFor", {
      name: he.design.person1,
      time: "08:14",
      ltr: isolate,
    }),
  );
  await expect(actions).toHaveAttribute("title", c.messageActions.open);
  await expect(
    bubble.getByRole("button", {
      name: new RegExp(`^${c.messageActions.open}`),
    }),
  ).toHaveCount(1);
});

// The desktop's documents table (the office's, on the twin): the preview
// closed gives the focus back to the row that opened it; each change of
// the filters says how many documents are left, once the menu gave its
// button the focus back (never on load); clearing them sends the focus on
// to the first filter. The twin has six documents: two forms, none a
// contract, three about Noa.
test("the documents table gives the row back its focus, and says what the filters leave", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the desktop's table");
  const count = (n: number) =>
    heT("app.chat.documents.office.filters.count", { count: n });
  const menu = (field: string, value: string) =>
    page.getByRole("button", { name: `${field}: ${value}`, exact: true });
  const choose = async (field: string, from: string, to: string) => {
    await menu(field, from).click();
    await page.getByRole("menuitemradio", { name: to }).click();
  };
  const table = page
    .getByRole("table", { name: d.office.table.caption })
    .filter({ visible: true });
  const preview = page.getByRole("complementary", {
    name: d.office.preview.title,
  });

  await page.goto("/design/chat/documents?state=seen");
  await expect(table).toBeVisible();
  // Nothing said on load.
  await noteIfSaid(page, count(6));
  await pastDrawing(page);
  expect(await wasSaid(page, count(6))).toBe(false);

  // A row opens its preview; closing it from the keyboard, the row has the
  // focus again.
  const row = table.getByRole("button", {
    name: heT("app.chat.documents.office.table.rowLabel", {
      person: "נועה כהן",
      title: "אישור מחלה ליום שני",
      direction: d.office.directions.from_person,
    }),
    exact: true,
  });
  await row.click();
  const close = preview.getByRole("button", { name: d.office.preview.close });
  await close.focus();
  await page.keyboard.press("Enter");
  await expect(preview.getByText(d.office.preview.choose)).toBeVisible();
  await expect(row).toBeFocused();

  // The forms: two, said once the focus is back on the menu's button.
  const category = d.office.filters.category;
  await noteFocusWhenSaid(
    page,
    count(2),
    `[aria-label="${category}: ${d.categories.form}"]`,
  );
  await choose(category, d.office.filters.allCategories, d.categories.form);
  await expect.poll(() => focusWhenSaid(page)).toBe(true);
  await expect(menu(category, d.categories.form)).toBeFocused();
  await expect(table.locator("tbody tr")).toHaveCount(2);
  await expect(saidSince(announcer(page, "polite"), count(2))).toHaveCount(1);

  // None a contract: said so, and the table gives way to the card.
  await noteIfSaid(page, count(0));
  await choose(category, d.categories.form, d.categories.contract);
  await expect.poll(() => wasSaid(page, count(0))).toBe(true);
  await expect(page.getByText(d.office.filters.noMatch)).toBeVisible();

  // Cleared from the keyboard: its button goes, the first filter has the
  // focus, and all six are said there.
  const person = d.office.filters.person;
  await noteFocusWhenSaid(
    page,
    count(6),
    `[aria-label="${person}: ${d.office.filters.everyone}"]`,
  );
  await page.getByRole("button", { name: d.office.filters.clear }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: d.office.filters.clear }),
  ).toHaveCount(0);
  await expect(menu(person, d.office.filters.everyone)).toBeFocused();
  await expect.poll(() => focusWhenSaid(page)).toBe(true);

  // Noa's: three, said once her documents came with the address.
  await noteFocusWhenSaid(page, count(3), `[aria-label="${person}: נועה כהן"]`);
  await choose(person, d.office.filters.everyone, "נועה כהן");
  await expect(page).toHaveURL(/\?person=noa$/);
  await expect.poll(() => focusWhenSaid(page)).toBe(true);
  await expect(table.locator("tbody tr")).toHaveCount(3);
});

// The send form's hints, read with their controls: what asking for "קראתי
// ואישרתי" does, with the switch; and for a sick note, what goes, with the
// list of kinds, said as "אישור מחלה" is chosen.
test("the send form reads its hints with their controls", async ({ page }) => {
  await page.goto("/design/chat/documents/send?to=people");
  await expect(
    page.getByRole("switch", { name: d.askConfirm }),
  ).toHaveAccessibleDescription(d.askConfirmHint);

  await page.goto("/design/chat/documents/send");
  const kinds = page.getByRole("group", { name: d.send.category });
  // A sick note is the first kind to the business: its hint is there.
  await expect(
    page.getByRole("radio", { name: d.categories.sick_note }),
  ).toBeChecked();
  await expect(kinds).toHaveAccessibleDescription(d.sickNoteHint);
  await page.getByRole("radio", { name: d.categories.form }).check();
  await expect(kinds).not.toHaveAccessibleDescription(d.sickNoteHint);
  await noteIfSaid(page, d.sickNoteHint);
  await page.getByRole("radio", { name: d.categories.sick_note }).check();
  await expect.poll(() => wasSaid(page, d.sickNoteHint)).toBe(true);
  await expect(kinds).toHaveAccessibleDescription(d.sickNoteHint);
  await expect(page.getByText(d.sickNoteHint)).toBeVisible();
});
