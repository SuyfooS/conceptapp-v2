import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// GET and HEAD /health, for an uptime monitor: 200 at request time (each
// waits for `connection()`, stood in for here), never cached, out of search,
// and nothing in it but `status`: no setting of the deployment's, no cookie.

const mocks = vi.hoisted(() => ({ connection: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: mocks.connection,
}));

const { GET, HEAD } = await import("./route");

beforeEach(() => {
  mocks.connection.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Whether `answer` is still waiting once `connection()` was asked. */
async function waitsForTheRequest(answer: () => Promise<Response>) {
  let release = () => {};
  mocks.connection.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  let settled = false;
  const pending = answer().then((response) => {
    settled = true;
    return response;
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(mocks.connection).toHaveBeenCalledTimes(1);
  expect(settled).toBe(false);
  release();
  expect((await pending).status).toBe(200);
}

describe("/health", () => {
  it("answers 200 with its status alone, never kept and out of search", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.text()).toBe('{"status":"ok"}');
  });

  it("tells nothing of the deployment's settings", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_health_test_value");
    vi.stubEnv("CRON_SECRET", "cron-secret-health-test-value");
    vi.stubEnv("DEMO_DOOR", "off");
    const body = await (await GET()).text();
    expect(JSON.parse(body)).toEqual({ status: "ok" });
    for (const value of ["sb_secret_", "cron-secret", "off"]) {
      expect(body).not.toContain(value);
    }
  });

  it("answers HEAD the same, with no body", async () => {
    const response = await HEAD();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.text()).toBe("");
  });

  it("waits for a request in both, so no copy made at build answers", async () => {
    await waitsForTheRequest(GET);
    mocks.connection.mockClear();
    await waitsForTheRequest(HEAD);
  });
});
