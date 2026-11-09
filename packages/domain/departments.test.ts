import { describe, expect, it } from "vitest";
import {
  departmentKey,
  departments,
  departmentsOf,
  MAX_DEPARTMENTS,
  newDepartmentKey,
} from "./departments";
import { holdsList } from "./lists";

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

  it("says which departments a person is in, removed ones only when asked", () => {
    const all = [
      { id: "kitchen", archivedAt: null, members: ["noa", "itay"] },
      { id: "bar", archivedAt: null, members: ["yoav"] },
      {
        id: "old-floor",
        archivedAt: "2026-11-09T08:00:00.000Z",
        members: ["noa"],
      },
    ];
    expect(departmentsOf(all, "noa", { live: true })).toEqual(["kitchen"]);
    expect(departmentsOf(all, "noa", { live: false })).toEqual([
      "kitchen",
      "old-floor",
    ]);
    expect(departmentsOf(all, "dana", { live: false })).toEqual([]);
    // A list the removed floor already holds stays Noa's to fill.
    expect(
      holdsList(
        { kind: "department", department: "old-floor" },
        {
          userId: "noa",
          role: "worker",
          departments: departmentsOf(all, "noa", { live: false }),
        },
      ),
    ).toBe(true);
  });
});
