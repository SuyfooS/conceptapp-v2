import { describe, expect, it } from "vitest";
import { jobs, readRepoFile, topLevel } from "./workflows";

// docs/production.md, the step-by-step setup of production for Orel (P9):
// linked from where he and a session look, its commands pasteable into
// PowerShell 5 one line at a time, nothing in it that looks like a secret or
// a path on someone's computer, and whole: every setting Vercel needs, and
// the workflow and the environment by the names GitHub shows. The repo is
// public, so what it must never hold is checked here too.

const doc = readRepoFile("docs/production.md");

/** Each fenced block of the doc, with the language its fence names. */
const fences = [...doc.matchAll(/^\s*```(\w*)\n([\s\S]*?)^\s*```$/gm)].map(
  ([, lang = "", body = ""]) => ({ lang, body }),
);

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

  it("names no path on anyone's computer", () => {
    expect(doc).not.toMatch(/[A-Za-z]:\\Users/i);
    expect(doc).not.toMatch(/\/Users\//);
    expect(doc).not.toMatch(/\/home\/[a-z]/);
  });
});
