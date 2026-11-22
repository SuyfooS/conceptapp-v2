import { describe, expect, it } from "vitest";
import { jobs, readRepoFile, topLevel } from "./workflows";

// docs/production.md, the step-by-step setup of production for Orel (P9):
// linked from where he and a session look, its commands pasteable into
// PowerShell 5 one line at a time, nothing in it that looks like a secret or
// a path on someone's computer, and whole: every setting Vercel needs, the
// workflow, the environment and its secrets by the names GitHub shows, a
// number for each of Supabase's rate limits, and where each value comes from
// when Vercel won't show it again. The repo is public, so what it must never
// hold is checked here too.

const doc = readRepoFile("docs/production.md");

/** Each fenced block of the doc, with the language its fence names. */
const fences = [...doc.matchAll(/^\s*```(\w*)\n([\s\S]*?)^\s*```$/gm)].map(
  ([, lang = "", body = ""]) => ({ lang, body }),
);

/** The section whose `## ` title starts with `title`, up to the next one. */
function section(title: string): string {
  const found = doc.split(/^## /m).find((part) => part.startsWith(title));
  expect(found, title).toBeDefined();
  return found ?? "";
}

/** The numbered step `n` of a section, up to the next one. */
function stepOf(text: string, n: number): string {
  const from = text.search(new RegExp(`^${n}\\. `, "m"));
  expect(from, `step ${n}`).toBeGreaterThanOrEqual(0);
  const rest = text.slice(from);
  const next = rest.slice(1).search(new RegExp(`^${n + 1}\\. `, "m"));
  return next < 0 ? rest : rest.slice(0, next + 1);
}

/** The cells of each table row in `text`, the header's rule left out. */
function rows(text: string): string[][] {
  return text
    .split("\n")
    .filter((line) => /^\s*\|/.test(line) && !/^\s*\|\s*-/.test(line))
    .map((line) =>
      line
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((cell) => cell.trim()),
    );
}

const SECRET = /\$\{\{\s*secrets\.([A-Za-z0-9_]+)\s*\}\}/g;
const secretsOf = (path: string) => [
  ...new Set(
    [...readRepoFile(path).matchAll(SECRET)].map(([, name = ""]) => name),
  ),
];

describe("docs/production.md", () => {
  it("is linked from the READMEs and the roadmap", () => {
    expect(readRepoFile("supabase/README.md")).toContain("docs/production.md");
    expect(readRepoFile("README.md")).toContain("docs/production.md");
    expect(readRepoFile("docs/ROADMAP.md")).toContain("(production.md)");
  });

  it("has commands PowerShell 5 runs one line at a time", () => {
    // Windows PowerShell 5 has no &&, and a line ending in ; is two commands.
    expect(doc).not.toContain("&&");
    expect(fences.length).toBeGreaterThan(0);
    for (const { lang, body } of fences) {
      if (lang === "sql") continue;
      expect(lang, body).toBe("powershell");
      for (const line of body.split("\n")) {
        expect(line.trimEnd(), line).not.toMatch(/;$/);
      }
    }
  });

  it("holds nothing that looks like a secret", () => {
    for (const pattern of [
      /sb_secret_[A-Za-z0-9]/,
      /sb_publishable_[A-Za-z0-9]/,
      /eyJ[A-Za-z0-9_-]{10,}/,
      // Turnstile's keys.
      /0x4[A-Za-z0-9_-]{8,}/,
      // Twilio's account and Verify service ids.
      /\bAC[0-9a-f]{32}\b/,
      /\bVA[0-9a-f]{32}\b/,
      /\b[0-9a-f]{64}\b/,
      /PRIVATE KEY/,
      /(VAPID_PRIVATE_KEY|CRON_SECRET|EMPLOYEE_DATA_KEKS|SUPABASE_SECRET_KEY)=\S/,
      // A real phone number: the doc writes 9725XXXXXXXX.
      /\b9725\d{8}\b/,
      /\+972\d/,
    ]) {
      expect(doc, String(pattern)).not.toMatch(pattern);
    }
  });

  it("names every setting of .env.example that a deployment takes", () => {
    const settings = [
      ...readRepoFile(".env.example").matchAll(/^([A-Z0-9_]+)=/gm),
    ].map(([, name = ""]) => name);
    expect(settings).toContain("DEMO_DOOR");
    for (const name of settings) {
      // The browser tests' mock push service, never on Vercel.
      if (name === "PUSH_TEST_ORIGIN") continue;
      expect(doc, name).toContain(`\`${name}\``);
    }
  });

  it("names the workflow and its environment as GitHub shows them", () => {
    const workflow = readRepoFile(".github/workflows/migrate-prod.yml");
    const name = /^name: (.+)$/m.exec(topLevel(workflow, "name"))?.[1];
    expect(name).toBe("Migrate conceptapp-prod");
    expect(doc).toContain(`Actions → ${name} → Run workflow`);
    const environments = jobs(workflow).map(
      ({ body }) => /^ {4}environment: (\S+)$/m.exec(body)?.[1],
    );
    expect(environments).toEqual(["conceptapp-prod"]);
    expect(doc).toContain(`New environment\`, שם בדיוק \`${environments[0]}\``);
  });

  it("has the environment's secrets entered by the workflow's names, never development's", () => {
    // Development's are repository secrets: entered under those names,
    // production's values would overwrite them and reach migrate-dev.yml.
    const prod = secretsOf(".github/workflows/migrate-prod.yml");
    expect(prod.length).toBeGreaterThan(0);
    const b3 = section("ב3.");
    for (const name of prod) {
      expect(b3, name).toContain(`\`${name}\``);
    }
    const dev = secretsOf(".github/workflows/migrate-dev.yml");
    expect(dev.length).toBeGreaterThan(0);
    for (const name of dev) {
      expect(doc, name).not.toContain(`\`${name}\``);
    }
  });

  it("has admin bypass unticked, since GitHub ticks it on a new environment", () => {
    const bypass =
      "`Allow administrators to bypass configured protection rules`";
    const lines = section("ב3.")
      .split("\n")
      .filter((line) => line.includes(bypass));
    expect(lines.some((line) => line.includes("להוריד את הסימון"))).toBe(true);
    for (const line of lines) {
      expect(line).not.toContain("לא לסמן");
    }
  });

  it("gives each of Supabase's rate limits a number in B4, which B12 reads", () => {
    // Supabase sees the app's server, not the person: these are limits for
    // the whole site, so each gets a number sized for it, not "no looser".
    const limits = new Map(
      rows(section("ב4."))
        .filter(([name = ""]) => name.startsWith("`Rate limit for "))
        .map(([name = "", , value = ""]) => [name, value]),
    );
    const sms = "`Rate limit for sending SMS messages`";
    for (const name of [
      sms,
      "`Rate limit for sign ups and sign ins`",
      "`Rate limit for token verifications`",
      "`Rate limit for token refreshes`",
    ]) {
      expect(limits.get(name), name).toMatch(/^\d+$/);
    }
    for (const [name] of doc.matchAll(/`Rate limit for [^`]+`/g)) {
      expect(limits.has(name), name).toBe(true);
    }
    // The joining day names B4's SMS limit with B4's number.
    const joining = section("ב12.")
      .split("\n")
      .filter((line) => line.includes(sms));
    expect(joining.length).toBeGreaterThan(0);
    for (const line of joining) {
      expect(line).toMatch(new RegExp(`(^|\\D)${limits.get(sms)}(\\D|$)`));
    }
  });

  it("checks the closed door signed out, since the proxy sends anyone signed in home", () => {
    const checks = doc
      .split("\n")
      .filter((line) => line.includes("/enter") && line.includes("/sign-in"));
    expect(checks.length).toBeGreaterThan(0);
    for (const line of checks) {
      expect(line).toContain("חלון פרטי");
    }
  });

  it("says where the demo's site gets each value Vercel won't show again", () => {
    const b7 = section("ב7.");
    const demo = rows(stepOf(b7, 2));
    // What the real site's table marks Sensitive is hidden on the main site.
    const sensitive = rows(stepOf(b7, 4))
      .filter((cells) => cells.some((cell) => cell.includes("`Sensitive`")))
      .map(([name = ""]) => name);
    expect(sensitive).toEqual(
      expect.arrayContaining([
        "`SUPABASE_SECRET_KEY`",
        "`VAPID_PRIVATE_KEY`",
        "`CRON_SECRET`",
      ]),
    );
    const rowOf = (name: string) =>
      demo.find(([names = ""]) => names.includes(name));
    for (const name of sensitive) {
      expect(rowOf(name)?.[1], name).toContain("מנהל הסיסמאות");
    }
    const settings = [
      ...readRepoFile(".env.example").matchAll(/^([A-Z0-9_]+)=/gm),
    ].map(([, name = ""]) => name);
    for (const name of settings) {
      if (name === "PUSH_TEST_ORIGIN") continue;
      expect(rowOf(`\`${name}\``), name).toBeDefined();
    }
  });

  it("names no path on anyone's computer", () => {
    expect(doc).not.toMatch(/[A-Za-z]:\\Users/i);
    expect(doc).not.toMatch(/\/Users\//);
    expect(doc).not.toMatch(/\/home\/[a-z]/);
  });
});
