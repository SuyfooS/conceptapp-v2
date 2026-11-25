import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The console's read of one business (`public.admin_business`) with the
 * database stood in for: an invite nobody got a link for yet comes as
 * 'invited' with `link_pending` (20261128000200_invite_links_pending.sql),
 * one of the three statuses the code before it reads, and is read here as
 * `pending`; a database before that migration sends no `link_pending`.
 */
const db = vi.hoisted(() => ({
  answer: { data: null as unknown, error: null as unknown },
  calls: [] as { fn: string; args: Record<string, unknown> }[],
}));

vi.mock("./supabase/server", () => ({
  createClient: async () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      db.calls.push({ fn, args });
      return db.answer;
    },
  }),
}));
vi.mock("./supabase/admin", () => ({ createAdminClient: () => ({}) }));

const { getBusinessSetup } = await import("./admin");

const BUSINESS = {
  id: "7a000000-0000-4000-a000-000000000001",
  slug: "setup-cafe",
  name: "Setup Cafe",
  accent: "#0f766e",
  address: null,
  template_key: "cafe-bar",
  created_at: "2026-11-26T08:00:00+00:00",
};

const invite = (n: number) => `7a000000-0000-4000-b000-00000000000${n}`;

beforeEach(() => {
  db.answer = { data: null, error: null };
  db.calls = [];
});

describe("getBusinessSetup", () => {
  it("reads an invite waiting for its link as pending, whatever its date", async () => {
    db.answer = {
      data: {
        ...BUSINESS,
        people: [
          {
            name: "Ronit",
            phone: "+972500000611",
            role: "owner",
            status: "member",
            invite_id: null,
            expires_at: null,
            link_pending: false,
          },
          {
            name: "Shai",
            phone: "+972500000612",
            role: "worker",
            status: "invited",
            invite_id: invite(1),
            expires_at: "2026-11-01T08:00:00+00:00",
            link_pending: true,
          },
          {
            name: "Dana",
            phone: "+972500000613",
            role: "worker",
            status: "invited",
            invite_id: invite(2),
            expires_at: "2026-12-08T08:00:00+00:00",
            link_pending: false,
          },
          {
            name: "Tal",
            phone: "+972500000614",
            role: "manager",
            status: "expired",
            invite_id: invite(3),
            expires_at: "2026-11-01T08:00:00+00:00",
            link_pending: false,
          },
        ],
      },
      error: null,
    };
    const setup = await getBusinessSetup("setup-cafe");
    expect(db.calls).toEqual([
      { fn: "admin_business", args: { business_slug: "setup-cafe" } },
    ]);
    expect(setup?.people.map((p) => [p.name, p.status, p.inviteId])).toEqual([
      ["Ronit", "member", null],
      ["Shai", "pending", invite(1)],
      ["Dana", "invited", invite(2)],
      ["Tal", "expired", invite(3)],
    ]);
    // The key is the database's: nothing else carries it on.
    expect(setup?.people[1]).not.toHaveProperty("link_pending");
  });

  it("reads a database from before the column as before", async () => {
    db.answer = {
      data: {
        ...BUSINESS,
        people: [
          {
            name: "Shai",
            phone: "+972500000612",
            role: "worker",
            status: "invited",
            invite_id: invite(1),
            expires_at: "2026-12-08T08:00:00+00:00",
          },
          {
            name: "Tal",
            phone: "+972500000614",
            role: "manager",
            status: "expired",
            invite_id: invite(3),
            expires_at: "2026-11-01T08:00:00+00:00",
          },
        ],
      },
      error: null,
    };
    const setup = await getBusinessSetup("setup-cafe");
    expect(setup?.people.map((p) => p.status)).toEqual(["invited", "expired"]);
  });

  it("reads an unknown slug as null", async () => {
    expect(await getBusinessSetup("no-such-business")).toBeNull();
  });
});
