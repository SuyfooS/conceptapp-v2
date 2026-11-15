import { ACCESS_AREAS, AREA_MODULE, extrasOf } from "@domain/role-access";
import { describe, expect, it } from "vitest";
import { manifestFor } from "./registry";

// The roles screen's switches are permissions the modules already declare
// (roles plan, Orel's answers of 15 November 2026): each one belongs to the
// module of the area it sits in, and is held by managers today, which is why
// it starts on under edit.
describe("role access areas", () => {
  it("put each switch in the module that declares it", () => {
    for (const area of ACCESS_AREAS) {
      const module = AREA_MODULE[area];
      if (!module) {
        expect(extrasOf(area)).toEqual([]);
        continue;
      }
      const declared = manifestFor(module).permissions;
      for (const extra of extrasOf(area)) {
        const permission = declared.find((p) => p.key === extra);
        expect(permission, `${area}: ${extra}`).toBeDefined();
        expect(permission?.defaultRole).toBe("manager");
        expect(permission?.byOwner).toBeUndefined();
      }
    }
  });
});
