import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { phoneSignInPath, signInPath } from "@domain/passive-sign-in";
import { SECURITY_HEADERS as CODE_HEADERS } from "@domain/security-headers";
import { TURNSTILE_TEST_KEYS as CODE_TEST_KEYS } from "@domain/turnstile";
import { describe, expect, it } from "vitest";
import {
  checkSite,
  main,
  originOf,
  PATHS,
  report,
  SECURITY_HEADERS,
  SITE_KEY,
  STOPPED,
  TURNSTILE_TEST_KEYS,
} from "./check-site.mjs";

// tooling/check-site.mjs, the one command that checks a site from outside
// for Orel's steps (docs/production.md, Turnstile and B7; closing the pilot,
// PR 18). Never against a real site here: every answer comes from a fake
// fetch. The script reads public pages with GET alone, follows no redirect,
// sends no cookie and prints no header's value but a redirect's origin and
// path (never its query); its header names, Cloudflare's test keys, a site
// key's shape and its paths are written in it (a .mjs on Node 20 can't
// import the TypeScript), so this keeps them the same as the code's. Since
// closing the pilot's PR 11 brought /health/db, a site must answer it too.

const root = join(__dirname, "..");
const source = readFileSync(join(root, "tooling/check-site.mjs"), "utf8");
const ORIGIN = "https://site.example";
const REAL_KEY = "0xFAKEsiteKeyForTests1";

type Answer = {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
  /** Its headers sent, its body cut short with this, as undici does. */
  cut?: Error;
};

/** A body that sends a little, then fails with `error`. */
const cutShort = (error: Error) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("<html><body>"));
    },
    pull(controller) {
      controller.error(error);
    },
  });
type Call = { url: string; init: RequestInit | undefined };

/** The page headers the code sends, as a site that is up to date sends them. */
const pageHeaders = () =>
  Object.fromEntries(CODE_HEADERS.map(({ key, value }) => [key, value]));

/** A closed, up-to-date site of real businesses with a real key. */
function site(overrides: Record<string, Answer | Error> = {}) {
  const answers: Record<string, Answer | Error> = {
    "/health": {
      body: '{"status":"ok"}',
      headers: { "content-type": "application/json" },
    },
    "/health/db": {
      body: '{"status":"ok"}',
      headers: { "content-type": "application/json" },
    },
    "/enter": {
      status: 307,
      headers: { location: `${ORIGIN}/sign-in` },
    },
    "/sign-in": {
      body: `<html><body><form><div data-captcha-frame="" data-sitekey="${REAL_KEY}" class="hidden"></div></form></body></html>`,
      headers: { ...pageHeaders(), "content-type": "text/html" },
    },
    ...overrides,
  };
  const calls: Call[] = [];
  const fetch = async (
    url: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const href = String(url);
    calls.push({ url: href, init });
    const path = new URL(href).pathname;
    const answer = answers[path];
    if (answer instanceof Error) throw answer;
    if (!answer) return new Response("not found", { status: 404 });
    const body = answer.cut ? cutShort(answer.cut) : (answer.body ?? null);
    return new Response(body, {
      status: answer.status ?? 200,
      headers: answer.headers ?? {},
    });
  };
  return { fetch, calls };
}

async function run(overrides: Record<string, Answer | Error> = {}) {
  const { fetch, calls } = site(overrides);
  const found = await checkSite(ORIGIN, fetch);
  const { text, failed } = report(ORIGIN, found);
  const of = (subject: string) => found.find((f) => f.subject === subject);
  return { found, text, failed, calls, of };
}

const offline = () =>
  Object.assign(new TypeError("fetch failed"), {
    cause: { code: "ENOTFOUND" },
  });

/** The connection dropped while a body was still coming. */
const dropped = () =>
  Object.assign(new TypeError("terminated"), {
    cause: { code: "UND_ERR_SOCKET", message: "other side closed" },
  });

