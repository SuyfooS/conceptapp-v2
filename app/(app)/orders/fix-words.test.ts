import type { TicketStage } from "@domain/order-screens";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import he from "@/messages/he.json";
import {
  type FixWrite,
  fixFailureWords,
  type OrdersT,
  sendFailureWords,
} from "./orders-parts";
import type { OrdersActionFailure } from "./orders-types";

// Why a fix was refused (waiter mode P5), in words of its own for every
// refusal each write meets in the database
// (20261120000300_order_taking_orders.sql), never the plain "לא נשמר" that
// is left for what nothing else explains. And the line's sheet names a
// ticket's state as its badge on the rounds does: one state, one name.

const t = createTranslator({
  locale: "he",
  messages: he,
  namespace: "app.orders",
}) as unknown as OrdersT;

const fallback = he.app.orders.failed.failed;

/** Each write, and what the database or the server refuses it with. */
const MEETS: Record<FixWrite, OrdersActionFailure[]> = {
  line: [
    "closed",
    "takenBack",
    "comped",
    "cancelled",
    "managersOnly",
    "gone",
    "off",
    "noAccess",
    "viewOnly",
    "businessChanged",
    "clock",
    "staleShift",
  ],
  restore: [
    "closed",
    "takenBack",
    "comped",
    "managersOnly",
    "gone",
    "off",
    "noAccess",
    "viewOnly",
    "businessChanged",
    "clock",
    "staleShift",
  ],
  comp: [
    "closed",
    "takenBack",
    "cancelled",
    "noAccess",
    "gone",
    "off",
    "viewOnly",
  ],
  order: [
    "closed",
    "noAccess",
    "gone",
    "off",
    "viewOnly",
    "sending",
    "writing",
  ],
  move: [
    "taken",
    "takeaway",
    "place",
    "closed",
    "gone",
    "viewOnly",
    "clock",
    "sending",
    "writing",
  ],
  close: ["held", "closed", "gone", "viewOnly", "clock", "sending", "writing"],
  reopen: [
    "day",
    "notClosed",
    "taken",
    "gone",
    "viewOnly",
    "clock",
    "sending",
    "writing",
  ],
  undoClose: [
    "sending",
    "writing",
    "window",
    "day",
    "notClosed",
    "taken",
    "gone",
    "viewOnly",
    "clock",
    "notYet",
  ],
};

describe("a refused fix", () => {
  it("says why in its own words, for every refusal each write meets", () => {
    for (const [what, failures] of Object.entries(MEETS)) {
      for (const failure of failures) {
        const words = fixFailureWords(t, failure, what as FixWrite, "שולחן 4");
        expect(words, `${what} ${failure}`).not.toBe(fallback);
        expect(words, `${what} ${failure}`).not.toContain("app.orders");
      }
    }
  });

  it("says who may, which place is taken, and what waits", () => {
    expect(fixFailureWords(t, "noAccess", "comp")).toBe(
      he.app.orders.failed.runsOnly,
    );
    expect(fixFailureWords(t, "noAccess", "order")).toBe(
      he.app.orders.failed.runsOnly,
    );
    expect(fixFailureWords(t, "taken", "move", "שולחן 4")).toBe(
      he.app.orders.failed.moveTaken.replace("{place}", "שולחן 4"),
    );
    expect(fixFailureWords(t, "taken", "reopen")).toBe(
      he.app.orders.failed.reopenTaken,
    );
    expect(fixFailureWords(t, "taken", "undoClose")).toBe(
      he.app.orders.failed.reopenTaken,
    );
    // The close's undo too late, or of another's close, says where it opens
    // again; a line's take-back too late keeps its own words.
    expect(fixFailureWords(t, "window", "undoClose")).toBe(
      he.app.orders.failed.undoClose,
    );
    expect(fixFailureWords(t, "window", "line")).toBe(
      he.app.orders.failed.window,
    );
    expect(fixFailureWords(t, "held", "close")).toBe(he.app.orders.close.held);
    // A write of the order whole waits for a round on its way, and says so.
    for (const what of [
      "close",
      "move",
      "undoClose",
      "reopen",
      "order",
    ] as const) {
      expect(fixFailureWords(t, "sending", what)).toBe(
        he.app.orders.order.actions.waitSend,
      );
      // Nor does it go behind another write of the order not answered yet.
      expect(fixFailureWords(t, "writing", what)).toBe(
        he.app.orders.order.actions.waitWrite,
      );
    }
    // A line ready: who cancels it, and who puts it back, each in its words.
    expect(fixFailureWords(t, "managersOnly", "line")).toBe(
      he.app.orders.failed.managersOnly,
    );
    expect(fixFailureWords(t, "managersOnly", "restore")).toBe(
      he.app.orders.failed.managersOnlyRestore,
    );
    // Anything nothing explains: not saved, and pressing again tries again.
    expect(fixFailureWords(t, "failed", "line")).toBe(fallback);
  });
});

describe("a refused send (P6)", () => {
  it("says the choices changed on the menu, or the price is past the most, in words of its own", () => {
    expect(sendFailureWords(t, "choices")).toBe(he.app.orders.failed.choices);
    expect(sendFailureWords(t, "price")).toBe(he.app.orders.failed.price);
    // What nothing else explains: the draft is back, to send again.
    expect(sendFailureWords(t, "invalid")).toBe(he.app.orders.failed.notSent);
  });
});

describe("a line's sheet", () => {
  it("names its ticket's state in the words of the ticket's badge", () => {
    const stages: TicketStage[] = [
      "held",
      "sent",
      "onScreen",
      "ready",
      "served",
    ];
    for (const words of [he, en]) {
      const { fix, ticketState } = words.app.orders;
      expect(Object.keys(fix.state).sort()).toEqual([...stages].sort());
      for (const stage of stages) {
        // The badge's words, without the department it names beside them.
        const badge = ticketState[stage].replace(" · {department}", "");
        expect(fix.state[stage], stage).toBe(badge);
      }
    }
  });
});
