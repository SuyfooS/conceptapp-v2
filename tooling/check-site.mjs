// Checks one site of the app from outside, as anyone on the internet sees it,
// for Orel's steps in docs/production.md (Turnstile, B7), in place of looking
// at a page's source by hand:
//
//   node tooling/check-site.mjs https://www.conceptapp.co.il
//
// It reads four public addresses, each with one GET and nothing else: no form
// is sent, no cookie kept or sent, no redirect followed, no setting or secret
// read, nothing installed (Node 20's own fetch). What it prints names paths,
// statuses and header names, never a cookie, a header's value or a page's
// body. The one value it prints is the Turnstile site key the sign-in page
// itself shows, public by design (it is in every page that sends a code).
//
//   /health      the running server answers 200 with {"status":"ok"}
//   /health/db   the database answers too. It comes later (closing the
//                pilot, PR 11): until a site has it, "not there yet", not a
//                failure
//   /enter       the demo door: closed (on to /sign-in, as on the site of real
//                businesses) or open (the demo's own site), said either way
//   /sign-in     Turnstile's data-sitekey is no test key of Cloudflare's, and
//                the security headers every page carries are the code's
//
// Answers in Hebrew, for Orel. The exit code is 0 when nothing failed, 1 when
// something did (or it stopped on what it didn't expect, said in one line and
// never as the error), 2 when the address can't be read. A .mjs on Node 20
// can't import packages/domain's TypeScript, so the header names,
// Cloudflare's test keys and the paths are written here, and
// tooling/check-site.test.ts keeps them the same as the code's, with a fake
// fetch in place of the internet.
import { basename } from "node:path";

/**
 * @typedef {"pass" | "fail" | "info" | "later"} Outcome
 * @typedef {{ outcome: Outcome, subject: string, words: string }} Finding
 * @typedef {(input: string, init: RequestInit) => Promise<Response>} Fetch
 * @typedef {{ log: (text: string) => void, error: (text: string) => void }} Out
 */

/** `SECURITY_HEADERS` of packages/domain/security-headers.ts, as sent. */
export const SECURITY_HEADERS = [
  {
    key: "Content-Security-Policy",
    value:
      "frame-ancestors 'none'; frame-src 'self' https://challenges.cloudflare.com",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(self), screen-wake-lock=(self), fullscreen=(self), web-share=(self), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

/** `TURNSTILE_TEST_KEYS` of packages/domain/turnstile.ts. */
export const TURNSTILE_TEST_KEYS = {
  pass: "1x00000000000000000000AA",
  fail: "2x00000000000000000000AB",
  tap: "3x00000000000000000000FF",
  passInvisible: "1x00000000000000000000BB",
  failInvisible: "2x00000000000000000000BB",
};

/** The shape of a Turnstile site key, as packages/db/env.ts takes one. */
const SITE_KEY = /^[0-3]x[0-9A-Za-z_-]{18,30}$/;

/** The four addresses it reads, and nothing else. */
export const PATHS = {
  health: "/health",
  database: "/health/db",
  door: "/enter",
  signIn: "/sign-in",
};

/** How long one address may take to answer. */
export const TIMEOUT_MS = 15_000;

/**
 * The site's origin from what was typed: http or https, with no name or
 * password in it, its path and query dropped. An address typed without
 * `https://` gets it. Anything else is null.
 * @param {string | undefined} input
 * @returns {string | null}
 */
export function originOf(input) {
  if (typeof input !== "string" || input.trim() === "") return null;
  const typed = input.trim();
  let url;
  try {
    url = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//i.test(typed) ? typed : `https://${typed}`,
    );
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username !== "" || url.password !== "") return null;
  return url.origin;
}

/** Why a request got no answer, in a word or two: never its message. */
function reasonOf(error) {
  if (error?.name === "TimeoutError" || error?.name === "AbortError") {
    return `לא ענה תוך ${TIMEOUT_MS / 1000} שניות`;
  }
  const code = error?.cause?.code ?? error?.code;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return "הכתובת לא נמצאה";
  }
  if (code === "ECONNREFUSED") return "החיבור נדחה";
  return typeof code === "string" && /^[A-Z0-9_]+$/.test(code)
    ? `אין תשובה (${code})`
    : "אין תשובה";
}

