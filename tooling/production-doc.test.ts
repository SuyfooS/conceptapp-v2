import { readdirSync } from "node:fs";
import { join } from "node:path";
import { TURNSTILE_TEST_KEYS } from "@domain/turnstile";
import { describe, expect, it } from "vitest";
import he from "../messages/he.json";
import { blocks, jobs, readRepoFile, topLevel } from "./workflows";

// docs/production.md, the step-by-step setup of production for Orel (P9):
// linked from where he and a session look, its commands pasteable into
// PowerShell 5 one line at a time, nothing in it that looks like a secret or
// a path on someone's computer, and whole: every setting Vercel needs, the
// workflow, the environment and its secrets by the names GitHub shows, a
// number for each of Supabase's rate limits, and where each value comes from
// when Vercel won't show it again. In order, too: the organisation chosen
// before anything is paid for, the cron secret made once, the demo's site
// rebuilt after its values, production's values in Production alone with a
// check of Preview and Development, and the real site released from its own
// branch only after Migrate conceptapp-prod. The repo is public, so what it
// must never hold is checked here too. Turnstile's "אני לא רובוט" (P9b) goes
// on in its own order: the code, the public key in Vercel and a rebuild, a
// look at the key each site names (never Cloudflare's test key, read by
// tooling/check-site.mjs), and only then CAPTCHA in Supabase, with a way
// back. And A1, free and now: development's secrets in their own
// environment, limited to main, and rules for main (CI's checks by the
// names GitHub shows, every one) and for production (never deleted or
// forced).

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

/**
 * The addresses `text` runs tooling/check-site.mjs on, in order: each a line
 * of its own, `https://` and a host, in a PowerShell block that starts with
 * `git pull`.
 */
