import { beforeEach, describe, expect, it, vi } from "vitest";

// The demo's sample availability as the door asks for it, with the database
// stood in for: how many answers it wrote, none while the function isn't on
// the project yet (the deploy comes before Migrate), and any other failure
// thrown for the door to log.

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({
  answers: [] as {
    data?: unknown;
    error: { code?: string; message: string } | null;
  }[],
  calls: [] as { name: string; args: unknown }[],
}));
vi.mock("./supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (name: string, args?: unknown) => {
      db.calls.push({ name, args });
      return db.answers.shift() ?? { data: null, error: null };
    },
  }),
}));

const { renewDemoAvailability } = await import("./demo");

beforeEach(() => {
  db.answers = [];
  db.calls = [];
});

describe("renewDemoAvailability", () => {
  it("asks the database once, with nothing, and answers how many it wrote", async () => {
    for (const data of [3, 0]) {
      db.answers.push({ data, error: null });
      expect(await renewDemoAvailability()).toBe(data);
    }
    expect(db.calls).toEqual([
      { name: "renew_demo_availability", args: undefined },
      { name: "renew_demo_availability", args: undefined },
    ]);
  });

  it("writes none before its migration reaches the project", async () => {
    for (const code of ["PGRST202", "42883"]) {
      db.answers.push({ error: { code, message: "no such function" } });
      expect(await renewDemoAvailability()).toBe(0);
    }
  });

  it("throws any other failure, for the door to log", async () => {
    db.answers.push({
      error: { code: "22023", message: "Ranges on the same day overlap" },
    });
    await expect(renewDemoAvailability()).rejects.toMatchObject({
      code: "22023",
    });
  });
});
