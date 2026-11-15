import { describe, expect, it } from "vitest";
import { type AppT, nameOf, type ShiftData } from "./shift-text";

// The key a sentence is read by stands for its words here.
const t = ((key: string) => `«${key}»`) as unknown as AppT;

const people = [
  { userId: "noa", name: "נועה כהן" },
  { userId: "omer", name: null },
] as unknown as ShiftData["people"];

// Who is on a shift, as the boards and the builder name them (Orel,
// 14 November 2026): someone taken off the team keeps the past shifts they
// worked, and nobody reads their name now.
describe("nameOf", () => {
  it("names someone on the team, or says they have no name", () => {
    expect(nameOf(t, { people }, "noa")).toBe("נועה כהן");
    expect(nameOf(t, { people }, "omer")).toBe("«shifts.noName»");
  });

  it("says someone the team no longer has is no longer on it", () => {
    expect(nameOf(t, { people }, "gone")).toBe("«shifts.former»");
  });

  it("says no name when there is nobody", () => {
    expect(nameOf(t, { people }, null)).toBe("«shifts.noName»");
  });
});
