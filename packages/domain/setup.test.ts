import { describe, expect, it } from "vitest";
import { setupChecklist, setupRemaining } from "./setup";

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
