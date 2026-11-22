import type { ModuleRow } from "@domain/modules";
import { describe, expect, it } from "vitest";
import { landingAfterJoin } from "./landing";

// Where someone lands once they joined a business (H5b): their hiring
// file's welcome, or Today.

const on: ModuleRow[] = [
  { key: "scheduling", enabled: true, settings: {} },
  { key: "employee_files", enabled: true, settings: {} },
];
const off: ModuleRow[] = [
  { key: "scheduling", enabled: true, settings: {} },
  { key: "employee_files", enabled: false, settings: {} },
];

describe("landing after joining", () => {
  it("opens the file's welcome for a worker or a manager while the business uses it", () => {
    expect(landingAfterJoin(on, "worker")).toBe("/me/file");
    expect(landingAfterJoin(on, "manager")).toBe("/me/file");
  });

  it("opens Today for an owner and an accountant", () => {
    expect(landingAfterJoin(on, "owner")).toBe("/home");
    expect(landingAfterJoin(on, "accountant")).toBe("/home");
  });

  it("opens Today with the file off, or with nothing read", () => {
    expect(landingAfterJoin(off, "worker")).toBe("/home");
    expect(landingAfterJoin([], "worker")).toBe("/home");
  });
});
