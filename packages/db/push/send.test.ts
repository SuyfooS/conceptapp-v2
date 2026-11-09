import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { parsePushConfig } = await import("./env");
const { forgetVapidTokens } = await import("./vapid");
const { sendPush } = await import("./send");

const keys = Object.fromEntries(
  execFileSync(
    process.execPath,
    [join(__dirname, "..", "..", "..", "tooling", "vapid-keys.mjs"), "--env"],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .map((line) => [
      line.slice(0, line.indexOf("=")),
      line.slice(line.indexOf("=") + 1),
    ]),
);
function makeConfig() {
  const made = parsePushConfig({
    ...keys,
    VAPID_SUBJECT: "mailto:dev@conceptapp.invalid",
  });
  if (!made) throw new Error("no config");
  return made;
}
const config = makeConfig();

type Seen = { url: string; init: RequestInit };

/** A push service that answers `status`, and remembers what it was sent. */
function service(
  status: number,
  headers: Record<string, string> = {},
  body = "",
) {
  const seen: Seen[] = [];
  const fetchImpl = (async (url: URL | string, init?: RequestInit) => {
    seen.push({ url: String(url), init: init ?? {} });
    return new Response(status === 204 ? null : body, { status, headers });
  }) as typeof fetch;
  return { seen, fetchImpl };
}

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc";

beforeEach(() => forgetVapidTokens());

describe("sendPush", () => {
  it("sends an empty push with VAPID, a time to live, an urgency and a topic", async () => {
    const { seen, fetchImpl } = service(201);
    const result = await sendPush(ENDPOINT, config, {
      ttl: 600,
      fetch: fetchImpl,
    });
    expect(result).toEqual({ outcome: "ok", status: 201 });
    expect(seen).toHaveLength(1);
    const [{ url, init } = { url: "", init: {} }] = seen;
    expect(url).toBe(ENDPOINT);
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(
      new RegExp(
        `^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${config.publicKey}$`,
      ),
    );
    expect(headers.TTL).toBe("600");
    expect(headers.Urgency).toBe("normal");
    expect(headers.Topic).toBe("inbox");
    // No payload and no encryption.
    expect(headers["Content-Encoding"]).toBeUndefined();
    expect((init.body as Uint8Array).byteLength).toBe(0);
  });

  it("reads each answer as what to do next", async () => {
    const cases: [number, string][] = [
      [200, "ok"],
      [202, "ok"],
      [404, "gone"],
      [410, "gone"],
      [400, "refused"],
      [403, "refused"],
      [413, "refused"],
      [429, "retry"],
      [500, "retry"],
      [503, "retry"],
    ];
    for (const [status, outcome] of cases) {
      const { fetchImpl } = service(status);
      expect(
        (await sendPush(ENDPOINT, config, { ttl: 60, fetch: fetchImpl }))
          .outcome,
        String(status),
      ).toBe(outcome);
    }
  });

  it("waits as long as the push service asks, up to an hour", async () => {
    const { fetchImpl } = service(429, { "Retry-After": "120" });
    expect(
      await sendPush(ENDPOINT, config, { ttl: 60, fetch: fetchImpl }),
    ).toEqual({
      outcome: "retry",
      status: 429,
      wait: 120,
    });
  });

  it("says why Apple refused, in its word", async () => {
    const { fetchImpl } = service(
      403,
      {},
      JSON.stringify({ reason: "BadJwtToken" }),
    );
    expect(
      await sendPush(ENDPOINT, config, { ttl: 60, fetch: fetchImpl }),
    ).toEqual({
      outcome: "refused",
      status: 403,
      reason: "BadJwtToken",
    });
    const odd = service(400, {}, "<html>no</html>");
    expect(
      await sendPush(ENDPOINT, config, { ttl: 60, fetch: odd.fetchImpl }),
    ).toEqual({
      outcome: "refused",
      status: 400,
    });
  });

  it("tries again later when nothing answers", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    expect(
      await sendPush(ENDPOINT, config, { ttl: 60, fetch: fetchImpl }),
    ).toEqual({
      outcome: "retry",
      status: null,
    });
  });

  it("never sends where it may not, even to a saved endpoint", async () => {
    const { seen, fetchImpl } = service(201);
    for (const endpoint of [
      "https://evil.example/push",
      "http://127.0.0.1:3199/push/abc",
      "https://169.254.169.254/latest",
    ]) {
      expect(
        (await sendPush(endpoint, config, { ttl: 60, fetch: fetchImpl }))
          .outcome,
      ).toBe("gone");
    }
    expect(seen).toHaveLength(0);
  });

  it("sends to the browser tests' mock when told to", async () => {
    const { seen, fetchImpl } = service(201);
    const mock = "http://127.0.0.1:3199/push/abc";
    expect(
      (
        await sendPush(mock, config, {
          ttl: 60,
          fetch: fetchImpl,
          testOrigin: "http://127.0.0.1:3199",
        })
      ).outcome,
    ).toBe("ok");
    expect(seen.map((s) => s.url)).toEqual([mock]);
  });
});
