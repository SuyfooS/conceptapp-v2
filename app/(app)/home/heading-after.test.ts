import { describe, expect, it } from "vitest";
import { headingsAfter, SECTION_HEADINGS } from "./heading-after";

/*
 * Where Today's "ביטול" sends the focus once it is up with the focus on it
 * (accessibility, part 3): the next section's title. The page is stood in
 * for: each element has its place in the page's order, and holds what it
 * holds.
 */

class Spot {
  constructor(
    readonly at: number,
    readonly inside: Spot[] = [],
  ) {}
  contains(other: unknown) {
    return other === this || this.inside.includes(other as Spot);
  }
  compareDocumentPosition(other: unknown) {
    // DOCUMENT_POSITION_FOLLOWING, or PRECEDING.
    return (other as Spot).at > this.at ? 4 : 2;
  }
}

const page = (headings: Spot[]) => ({
  asked: [] as string[],
  querySelectorAll(selectors: string) {
    this.asked.push(selectors);
    return headings as unknown as Element[];
  },
});

describe("headingsAfter", () => {
  it("lists the headings after where the row was, in the page's order", () => {
    const title = new Spot(0);
    const next = new Spot(5);
    const later = new Spot(9);
    const anchor = new Spot(3);
    const doc = page([title, next, later]);
    expect(headingsAfter(anchor as unknown as Node, doc)).toEqual([
      next,
      later,
    ]);
    expect(doc.asked).toEqual([SECTION_HEADINGS]);
  });

  it("leaves out a heading inside it", () => {
    const own = new Spot(4);
    const next = new Spot(6);
    const anchor = new Spot(3, [own]);
    expect(headingsAfter(anchor as unknown as Node, page([own, next]))).toEqual(
      [next],
    );
  });

  it("has none with no anchor or no page, nor at the end of the page", () => {
    expect(headingsAfter(null, page([new Spot(1)]))).toEqual([]);
    expect(headingsAfter(new Spot(1) as unknown as Node, undefined)).toEqual(
      [],
    );
    expect(
      headingsAfter(new Spot(9) as unknown as Node, page([new Spot(1)])),
    ).toEqual([]);
  });
});
