import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Every pg_cron job the migrations schedule is switched off by the local
// seed, so the tests run what it runs at times they choose and nothing runs
// at real time under them, and is named in supabase/README.md with the
// count the paragraph gives, where whoever sets up a hosted project reads
// which jobs run and what each needs (H4's review found `audit-guard`
// missing there).

const root = join(__dirname, "..");
const read = (path: string) =>
  readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");

const COUNTS = [
  "none",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
];

/** The jobs the migrations schedule and don't unschedule later, in order. */
function scheduledJobs(): string[] {
  const jobs: string[] = [];
  const migrations = readdirSync(join(root, "supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const name of migrations) {
    const sql = read(`supabase/migrations/${name}`).replace(/^\s*--.*$/gm, "");
    for (const [, verb, job = ""] of sql.matchAll(
      /cron\.(schedule|unschedule)\(\s*'([a-z0-9-]+)'/g,
    )) {
      const at = jobs.indexOf(job);
      if (verb === "schedule" && at < 0) jobs.push(job);
      if (verb === "unschedule" && at >= 0) jobs.splice(at, 1);
    }
  }
  return jobs;
}

describe("the scheduled jobs", () => {
  const jobs = scheduledJobs();

  it("are found", () => {
    expect(jobs).toContain("notifications");
    expect(jobs).toContain("audit-guard");
  });

  it("are all switched off by the local seed", () => {
    const list =
      /cron\.alter_job\(j\.jobid, active => false\)\s+from cron\.job j\s+where j\.jobname in \(([^)]*)\)/.exec(
        read("supabase/seed.sql"),
      );
    expect(list).not.toBeNull();
    const off = [...(list?.[1] ?? "").matchAll(/'([a-z0-9-]+)'/g)].map(
      ([, job]) => job,
    );
    expect([...off].sort()).toEqual([...jobs].sort());
  });

  it("are each named in supabase/README.md, with their count", () => {
    const readme = read("supabase/README.md");
    for (const job of jobs) expect(readme, job).toContain(`\`${job}\``);
    const count = COUNTS[jobs.length] ?? String(jobs.length);
    expect(readme).toMatch(new RegExp(`switches all\\s+${count}\\s+off`));
  });

  it("are each named in docs/production.md, where the first apply is checked", () => {
    // B3's check after the first Migrate conceptapp-prod run lists them, so
    // a job a migration adds is looked for there too.
    const doc = read("docs/production.md");
    for (const job of jobs) expect(doc, job).toContain(`\`${job}\``);
  });
});
