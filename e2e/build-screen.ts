import { expect, type Locator, type Page } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };

const tb = he.app.build;

/** The text of a message up to its first placeholder or tag. */
export const before = (message: string) => message.split(/[<{]/)[0] ?? message;

const sunday = he.app.availability.weekdays.sun;

/**
 * The "build the week" screen as a manager uses it, on any of the three
 * layouts: a card per shift, and one sheet where everything about a shift
 * happens. While a sheet is open the rest of the page is hidden from these
 * locators, as it is from a screen reader, so close it before going back.
 */
export function buildScreen(page: Page) {
  const sheet = page.getByRole("dialog");
  return {
    sheet,

    /** The card of a shift on next week's Sunday, whatever its date. */
    card: (name: string): Locator =>
      page.getByRole("button", {
        name: new RegExp(
          `^${before(tb.shift.replace("{name}", name).replace("{day}", sunday))}`,
        ),
      }),

    /** Adding a shift to next week's Sunday. */
    addOnSunday: (): Locator =>
      page.getByRole("button", {
        name: new RegExp(`^${before(tb.addShiftOn.replace("{day}", sunday))}`),
      }),

    /** One of the sheet's lists of people, by its title. */
    group: (title: string): Locator =>
      sheet.getByRole("group", { name: title, exact: true }),

    /** The button that puts someone on the open shift. */
    addButton: (name: string): Locator =>
      sheet.getByRole("button", { name: tb.addPerson.replace("{name}", name) }),

    /** The button that takes someone off the open shift. */
    removeButton: (name: string): Locator =>
      sheet.getByRole("button", { name: tb.remove.replace("{name}", name) }),

    /** The button showing and changing someone's position on the open shift. */
    positionButton: (name: string, position: string): Locator =>
      sheet.getByRole("button", {
        name: tb.position
          .replace("{name}", name)
          .replace("{position}", position),
      }),

    /** Unfolds the open shift's name, hours, people needed and removal. */
    async openDetails(shiftName: string) {
      await sheet
        .getByRole("button", { name: tb.edit.replace("{name}", shiftName) })
        .click();
    },

    async closeSheet() {
      await sheet.getByRole("button", { name: tb.done, exact: true }).click();
      await expect(sheet).toHaveCount(0);
    },
  };
}
