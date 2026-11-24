import { expect, type Locator, type Page } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };

const tb = he.app.build;

/** The text of a message up to its first placeholder or tag. */
export const before = (message: string) => message.split(/[<{]/)[0] ?? message;

const sunday = he.app.availability.weekdays.sun;

/** Text to find as it is, inside a pattern. */
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * How long publishing changes waits for "ביטול" before anything reaches the
 * server (`HOLD_MS` in app/(app)/use-held-write.ts).
 */
export const HOLD_MS = 8_000;

/**
 * How long after a sheet closes the builder gives the focus back, should it
 * be lost by then (`SHEET_CLOSES_MS` in
 * app/(app)/schedule/build/schedule-builder.tsx).
 */
export const SHEET_CLOSES_MS = 240;

/**
 * A day of the week on the screen, by its weekday as the screen names it
 * (`he.app.availability.weekdays`), and its date ("17.11") when the week
 * shown could be either of two: next week's Sunday unless it says otherwise.
 */
export type OnDay = { day?: string; date?: string };

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** A day by its date (YYYY-MM-DD), named as the builder names it. */
export function onDate(date: string): OnDay {
  const [, month, day] = date.split("-").map(Number);
  return {
    day: he.app.availability.weekdays[
      WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()] ?? "sun"
    ],
    date: `${day}.${month}`,
  };
}

/**
 * The "build the week" screen as a manager uses it, on any of the three
 * layouts: a card per shift, and one sheet where everything about a shift
 * happens. While a sheet is open the rest of the page is hidden from these
 * locators, as it is from a screen reader, so close it before going back.
 */
export function buildScreen(page: Page) {
  const sheet = page.getByRole("dialog");
  const publishChanges = page.getByRole("button", { name: tb.publishChanges });
  /** The toast of a publish held for its undo, while it waits. */
  const held = page.getByRole("status").filter({ hasText: tb.hold.waiting });
  return {
    sheet,

    /** The toast of a publish held for its undo, while it waits. */
    held,

    /** The toast's "ביטול", which lets a held publish go unsent. */
    undoHeld: (): Locator =>
      held.getByRole("button", { name: he.app.manage.undo, exact: true }),

    /**
     * Presses "פרסום השינויים" and waits out the hold: it waits `HOLD_MS`
     * for "ביטול" first, and says so, with nothing sent yet. Once the wait
     * is over the publish goes, and what it answers is the caller's to read.
     */
    async publishChanges() {
      await publishChanges.click();
      await expect(held).toBeVisible();
      await expect(publishChanges).toBeDisabled();
      await expect(held).toHaveCount(0, { timeout: HOLD_MS + 5_000 });
    },

    /**
     * The card of a shift on a day of the week on the screen (`on`): next
     * week's Sunday, whatever its date, unless it names another day of
     * whichever week the builder shows, this week's included.
     */
    card: (name: string, on: OnDay = {}): Locator => {
      const label = tb.shift
        .replace("{name}", name)
        .replace("{day}", on.day ?? sunday);
      return page.getByRole("button", {
        name: new RegExp(
          `^${literal(before(on.date ? label.replace("{date}", on.date) : label))}`,
        ),
      });
    },

    /** Adding a shift to a day (`on`): next week's Sunday unless it says. */
    addOn: (on: OnDay = {}): Locator =>
      page.getByRole("button", {
        name: new RegExp(
          `^${literal(before(tb.addShiftOn.replace("{day}", on.day ?? sunday)))}`,
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
