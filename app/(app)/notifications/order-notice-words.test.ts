import type { NotificationLine } from "@domain/notifications";
import { describe, expect, it, vi } from "vitest";
import { restaurantWording } from "@/app/design/order-taking/data";
import he from "@/messages/he.json";

vi.mock("server-only", () => ({}));

const { orderNoticeWords, orderPlace } = await import("./order-notice-words");
const { baseWording, wordingFrom } = await import("../wording");

// The lines about orders in words (waiter mode P8b), the inbox's and the
// phone's alike: the place as the mode names it, in the business's words
// ("שולחן 4" in a restaurant, "מקום 4" elsewhere), the department standing
// alone, how many items, and a plain title for a line that lost either.

type OrderLine = Extract<
  NotificationLine,
  { kind: "order.ready" | "order.unseen" }
>;

const words = he.app.notifications.kinds.order;
const restaurant = wordingFrom({ template: restaurantWording, business: {} });
const line = (more: Partial<OrderLine> = {}): OrderLine => ({
  kind: "order.ready",
  where: { placeName: "4", takeaway: null },
  department: "מטבח",
  count: 3,
  ...more,
});

describe("where a line about an order is", () => {
  it("is named as the mode names it, in the business's words", () => {
    expect(orderPlace({ placeName: "4", takeaway: null }, baseWording)).toBe(
      "מקום 4",
    );
    expect(orderPlace({ placeName: "4", takeaway: null }, restaurant)).toBe(
      "שולחן 4",
    );
    // A name stands alone.
    expect(orderPlace({ placeName: "בר 3", takeaway: null }, restaurant)).toBe(
      "בר 3",
    );
    expect(orderPlace({ placeName: null, takeaway: 7 }, baseWording)).toBe(
      "הזמנה 7",
    );
    expect(orderPlace({ placeName: null, takeaway: 7 }, restaurant)).toBe(
      "לקחת 7",
    );
    expect(orderPlace({ placeName: null, takeaway: null }, restaurant)).toBe(
      null,
    );
  });
});

describe("a line about an order in words", () => {
  it("says a ticket ready, where, and how many to serve", () => {
    expect(orderNoticeWords(line(), false, restaurant)).toEqual({
      title: "שולחן 4 · מטבח: מוכן",
      note: "3 פריטים להגשה",
    });
    // Nothing left to count: no note rather than "0".
    expect(orderNoticeWords(line({ count: 0 }), false, restaurant).note).toBe(
      null,
    );
  });

  it("says a screen that didn't get it, and what to do", () => {
    expect(
      orderNoticeWords(line({ kind: "order.unseen" }), false, restaurant),
    ).toEqual({
      title: "שולחן 4: המסך לא מחובר · מטבח",
      note: words.unseen.body,
    });
  });

  it("says settled that it no longer waits, and plainly what lost its place", () => {
    expect(orderNoticeWords(line(), true, baseWording).note).toBe(
      words.ready.settledNote,
    );
    expect(
      orderNoticeWords(line({ kind: "order.unseen" }), true, baseWording).note,
    ).toBe(words.unseen.settledNote);
    expect(
      orderNoticeWords(
        line({ where: { placeName: null, takeaway: null } }),
        false,
        restaurant,
      ).title,
    ).toBe(words.ready.titlePlain);
  });
});
