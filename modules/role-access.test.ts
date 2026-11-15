import {
  ACCESS_AREAS,
  AREA_MODULE,
  accessFromHeld,
  areaPermissions,
  defaultAccess,
  extrasOf,
  matrixByDefault,
} from "@domain/role-access";
import { describe, expect, it } from "vitest";
import { manifestFor, permissions } from "./registry";

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

  // The console reads and writes these keys (R2): each is declared, in its
  // area, never one an owner gives, and their defaults draw today's rules.
  it("name only permissions declared in their own area", () => {
    for (const area of ACCESS_AREAS) {
      for (const key of areaPermissions(area)) {
        const entry = permissions.find((p) => p.key === key);
        expect(entry, `${area}: ${key}`).toBeDefined();
        expect(entry?.area).toBe(area);
        expect(entry?.byOwner).toBe(false);
      }
    }
  });

  it("draw today's rules from the declarations' defaults", () => {
    const matrix = matrixByDefault(permissions, []);
    for (const base of ["manager", "worker"] as const) {
      expect(accessFromHeld((key) => matrix.held[base].has(key))).toEqual(
        defaultAccess(base),
      );
    }
  });

  it("never count pay as a role's default, given or not", () => {
    const matrix = matrixByDefault(permissions, ["worker"]);
    expect(matrix.given.worker.has("clock.payroll")).toBe(true);
    expect(matrix.byDefault.worker.has("clock.payroll")).toBe(false);
    expect(matrix.byDefault.manager.has("clock.payroll")).toBe(false);
    expect(matrix.byDefault.manager.has("schedule.publish")).toBe(true);
  });
});
