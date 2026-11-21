import { afterEach, describe, expect, it, vi } from "vitest";
import { orderFailureOf, refusedItems, takenOrder } from "./order-failures";

/**
 * What the screens will say when the database refuses a write to the orders
 * (20261120000300_order_taking_orders.sql): each code, each hint that names
 * its own reason, and the ids a refusal names.
 */
afterEach(() => {
  vi.restoreAllMocks();
});

const ID = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";

describe("an order write refused", () => {
  it("reads each code the database raises", () => {
    expect(orderFailureOf({ code: "P0002", message: "" })).toBe("gone");
    expect(orderFailureOf({ code: "42501", message: "" })).toBe("noAccess");
    expect(orderFailureOf({ code: "22023", message: "" })).toBe("invalid");
    expect(orderFailureOf({ code: "23505", message: "" })).toBe("key");
    expect(orderFailureOf({ code: "54000", message: "" })).toBe("tooMany");
    expect(orderFailureOf({ code: "55000", message: "" })).toBe("closed");
  });

  it("reads every hint that says why", () => {
    const cases: [string, string, string][] = [
      ["42501", "off", "off"],
      ["42501", "clock", "clock"],
      ["42501", "stale_shift", "staleShift"],
      ["42501", "sender", "sender"],
      ["42501", "own_department", "ownDepartment"],
      ["42501", "ready", "managersOnly"],
      ["22023", "unavailable", "unavailable"],
      ["22023", "route", "route"],
      ["22023", "choices", "choices"],
      ["22023", "price", "price"],
      ["22023", "allergy", "allergy"],
      ["22023", "place", "place"],
      ["23505", "taken", "taken"],
      ["23505", "key", "key"],
      ["23505", "body", "body"],
      ["55000", "closed", "closed"],
      ["55000", "moved", "moved"],
      ["55000", "held", "held"],
      ["55000", "window", "window"],
      ["55000", "prepared", "prepared"],
      ["55000", "taken_back", "takenBack"],
      ["55000", "cancelled", "cancelled"],
      ["55000", "comped", "comped"],
      ["55000", "served", "served"],
      ["55000", "day", "day"],
      ["55000", "takeaway", "takeaway"],
      ["55000", "not_closed", "notClosed"],
    ];
    for (const [code, hint, failure] of cases) {
      expect(orderFailureOf({ code, message: "", hint }), hint).toBe(failure);
    }
    // A hint of another code says nothing of its own.
    expect(orderFailureOf({ code: "22023", message: "", hint: "clock" })).toBe(
      "invalid",
    );
  });

  it("reads the close's undo's refusals (20261122000100) as the reopen's, its window too", () => {
    const refusal = (code: string, hint: string, details?: string) =>
      orderFailureOf({
        code,
        hint,
        details,
        message:
          "Only whoever closed it takes the close back, within 2 minutes",
      });
    expect(refusal("55000", "window")).toBe("window");
    expect(refusal("55000", "day")).toBe("day");
    expect(refusal("55000", "not_closed")).toBe("notClosed");
    expect(refusal("23505", "taken", ID)).toBe("taken");
    expect(
      takenOrder({ code: "23505", hint: "taken", details: ID, message: "" }),
    ).toBe(ID);
  });

  it("waits for a function the project doesn't have yet", () => {
    expect(orderFailureOf({ code: "PGRST202", message: "" })).toBe("notYet");
    expect(orderFailureOf({ code: "42883", message: "" })).toBe("notYet");
  });

  it("logs anything else, without what was written", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      orderFailureOf(
        { code: "XX000", message: "boom", details: "a note" },
        "a send",
      ),
    ).toBe("failed");
    expect(logged).toHaveBeenCalledWith("a send failed", "boom");
  });

  it("names the items a send was refused for, and the order that holds a place", () => {
    const details = JSON.stringify([ID, OTHER]);
    expect(
      refusedItems({
        code: "22023",
        message: "",
        hint: "unavailable",
        details,
      }),
    ).toEqual([ID, OTHER]);
    expect(
      refusedItems({ code: "22023", message: "", hint: "route", details }),
    ).toEqual([ID, OTHER]);
    expect(
      refusedItems({ code: "22023", message: "", hint: "choices", details }),
    ).toEqual([]);
    expect(
      refusedItems({
        code: "22023",
        message: "",
        hint: "unavailable",
        details: "not json",
      }),
    ).toEqual([]);
    expect(
      takenOrder({ code: "23505", message: "", hint: "taken", details: ID }),
    ).toBe(ID);
    expect(
      takenOrder({ code: "23505", message: "", hint: "key", details: ID }),
    ).toBeNull();
    expect(
      takenOrder({ code: "23505", message: "", hint: "taken", details: "x" }),
    ).toBeNull();
  });
});
