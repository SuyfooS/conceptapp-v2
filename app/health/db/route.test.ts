import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// GET and HEAD /health/db, for the uptime check: 200 when the database
// answers (`public.ping()` through @db/health, the client of the publishable
// key and no session stood in for here), 503 when it doesn't, each at
// request time (after `connection()`), never kept by a browser or a CDN, out
// of search, with no cookie, and nothing in the body but its status: no word
// of the database, a key, an error or a host, whatever went wrong. An answer
// is kept a minute in the server's memory, so the database is asked once a
// minute at most however often the address is; a failure is not kept.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  answers: [] as unknown[],
  asked: 0,
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: mocks.connection,
}));
vi.mock("@db/supabase/detached", () => ({
  createDetachedClient: () => ({
    rpc: () => ({
      abortSignal: () => {
        mocks.asked++;
        const next = mocks.answers.shift() ?? { data: true, error: null };
        return next instanceof Error
          ? Promise.reject(next)
          : Promise.resolve(next);
      },
    }),
  }),
}));

const SUPABASE_URL = "https://abcdefghsecretref.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_health_db_test_value";

/** What a database that is down says, with every detail a leak would carry. */
const DOWN = {
  data: null,
  error: {
    code: "PGRST001",
    message:
      "Database client error. Retrying the connection to abcdefghsecretref.pooler.supabase.com:5432 with sb_secret_from_an_error",
    details: "connection refused 10.0.0.12",
    hint: null,
  },
};

async function route() {
  vi.resetModules();
  return import("./route");
}

beforeEach(() => {
  mocks.connection.mockReset().mockResolvedValue(undefined);
  mocks.answers = [];
  mocks.asked = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-28T05:07:00.000Z"));
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE_KEY);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

/** The headers every answer carries, 200 or 503. */
function expectHeaders(response: Response) {
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  expect(response.headers.get("set-cookie")).toBeNull();
}

describe("/health/db", () => {
  it("answers 200 with its status alone when the database answers", async () => {
    const { GET } = await route();
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expectHeaders(response);
    expect(await response.text()).toBe('{"status":"ok"}');
    expect(mocks.asked).toBe(1);
  });

  it("answers 503 with its status alone when it doesn't, naming nothing", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_health_db_test_value");
    vi.stubEnv("CRON_SECRET", "cron-secret-health-db-test-value");
    for (const failure of [
      DOWN,
      new TypeError(`fetch failed ${SUPABASE_URL}`),
    ]) {
      const { GET } = await route();
      mocks.answers.push(failure);
      const response = await GET();
      expect(response.status).toBe(503);
      expect(response.headers.get("content-type")).toMatch(
        /^application\/json/,
      );
      expectHeaders(response);
      const body = await response.text();
      expect(body).toBe('{"status":"unavailable"}');
      for (const leak of [
        "abcdefgh",
        "supabase",
        "sb_",
        "PGRST",
        "5432",
        "10.0.0",
        "cron",
        "fetch",
        "error",
        "database",
      ]) {
        expect(body.toLowerCase(), leak).not.toContain(leak);
      }
      const named = [...response.headers.values()].join(" ");
      expect(named).not.toContain("abcdefgh");
      expect(named).not.toContain("sb_");
    }
  });

  it("answers 503 without the Supabase settings, asking nothing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const { GET } = await route();
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('{"status":"unavailable"}');
    expect(mocks.asked).toBe(0);
  });

  it("answers 200 before Migrate brings public.ping, from the API's answer", async () => {
    const { GET } = await route();
    mocks.answers.push({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function" },
    });
    expect((await GET()).status).toBe(200);
  });

  it("answers HEAD the same, with no body", async () => {
    const up = await route();
    const ok = await up.HEAD();
    expect(ok.status).toBe(200);
    expectHeaders(ok);
    expect(await ok.text()).toBe("");
    const down = await route();
    mocks.answers.push(DOWN);
    const failed = await down.HEAD();
    expect(failed.status).toBe(503);
    expectHeaders(failed);
    expect(await failed.text()).toBe("");
  });

  it("keeps the database's answer a minute, for GET and HEAD alike, then asks again", async () => {
    const { GET, HEAD } = await route();
    expect((await GET()).status).toBe(200);
    vi.setSystemTime(Date.now() + 20_000);
    expect((await HEAD()).status).toBe(200);
    vi.setSystemTime(Date.now() + 39_999);
    expect((await GET()).status).toBe(200);
    expect(mocks.asked).toBe(1);
    // A minute after it answered, the next request asks, and hears it's down.
    vi.setSystemTime(Date.now() + 1);
    mocks.answers.push(DOWN);
    expect((await GET()).status).toBe(503);
    expect(mocks.asked).toBe(2);
  });

  it("keeps no failure: a retry a second later asks again, and sees it back", async () => {
    const { GET } = await route();
    mocks.answers.push(DOWN);
    expect((await GET()).status).toBe(503);
    vi.setSystemTime(Date.now() + 1_000);
    mocks.answers.push(DOWN);
    expect((await GET()).status).toBe(503);
    vi.setSystemTime(Date.now() + 2_000);
    expect((await GET()).status).toBe(200);
    expect(mocks.asked).toBe(3);
  });

  it("waits for a request in both, so no copy made at build answers", async () => {
    for (const method of ["GET", "HEAD"] as const) {
      const handlers = await route();
      let release = () => {};
      mocks.connection.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      );
      let settled = false;
      const pending = handlers[method]().then((response) => {
        settled = true;
        return response;
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mocks.connection, method).toHaveBeenCalledTimes(1);
      expect(settled, method).toBe(false);
      // Nothing is asked of the database, nor the clock read, before then.
      expect(mocks.asked, method).toBe(0);
      release();
      expect((await pending).status, method).toBe(200);
      expect(mocks.asked, method).toBe(1);
      mocks.connection.mockReset().mockResolvedValue(undefined);
      mocks.asked = 0;
    }
  });
});
