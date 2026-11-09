import { describe, expect, it } from "vitest";
import {
  departmentKey,
  departments,
  MAX_DEPARTMENTS,
  newDepartmentKey,
} from "./departments";

describe("departments", () => {
  it("takes a business's departments in order, names trimmed", () => {
    expect(
      departments.parse([
        { key: "kitchen", name: " Kitchen " },
        { key: "bar", name: "Bar" },
      ]),
    ).toEqual([
      { key: "kitchen", name: "Kitchen" },
      { key: "bar", name: "Bar" },
    ]);
    expect(departments.parse([])).toEqual([]);
  });

  it("takes each key once and each name once, case aside", () => {
    expect(
      departments.safeParse([
        { key: "kitchen", name: "Kitchen" },
        { key: "kitchen", name: "Second kitchen" },
      ]).success,
    ).toBe(false);
    expect(
      departments.safeParse([
        { key: "bar", name: "Bar" },
        { key: "bar-2", name: "bar " },
      ]).success,
    ).toBe(false);
  });

  it("refuses more than the database keeps, bad keys and empty names", () => {
    const many = Array.from({ length: MAX_DEPARTMENTS + 1 }, (_, i) => ({
      key: `d${i}`,
      name: `D${i}`,
    }));
    expect(departments.safeParse(many).success).toBe(false);
    expect(departments.safeParse(many.slice(1)).success).toBe(true);
    for (const bad of [
      { key: "Kitchen", name: "Kitchen" },
      { key: "1st", name: "First" },
      { key: "kitchen", name: "   " },
      { key: "kitchen", name: "x".repeat(41) },
      { key: "kitchen", name: "Kitchen", colour: "red" },
    ]) {
      expect(departments.safeParse([bad]).success, JSON.stringify(bad)).toBe(
        false,
      );
    }
  });

  it("makes keys nobody types, that a department keeps", () => {
    const made = newDepartmentKey();
    expect(made).toMatch(/^d-[0-9a-f]{8}$/);
    expect(departmentKey.safeParse(made).success).toBe(true);
    expect(newDepartmentKey()).not.toBe(made);
  });
});
