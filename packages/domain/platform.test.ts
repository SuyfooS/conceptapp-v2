import { describe, expect, it } from "vitest";
import { PLATFORM_ACTIONS, platformCan } from "./platform";

describe("platformCan", () => {
  it("lets a platform admin do everything", () => {
    for (const action of PLATFORM_ACTIONS) {
      expect(platformCan("platform_admin", action)).toBe(true);
    }
  });

  it.each([
    "businesses.read",
    "businesses.create",
    "businesses.edit",
    "businesses.view_as",
    "staff.invite",
  ] as const)("lets an onboarder %s", (action) => {
    expect(platformCan("onboarder", action)).toBe(true);
  });

  it.each(["businesses.delete", "templates.edit", "billing.manage"] as const)(
    "does not let an onboarder %s",
    (action) => {
      expect(platformCan("onboarder", action)).toBe(false);
    },
  );

  it("lets someone off the team do nothing", () => {
    for (const action of PLATFORM_ACTIONS) {
      expect(platformCan(null, action)).toBe(false);
    }
  });
});