describe("what it checks, kept the same as the code", () => {
  it("names the security headers every page carries, with their values", () => {
    expect(SECURITY_HEADERS).toEqual(
      CODE_HEADERS.map(({ key, value }) => ({ key, value })),
    );
  });

  it("knows Cloudflare's test keys", () => {
    expect(TURNSTILE_TEST_KEYS).toEqual(CODE_TEST_KEYS);
  });

  it("takes a site key of the shape the build takes, no wider and no narrower", () => {
    // packages/db/env.ts keeps its pattern to itself, so this reads it: a
    // key the build lets through and this refused would stop Orel at
    // Turnstile step 4 with a real key.
    const env = readFileSync(join(root, "packages/db/env.ts"), "utf8");
    const built =
      /const TurnstileSiteKey = z[\s\S]*?\.regex\((\/.+\/[a-z]*)\)/.exec(
        env,
      )?.[1];
    expect(built).toBeDefined();
    expect(String(SITE_KEY)).toBe(built);
    expect(SITE_KEY.test(REAL_KEY)).toBe(true);
  });

  it("reads the app's own addresses", () => {
    expect(PATHS.door).toBe(signInPath);
    expect(PATHS.signIn).toBe(phoneSignInPath);
    expect(existsSync(join(root, "app/health/route.ts"))).toBe(true);
    expect(existsSync(join(root, "app/health/db/route.ts"))).toBe(true);
    expect(PATHS.health).toBe("/health");
    expect(PATHS.database).toBe("/health/db");
    // Nothing is "not there yet" any more.
    expect(source).not.toContain("later");
    expect(source).not.toContain("עוד לא באתר");
    expect(
      readFileSync(join(root, "packages/ui/captcha.tsx"), "utf8"),
    ).toContain("data-sitekey={siteKey");
  });
});

describe("a site as it should be", () => {
  it("passes the closed site of real businesses with a real key", async () => {
    const { found, failed, text, of } = await run();
    expect(failed).toBe(0);
    expect(of("/health")?.outcome).toBe("pass");
    expect(of("/health/db")?.outcome).toBe("pass");
    expect(of("/health/db")?.words).toContain("מסד הנתונים עונה");
    expect(of("/enter")?.outcome).toBe("info");
    expect(of("/enter")?.words).toContain("סגורה");
    expect(of("Turnstile")?.outcome).toBe("pass");
    expect(of("Turnstile")?.words).toContain(REAL_KEY);
    for (const { key } of CODE_HEADERS) {
      expect(of(key)?.outcome, key).toBe("pass");
    }
    expect(found).toHaveLength(4 + CODE_HEADERS.length);
    expect(text.split("\n").at(-1)).toBe("הכול תקין.");
  });

  it("says the demo's door is open, without failing", async () => {
    const { failed, of } = await run({
      "/enter": { body: "<html>demo</html>", headers: pageHeaders() },
    });
    expect(failed).toBe(0);
    expect(of("/enter")?.outcome).toBe("info");
    expect(of("/enter")?.words).toContain("פתוחה");
  });

  it("takes the door's redirect as Next.js writes it, a whole address or a path", async () => {
    for (const location of [`${ORIGIN}/sign-in`, "/sign-in"]) {
      const { of } = await run({
        "/enter": { status: 307, headers: { location } },
      });
      expect(of("/enter")?.words, location).toContain("סגורה");
    }
  });
});

