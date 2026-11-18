import { describe, expect, it } from "vitest";
import { ROLES } from "./modules";
import {
  hasStaff,
  isSetupStaff,
  SETUP_STAFF_ROLES,
  setupChecklist,
  setupRemaining,
} from "./setup";

const none = { owner: 0, manager: 0, worker: 0 };

describe("setupChecklist", () => {
  it("leaves everything but the opening for a bare business", () => {
    const items = setupChecklist({ people: none, hasAddress: false });
    expect(items).toEqual([
      { key: "opened", done: true },
      { key: "owner", done: false },
      { key: "staff", done: false },
      { key: "address", done: false },
    ]);
    expect(setupRemaining(items)).toBe(3);
  });

  it("counts an owner apart from the rest of the staff", () => {
    const ownerOnly = setupChecklist({
      people: { ...none, owner: 1 },
      hasAddress: true,
    });
    expect(ownerOnly.filter((i) => !i.done).map((i) => i.key)).toEqual([
      "staff",
    ]);
    const staffOnly = setupChecklist({
      people: { ...none, manager: 1 },
      hasAddress: true,
    });
    expect(staffOnly.filter((i) => !i.done).map((i) => i.key)).toEqual([
      "owner",
    ]);
  });

  it("is complete with an owner, staff and an address", () => {
    const items = setupChecklist({
      people: { owner: 1, manager: 0, worker: 3 },
      hasAddress: true,
    });
    expect(setupRemaining(items)).toBe(0);
  });
});

describe("hasStaff", () => {
  it("counts managers and workers, never owners or accountants", () => {
    expect(SETUP_STAFF_ROLES).toEqual(["manager", "worker"]);
    expect(ROLES.filter(isSetupStaff)).toEqual(["manager", "worker"]);
    expect(hasStaff({ manager: 0, worker: 0 })).toBe(false);
    expect(hasStaff({ manager: 1, worker: 0 })).toBe(true);
    expect(hasStaff({ manager: 0, worker: 2 })).toBe(true);
  });

  it("is what the checklist's staff item says", () => {
    for (const people of [
      none,
      { ...none, owner: 2 },
      { ...none, manager: 1 },
      { ...none, worker: 1 },
    ]) {
      const staff = setupChecklist({ people, hasAddress: false }).find(
        (item) => item.key === "staff",
      );
      expect(staff?.done).toBe(hasStaff(people));
    }
  });
});
