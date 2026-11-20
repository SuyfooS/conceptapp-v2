import { type MessageTree, messageLeaves } from "@domain/wording";
import { describe, expect, it } from "vitest";
import { restaurantWording } from "../app/design/order-taking/data";
import en from "../messages/en.json";
import he from "../messages/he.json";

/**
 * A department's name is the business's own ("מטבח", "בר", "קופה"), so a
 * sentence can't bend it: Hebrew would need "במטבח" for one and "בבר" for
 * another. The orders' sentences put it only where it stands alone: at the
 * start, or after " · " or ": " (waiter mode's §12.2), in Hebrew, in English
 * and in the templates' own sentences.
 */

const DEPARTMENT = "{department}";

/** Whether every `{department}` in a sentence stands alone. */
function standsAlone(sentence: string): boolean {
  let at = sentence.indexOf(DEPARTMENT);
  while (at !== -1) {
    const before = sentence.slice(0, at);
    if (!(before === "" || before.endsWith(" · ") || before.endsWith(": "))) {
      return false;
    }
    at = sentence.indexOf(DEPARTMENT, at + 1);
  }
  return true;
}

const orders = (tree: MessageTree) =>
  messageLeaves(tree).filter(
    ([key]) =>
      key.startsWith("app.orders.") || key.startsWith("modules.order_taking."),
  );

describe("a department's name in the orders' sentences", () => {
  it("is told standing alone from one bent by a word before it", () => {
    expect(standsAlone("{department} · 3")).toBe(true);
    expect(standsAlone("מוכן · {department}")).toBe(true);
    expect(standsAlone("{place} · {department}: הוגש")).toBe(true);
    expect(standsAlone("נשלח ל{department}")).toBe(false);
    expect(standsAlone("במחלקה {department}")).toBe(false);
  });

  it("stands alone in Hebrew and in English", () => {
    for (const tree of [he, en] as MessageTree[]) {
      const named = orders(tree).filter(([, sentence]) =>
        sentence.includes(DEPARTMENT),
      );
      expect(named.length).toBeGreaterThan(5);
      for (const [key, sentence] of named) {
        expect(standsAlone(sentence), key).toBe(true);
      }
    }
  });

  it("stands alone in the restaurant's and the café's own sentences", () => {
    for (const [key, sentence] of Object.entries(restaurantWording)) {
      expect(standsAlone(sentence), key).toBe(true);
    }
  });
});
