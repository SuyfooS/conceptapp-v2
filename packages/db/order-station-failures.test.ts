import { describe, expect, it, vi } from "vitest";
import {
  orderStationFailureOf,
  orderStationItemFailureOf,
  orderStationRefusalOf,
} from "./order-station-failures";

// What the database says when it refuses a station
// (20261124000100_order_taking_stations.sql), in the words the station's
// screen has.

describe("a station's own refusals", () => {
  it("are told by their hint, and a secret that is no station's by its words", () => {
    const cases: [string | null, string, string | null][] = [
      [null, "Not a station", "notStation"],
      ["stopped", "This station was stopped", "stopped"],
      ["shows", "This station shows something else", "notOrders"],
      ["off", "Taking orders is off for this business", "off"],
      [null, "Those who run orders only", null],
    ];
    for (const [hint, message, expected] of cases) {
      expect(
        orderStationRefusalOf({ code: "42501", message, hint }),
        message,
      ).toBe(expected);
    }
    expect(
      orderStationRefusalOf({ code: "P0002", message: "Not a station" }),
    ).toBeNull();
  });
});

describe("a station's write refused", () => {
  it("says the station's refusal first, then the orders' own", () => {
    const of = (code: string, message: string, hint: string | null = null) =>
      orderStationFailureOf({ code, message, hint }, "a station's write");
    expect(of("42501", "This station was stopped", "stopped")).toBe("stopped");
    expect(of("42501", "Not a station")).toBe("notStation");
    expect(of("P0002", "Unknown order")).toBe("gone");
    expect(of("55000", "A held block waits to be called", "held")).toBe("held");
    expect(of("55000", "Too late", "window")).toBe("window");
    expect(of("55000", "It was served", "served")).toBe("served");
    expect(of("55000", "Its business day is over", "day")).toBe("day");
    expect(of("55000", "A cancelled order stays cancelled", "not_closed")).toBe(
      "notClosed",
    );
    expect(of("55000", "The order was cancelled", "closed")).toBe("closed");
    expect(of("23505", "That place has an open order", "taken")).toBe("taken");
    expect(of("42501", "The screen's department's items only")).toBe(
      "noAccess",
    );
    expect(of("22023", "Ready or not")).toBe("invalid");
    expect(of("PGRST202", "Could not find the function")).toBe("notYet");
  });

  it("says failed for what a station can't meet, logging only the message", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      orderStationFailureOf(
        { code: "42501", message: "Only the sender", hint: "sender" },
        "a station's write",
      ),
    ).toBe("failed");
    expect(
      orderStationFailureOf(
        { code: "XX000", message: "boom" },
        "a station's write",
      ),
    ).toBe("failed");
    expect(error).toHaveBeenCalledWith("a station's write failed", "boom");
    error.mockRestore();
  });
});

describe("a kitchen's sold-out mark refused", () => {
  it("says the item's words: removed or none, and no longer this screen's", () => {
    const of = (code: string, message: string, hint: string | null = null) =>
      orderStationItemFailureOf(
        { code, message, hint },
        "a station's sold out",
      );
    expect(of("P0002", "Unknown item")).toBe("itemGone");
    expect(of("55000", "A removed item is restored first", "archived")).toBe(
      "itemGone",
    );
    expect(of("42501", "The screen's department's items only")).toBe("notHere");
  });

  it("says the station's own refusals first, and the rest as any write", () => {
    const of = (code: string, message: string, hint: string | null = null) =>
      orderStationItemFailureOf(
        { code, message, hint },
        "a station's sold out",
      );
    expect(of("42501", "This station was stopped", "stopped")).toBe("stopped");
    expect(of("42501", "Taking orders is off for this business", "off")).toBe(
      "off",
    );
    expect(of("42501", "Not a station")).toBe("notStation");
    expect(of("22023", "Sold out or not")).toBe("invalid");
    expect(of("PGRST202", "Could not find the function")).toBe("notYet");
  });
});