function checkSiteRuns(text: string): string[] {
  const found: string[] = [];
  for (const { lang, body } of fences) {
    if (!body.includes("check-site.mjs") || !text.includes(body)) continue;
    const lines = body
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");
    expect(lang, body).toBe("powershell");
    expect(lines[0], body).toBe("git pull");
    for (const line of lines.slice(1)) {
      const site =
        /^node tooling\/check-site\.mjs (https:\/\/[a-z0-9.-]+)$/.exec(
          line,
        )?.[1];
      expect(site, line).toBeDefined();
      if (site) found.push(site);
    }
  }
  return found;
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
    // Development's are repository secrets until A1: entered under those
    // names, production's values would overwrite them and reach
    // migrate-dev.yml.
    const prod = secretsOf(".github/workflows/migrate-prod.yml");
    expect(prod.length).toBeGreaterThan(0);
    const b3 = section("ב3.");
    for (const name of prod) {
      expect(b3, name).toContain(`\`${name}\``);
    }
    // Development's names appear only where development's secrets move into
    // their own environment (A1), and nowhere production's are entered.
    const dev = secretsOf(".github/workflows/migrate-dev.yml");
    expect(dev.length).toBeGreaterThan(0);
    const a1 = section("א1.");
    const outside = doc.replace(a1, "");
    for (const name of dev) {
      expect(outside, name).not.toContain(`\`${name}\``);
      expect(a1, name).toContain(`\`${name}\``);
    }
  });

  it("moves development's secrets into conceptapp-dev, limited to main, before the repository's go (A1)", () => {
    const workflow = readRepoFile(".github/workflows/migrate-dev.yml");
    const name = /^name: (.+)$/m.exec(topLevel(workflow, "name"))?.[1];
    expect(name).toBe("Migrate conceptapp-dev");
    const environments = jobs(workflow).map(
      ({ body }) => /^ {4}environment: (\S+)$/m.exec(body)?.[1],
    );
    expect(environments).toEqual(["conceptapp-dev"]);
    const a1 = section("א1.");
    const environment = stepOf(a1, 1);
    for (const word of [
      `New environment\`, שם בדיוק \`${environments[0]}\``,
      "`Selected branches and tags`, וכלל אחד: `main`",
      "`Environment secrets`",
      ...secretsOf(".github/workflows/migrate-dev.yml").map((s) => `\`${s}\``),
    ]) {
      expect(environment, word).toContain(word);
    }
    // GitHub ticks it on a new environment, as in B3.
    const bypass =
      "`Allow administrators to bypass configured protection rules`";
    const bypassLines = environment
      .split("\n")
      .filter((line) => line.includes(bypass));
    expect(bypassLines.length).toBeGreaterThan(0);
    for (const line of bypassLines) {
      expect(line).toContain("להוריד את הסימון");
    }
    // A run that connects with the environment's own before the
    // repository's are deleted, and the unused token with them.
    const dry = stepOf(a1, 2);
    expect(dry).toContain(`Actions → ${name} → Run workflow`);
    expect(dry).toContain("ענף `main`");
    expect(dry).toContain('"Find the connection"');
    const repository = stepOf(a1, 3);
    expect(repository).toContain("`Repository secrets`");
    for (const secret of [
      ...secretsOf(".github/workflows/migrate-dev.yml"),
      "SUPABASE_ACCESS_TOKEN",
    ]) {
      expect(repository, secret).toContain(`\`${secret}\``);
    }
    // Deleting the token breaks nothing: no workflow reads it.
    for (const file of ["ci.yml", "migrate-dev.yml", "migrate-prod.yml"]) {
      expect(readRepoFile(`.github/workflows/${file}`), file).not.toContain(
        "SUPABASE_ACCESS_TOKEN",
      );
    }
  });

  it("names CI's required checks as GitHub shows them, every one (A1)", () => {
    // A job's check is its `name:` with the matrix filled in, else its id;
    // gate counts too (skipped on a pull request, which GitHub counts as
    // passed). A job added to CI fails here until the list has it.
    const ci = readRepoFile(".github/workflows/ci.yml");
    const names = jobs(ci).flatMap(({ key, body }) => {
      const template = /^ {4}name: (.+)$/m.exec(body)?.[1];
      if (!template) return [key];
      const strategy = blocks(body, 4).find((b) => b.key === "strategy");
      const axes = [
        ...(strategy?.body ?? "").matchAll(/^ {8}(\w+): \[([^\]]*)\]$/gm),
      ].map(([, axis = "", values = ""]) => ({
        axis,
        values: values.split(",").map((v) => v.trim()),
      }));
      let filled = [template];
      for (const { axis, values } of axes) {
        const slot = new RegExp(`\\$\\{\\{\\s*matrix\\.${axis}\\s*\\}\\}`, "g");
        filled = filled.flatMap((name) =>
          values.map((value) => name.replace(slot, value)),
        );
      }
      for (const name of filled) expect(name, key).not.toContain("${{");
      return filled;
    });
    expect(names).toContain("gate");
    expect(names).toContain("e2e (phone 1/2)");
    const checks = stepOf(section("א1."), 4);
    const listed = [...checks.matchAll(/^ +- `([^`]+)`$/gm)].map(
      ([, name = ""]) => name,
    );
    expect([...listed].sort()).toEqual([...names].sort());
    expect(checks).toContain("`Require status checks to pass`");
    // Named, never counted: a word for nine would go stale with PR 27's job.
    expect(checks).toContain("לבדוק), השמות האלה בדיוק");
    // The other way too: a check renamed, removed or split anew never
    // reports its old name, so its PR waits for the ruleset, and says so.
    expect(checks).toContain("GitHub מחכה לשמות הישנים");
    expect(checks).toContain("PR כזה אומר את זה בתיאור שלו ומחכה לך");
    const brief = readRepoFile("docs/AGENT.md").replace(/\s+/g, " ");
    expect(brief).toContain(
      "a pull request that renames, removes or re-splits a CI job can't merge until Orel lists the new check names there and drops the old",
    );
    // A job added to CI merges, and its check blocks nothing until Orel adds
    // it to the ruleset: so its PR names it for him, in words he looks for.
    expect(checks).toContain(
      "עד אז היא לא עוצרת שום מיזוג, ולכן ה-PR שמוסיף אותה כותב בתיאור שלו את השם להוספה",
    );
    expect(brief).toContain(
      'a pull request that adds a CI job merges, but its check blocks nothing until Orel adds it: write "add `<check name>` to main\'s ruleset (docs/production.md, A1 step 4)" in its description and in the nightly note',
    );
  });

  it("rules main and production: never deleted, never forced, main only through a PR with the checks (A1)", () => {
    const a1 = section("א1.");
    const main = stepOf(a1, 4);
    const production = stepOf(a1, 5);
    for (const [where, text] of [
      ["main", main],
      ["production", production],
    ] as const) {
      expect(text, where).toContain(`\`Ruleset Name\`: \`${where}\``);
      expect(text, where).toContain("`Enforcement status`: `Active`");
      expect(text, where).toContain("`Bypass list`: ריק");
      expect(text, where).toContain("`Restrict deletions`");
      expect(text, where).toContain("`Block force pushes`");
    }
    expect(main).toContain("`Include default branch`");
    expect(main).toContain("`Require a pull request before merging`");
    expect(main).toContain("`Required approvals` 0");
    expect(main).toContain(
      "`Require branches to be up to date before merging`: לא לסמן",
    );
    // Unticked, a PR that conflicts with main still needs updating with it,
    // and nearly every one does, each writing at the top of the log; with the
    // ruleset that update waits for every check again. Orel hears it before
    // he turns the rule on, and the brief stays for that run.
    expect(readRepoFile("docs/agent/LOG.md")).toContain("Newest entry on top");
    const updated =
      main.split("\n").find((line) => line.includes("PR שמתנגש עם `main`")) ??
      "";
    expect(updated).toContain("כולם כותבים בראש `docs/agent/LOG.md`");
    expect(updated).toContain(
      "מחכה שוב לכל הבדיקות, עם ה-e2e, גם כשההתנגשות רק במסמכים",
    );
    expect(
      main.indexOf("`Require branches to be up to date before merging`"),
    ).toBeLessThan(main.indexOf(updated));
    expect(readRepoFile("docs/AGENT.md").replace(/\s+/g, " ")).toContain(
      "a branch brought up to date with `main`, even for a conflict only in the log or the roadmap, waits for its whole CI run again, e2e and all, before it can merge",
    );
    expect(production).toContain("`Include by pattern`, והשם `production`");
    expect(production).toContain("לא `Restrict creations`");
    // Orel's release is a direct fast-forward push of a commit main tested.
    expect(production).not.toContain("`Require a pull request before merging`");
    expect(production).not.toContain("`Require status checks to pass`");
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

  it("says in B12 what the screen tells someone the network's count stopped, in its own words", () => {
    // Closing the pilot, PR 2: the 21st person on the shop's Wi-Fi is told,
    // and the day's SQL is for when cellular isn't an answer.
    const [said = ""] = he.auth.signIn.errors.tooManyNetwork.split(".");
    expect(said.length).toBeGreaterThan(10);
    const joining = section("ב12.");
    expect(joining).toContain(said);
    expect(joining.indexOf(said)).toBeLessThan(
      joining.indexOf("update private.auth_limits"),
    );
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
    const sensitive = rows(stepOf(b7, 5))
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

  it("has the organisation chosen, with its price, before the project and before Pro", () => {
    // In a Pro organisation every project pays for its compute: upgraded
    // first, the demo's would be paid before Orel chose it.
    const b2 = section("ב2.");
    const choose = stepOf(b2, 1);
    for (const word of ["באיזה ארגון", "מחיר", "`New organization`"]) {
      expect(choose, word).toContain(word);
    }
    expect(stepOf(b2, 2)).toMatch(/בארגון שבחרת: `New project`/);
    const upgrade = [2, 3, 4].find((n) =>
      stepOf(b2, n).includes("`Spend cap`"),
    );
    expect(upgrade).toBeDefined();
    expect(stepOf(b2, upgrade ?? 0)).toContain("רק הארגון שבחרת");
    expect(choose).not.toContain("`Spend cap`");
  });

  it("makes the cron secret once, in B5, and B7 takes it from the password manager", () => {
    // Two values and the app refuses every job, with nothing on screen.
    const make = "randomBytes(32)";
    expect(doc.split(make)).toHaveLength(2);
    const made = fences.filter(({ body }) => body.includes(make));
    expect(made).toHaveLength(1);
    const lines = (made[0]?.body ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");
    expect(lines[0]).toBe("git pull");
    const b5 = section("ב5.");
    expect(b5).toContain(make);
    expect(b5).toContain("מנהל הסיסמאות");
    const real = rows(stepOf(section("ב7."), 5)).find(
      ([name = ""]) => name === "`CRON_SECRET`",
    );
    expect(real?.[1]).toContain("ב5");
    expect(real?.[1]).toContain("מנהל הסיסמאות");
    expect(real?.join(" ")).not.toContain("חדש");
    expect(real?.join(" ")).not.toContain("הפקודה");
  });

  it("puts production's values in Production alone, splitting an entry Preview shares, and checks both", () => {
    // In Vercel one entry serves every environment ticked on it: a new value
    // there would reach every branch's preview, the nightly agent's too.
    const b7 = section("ב7.");
    const how = b7.slice(
      b7.indexOf("**משתנה ל-`Production` בלבד**"),
      b7.search(/^1\. /m),
    );
    for (const word of [
      "`Preview`",
      "`Development`",
      "מורידים בו את הסימון מ-`Production`",
      "`Add`",
    ]) {
      expect(how, word).toContain(word);
    }
    const stepB = stepOf(b7, 5);
    expect(stepB).toContain("בדרך שלמעלה");
    const check = stepB.slice(stepB.indexOf("**בדיקה:**"));
    const sensitive = rows(stepB)
      .filter((cells) => cells.some((cell) => cell.includes("`Sensitive`")))
      .map(([name = ""]) => name);
    expect(sensitive.length).toBeGreaterThan(0);
    for (const word of [
      "`Preview`",
      "`Development`",
      "`NEXT_PUBLIC_SUPABASE_URL`",
      "`conceptapp-dev`",
      "`EMPLOYEE_DATA_KEKS`",
      ...sensitive,
    ]) {
      expect(check, word).toContain(word);
    }
    // B9's keys: the same way in, and the same check.
    const keys = stepOf(section("ב9."), 2);
    expect(keys).toContain("בדרך שבב7");
    const keysCheck = keys.slice(keys.indexOf("**בדיקה:**"));
    for (const word of [
      "`Preview`",
      "`Development`",
      "`EMPLOYEE_DATA_KEKS`",
      "`EMPLOYEE_DATA_KEK_ACTIVE`",
    ]) {
      expect(keysCheck, word).toContain(word);
    }
  });

  it("releases the real site only from production, after Migrate, by the workflow's own lines", () => {
    // From B7 step 4 a merge to main reaches the demo's site alone; the real
    // one deploys the branch production, which Orel moves to the commit
    // whose migrations Migrate conceptapp-prod applied.
    const workflow = readRepoFile(".github/workflows/migrate-prod.yml");
    const lines = [...workflow.matchAll(/^\s*echo "(git [^"]+)"$/gm)].map(
      ([, line = ""]) => line.replace("$GITHUB_SHA", "COMMIT"),
    );
    expect(lines).toEqual([
      "git fetch origin",
      "git push origin COMMIT:refs/heads/production",
    ]);
    const releases = fences.filter(({ body }) =>
      body.includes("refs/heads/production"),
    );
    expect(releases.length).toBeGreaterThanOrEqual(2);
    for (const { body } of releases) {
      expect(
        body
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line !== ""),
      ).toEqual(lines);
    }
    for (const { body } of fences) {
      expect(body).not.toContain("--force");
      expect(body).not.toMatch(/\s\+\S*:refs\//);
      for (const line of body.split("\n")) {
        if (!line.includes("git push")) continue;
        expect(line.trim()).toBe(lines[1]);
      }
    }

    const b7 = section("ב7.");
    const gate = stepOf(b7, 4);
    expect(gate).toContain("`Branch Tracking`");
    expect(gate).toContain("`production` במקום `main`");
    expect(gate).toMatch(/ההדגמה[^\n]*`main`/);
    // Step B comes after it: Migrate again, the values, then the first release.
    const stepB = stepOf(b7, 5);
    expect(stepB).toContain("צעד ב");
    const migrate = stepB.indexOf("Migrate conceptapp-prod");
    const table = stepB.search(/^\s*\|/m);
    const release = stepB.indexOf("refs/heads/production");
    expect(migrate).toBeGreaterThanOrEqual(0);
    expect(migrate).toBeLessThan(table);
    expect(table).toBeLessThan(release);

    const update = section("עדכון אחרי שעסק אמיתי עלה");
    expect(update).toContain(
      "Actions → Migrate conceptapp-prod → Run workflow",
    );
    const dry = update.indexOf("`apply` כבוי");
    const apply = update.indexOf("`apply` דלוק");
    const push = update.indexOf("refs/heads/production");
    expect(dry).toBeGreaterThanOrEqual(0);
    expect(dry).toBeLessThan(apply);
    expect(apply).toBeLessThan(push);
    // Moving it is Orel's alone.
    expect(section("שלושה כללים")).toContain("לא מקדמים את הענף `production`");
  });

  it("releases from step B's own run, never B3's, which shows only what came since", () => {
    // B3's lines name an older commit than the schema step B applies: run on
    // the first day, they would put code older than the database on the site.
    const run = stepOf(section("ב3."), 3);
    expect(run).not.toContain("ב7 צעד ב ואילך");
    expect(run).toContain("לא מריצים בכלל");
    const stepB = stepOf(section("ב7."), 5);
    const rerun = stepB.slice(0, stepB.search(/^\s*\|/m));
    expect(rerun).toContain('"עדכון אחרי שעסק אמיתי עלה"');
    expect(rerun).toContain("רק מה שנוסף מאז ב3, או כלום");
    expect(rerun).not.toContain("כמו בב3");
  });

  it("says when to release: the line every note and summary carries, at least weekly", () => {
    // From step B a merge reaches the demo alone, a fix and a revert too:
    // the agent's note and each session's summary say what is waiting.
    const update = section("עדכון אחרי שעסק אמיתי עלה");
    const when = update.slice(
      update.indexOf("**מתי:**"),
      update.indexOf("**זמן:**"),
    );
    for (const word of [
      '"מחכה לשחרור לעסקים"',
      '"כלום"',
      "`יומן הסוכן`",
      "סשן",
      "פעם בשבוע",
      '"כולל שינוי במבנה"',
      "`בטל`",
    ]) {
      expect(when, word).toContain(word);
    }
    // The agent's brief tells every note and summary to carry that line, and
    // never to move the branch the real site deploys.
    const brief = readRepoFile("docs/AGENT.md");
    for (const word of [
      "מחכה לשחרור לעסקים: <n> שינויים",
      "מחכה לשחרור לעסקים: כלום",
      "כולל שינוי במבנה",
      "git log --oneline origin/production..origin/main",
      "push to the branch `production`",
    ]) {
      expect(brief, word).toContain(word);
    }
  });

  it("has a first step when the check after a release fails", () => {
    // A revert on main no longer reaches the real site by itself, and
    // production never moves backwards: the previous version is brought back
    // in Vercel, and a session opened.
    const update = section("עדכון אחרי שעסק אמיתי עלה");
    const step = stepOf(update, 4);
    const check = step.slice(0, step.search(/^- /m));
    for (const word of [
      "אם הבדיקה לא עוברת",
      "סשן",
      "`Ready`",
      "`Instant Rollback`",
      "`Undo Rollback`",
      "המבנה של המסד לא חוזר",
    ]) {
      expect(check, word).toContain(word);
    }
    // The first release's check too, with no business on the site yet.
    const stepB = stepOf(section("ב7."), 5);
    const first = stepB.slice(stepB.indexOf("**בדיקה:**"));
    expect(first).toContain("**אם הבדיקה לא עוברת**");
    expect(first).toContain("סשן");
  });

  it("redeploys the release itself after a value changes, never the top version", () => {
    // A changed value reaches only a new build, and from B7 step 4 the top
    // deployment is usually a preview of main, with development's values.
    const redeploy =
      "`Redeploy` לגרסה הנוכחית של `Production`, מהענף `production`";
    const appendix = rows(section("נספח: החלפת סוד"));
    const vercel = appendix.filter((cells) =>
      cells.join(" ").includes("Vercel"),
    );
    expect(vercel.map(([name = ""]) => name)).toEqual(
      expect.arrayContaining([
        "`SUPABASE_SECRET_KEY`",
        "`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`",
        "`CRON_SECRET`",
        "`EMPLOYEE_DATA_KEKS`",
      ]),
    );
    for (const [name = "", where = ""] of vercel) {
      expect(where, name).toContain(redeploy);
    }
    const whereOf = (name: string) =>
      appendix.find(([cell = ""]) => cell === name)?.[1] ?? "";
    // Vault takes the cron secret once the site runs it; the old secret key
    // goes once the site runs the new one.
    const cron = whereOf("`CRON_SECRET`");
    expect(cron.indexOf("`cron_secret`")).toBeGreaterThan(
      cron.indexOf("`Ready`"),
    );
    expect(cron.indexOf("`Ready`")).toBeGreaterThan(cron.indexOf(redeploy));
    const key = whereOf("`SUPABASE_SECRET_KEY`");
    const remove = key.indexOf("מוחקים את הישן רק כשהיא `Ready`");
    expect(remove).toBeGreaterThan(key.indexOf(redeploy));
    expect(key.indexOf(redeploy)).toBeGreaterThanOrEqual(0);
    // B9's keys the same way, and the update section says which version.
    expect(stepOf(section("ב9."), 2)).toContain(redeploy);
    expect(section("עדכון אחרי שעסק אמיתי עלה")).toContain(
      "הגרסה הנוכחית של `Production`, מהענף `production`, `⋯` → `Redeploy`. לא הגרסה העליונה",
    );
  });

  it("redeploys the demo's site after its values, and points the dev project at it once it answers", () => {
    const demo = stepOf(section("ב7."), 2);
    const table = demo.lastIndexOf("|");
    const redeploy = demo.indexOf("`Redeploy`", table);
    const check = demo.indexOf("**בדיקה:**");
    expect(table).toBeGreaterThan(0);
    expect(redeploy).toBeGreaterThan(table);
    expect(redeploy).toBeLessThan(check);
    for (const word of ["`app_url`", "`Site URL`"]) {
      expect(demo.indexOf(word), word).toBeGreaterThan(check);
    }
  });

  it("turns CAPTCHA on only after the site sends Turnstile's token, and checks sign-in", () => {
    // CAPTCHA on before the site sends the token stops every code.
    const turnstile = section("Turnstile");
    expect(stepOf(turnstile, 1)).toContain("`Ready`");
    const key = stepOf(turnstile, 2);
    for (const word of [
      "`NEXT_PUBLIC_TURNSTILE_SITE_KEY`",
      "`Production`",
      "`Preview`",
      "`Site Key`",
      "`Secret Key`",
    ]) {
      expect(key, word).toContain(word);
    }
    expect(key).toMatch(/`Secret Key` של הווידג'ט לא נכנס ל-Vercel/);
    expect(stepOf(turnstile, 3)).toContain("`Redeploy`");
    const look = stepOf(turnstile, 4);
    expect(look).toContain("חלון פרטי");
    const unloaded = he.ui.captcha.unavailable.split(".")[0] ?? "";
    expect(look).toContain(unloaded);
    // The key first, with a hard stop on the test key: it passes on any
    // address, so the screen shows nothing, and CAPTCHA would then refuse
    // every code. One command per address reads the key the page names
    // (tooling/check-site.mjs), in place of looking at its source by hand.
    expect(look).toContain("`data-sitekey`");
    expect(look).toContain(`\`${TURNSTILE_TEST_KEYS.pass}\`, עוצרים`);
    expect(look.indexOf("`data-sitekey`")).toBeLessThan(look.indexOf(unloaded));
    expect(checkSiteRuns(look)).toEqual([
      "https://www.conceptapp.co.il",
      "https://conceptapp-v2.vercel.app",
    ]);
    expect(look.indexOf("check-site.mjs")).toBeLessThan(look.indexOf(unloaded));
    // Its lines start with a mark ("[v] Turnstile: …"), not the word.
    expect(look).toContain("בשורה של `Turnstile`");
    expect(look).not.toContain("שמתחילה ב-`Turnstile`");
    expect(readRepoFile("packages/ui/captcha.tsx")).toContain(
      "data-sitekey={siteKey",
    );
    const on = stepOf(turnstile, 5);
    expect(on).toContain("`Authentication → Attack Protection`");
    expect(on).toContain("`Secret Key`");
    const after = stepOf(turnstile, 6);
    expect(after).toContain("חלון פרטי");
    const refused = he.auth.signIn.errors.captcha.split(",")[0] ?? "";
    expect(refused.length).toBeGreaterThan(10);
    expect(after).toContain(refused);
    expect(after).toContain("מכבים את CAPTCHA");
  });

  it("has production's CAPTCHA turned on with the same widget, checked in B7 step B", () => {
    const b4 = stepOf(section("ב4."), 7);
    expect(b4).not.toContain("עוד לא בקוד");
    expect(b4).toContain("`Authentication → Attack Protection`");
    expect(b4).toContain("ב7 צעד ב");
    expect(b4).toContain("`conceptapp-prod`");
    expect(b4).toContain("`data-sitekey`");
    // The demo's own project and the real site look at the key too, before
    // anyone signs in: each is a build of its own.
    const stepB = stepOf(section("ב7."), 5);
    const stepBChecks = stepB.slice(stepB.indexOf("**בדיקה:**"));
    for (const [where, text, site] of [
      ["B7.2", stepOf(section("ב7."), 2), "https://demo.conceptapp.co.il"],
      ["B7 step B", stepBChecks, "https://www.conceptapp.co.il"],
    ] as const) {
      expect(text, where).toContain("`data-sitekey`");
      expect(text, where).toContain(`\`${TURNSTILE_TEST_KEYS.pass}\``);
      expect(text, where).toContain("`Redeploy`");
      expect(checkSiteRuns(text), where).toEqual([site]);
    }
    expect(stepBChecks.indexOf("`data-sitekey`")).toBeGreaterThan(0);
    expect(stepBChecks.indexOf("`data-sitekey`")).toBeLessThan(
      stepBChecks.indexOf("נכנסים עם המספר שלך"),
    );
    // Public and the same everywhere: the real site's table leaves it be.
    const real = rows(stepOf(section("ב7."), 5)).find(
      ([name = ""]) => name === "`NEXT_PUBLIC_TURNSTILE_SITE_KEY`",
    );
    expect(real?.join(" ")).toContain("לא נוגעים בו");
    expect(real?.join(" ")).not.toContain("`Sensitive`");
    // Rotating the secret never touches Vercel.
    const appendix = rows(section("נספח: החלפת סוד")).find(([name = ""]) =>
      name.includes("Turnstile"),
    );
    expect(appendix?.[0]).toContain("`Secret Key`");
    expect(appendix?.join(" ")).not.toContain("Vercel");
    expect(section("ב1.")).toContain("Cloudflare (Turnstile)");
    expect(section("מה הקוד כבר עושה")).toContain(
      "`NEXT_PUBLIC_TURNSTILE_SITE_KEY`",
    );
  });

  it("checks a site's key by the command, never by reading the page's source by hand", () => {
    // Closing the pilot, PR 18: one command reads /health, the door, the
    // key and the headers from outside (tooling/check-site.test.ts).
    expect(doc).not.toMatch(/Ctrl\+U/i);
    expect(readRepoFile("tooling/check-site.mjs")).toContain(
      "export async function checkSite(",
    );
    const runs = fences.filter(({ body }) => body.includes("check-site.mjs"));
    expect(runs.length).toBeGreaterThanOrEqual(3);
    expect(checkSiteRuns(doc).length).toBeGreaterThanOrEqual(4);
    expect(section("מה הקוד כבר עושה")).toContain("`tooling/check-site.mjs`");
  });

  it("backs up the files by the command, restores them only to a temporary project, and says when (B8)", () => {
    // Closing the pilot, PR 20 (tooling/backup-files.test.ts and
    // tooling/restore-files.test.ts): Supabase's database backup holds the
    // files' rows and not the files, so they have a backup of their own.
    const b8 = section("ב8.");
    expect(b8).toContain("לא כולל את הקבצים");
    const runs = fences.filter(
      ({ body }) =>
        b8.includes(body) && /tooling\/(backup|restore)-files\.mjs/.test(body),
    );
    expect(runs.map(({ lang }) => lang)).toEqual(["powershell", "powershell"]);
    expect(
      runs.map(({ body }) =>
        body
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line !== ""),
      ),
    ).toEqual([
      ["git pull", "node tooling/backup-files.mjs"],
      ["git pull", 'node tooling/restore-files.mjs "FILE" --overwrite'],
    ]);
    // Monthly, and before a release that changes the database's structure:
    // said in B8, and as step 0 of the release Orel follows every week, with
    // a reminder in his calendar for the monthly one.
    expect(b8).toContain("פעם בחודש");
    expect(b8).toContain("כולל שינוי במבנה");
    expect(stepOf(b8, 3)).toContain("צעד 0");
    expect(stepOf(b8, 3)).toContain("תזכורת חוזרת ביומן");
    const update = section("עדכון אחרי שעסק אמיתי עלה");
    const zero = update.slice(update.search(/^0\. /m), update.search(/^1\. /m));
    for (const word of ['"כולל שינוי במבנה"', "ב8, צעד 2", '"הכול תקין"']) {
      expect(zero, word).toContain(word);
    }
    expect(update).toContain("**זמן:** כרבע שעה, וכחצי שעה כשיש שינוי במבנה");
    // The address shown and its ref checked; the plain files never in a
    // folder that syncs; a folder left behind deleted by hand.
    const files = stepOf(b8, 2);
    for (const word of [
      'כותבת "הפרויקט:"',
      "המזהה של `conceptapp-prod`, כמו בכתובת שלו בלוח",
      "שלא מסתנכרנת לענן",
      "לא סוגרים את החלון",
      "`Shift+Delete`",
      "משלושת החודשים האחרונים",
    ]) {
      expect(files, word).toContain(word);
    }
    // The drill twice: before the business there are no files to bring back.
    const drill = stepOf(b8, 4);
    for (const word of [
      "ועוד פעם אחרי החודש הראשון עם העסק",
      "עוד אין קבצים",
      "ב-`documents` וב-`avatars` יש קבצים",
      "אם הלשונית לא מופיעה: עוצרים ושואלים בסשן",
      "כמו `conceptapp-dev`, הוא לא העותק",
    ]) {
      expect(drill, word).toContain(word);
    }
    // The drill: a project Orel makes, which costs by the hour, its jobs off
    // first, the counts on both, and the project deleted after.
    for (const word of [
      "`Restore to a New Project`",
      "לפי שעה",
      "cron.alter_job",
      "query_to_xml",
      "→ Delete project`",
      "`--overwrite`",
    ]) {
      expect(b8, word).toContain(word);
    }
    const sql = fences
      .filter(({ lang, body }) => lang === "sql" && b8.includes(body))
      .map(({ body }) => body);
    expect(sql).toHaveLength(2);
    expect(sql[1]).toContain("'storage'");
    // Only Orel, on his computer: never in GitHub Actions, and no workflow
    // names either script.
    expect(b8).toContain("GitHub Actions");
    for (const script of ["backup-files.mjs", "restore-files.mjs"]) {
      expect(readRepoFile(`tooling/${script}`)).toContain("if (runsInCi(env))");
      for (const workflow of readdirSync(
        join(__dirname, "..", ".github", "workflows"),
      )) {
        expect(
          readRepoFile(`.github/workflows/${workflow}`),
          `${workflow} ${script}`,
        ).not.toContain(script);
      }
    }
    expect(section("מה הקוד כבר עושה")).toContain(
      "`tooling/backup-files.mjs`, `tooling/restore-files.mjs`",
    );
  });

  it("names no path on anyone's computer", () => {
    expect(doc).not.toMatch(/[A-Za-z]:\\Users/i);
    expect(doc).not.toMatch(/\/Users\//);
    expect(doc).not.toMatch(/\/home\/[a-z]/);
  });
});