describe("what fails", () => {
  it("stops at Cloudflare's always-passing test key", async () => {
    const { failed, of, text } = await run({
      "/sign-in": {
        body: `<div data-sitekey="${CODE_TEST_KEYS.pass}"></div>`,
        headers: pageHeaders(),
      },
    });
    expect(failed).toBe(1);
    expect(of("Turnstile")?.outcome).toBe("fail");
    expect(of("Turnstile")?.words).toContain(CODE_TEST_KEYS.pass);
    expect(of("Turnstile")?.words).toContain("NEXT_PUBLIC_TURNSTILE_SITE_KEY");
    expect(text.split("\n").at(-1)).toBe("בדיקה אחת נכשלה.");
  });

  it("fails every other test key, the invisible two among them, and a key of no known shape, which it never prints", async () => {
    const others = Object.values(CODE_TEST_KEYS).filter(
      (key) => key !== CODE_TEST_KEYS.pass,
    );
    expect(others).toContain("1x00000000000000000000BB");
    expect(others).toContain("2x00000000000000000000BB");
    for (const key of others) {
      const { of } = await run({
        "/sign-in": {
          body: `<div data-sitekey="${key}"></div>`,
          headers: pageHeaders(),
        },
      });
      expect(of("Turnstile")?.outcome, key).toBe("fail");
      expect(of("Turnstile")?.words, key).toContain(key);
    }
    const odd = "sk_live_not-a-site-key";
    const { of, text } = await run({
      "/sign-in": {
        body: `<div data-sitekey="${odd}"></div>`,
        headers: pageHeaders(),
      },
    });
    expect(of("Turnstile")?.outcome).toBe("fail");
    expect(text).not.toContain(odd);
  });

  it("fails a sign-in page with no key, or two", async () => {
    const none = await run({
      "/sign-in": { body: "<html></html>", headers: pageHeaders() },
    });
    expect(none.of("Turnstile")?.outcome).toBe("fail");
    expect(none.of("Turnstile")?.words).toContain("אין data-sitekey");
    const other = "0xFAKEsiteKeyForTests2";
    const two = await run({
      "/sign-in": {
        body: `<div data-sitekey="${REAL_KEY}"></div><div data-sitekey="${other}"></div>`,
        headers: pageHeaders(),
      },
    });
    expect(two.of("Turnstile")?.outcome).toBe("fail");
    // Both are of a key's shape: what's wrong is that there are two.
    expect(two.of("Turnstile")?.words).toContain(
      "יש כמה ערכים שונים של data-sitekey",
    );
    expect(two.of("Turnstile")?.words).not.toContain("צורה לא מוכרת");
    expect(two.text).not.toContain(REAL_KEY);
    expect(two.text).not.toContain(other);
  });

  it("fails a missing header and one the code doesn't send, never printing a value", async () => {
    const headers: Record<string, string> = {
      ...Object.fromEntries(
        CODE_HEADERS.filter(({ key }) => key !== "X-Frame-Options").map(
          ({ key, value }) => [key, value],
        ),
      ),
      "Content-Security-Policy":
        "frame-ancestors *; report-uri https://x.example/k3y-SECRET",
      "set-cookie": "sb-session=COOKIE-SECRET; HttpOnly",
    };
    const { of, text, failed } = await run({
      "/sign-in": { body: `<div data-sitekey="${REAL_KEY}"></div>`, headers },
    });
    expect(failed).toBe(2);
    expect(of("X-Frame-Options")?.outcome).toBe("fail");
    expect(of("X-Frame-Options")?.words).toContain("חסרה");
    expect(of("Content-Security-Policy")?.outcome).toBe("fail");
    expect(text).not.toContain("SECRET");
    expect(text).not.toContain("frame-ancestors");
    expect(text).not.toContain("sb-session");
  });

  it("stops after /health when the site can't be reached", async () => {
    const { found, calls, failed } = await run({ "/health": offline() });
    expect(failed).toBe(1);
    expect(found).toHaveLength(1);
    expect(found[0]?.words).toBe("הכתובת לא נמצאה");
    expect(calls).toHaveLength(1);
  });

  it("says when a request took too long", async () => {
    const late = Object.assign(new Error("timed out"), {
      name: "TimeoutError",
    });
    const { found } = await run({ "/health": late });
    expect(found[0]?.words).toContain("15 שניות");
  });

  it("stops when the address moves to another, and names only its origin", async () => {
    const { found, calls, text } = await run({
      "/health": {
        status: 308,
        headers: { location: "https://www.site.example/health?token=abc" },
      },
    });
    expect(calls).toHaveLength(1);
    expect(found).toHaveLength(1);
    expect(found[0]?.outcome).toBe("fail");
    expect(found[0]?.words).toContain("https://www.site.example");
    expect(text).not.toContain("token");
  });

  it("fails /health that answers something else, and goes on", async () => {
    const broken = await run({ "/health": { status: 500, body: "" } });
    expect(broken.of("/health")?.outcome).toBe("fail");
    expect(broken.of("/health")?.words).toContain("500");
    expect(broken.found.length).toBeGreaterThan(1);
    const wrong = await run({ "/health": { body: "<html>parked</html>" } });
    expect(wrong.of("/health")?.outcome).toBe("fail");
  });

  it("reads /health/db: the database answering, down, missing, or not the app's", async () => {
    const up = await run();
    expect(up.of("/health/db")?.outcome).toBe("pass");
    const down = await run({
      "/health/db": { status: 503, body: '{"status":"unavailable"}' },
    });
    expect(down.of("/health/db")?.outcome).toBe("fail");
    expect(down.of("/health/db")?.words).toContain("מסד הנתונים לא עונה");
    expect(down.failed).toBe(1);
    // Since PR 11 a site of the app has it: a 404 is a version from before
    // it, and fails.
    const missing = await run({ "/health/db": { status: 404 } });
    expect(missing.of("/health/db")?.outcome).toBe("fail");
    expect(missing.of("/health/db")?.words).toContain("404");
    expect(missing.of("/health/db")?.words).toContain("מלפני");
    expect(missing.failed).toBe(1);
    const odd = await run({ "/health/db": { status: 500 } });
    expect(odd.of("/health/db")?.outcome).toBe("fail");
    expect(odd.of("/health/db")?.words).toContain("500");
    for (const body of [
      "",
      "<html>parked</html>",
      '{"status":"unavailable"}',
    ]) {
      const wrong = await run({ "/health/db": { body } });
      expect(wrong.of("/health/db")?.outcome, body).toBe("fail");
      expect(wrong.of("/health/db")?.words, body).toContain("לא כמו האפליקציה");
      expect(wrong.text, body).not.toContain("parked");
    }
  });

  it("says a /health/db cut short as no answer, and goes on", async () => {
    const { of, found, text } = await run({ "/health/db": { cut: dropped() } });
    expect(of("/health/db")?.outcome).toBe("fail");
    expect(of("/health/db")?.words).toContain("UND_ERR_SOCKET");
    expect(of("/health/db")?.words).not.toContain("כמו האפליקציה");
    expect(found).toHaveLength(4 + CODE_HEADERS.length);
    expect(text).not.toContain("terminated");
  });

  it("fails /health/db on an address with no deployment, as every other line", async () => {
    // An address with no deployment on it answers 404 everywhere, as Vercel
    // does.
    const nothing = { status: 404, body: "The deployment could not be found" };
    const gone = await run({
      "/health": nothing,
      "/health/db": nothing,
      "/enter": nothing,
      "/sign-in": nothing,
    });
    expect(gone.of("/health")?.outcome).toBe("fail");
    expect(gone.of("/health/db")?.outcome).toBe("fail");
    expect(gone.of("/health/db")?.words).toContain("404");
    expect(gone.text).not.toContain("deployment could not");
    expect(gone.failed).toBe(5);
  });

  it("fails a door that goes anywhere but /sign-in, naming no query", async () => {
    for (const location of [
      `${ORIGIN}/home?x=secret`,
      "https://elsewhere.example/sign-in",
    ]) {
      const { of, text } = await run({
        "/enter": { status: 307, headers: { location } },
      });
      expect(of("/enter")?.outcome, location).toBe("fail");
      expect(text, location).not.toContain("secret");
    }
    const { of } = await run({ "/enter": { status: 500 } });
    expect(of("/enter")?.outcome).toBe("fail");
  });

  it("fails Turnstile and the headers when /sign-in doesn't answer 200", async () => {
    const { of, failed } = await run({
      "/sign-in": { status: 500, headers: pageHeaders() },
    });
    expect(of("Turnstile")?.outcome).toBe("fail");
    expect(of("כותרות האבטחה")?.outcome).toBe("fail");
    expect(failed).toBe(2);
    const gone = await run({ "/sign-in": offline() });
    expect(gone.of("Turnstile")?.outcome).toBe("fail");
    expect(gone.of("כותרות האבטחה")?.outcome).toBe("fail");
  });

  it("says a /sign-in cut short after its headers, with every line before it", async () => {
    const { found, failed, text, of } = await run({
      "/sign-in": { cut: dropped(), headers: pageHeaders() },
    });
    expect(found.map((f) => f.subject)).toEqual([
      "/health",
      "/health/db",
      "/enter",
      "Turnstile",
      "כותרות האבטחה",
    ]);
    expect(of("/health")?.outcome).toBe("pass");
    expect(of("Turnstile")?.outcome).toBe("fail");
    expect(of("Turnstile")?.words).toContain("UND_ERR_SOCKET");
    expect(of("כותרות האבטחה")?.words).toContain("לא נבדקו");
    expect(failed).toBe(2);
    expect(text.split("\n").at(-1)).toBe("2 בדיקות נכשלו.");
    expect(text).not.toContain("terminated");
    expect(text).not.toContain("other side closed");
    // Its time running out while the body still came.
    const late = Object.assign(new Error("timed out"), {
      name: "TimeoutError",
    });
    const slow = await run({
      "/sign-in": { cut: late, headers: pageHeaders() },
    });
    expect(slow.of("Turnstile")?.words).toContain("15 שניות");
    expect(slow.failed).toBe(2);
  });

  it("says a /health cut short as no answer, not as another site, and goes on", async () => {
    const { found, of, text } = await run({ "/health": { cut: dropped() } });
    expect(of("/health")?.outcome).toBe("fail");
    expect(of("/health")?.words).toContain("UND_ERR_SOCKET");
    expect(of("/health")?.words).not.toContain("כמו האפליקציה");
    expect(found).toHaveLength(4 + CODE_HEADERS.length);
    expect(text).not.toContain("terminated");
  });

  it("counts the failures in its last line", async () => {
    const { text } = await run({
      "/health/db": { status: 503 },
      "/enter": { status: 500 },
    });
    expect(text.split("\n").at(-1)).toBe("2 בדיקות נכשלו.");
  });
});

