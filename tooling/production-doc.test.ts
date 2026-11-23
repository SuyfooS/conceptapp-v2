import { describe, expect, it } from "vitest";
import { jobs, readRepoFile, topLevel } from "./workflows";

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
// must never hold is checked here too.

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

  it("names no path on anyone's computer", () => {
    expect(doc).not.toMatch(/[A-Za-z]:\\Users/i);
    expect(doc).not.toMatch(/\/Users\//);
    expect(doc).not.toMatch(/\/home\/[a-z]/);
  });
});
