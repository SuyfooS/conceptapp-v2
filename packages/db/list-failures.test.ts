import { afterEach, describe, expect, it, vi } from "vitest";
import { itemFailureOf, listFailureOf } from "./list-failures";

/**
 * What the screens say when the database refuses a lists write, a fix of a
 * closed list's too (L6b-1, 20261116000300_lists_fix.sql).
 */
afterEach(() => {
  vi.restoreAllMocks();
});

describe("a lists write refused", () => {
  it("reads each code the database raises", () => {
    expect(listFailureOf({ code: "42501", message: "" })).toBe("noAccess");
    expect(listFailureOf({ code: "P0002", message: "" })).toBe("noAccess");
    expect(listFailureOf({ code: "22023", message: "" })).toBe("invalid");
    expect(listFailureOf({ code: "23514", message: "" })).toBe("left");
    expect(listFailureOf({ code: "40001", message: "" })).toBe("changed");
    expect(listFailureOf({ code: "55000", message: "" })).toBe("finished");
  });

  it("waits for a function the project doesn't have yet", () => {
    expect(listFailureOf({ code: "PGRST202", message: "" })).toBe("notYet");
    expect(listFailureOf({ code: "42883", message: "" })).toBe("notYet");
  });

  it("logs anything else, without what was written", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(listFailureOf({ code: "XX000", message: "boom" }, "a fix")).toBe(
      "failed",
    );
    expect(logged).toHaveBeenCalledWith("a fix failed", "boom");
  });
});

describe("an item's save refused", () => {
  it("is as any lists write while filling", () => {
    expect(itemFailureOf({ code: "55000", message: "" }, false)).toBe(
      "finished",
    );
    expect(itemFailureOf({ code: "42501", message: "" }, false)).toBe(
      "noAccess",
    );
  });

  it("says the list opened again when a fix finds it open", () => {
    expect(itemFailureOf({ code: "55000", message: "" }, true)).toBe(
      "reopened",
    );
  });

  it("keeps a required item of a closed list from being emptied", () => {
    const required = {
      code: "23514",
      message: "A required item of a finished list is changed, never emptied",
      hint: "required",
    };
    expect(itemFailureOf(required, true)).toBe("keepRequired");
    // Another 23514 is the list's required items, as before.
    expect(itemFailureOf({ code: "23514", message: "" }, true)).toBe("left");
    expect(
      itemFailureOf({ code: "23514", message: "", hint: null }, false),
    ).toBe("left");
  });

  // L6b-2 (20261116000400_lists_fix_switch.sql): someone given "תיקון
  // רשימות שנסגרו" past the business's window.
  it("says the time to fix is over, apart from any other refusal", () => {
    const over = {
      code: "42501",
      message: "The time to fix the list is over",
      hint: "fix_window",
    };
    expect(itemFailureOf(over, true)).toBe("fixOver");
    expect(itemFailureOf(over, true, "a list photo write")).toBe("fixOver");
    // Refused otherwise, a fix is one they can no longer make.
    expect(itemFailureOf({ code: "42501", message: "" }, true)).toBe(
      "fixNoAccess",
    );
    expect(
      itemFailureOf({ code: "42501", message: "", hint: null }, true),
    ).toBe("fixNoAccess");
    // The hint belongs to 42501 alone.
    expect(
      itemFailureOf({ code: "55000", message: "", hint: "fix_window" }, true),
    ).toBe("reopened");
  });

  it("says a fix refused as not theirs is one they can no longer make", () => {
    // The switch or running the lists taken away, the list moved to another
    // department (42501 without the hint), or they left the business (P0002).
    expect(itemFailureOf({ code: "42501", message: "" }, true)).toBe(
      "fixNoAccess",
    );
    expect(itemFailureOf({ code: "P0002", message: "" }, true)).toBe(
      "fixNoAccess",
    );
    expect(
      itemFailureOf({ code: "42501", message: "" }, true, "a list photo write"),
    ).toBe("fixNoAccess");
    // Filling, the list is no longer theirs, as before.
    expect(itemFailureOf({ code: "42501", message: "" }, false)).toBe(
      "noAccess",
    );
    expect(itemFailureOf({ code: "P0002", message: "" }, false)).toBe(
      "noAccess",
    );
    // Any other refusal of a fix stays what it is.
    expect(itemFailureOf({ code: "40001", message: "" }, true)).toBe("changed");
    expect(itemFailureOf({ code: "22023", message: "" }, true)).toBe("invalid");
  });

  it("waits for the fix's own functions before its migration", () => {
    expect(itemFailureOf({ code: "PGRST202", message: "" }, true)).toBe(
      "notYet",
    );
  });
});
