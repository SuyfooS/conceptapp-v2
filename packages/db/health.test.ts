import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The one question /health/db asks the database (`public.ping()`), with the
// client of the publishable key and no session stood in for: true when it
// answered true, or answered that the function isn't there yet (its API
// answering, before Migrate brings the migration); false for any other
// answer or error, after 5 seconds, without the two public settings, and
// when anything throws, never throwing itself. An answer is kept a minute,
// and nothing else is: a request after none asks again. Requests that come
// while it is on its way wait for the same one.

vi.mock("server-only", () => ({}));

type Answer = { data?: unknown; error?: { code?: string; message: string } };

const db = vi.hoisted(() => ({
  answers: [] as (Answer | Error | Promise<Answer>)[],
  calls: [] as { name: string; args: unknown[]; signal?: AbortSignal }[],
  clients: 0,
}));
vi.mock("./supabase/detached", () => ({
  createDetachedClient: () => {
    db.clients++;
    return {
      rpc: (name: string, ...args: unknown[]) => {
        const call: (typeof db.calls)[number] = { name, args };
        db.calls.push(call);
        return {
          abortSignal(signal: AbortSignal) {
            call.signal = signal;
            const next = db.answers.shift() ?? { data: true };
            return next instanceof Error
              ? Promise.reject(next)
              : Promise.resolve(next);
          },
        };
      },
    };
  },
}));

const URL_SETTING = "https://abcdefgh.supabase.co";
const KEY_SETTING = "sb_publishable_health_test_value";

async function load() {
  vi.resetModules();
  return import("./health");
}

beforeEach(() => {
  db.answers = [];
  db.calls = [];
  db.clients = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-28T07:22:00.000Z"));
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL_SETTING);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", KEY_SETTING);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("databaseAnswers", () => {
  it("asks public.ping, with no argument and a 5-second limit", async () => {
    const { databaseAnswers, PING_TIMEOUT_MS } = await load();
    const timeout = vi.spyOn(AbortSignal, "timeout");
    expect(await databaseAnswers()).toBe(true);
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0]?.name).toBe("ping");
    expect(db.calls[0]?.args).toEqual([]);
    // The signal the question carries is the one of a 5-second timeout.
    expect(timeout).toHaveBeenCalledTimes(1);
    expect(timeout).toHaveBeenCalledWith(5_000);
    expect(db.calls[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(db.calls[0]?.signal).toBe(timeout.mock.results[0]?.value);
    expect(PING_TIMEOUT_MS).toBe(5_000);
  });

  it("answers true only for true", async () => {
    for (const data of [true, false, null, "true", 1, { ok: true }]) {
      const { databaseAnswers } = await load();
      db.answers.push({ data });
      expect(await databaseAnswers(), String(data)).toBe(data === true);
    }
  });

  it("takes a project the migration hasn't reached yet as its API answering", async () => {
    for (const code of ["PGRST202", "42883"]) {
      const { databaseAnswers } = await load();
      db.answers.push({ error: { code, message: "Could not find" } });
      expect(await databaseAnswers(), code).toBe(true);
    }
  });

  it("answers false for any other error, a thrown one, or one that took too long", async () => {
    const errors: (Answer | Error)[] = [
      { error: { code: "PGRST001", message: "Database client error" } },
      { error: { code: "PGRST002", message: "Could not query the schema" } },
      { error: { code: "42501", message: "permission denied" } },
      { error: { code: "", message: "TypeError: fetch failed" } },
      { error: { message: "AbortError: This operation was aborted" } },
      new TypeError("fetch failed"),
      Object.assign(new Error("timed out"), { name: "TimeoutError" }),
    ];
    for (const answer of errors) {
      const { databaseAnswers } = await load();
      db.answers.push(answer);
      expect(await databaseAnswers()).toBe(false);
    }
  });

  it("answers false without the two public settings, asking nothing", async () => {
    for (const name of [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ]) {
      const { databaseAnswers } = await load();
      vi.stubEnv(name, "");
      expect(await databaseAnswers(), name).toBe(false);
      vi.stubEnv(name, name.endsWith("URL") ? URL_SETTING : KEY_SETTING);
    }
    expect(db.calls).toHaveLength(0);
    expect(db.clients).toBe(0);
  });

  it("keeps an answer a minute, then asks again", async () => {
    const { databaseAnswers, KEEP_ANSWER_MS } = await load();
    expect(KEEP_ANSWER_MS).toBe(60_000);
    expect(await databaseAnswers()).toBe(true);
    vi.setSystemTime(Date.now() + 30_000);
    expect(await databaseAnswers()).toBe(true);
    vi.setSystemTime(Date.now() + 29_999);
    expect(await databaseAnswers()).toBe(true);
    expect(db.calls).toHaveLength(1);
    vi.setSystemTime(Date.now() + 1);
    db.answers.push({ error: { code: "PGRST001", message: "down" } });
    expect(await databaseAnswers()).toBe(false);
    expect(db.calls).toHaveLength(2);
  });

  it("keeps no failure: the next request asks again, and sees it come back", async () => {
    const { databaseAnswers } = await load();
    db.answers.push(new TypeError("fetch failed"), { data: true });
    expect(await databaseAnswers()).toBe(false);
    vi.setSystemTime(Date.now() + 1_000);
    expect(await databaseAnswers()).toBe(true);
    vi.setSystemTime(Date.now() + 1_000);
    expect(await databaseAnswers()).toBe(true);
    expect(db.calls).toHaveLength(2);
  });

  it("asks once for the requests that come while the question is on its way", async () => {
    const { databaseAnswers } = await load();
    let release: (answer: Answer) => void = () => {};
    db.answers.push(
      new Promise<Answer>((resolve) => {
        release = resolve;
      }),
    );
    const waiting = [databaseAnswers(), databaseAnswers(), databaseAnswers()];
    expect(db.calls).toHaveLength(1);
    release({ error: { code: "PGRST001", message: "down" } });
    expect(await Promise.all(waiting)).toEqual([false, false, false]);
    // Once it came back with none, the next asks again.
    expect(await databaseAnswers()).toBe(true);
    expect(db.calls).toHaveLength(2);
  });

  it("doesn't take a kept answer from a clock that went back", async () => {
    const { databaseAnswers } = await load();
    expect(await databaseAnswers()).toBe(true);
    vi.setSystemTime(Date.now() - 1_000);
    expect(await databaseAnswers()).toBe(true);
    expect(db.calls).toHaveLength(2);
  });
});