describe("how it asks", () => {
  it("reads the four addresses once each, with GET, following no redirect, sending nothing", async () => {
    const { calls } = await run();
    expect(calls.map(({ url }) => url)).toEqual([
      `${ORIGIN}/health`,
      `${ORIGIN}/health/db`,
      `${ORIGIN}/enter`,
      `${ORIGIN}/sign-in`,
    ]);
    for (const { url, init } of calls) {
      expect(init?.method, url).toBe("GET");
      expect(init?.redirect, url).toBe("manual");
      expect(init?.body, url).toBeUndefined();
      expect(init?.credentials, url).toBeUndefined();
      const names = Object.keys(
        (init?.headers ?? {}) as Record<string, string>,
      ).map((name) => name.toLowerCase());
      expect(names, url).toEqual(["accept"]);
      expect(init?.signal, url).toBeInstanceOf(AbortSignal);
    }
    // The pages as a browser asks for them, the health checks as JSON.
    expect(
      calls.map(
        ({ init }) => (init?.headers as Record<string, string>)?.accept,
      ),
    ).toEqual([
      "application/json",
      "application/json",
      "text/html",
      "text/html",
    ]);
  });

  it("is plain Node 20, with no package, no setting and no other method", () => {
    const code = source
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*\*)/.test(line))
      .join("\n");
    const imports = [...code.matchAll(/^import .* from "([^"]+)";$/gm)].map(
      ([, from]) => from,
    );
    expect(imports.length).toBeGreaterThan(0);
    for (const from of imports) expect(from).toMatch(/^node:/);
    expect(code).not.toMatch(/\brequire\(/);
    expect(code).not.toContain("process.env");
    expect([...code.matchAll(/method: "([A-Z]+)"/g)].map(([, m]) => m)).toEqual(
      ["GET"],
    );
    expect(code).not.toMatch(/\bbody:/);
    expect(code).not.toMatch(/\bcookie\b/i);
    // Newer than Node 20.
    for (const newer of [
      "import.meta.dirname",
      "import.meta.filename",
      "Promise.withResolvers",
      "Object.groupBy",
      "process.getBuiltinModule",
      ".union(",
    ]) {
      expect(code, newer).not.toContain(newer);
    }
  });
});

