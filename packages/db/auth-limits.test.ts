import { beforeEach, describe, expect, it, vi } from "vitest";

// The counts on sign-in codes as the server reads them, with the database
// stood in for: 0 to go ahead, the seconds to wait, no code waiting for a
// check, or a code sent within the wait for a send; anything else, or a
// failure but a function not there yet, throws.
// Joining clears the counts of a number with no account, by the number only.

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({
  answers: [] as {
    data?: unknown;
    error: { code?: string; message: string } | null;
  }[],
  calls: [] as { name: string; args: Record<string, unknown> }[],
}));
vi.mock("./supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      db.calls.push({ name, args });
      return db.answers.shift() ?? { data: null, error: null };
    },
  }),
}));

const {
  CODE_JUST_SENT,
  forgetAuthAttempt,
  forgetNumberAttempts,
  NO_CODE_WAITING,
  noteAuthAttempt,
} = await import("./auth-limits");

const ATTEMPT = {
  kind: "verify",
  phone: "+972500000003",
  caller: "1.1.1.1",
  at: "2026-11-20T08:00:00.000Z",
} as const;

beforeEach(() => {
  db.answers = [];
  db.calls = [];
});

describe("noteAuthAttempt", () => {
  it("answers 0, the seconds to wait, no code waiting or a code just sent, as the database says", async () => {
    for (const data of [0, 412, -1, -2]) {
      db.answers.push({ data, error: null });
      expect(await noteAuthAttempt(ATTEMPT)).toBe(data);
    }
    expect(NO_CODE_WAITING).toBe(-1);
    expect(CODE_JUST_SENT).toBe(-2);
    expect(db.calls[0]).toEqual({
      name: "note_auth_attempt",
      args: {
        kind: "verify",
        phone: "+972500000003",
        caller: "1.1.1.1",
        at_time: "2026-11-20T08:00:00.000Z",
      },
    });
  });

  it("throws on any other answer", async () => {
    for (const data of [-3, 1.5, "x", null]) {
      db.answers.push({ data, error: null });
      await expect(noteAuthAttempt(ATTEMPT)).rejects.toThrow();
    }
  });

  it("limits nothing before the function reaches a project, and throws on any other failure", async () => {
    db.answers.push({ error: { code: "PGRST202", message: "not found" } });
    expect(await noteAuthAttempt(ATTEMPT)).toBe(0);
    db.answers.push({ error: { code: "57014", message: "timeout" } });
    await expect(noteAuthAttempt(ATTEMPT)).rejects.toThrow(
      "Could not count the attempt",
    );
  });

  it("sends no number or no caller as an empty string", async () => {
    db.answers.push({ data: 0, error: null });
    await noteAuthAttempt({ ...ATTEMPT, phone: null, caller: null });
    expect(db.calls[0]?.args).toMatchObject({ phone: "", caller: "" });
  });
});

describe("forgetAuthAttempt", () => {
  it("gives the try back by the same keys", async () => {
    await forgetAuthAttempt({ ...ATTEMPT, kind: "send" });
    expect(db.calls).toEqual([
      {
        name: "forget_auth_attempt",
        args: {
          kind: "send",
          phone: "+972500000003",
          caller: "1.1.1.1",
          at_time: "2026-11-20T08:00:00.000Z",
        },
      },
    ]);
    await forgetAuthAttempt({ ...ATTEMPT, caller: null });
    expect(db.calls[1]?.args).toMatchObject({ caller: "" });
  });

  it("throws on a failure but a function not there yet", async () => {
    db.answers.push({ error: { code: "PGRST202", message: "not found" } });
    await expect(forgetAuthAttempt(ATTEMPT)).resolves.toBeUndefined();
    db.answers.push({ error: { code: "57014", message: "timeout" } });
    await expect(forgetAuthAttempt(ATTEMPT)).rejects.toThrow(
      "Could not give the attempt back",
    );
  });
});

describe("forgetNumberAttempts", () => {
  it("asks the database by the number alone", async () => {
    await forgetNumberAttempts("+972500000003");
    expect(db.calls).toEqual([
      { name: "forget_number_attempts", args: { phone: "+972500000003" } },
    ]);
  });

  it("clears nothing before the function reaches a project, and throws on any other failure", async () => {
    db.answers.push({ error: { code: "PGRST202", message: "not found" } });
    await expect(
      forgetNumberAttempts("+972500000003"),
    ).resolves.toBeUndefined();
    db.answers.push({ error: { code: "57014", message: "timeout" } });
    await expect(forgetNumberAttempts("+972500000003")).rejects.toThrow(
      "Could not clear the number's attempts",
    );
  });
});
