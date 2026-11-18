import { afterEach, describe, expect, it, vi } from "vitest";
import { menuFailureOf } from "./menu-failures";

/**
 * What the screens will say when the database refuses a write to the menu or
 * the places (20261117000500_order_taking_menu.sql): each code, and each
 * hint that names its own reason.
 */
afterEach(() => {
  vi.restoreAllMocks();
});

describe("a menu write refused", () => {
  it("reads each code the database raises", () => {
    expect(menuFailureOf({ code: "42501", message: "" })).toBe("noAccess");
    expect(menuFailureOf({ code: "P0002", message: "" })).toBe("gone");
    expect(menuFailureOf({ code: "22023", message: "" })).toBe("invalid");
    expect(menuFailureOf({ code: "23505", message: "" })).toBe("taken");
    expect(menuFailureOf({ code: "40001", message: "" })).toBe("changed");
    expect(menuFailureOf({ code: "54000", message: "" })).toBe("tooMany");
    expect(menuFailureOf({ code: "55000", message: "" })).toBe("archived");
  });

  it("reads the hints that say why", () => {
    expect(menuFailureOf({ code: "42501", message: "", hint: "off" })).toBe(
      "off",
    );
    expect(menuFailureOf({ code: "22023", message: "", hint: "route" })).toBe(
      "route",
    );
    expect(
      menuFailureOf({ code: "22023", message: "", hint: "category" }),
    ).toBe("category");
    expect(menuFailureOf({ code: "22023", message: "", hint: "choices" })).toBe(
      "choices",
    );
    expect(
      menuFailureOf({ code: "55000", message: "", hint: "archived" }),
    ).toBe("archived");
    expect(
      menuFailureOf({ code: "55000", message: "", hint: "category" }),
    ).toBe("categoryRemoved");
  });

  it("waits for a function the project doesn't have yet", () => {
    expect(menuFailureOf({ code: "PGRST202", message: "" })).toBe("notYet");
    expect(menuFailureOf({ code: "42883", message: "" })).toBe("notYet");
  });

  it("logs anything else, without what was written", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(menuFailureOf({ code: "XX000", message: "boom" }, "an import")).toBe(
      "failed",
    );
    expect(logged).toHaveBeenCalledWith("an import failed", "boom");
  });
});
