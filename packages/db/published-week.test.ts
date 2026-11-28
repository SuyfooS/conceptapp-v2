import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Whether a business ever published a week, read two ways: under the
 * person's session (the owner's first steps on Today) and with the secret
 * key (the console's checklist, closing the pilot, PR 16). Each client keeps
 * what it was asked, and the answers come in turn.
 */
const db = vi.hoisted(() => {
  type Answer = {
    data: { id: string }[] | null;
    error: { code?: string; message: string } | null;
  };
  const state = {
    asked: [] as { client: "admin" | "session"; call: unknown[] }[],
    answers: [] as Answer[],
    client: (name: "admin" | "session") => ({
      from: (table: string) => {
        state.asked.push({ client: name, call: ["from", table] });
        const query = {
          select: (...args: unknown[]) => {
            state.asked.push({ client: name, call: ["select", ...args] });
            return query;
          },
          eq: (...args: unknown[]) => {
            state.asked.push({ client: name, call: ["eq", ...args] });
            return query;
          },
          not: (...args: unknown[]) => {
            state.asked.push({ client: name, call: ["not", ...args] });
            return query;
          },
          limit: async (...args: unknown[]) => {
            state.asked.push({ client: name, call: ["limit", ...args] });
            return state.answers.shift() ?? { data: [], error: null };
          },
        };
        return query;
      },
    }),
  };
  return state;
});
vi.mock("./supabase/admin", () => ({
  createAdminClient: () => db.client("admin"),
}));
vi.mock("./supabase/server", () => ({
  createClient: async () => db.client("session"),
}));

const { hasPublishedWeek, hasPublishedWeekForTeam } = await import(
  "./schedule"
);

const BUSINESS = "00000000-0000-4000-b000-000000000001";

const read = (client: "admin" | "session") => [
  { client, call: ["from", "schedule_weeks"] },
  { client, call: ["select", "id"] },
  { client, call: ["eq", "business_id", BUSINESS] },
  { client, call: ["not", "schedule_published_at", "is", null] },
  { client, call: ["limit", 1] },
];

beforeEach(() => {
  db.asked = [];
  db.answers = [];
});

describe("a week ever published", () => {
  it("is read for the console with the secret key, as Today reads it", async () => {
    db.answers = [{ data: [{ id: "week" }], error: null }];
    expect(await hasPublishedWeekForTeam(BUSINESS)).toBe(true);
    expect(db.asked).toEqual(read("admin"));
  });

  it("is none while no week was published", async () => {
    db.answers = [{ data: [], error: null }];
    expect(await hasPublishedWeekForTeam(BUSINESS)).toBe(false);
  });

  it("is read for Today under the person's session", async () => {
    db.answers = [{ data: [{ id: "week" }], error: null }];
    expect(await hasPublishedWeek(BUSINESS)).toBe(true);
    expect(db.asked).toEqual(read("session"));
  });

  it("throws what the database refuses", async () => {
    db.answers = [
      { data: null, error: { code: "57014", message: "canceled" } },
    ];
    await expect(hasPublishedWeekForTeam(BUSINESS)).rejects.toMatchObject({
      code: "57014",
    });
  });
});
