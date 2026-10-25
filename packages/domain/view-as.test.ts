import { describe, expect, it } from "vitest";
import { canWrite, parseViewAsRole, VIEW_AS_ROLES } from "./view-as";

describe("parseViewAsRole", () => {
  it.each(VIEW_AS_ROLES)("accepts %s", (role) => {
    expect(parseViewAsRole(role)).toBe(role);
  });

  it.each(["", "admin", "platform_admin", "Owner", null, undefined, 3])(
    "refuses %s",
    (value) => {
      expect(parseViewAsRole(value)).toBeNull();
    },
  );
});

describe("canWrite", () => {
  it("allows writes outside a view session", () => {
    expect(canWrite(null)).toBe(true);
  });

  it.each(VIEW_AS_ROLES)("refuses writes while viewing as %s", (role) => {
    expect(canWrite({ role, businessSlug: "demo-restaurant" })).toBe(false);
  });
});