describe("the command", () => {
  const quiet = () => {
    const said: string[] = [];
    return {
      said,
      out: {
        log: (line: string) => said.push(line),
        error: (line: string) => said.push(line),
      },
    };
  };

  it("takes the address as typed, with or without https://, and nothing else", () => {
    expect(originOf("https://www.conceptapp.co.il")).toBe(
      "https://www.conceptapp.co.il",
    );
    expect(originOf(" https://www.conceptapp.co.il/sign-in?x=1 ")).toBe(
      "https://www.conceptapp.co.il",
    );
    expect(originOf("www.conceptapp.co.il")).toBe(
      "https://www.conceptapp.co.il",
    );
    expect(originOf("http://localhost:3000")).toBe("http://localhost:3000");
    for (const bad of [
      "",
      "   ",
      "ftp://example.com",
      "https://user:pass@example.com",
      "javascript:alert(1)",
      "https://",
      undefined,
    ]) {
      expect(originOf(bad as string), String(bad)).toBeNull();
    }
  });

  it("ends 0 when nothing failed, 1 when something did, 2 without one address", async () => {
    const good = quiet();
    expect(await main([ORIGIN], site().fetch, good.out)).toBe(0);
    expect(good.said.join("\n")).toContain("הכול תקין.");

    const bad = quiet();
    const failing = site({ "/health": { status: 500 } }).fetch;
    expect(await main([ORIGIN], failing, bad.out)).toBe(1);

    for (const args of [[], ["a", "b"], ["ftp://x"]]) {
      const none = quiet();
      const { fetch, calls } = site();
      expect(await main(args, fetch, none.out), String(args)).toBe(2);
      expect(calls, String(args)).toHaveLength(0);
      expect(none.said.join("\n")).toContain("node tooling/check-site.mjs");
    }
  });

  it("says in one line when it stopped on what it didn't expect, never the error, and ends 1", async () => {
    const stopped = quiet();
    const strange = async () =>
      ({
        get status(): number {
          throw new TypeError("SECRET-STACK at undici");
        },
      }) as unknown as Response;
    expect(await main([ORIGIN], strange, stopped.out)).toBe(1);
    expect(stopped.said).toEqual([STOPPED]);
    expect(STOPPED).toMatch(/[֐-׿]/);
    expect(stopped.said.join("\n")).not.toContain("SECRET");
  });
});