/** One GET of a path on the site, its redirect not followed. */
async function read(fetchImpl, origin, path) {
  try {
    const response = await fetchImpl(`${origin}${path}`, {
      method: "GET",
      redirect: "manual",
      // A page as a browser asks for one; the two health checks as JSON.
      headers: {
        accept: path.startsWith(PATHS.health)
          ? "application/json"
          : "text/html",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { response };
  } catch (error) {
    return { error: reasonOf(error) };
  }
}

/**
 * An answer's body, or why it didn't arrive whole: the connection cut, or
 * the time `read` gave it running out while it was still coming.
 */
async function textOf(response) {
  try {
    return { text: await response.text() };
  } catch (error) {
    return { error: reasonOf(error) };
  }
}

const isRedirect = (status) => status >= 300 && status < 400;

/** Where a redirect goes, as an origin and a path: never its query. */
function targetOf(response, origin) {
  const location = response.headers.get("location");
  if (!location) return null;
  try {
    const url = new URL(location, origin);
    return { origin: url.origin, path: url.pathname };
  } catch {
    return null;
  }
}

/**
 * A line of the answer: pass, fail, info (said, not judged) or later.
 * @param {Outcome} outcome
 * @param {string} subject
 * @param {string} words
 * @returns {Finding}
 */
const finding = (outcome, subject, words) => ({ outcome, subject, words });

async function checkHealth(fetchImpl, origin) {
  const subject = PATHS.health;
  const { response, error } = await read(fetchImpl, origin, subject);
  if (!response) {
    return { stop: true, found: finding("fail", subject, error) };
  }
  if (isRedirect(response.status)) {
    const to = targetOf(response, origin);
    if (to && to.origin !== origin) {
      return {
        stop: true,
        found: finding(
          "fail",
          subject,
          `הכתובת עוברת ל-${to.origin}. מריצים שוב עם הכתובת הזו.`,
        ),
      };
    }
  }
  if (response.status !== 200) {
    return {
      stop: false,
      found: finding("fail", subject, `עונה ${response.status}, לא 200.`),
    };
  }
  // Headers came, so the address is right: a body cut short is no answer,
  // and the other addresses are still read.
  const answer = await textOf(response);
  if (answer.error !== undefined) {
    return { stop: false, found: finding("fail", subject, answer.error) };
  }
  let ok = false;
  try {
    ok = JSON.parse(answer.text)?.status === "ok";
  } catch {
    ok = false;
  }
  return {
    stop: false,
    found: ok
      ? finding("pass", subject, "השרת עונה (200).")
      : finding(
          "fail",
          subject,
          "עונה 200, אבל לא כמו האפליקציה. זו הכתובת הנכונה?",
        ),
  };
}

async function checkDatabase(fetchImpl, origin) {
  const subject = PATHS.database;
  const { response, error } = await read(fetchImpl, origin, subject);
  if (!response) return finding("fail", subject, error);
  switch (response.status) {
    case 200:
      return finding("pass", subject, "מסד הנתונים עונה (200).");
    // Until the route reaches every site. Once it has (closing the pilot,
    // PR 11), a 404 here means it went missing: that PR makes it a failure.
    case 404:
      return finding(
        "later",
        subject,
        "עוד לא באתר הזה: הבדיקה של מסד הנתונים מגיעה בהמשך. זה לא כשל.",
      );
    case 503:
      return finding(
        "fail",
        subject,
        "השרת עונה, אבל מסד הנתונים לא עונה (503).",
      );
    default:
      return finding("fail", subject, `עונה ${response.status}, לא 200.`);
  }
}

async function checkDoor(fetchImpl, origin) {
  const subject = PATHS.door;
  const { response, error } = await read(fetchImpl, origin, subject);
  if (!response) return finding("fail", subject, error);
  if (response.status === 200) {
    return finding(
      "info",
      subject,
      "דלת ההדגמה פתוחה: יש בה אנשי הדגמה. כך באתר של ההדגמה, ולא באתר של העסקים האמיתיים.",
    );
  }
  if (isRedirect(response.status)) {
    const to = targetOf(response, origin);
    if (to && to.origin === origin && to.path === PATHS.signIn) {
      return finding(
        "info",
        subject,
        `דלת ההדגמה סגורה: הכתובת עוברת ל-${PATHS.signIn}. כך באתר של העסקים האמיתיים.`,
      );
    }
    const where = to
      ? `${to.origin === origin ? "" : to.origin}${to.path}`
      : "כתובת לא מוכרת";
    return finding("fail", subject, `עובר ל-${where}, לא ל-${PATHS.signIn}.`);
  }
  return finding("fail", subject, `עונה ${response.status}.`);
}

/** Turnstile's site key on the sign-in page. */
function checkTurnstile(status, html) {
  const subject = "Turnstile";
  if (status !== 200) {
    return finding(
      "fail",
      subject,
      `${PATHS.signIn} עונה ${status}, לא 200, ולכן אין data-sitekey לבדוק.`,
    );
  }
  const keys = [
    ...new Set(
      [...html.matchAll(/data-sitekey="([^"]*)"/g)].map(([, key]) => key),
    ),
  ];
  if (keys.length === 0) {
    return finding(
      "fail",
      subject,
      `אין data-sitekey בדף ${PATHS.signIn}: האתר על גרסה מלפני Turnstile, או שזה לא האתר של האפליקציה.`,
    );
  }
  const tests = Object.values(TURNSTILE_TEST_KEYS);
  if (keys.includes(TURNSTILE_TEST_KEYS.pass)) {
    return finding(
      "fail",
      subject,
      `data-sitekey הוא מפתח הבדיקה של Cloudflare, ${TURNSTILE_TEST_KEYS.pass}: NEXT_PUBLIC_TURNSTILE_SITE_KEY לא הגיע לבנייה. עוצרים, מתקנים ב-Vercel (docs/production.md, Turnstile, צעד 2), Redeploy, ובודקים שוב.`,
    );
  }
  const test = keys.find((key) => tests.includes(key));
  if (test) {
    return finding(
      "fail",
      subject,
      `data-sitekey הוא מפתח בדיקה של Cloudflare, ${test}, לא ה-Site Key של הווידג'ט.`,
    );
  }
  if (keys.length > 1 || !SITE_KEY.test(keys[0] ?? "")) {
    return finding(
      "fail",
      subject,
      "ב-data-sitekey יש ערך בצורה לא מוכרת: זה לא Site Key של Turnstile.",
    );
  }
  return finding(
    "pass",
    subject,
    `data-sitekey הוא ${keys[0]}, לא מפתח בדיקה. הוא צריך להיות ה-Site Key של הווידג'ט ב-Cloudflare.`,
  );
}

/** Each security header by its name: there, and as the code sends it. */
function checkHeaders(headers) {
  return SECURITY_HEADERS.map(({ key, value }) => {
    const sent = headers.get(key);
    if (sent === null) return finding("fail", key, "חסרה.");
    if (sent !== value) {
      return finding(
        "fail",
        key,
        "יש בה ערך אחר מזה שבקוד: אולי האתר על גרסה ישנה יותר.",
      );
    }
    return finding("pass", key, "כמו בקוד.");
  });
}

/**
 * Every check of a site, in order, as findings: `/health` first, and nothing
 * more when it got no answer or the address moves elsewhere.
 * @param {string} origin
 * @param {Fetch} [fetchImpl]
 * @returns {Promise<Finding[]>}
 */
export async function checkSite(origin, fetchImpl = globalThis.fetch) {
  const health = await checkHealth(fetchImpl, origin);
  if (health.stop) return [health.found];
  const found = [
    health.found,
    await checkDatabase(fetchImpl, origin),
    await checkDoor(fetchImpl, origin),
  ];
  // No answer, or a page whose body was cut short: neither is checked.
  const { response, error } = await read(fetchImpl, origin, PATHS.signIn);
  const answer =
    response?.status === 200 ? await textOf(response) : { text: "" };
  const lost = error ?? answer.error;
  if (!response || lost !== undefined) {
    found.push(
      finding("fail", "Turnstile", `${PATHS.signIn}: ${lost}`),
      finding("fail", "כותרות האבטחה", `לא נבדקו: ${PATHS.signIn} לא ענה.`),
    );
    return found;
  }
  found.push(checkTurnstile(response.status, answer.text ?? ""));
  if (response.status === 200) {
    found.push(...checkHeaders(response.headers));
  } else {
    found.push(
      finding(
        "fail",
        "כותרות האבטחה",
        `לא נבדקו: ${PATHS.signIn} עונה ${response.status}, לא 200.`,
      ),
    );
  }
  return found;
}

const MARK = { pass: "[v]", fail: "[x]", info: "[i]", later: "[-]" };

/**
 * The answer as Orel reads it, a line a finding and the sum at the end.
 * @param {string} origin
 * @param {Finding[]} findings
 * @returns {{ text: string, failed: number }}
 */
export function report(origin, findings) {
  const failed = findings.filter((f) => f.outcome === "fail").length;
  const lines = [
    `בודקים את ${origin} מבחוץ: רק קריאה של דפים ציבוריים, בלי סיסמה ובלי טופס.`,
    "",
    ...findings.map((f) => `${MARK[f.outcome]} ${f.subject}: ${f.words}`),
    "",
    failed === 0
      ? "הכול תקין."
      : failed === 1
        ? "בדיקה אחת נכשלה."
        : `${failed} בדיקות נכשלו.`,
  ];
  return { text: lines.join("\n"), failed };
}

const USAGE = [
  "כך מריצים, עם הכתובת של האתר:",
  "node tooling/check-site.mjs https://www.conceptapp.co.il",
].join("\n");

/** What it says when it stopped on something it didn't expect: never the error. */
export const STOPPED =
  "הבדיקה נעצרה לפני שהסתיימה. מריצים אותה שוב, ואם זה חוזר, שואלים בסשן.";

/**
 * The command itself: the exit code it ends with.
 * @param {string[]} args
 * @param {Fetch} [fetchImpl]
 * @param {Out} [out]
 * @returns {Promise<number>}
 */
export async function main(args, fetchImpl = globalThis.fetch, out = console) {
  const origin = args.length === 1 ? originOf(args[0]) : null;
  if (!origin) {
    out.error(USAGE);
    return 2;
  }
  let findings;
  try {
    findings = await checkSite(origin, fetchImpl);
  } catch {
    out.error(STOPPED);
    return 1;
  }
  const { text, failed } = report(origin, findings);
  out.log(text);
  return failed === 0 ? 0 : 1;
}

if (basename(process.argv[1] ?? "") === "check-site.mjs") {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    () => {
      console.error(STOPPED);
      process.exitCode = 1;
    },
  );
}
