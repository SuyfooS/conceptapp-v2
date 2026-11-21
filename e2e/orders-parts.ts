import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { createTranslator } from "next-intl";
import he from "../messages/he.json" with { type: "json" };
import { type MessageTree, mergeWording } from "../packages/domain/wording";
import { templateWording } from "./db";
import { heT } from "./t";

// What the order specs share (waiter mode, P4 on; moved out of
// orders.spec.ts for P7's orders-offline.spec.ts, as they were): the demo
// restaurant's people, its words read from the database as it reads them,
// and the ways to the mode's screens. Every locator keeps to what is
// visible: Next keeps a screen left in a hidden <Activity>.

// Seeded in supabase/seed.sql: Yoav in the bar, who signs in by SMS, and
// the team in no business.
export const YOAV = { local: "050-000-0004", e164: "+972500000004" };
export const OWNER = "+972500000001";
export const SHIRAN = "+972500000002";
export const NOA = "+972500000003";
export const ADMIN = { local: "050-000-0005", e164: "+972500000005" };
export const RESTAURANT = "00000000-0000-4000-b000-000000000001";

const e = he.auth.enter;
export const literal = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The restaurant's words: the app's, with its template's sentences in place.
 * Read once per spec (`test.beforeAll(loadRestaurantWords)`); until then,
 * the app's own.
 */
export let rt = heT;

export async function loadRestaurantWords(): Promise<void> {
  const words = await templateWording("restaurant");
  rt = createTranslator({
    locale: "he",
    messages: mergeWording(he as MessageTree, words) as typeof he,
  }) as typeof heT;
}

export const main = (page: Page) => page.getByRole("main");
export const shown = (page: Page, text: string | RegExp) =>
  page.getByText(text).filter({ visible: true }).first();
export const toast = (page: Page, text: string) =>
  page.getByRole("status").filter({ hasText: text });
/**
 * The "ביטול" of the toast that says `text`: on an order screen of someone
 * who runs orders, "ביטול ההזמנה" is a button too, whose name holds the word.
 */
export const undoOn = (page: Page, text: string) =>
  toast(page, text).getByRole("button", {
    name: rt("app.orders.toast.undo"),
    exact: true,
  });
export const button = (page: Page, text: string | RegExp) =>
  main(page)
    .getByRole("button", {
      name: typeof text === "string" ? new RegExp(`^${literal(text)}`) : text,
    })
    .filter({ visible: true })
    .first();
export const link = (page: Page, text: string | RegExp) =>
  main(page)
    .getByRole("link", {
      name: typeof text === "string" ? new RegExp(`^${literal(text)}`) : text,
    })
    .filter({ visible: true })
    .first();
export const navItem = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: he.ui.appShell.mainNav })
    .filter({ visible: true })
    .first()
    .getByRole("link", { name: new RegExp(`^${literal(name)}`) });
export const heading = (page: Page, level: number, name: string) =>
  main(page).getByRole("heading", { level, name }).filter({ visible: true });

export async function expectCleanPage(page: Page) {
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

/** In through the door, as one of the demo restaurant's people. */
export async function enterAs(page: Page, key: keyof typeof e.people) {
  await page.goto("/enter");
  await page
    .getByRole("region", { name: e.businesses.restaurant.name })
    .getByRole("button", { name: new RegExp(e.people[key].name) })
    .click();
  await expect(page).toHaveURL(/\/home$/);
}

/**
 * Back to the floor from the mode's own nav, once it is the screen shown:
 * the screen left stays in the page, hidden (Next keeps it in an
 * <Activity>), and a tile looked for before the floor shows can match a
 * link of that screen ("ההזמנות שלי"'s "שולחן 9 · בר") and wait on it for
 * good.
 */
export async function toFloor(page: Page) {
  await navItem(page, rt("modules.order_taking.mode.places")).click();
  await expect(page).toHaveURL(/\/orders$/);
  await expect(heading(page, 1, rt("app.orders.floor.title"))).toBeVisible();
}

/** A table's tile on the floor, by its name. */
export const tile = (page: Page, name: string) =>
  link(
    page,
    new RegExp(`^${literal(rt("app.orders.place.kind"))}\\s*${name}(\\D|$)`),
  );

/**
 * On a phone the items and the order show one at a time, switched by a
 * Segmented: buttons with aria-pressed. The order's own "הוספת מנות" comes
 * after it, and switches the same way.
 */
export async function showItems(page: Page, project: string) {
  if (project !== "phone") return;
  await page
    .getByRole("button", {
      name: new RegExp(`^${literal(rt("app.orders.order.view.add"))}`),
    })
    .filter({ visible: true })
    .first()
    .click();
}

export async function showOrder(page: Page, project: string) {
  if (project !== "phone") return;
  await page
    .getByRole("button", {
      name: new RegExp(`^${literal(rt("app.orders.order.view.order"))}`),
    })
    .filter({ visible: true })
    .first()
    .click();
}

export const send = (page: Page) =>
  button(page, rt("app.orders.send.label")).click();
