import { PLATFORM_ROLES } from "@domain/platform";
import { describe, expect, it } from "vitest";
import { Constants } from "./database.types";

describe("platform roles", () => {
  it("match the database enum", () => {
    expect([...PLATFORM_ROLES]).toEqual([
      ...Constants.public.Enums.platform_role,
    ]);
  });
});
