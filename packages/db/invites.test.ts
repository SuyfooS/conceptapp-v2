import { isInviteToken } from "@domain/invites";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The database as the secret key reaches it: what `rpc` answers, and every
 * call kept, in order.
 */
type Failure = { code?: string; hint?: string | null; message: string };
const db = vi.hoisted(() => ({
  answer: { data: null as unknown, error: null as Failure | null },
  calls: [] as {
    fn: string;
    args: Record<string, unknown>;
    options?: unknown;
  }[],
}));
vi.mock("./supabase/admin", () => ({
  createAdminClient: () => ({
    // Options (a GET, say) are kept too, when a call passes any.
    rpc: async (
      fn: string,
      args: Record<string, unknown>,
      options?: unknown,
    ) => {
      db.calls.push({
        fn,
        args,
        ...(options === undefined ? {} : { options }),
      });
      return db.answer;
    },
  }),
}));

const {
  hashInviteToken,
  issueFirstInviteLink,
  newInviteToken,
  onAnotherStaff,
} = await import("./invites");

const ACTOR = "c5000000-0000-4000-a000-00000000000b";
const INVITE = "c5000000-0000-4000-8000-000000000018";
const PHONE = "+972500007618";

beforeEach(() => {
  db.answer = { data: null, error: null };
  db.calls = [];
});

describe("invite tokens", () => {
  it("are fresh, link-safe tokens", () => {
    const a = newInviteToken();
    const b = newInviteToken();
    expect(isInviteToken(a)).toBe(true);
    expect(a).not.toBe(b);
  });

  it("are stored as the SHA-256 the database expects", () => {
    // echo -n abc | sha256sum
    expect(hashInviteToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(hashInviteToken(newInviteToken())).toMatch(/^[0-9a-f]{64}$/);
  });
});

/**
 * "יצירת קישור" (`public.team_invite_first_link`,
 * 20261128000200_invite_links_pending.sql): the first link of an invite
 * nobody got one for, and its refusals as the screen explains them. "linked"
 * (P0002 with hint `linked`) is read before the rest, since an invite no
 * longer open is P0002 too, with no hint: the first keeps its row on the
 * screen, the second lets it go.
 */
describe("issueFirstInviteLink", () => {
  const refused = (error: Failure) => {
    db.answer = { data: null, error };
    return issueFirstInviteLink(ACTOR, INVITE);
  };

  it("makes the first link, and gives its token and the number to send it to", async () => {
    db.answer = { data: PHONE, error: null };
    const result = await issueFirstInviteLink(ACTOR, INVITE);
    if (!result.ok) throw new Error(`refused: ${result.error}`);
    expect(isInviteToken(result.token)).toBe(true);
    expect(result.phone).toBe(PHONE);
    // The database keeps the token's hash alone.
    expect(db.calls).toEqual([
      {
        fn: "team_invite_first_link",
        args: {
          actor: ACTOR,
          invite: INVITE,
          new_token_hash: hashInviteToken(result.token),
        },
      },
    ]);
  });

  it("says 'linked' when a link was made for it meanwhile", async () => {
    await expect(
      refused({
        code: "P0002",
        hint: "linked",
        message: "The invite has its link already",
      }),
    ).resolves.toEqual({ ok: false, error: "linked" });
  });

  it("says an invite no longer open is not open, never 'linked'", async () => {
    await expect(
      refused({ code: "P0002", hint: null, message: "No open invite" }),
    ).resolves.toEqual({ ok: false, error: "notOpen" });
    await expect(
      refused({ code: "P0002", message: "No open invite" }),
    ).resolves.toEqual({ ok: false, error: "notOpen" });
  });

  it("says the rest of team_invite_link's refusals as the screens explain them", async () => {
    const message = "refused";
    await expect(refused({ code: "42501", message })).resolves.toEqual({
      ok: false,
      error: "notAllowed",
    });
    // A hint of its own is no "linked".
    await expect(
      refused({ code: "42501", hint: "linked", message }),
    ).resolves.toEqual({ ok: false, error: "notAllowed" });
    await expect(
      refused({ code: "42501", hint: "pay", message }),
    ).resolves.toEqual({ ok: false, error: "givesPay" });
    await expect(refused({ code: "55000", message })).resolves.toEqual({
      ok: false,
      error: "demo",
    });
    await expect(
      refused({ code: "22023", hint: "archived", message }),
    ).resolves.toEqual({ ok: false, error: "roleGone" });
  });

  it("throws on anything else", async () => {
    await expect(
      refused({ code: "08006", message: "connection failure" }),
    ).rejects.toThrow(
      "Could not issue a first invite link: connection failure",
    );
  });
});

/**
 * The new-business wizard asks which of its list's numbers are on a staff
 * already (`public.admin_staff_elsewhere`, inviting from a list, part 6):
 * the numbers in the call's body, never in a GET's address, and only those
 * in a staff role, each once.
 */
describe("onAnotherStaff", () => {
  const OWNER = "+972500006501";
  const WORKER = "+972500006502";
  const BOOKS = "+972500006503";
  const entries = [
    { phone: OWNER, role: "owner" as const },
    { phone: WORKER, role: "worker" as const },
    { phone: BOOKS, role: "accountant" as const },
    { phone: OWNER, role: "owner" as const },
  ];

  it("sends the staff roles' numbers, each once, in the body of one call", async () => {
    db.answer = { data: [WORKER], error: null };
    await expect(onAnotherStaff(ACTOR, entries)).resolves.toEqual([WORKER]);
    // No options: supabase-js sends an rpc as a POST, its arguments the body.
    expect(db.calls).toEqual([
      {
        fn: "admin_staff_elsewhere",
        args: { actor: ACTOR, phones: [OWNER, WORKER] },
      },
    ]);
  });

  it("answers in the list's order, whatever order the database gives", async () => {
    db.answer = { data: [WORKER, OWNER], error: null };
    await expect(onAnotherStaff(ACTOR, entries)).resolves.toEqual([
      OWNER,
      WORKER,
    ]);
  });

  it("asks nothing for a list with no one in a staff role", async () => {
    await expect(
      onAnotherStaff(ACTOR, [{ phone: BOOKS, role: "accountant" }]),
    ).resolves.toEqual([]);
    await expect(onAnotherStaff(ACTOR, [])).resolves.toEqual([]);
    expect(db.calls).toEqual([]);
  });

  it("finds none before the function reaches a project, and asks no other way", async () => {
    for (const code of ["PGRST202", "42883"]) {
      db.answer = { data: null, error: { code, message: "missing" } };
      await expect(onAnotherStaff(ACTOR, entries)).resolves.toEqual([]);
    }
    expect(db.calls.map((call) => call.fn)).toEqual([
      "admin_staff_elsewhere",
      "admin_staff_elsewhere",
    ]);
  });

  it("throws on a refusal, with no number in its words", async () => {
    db.answer = {
      data: null,
      error: { code: "42501", message: "Platform staff only" },
    };
    const thrown = await onAnotherStaff(ACTOR, entries).catch(
      (error: unknown) => error,
    );
    expect(thrown).toBeInstanceOf(Error);
    const { message } = thrown as Error;
    expect(message).toBe(
      "Could not ask about other staffs: Platform staff only",
    );
    expect(message).not.toMatch(/\d{7}/);
  });

  it("refuses an answer that isn't a list of numbers", async () => {
    db.answer = { data: [{ phone: WORKER }], error: null };
    await expect(onAnotherStaff(ACTOR, entries)).rejects.toThrow();
  });
});
