import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  blocks,
  jobs,
  readRepoFile,
  stepName,
  steps,
  topLevel,
  withoutComments,
} from "./workflows";

// The uptime check (closing the pilot, PR 11): .github/workflows/uptime.yml,
// the repository's first schedule, runs .github/scripts/uptime.sh, which asks
// the hosted site's /health and /health/db and keeps one issue labelled
// `uptime` open while either gets no answer. The workflow is read as text, as
// GitHub reads it: four times an hour off the hour and by hand, one run at a
// time, GITHUB_TOKEN alone with the code to read and issues to write, no
// secret, and nothing typed by hand ever written into a script. The script
// is run with curl and gh stood in for (CI only, like
// tooling/supabase-start.test.ts: it needs bash and the Ubuntu runner's
// tools, and Orel's PowerShell has neither): what it asks, and what it opens,
// says, closes or leaves alone. Never against a real site or a real issue.

const workflow = readRepoFile(".github/workflows/uptime.yml");
const script = readRepoFile(".github/scripts/uptime.sh");
const code = withoutComments(workflow);
const REAL = "https://www.conceptapp.co.il";

const [job] = jobs(workflow);
const allSteps = steps(job?.body ?? "");

/** Each `run:` of the workflow, with the lines under it. */
const runs = allSteps.flatMap((step) => {
  const at = step.search(/^ {8}run: /m);
  return at < 0 ? [] : [step.slice(at)];
});

describe("the workflow", () => {
  it("runs four times an hour, off the hour, and by hand", () => {
    const on = topLevel(workflow, "on");
    expect(blocks(on, 2).map((b) => b.key)).toEqual([
      "schedule",
      "workflow_dispatch",
    ]);
    const crons = [...on.matchAll(/^ {4}- cron: "([^"]+)"$/gm)].map(
      ([, cron = ""]) => cron,
    );
    expect(crons).toEqual(["7,22,37,52 * * * *"]);
    const [minutes = "", ...rest] = (crons[0] ?? "").split(" ");
    expect(rest).toEqual(["*", "*", "*", "*"]);
    // Every quarter of an hour, never at :00 or :30, when GitHub starts the
    // most schedules and runs them late.
    const at = minutes.split(",").map(Number);
    expect(at).toEqual([7, 22, 37, 52]);
    expect(at.filter((m) => m % 30 === 0)).toEqual([]);
    // Nothing anyone else does starts it: no push, pull request or issue.
    for (const trigger of [
      "push",
      "pull_request",
      "pull_request_target",
      "workflow_run",
      "repository_dispatch",
      "workflow_call",
      "issues",
      "issue_comment",
    ]) {
      expect(on, trigger).not.toMatch(new RegExp(`^ +${trigger}:`, "m"));
    }
  });

  it("takes one address by hand, empty for the real site", () => {
    const inputs = blocks(topLevel(workflow, "on"), 4).find(
      (b) => b.key === "inputs",
    );
    const fields = blocks(inputs?.body ?? "", 6);
    expect(fields.map((b) => b.key)).toEqual(["site"]);
    const site = fields[0]?.body ?? "";
    expect(site).toMatch(/^ {8}type: string$/m);
    expect(site).toMatch(/^ {8}required: false$/m);
    expect(site).toMatch(/^ {8}default: ""$/m);
  });

  it("runs one at a time, never cutting one short", () => {
    expect(topLevel(workflow, "concurrency").trim()).toBe(
      "concurrency:\n  group: uptime\n  cancel-in-progress: false",
    );
  });

  it("reads the code and writes issues, with GITHUB_TOKEN alone and no secret", () => {
    expect(topLevel(workflow, "permissions").trim()).toBe(
      "permissions:\n  contents: read\n  issues: write",
    );
    expect(job?.body).not.toMatch(/^ {4}permissions:/m);
    expect(code).not.toMatch(/secrets\./);
    expect(code).not.toContain("secrets: inherit");
    expect(code).not.toMatch(/^ {4}environment:/m);
    expect(topLevel(workflow, "env")).toBe("");
    expect(job?.body).not.toMatch(/^ {4}env:/m);
  });

  it("writes nothing typed or read into a script: every value reaches it through the environment", () => {
    const found = [...code.matchAll(/\$\{\{([^}]*)\}\}/g)];
    expect(found.map(([, inside = ""]) => inside.trim()).sort()).toEqual([
      "github.repository",
      "github.token",
      "inputs.site",
    ]);
    // Each on an env line of its own, under the step's `env:`.
    for (const [expression] of found) {
      const lines = code
        .split("\n")
        .filter((line) => line.includes(expression));
      expect(lines, expression).toHaveLength(1);
      expect(lines[0], expression).toMatch(
        /^ {10}[A-Z_]+: \$\{\{ [a-z.]+ \}\}$/,
      );
    }
    expect(code).toMatch(/^ {10}SITE: \$\{\{ inputs\.site \}\}$/m);
    expect(code).toMatch(/^ {10}GH_TOKEN: \$\{\{ github\.token \}\}$/m);
    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) expect(run).not.toContain("${{");
    expect(script).not.toContain("${{");
  });

  it("checks out the scripts alone and runs the one script, with nothing left in git's config", () => {
    expect(jobs(workflow).map((j) => j.key)).toEqual(["check"]);
    expect(job?.body).toMatch(/^ {4}runs-on: ubuntu-latest$/m);
    expect(job?.body).toMatch(/^ {4}timeout-minutes: 5$/m);
    expect(
      allSteps.map((s) => stepName(s) ?? s.split("\n")[0]?.trim()),
    ).toEqual([
      "- uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0",
      "Ask the site, and open or close the issue",
    ]);
    expect(allSteps[0]).toMatch(/^ {10}sparse-checkout: \.github\/scripts$/m);
    expect(allSteps[0]).toMatch(/^ {10}persist-credentials: false$/m);
    expect(runs.map((r) => r.trimEnd())).toEqual([
      "        run: bash .github/scripts/uptime.sh",
    ]);
  });

  it("pins its one action to a commit, the same as CI's", () => {
    const uses = [...code.matchAll(/uses: (\S+)(.*)$/gm)];
    expect(uses).toHaveLength(1);
    for (const [line, action = "", version = ""] of uses) {
      expect(action, line).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
      expect(version, line).toMatch(/^ # v\d+\.\d+\.\d+$/);
    }
    const ci = readRepoFile(".github/workflows/ci.yml");
    expect(ci).toContain(uses[0]?.[0] ?? "nothing");
  });
});

describe("what the script asks and writes", () => {
  it("asks the hosted site's /health and /health/db, which the app answers", () => {
    expect(script).toContain(`REAL_SITE="${REAL}"`);
    expect(script).toContain("PATHS=(/health /health/db)");
    expect(existsSync(join(__dirname, "..", "app/health/route.ts"))).toBe(true);
    expect(existsSync(join(__dirname, "..", "app/health/db/route.ts"))).toBe(
      true,
    );
    // Today's hosted site, as docs/production.md names it (the Turnstile
    // section) and as Vault's app_url is set (B5).
    const doc = readRepoFile("docs/production.md");
    expect(doc).toContain("היום זה האתר הראשי, www.conceptapp.co.il");
    expect(doc).toContain(`\`app_url\`: \`${REAL}\` בדיוק`);
  });

  it("asks each with curl's limit, retries and failure", () => {
    expect(script).toContain(
      "curl -fsS --max-time 10 --retry 2 --retry-all-errors \\",
    );
    expect(script).toContain("-o /dev/null -w '%{http_code}' \"$url\"");
    // One call, and no other way out to the internet.
    const commands = withoutComments(script);
    expect([...commands.matchAll(/\bcurl\b/g)]).toHaveLength(1);
    expect(commands).not.toMatch(/\b(wget|nc|eval)\b/);
  });

  it("labels its issue uptime, none of the labels that are work for the agent", () => {
    expect(script).toContain('LABEL="uptime"');
    const brief = readRepoFile("docs/AGENT.md");
    for (const work of ["orel", "question", "urgent"]) {
      expect(brief).toContain(`label \`${work}\``);
      expect(script).not.toMatch(new RegExp(`\\b${work}\\b`));
    }
  });

  it("is said where Orel and the nightly agent look", () => {
    const doc = readRepoFile("docs/production.md");
    expect(doc).toContain("Actions → Uptime → Run workflow");
    expect(doc).toContain("`uptime`");
    expect(doc).toContain("`.github/workflows/uptime.yml`");
    expect(script).toContain(
      'WHAT_TO_DO="מה עושים: docs/production.md, בדיקת הזמינות."',
    );
    expect(doc).toMatch(/^## בדיקת הזמינות/m);
    const brief = readRepoFile("docs/AGENT.md").replace(/\s+/g, " ");
    expect(brief).toContain("label `uptime`");
    expect(brief).toContain("never close it while the site still fails");
  });
});

// The stand-ins. Each writes one record a call: its arguments, each ended by
// \x1f, and the record by \x1e, bodies with their line breaks kept. curl
// answers each address as answers.txt says ("<address> <status>", or
// "<address> none" for no connection at all), printing the status as
// -w '%{http_code}' does and failing as -f makes it fail. gh answers
// `issue list`, `label list` and `issue view` from open.txt, labels.txt and
// said.txt, as its --jq would print them, and fails a command that
// fail-<command>-<subcommand> names.
const STUBS: Record<string, string> = {
  curl: `
{ printf '%s\\x1f' curl "$@"; printf '\\x1e'; } >> "$STUBS/calls"
url="\${!#}"
status=$(awk -v url="$url" '$1 == url { print $2 }' "$STUBS/answers.txt")
if [ -z "$status" ] || [ "$status" = none ]; then
  printf '000'
  echo "curl: (6) Could not resolve host" >&2
  exit 6
fi
printf '%s' "$status"
[ "$status" -ge 400 ] && { echo "curl: (22) The requested URL returned error: $status" >&2; exit 22; }
exit 0
`,
  gh: `
{ printf '%s\\x1f' gh "$@"; printf '\\x1e'; } >> "$STUBS/calls"
[ -f "$STUBS/fail-$1-$2" ] && exit 1
case "$1 $2" in
  "issue list") cat "$STUBS/open.txt" ;;
  "label list") cat "$STUBS/labels.txt" ;;
  "issue view") cat "$STUBS/said.txt" ;;
esac
exit 0
`,
};

type Run = { status: number | null; output: string; calls: string[][] };

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const UP = { "/health": "200", "/health/db": "200" };

function run({
  site,
  answers = UP,
  host = REAL,
  open = [],
  labels = ["uptime"],
  said = "",
  fail = [],
}: {
  site?: string;
  /** Each path's status, or "none". */
  answers?: Record<string, string>;
  /** The site the answers are for. */
  host?: string;
  open?: number[];
  labels?: string[];
  said?: string;
  fail?: string[];
} = {}): Run {
  const dir = mkdtempSync(join(tmpdir(), "uptime-"));
  dirs.push(dir);
  const stubs = join(dir, "stubs");
  mkdirSync(stubs);
  for (const [name, body] of Object.entries(STUBS)) {
    const file = join(stubs, name);
    writeFileSync(file, `#!/usr/bin/env bash\n${body.trimStart()}`);
    chmodSync(file, 0o755);
  }
  writeFileSync(
    join(stubs, "answers.txt"),
    Object.entries(answers)
      .map(([path, status]) => `${host}${path} ${status}\n`)
      .join(""),
  );
  writeFileSync(join(stubs, "open.txt"), open.map((n) => `${n}\n`).join(""));
  writeFileSync(
    join(stubs, "labels.txt"),
    labels.map((l) => `${l}\n`).join(""),
  );
  writeFileSync(join(stubs, "said.txt"), said);
  writeFileSync(join(stubs, "calls"), "");
  for (const command of fail) writeFileSync(join(stubs, `fail-${command}`), "");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${stubs}${delimiter}${process.env.PATH ?? "/usr/bin:/bin"}`,
    STUBS: stubs,
    GITHUB_STEP_SUMMARY: join(dir, "summary.md"),
    GH_TOKEN: "stand-in",
    GH_REPO: "owner/repo",
  };
  if (site === undefined) delete env.SITE;
  else env.SITE = site;
  const result = spawnSync(
    "bash",
    [join(__dirname, "..", ".github", "scripts", "uptime.sh")],
    { encoding: "utf8", env, timeout: 20_000 },
  );
  const calls = readFileSync(join(stubs, "calls"), "utf8")
    .split("\x1e")
    .filter(Boolean)
    .map((record) => record.split("\x1f").slice(0, -1));
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    calls,
  };
}

const ghCalls = (r: Run) =>
  r.calls.filter(([cmd]) => cmd === "gh").map((c) => c.slice(1));
const curlCalls = (r: Run) =>
  r.calls.filter(([cmd]) => cmd === "curl").map((c) => c.slice(1));
/** The gh commands that write: anything but list and view. */
const writes = (r: Run) =>
  ghCalls(r).filter(
    ([what, how]) => !(how === "list" || (what === "issue" && how === "view")),
  );
/** The value after `flag` in a call. */
const flagValue = (call: string[] | undefined, flag: string) =>
  call?.[call.indexOf(flag) + 1];

const TIME = /^מתי: \d{2}\.\d{2}\.\d{4} \d{2}:\d{2} \(שעון ישראל\)\.$/;
const NO_ANSWER = "בדיקת הזמינות לא קיבלה תשובה מ:";
const ANSWERS = "בדיקת הזמינות מקבלת שוב תשובה מ:";

/** What the issue said when /health/db alone got no answer. */
const SAID_DB = [
  NO_ANSWER,
  `- ${REAL}/health/db`,
  "",
  "מתי: 28.11.2026 07:22 (שעון ישראל).",
  "",
  "מה עושים: docs/production.md, בדיקת הזמינות.",
  "",
].join("\n");

// Each case starts bash a few times: give a loaded runner time for them.
describe.skipIf(process.platform === "win32")(
  "uptime.sh",
  { timeout: 60_000 },
  () => {
    it("asks the real site's two addresses, with the workflow's curl, and writes nothing when both answer", () => {
      const r = run();
      expect(r.status).toBe(0);
      const asked = curlCalls(r);
      expect(asked.map((args) => args.at(-1))).toEqual([
        `${REAL}/health`,
        `${REAL}/health/db`,
      ]);
      for (const args of asked) {
        expect(args.slice(0, 7)).toEqual([
          "-fsS",
          "--max-time",
          "10",
          "--retry",
          "2",
          "--retry-all-errors",
          "-o",
        ]);
      }
      expect(ghCalls(r)).toEqual([
        [
          "label",
          "list",
          "--search",
          "uptime",
          "--limit",
          "100",
          "--json",
          "name",
          "--jq",
          ".[].name",
        ],
        [
          "issue",
          "list",
          "--label",
          "uptime",
          "--state",
          "open",
          "--limit",
          "50",
          "--json",
          "number",
          "--jq",
          ".[].number",
        ],
      ]);
      expect(writes(r)).toEqual([]);
    });

    it("opens one issue labelled uptime, with only the address and the time, when one gets no answer", () => {
      const r = run({ answers: { "/health": "200", "/health/db": "503" } });
      expect(r.status).toBe(0);
      const made = writes(r);
      expect(made).toHaveLength(1);
      const [create] = made;
      expect(create?.slice(0, 2)).toEqual(["issue", "create"]);
      expect(flagValue(create, "--label")).toBe("uptime");
      expect(flagValue(create, "--title")).toBe("האתר לא עונה לבדיקת הזמינות");
      const lines = (flagValue(create, "--body") ?? "").split("\n");
      expect(lines).toHaveLength(6);
      expect(lines.slice(0, 3)).toEqual([NO_ANSWER, `- ${REAL}/health/db`, ""]);
      expect(lines[3]).toMatch(TIME);
      expect(lines.slice(4)).toEqual([
        "",
        "מה עושים: docs/production.md, בדיקת הזמינות.",
      ]);
      expect(r.output).toContain(
        `::warning::${REAL}/health/db: no answer (503)`,
      );
    });

    it("makes the label first when the repository has none, never another", () => {
      const r = run({
        answers: { "/health": "none", "/health/db": "none" },
        labels: ["uptime-old", "urgent"],
      });
      expect(r.status).toBe(0);
      const made = writes(r);
      expect(made.map((c) => c.slice(0, 2))).toEqual([
        ["label", "create"],
        ["issue", "create"],
      ]);
      expect(made[0]?.[2]).toBe("uptime");
      expect(flagValue(made[0], "--description")).toContain("uptime.yml");
      // With no label, no issue can have it: none is asked for.
      expect(
        ghCalls(r).some(([what, how]) => what === "issue" && how === "list"),
      ).toBe(false);
      expect(flagValue(made[1], "--body")).toContain(
        `${NO_ANSWER}\n- ${REAL}/health\n- ${REAL}/health/db\n`,
      );
    });

    it("takes a redirect, or any status but 200, as no answer", () => {
      for (const status of ["308", "301", "204", "404", "500"]) {
        const r = run({ answers: { "/health": status, "/health/db": "200" } });
        expect(r.status, status).toBe(0);
        expect(flagValue(writes(r)[0], "--body"), status).toContain(
          `${NO_ANSWER}\n- ${REAL}/health\n\n`,
        );
      }
    });

    it("says nothing more while the same address still gets no answer", () => {
      const r = run({
        answers: { "/health": "200", "/health/db": "503" },
        open: [12],
        said: SAID_DB,
      });
      expect(r.status).toBe(0);
      expect(writes(r)).toEqual([]);
      expect(ghCalls(r)[2]).toEqual([
        "issue",
        "view",
        "12",
        "--json",
        "body,comments",
        "--jq",
        ".body, .comments[].body",
      ]);
    });

    it("reads what it said last past anyone else's comment, and with Windows line ends", () => {
      for (const said of [
        `${SAID_DB}בודק את זה עכשיו\n- https://elsewhere.example/x\n`,
        SAID_DB.replace(/\n/g, "\r\n"),
      ]) {
        const r = run({
          answers: { "/health": "200", "/health/db": "503" },
          open: [12],
          said,
        });
        expect(writes(r)).toEqual([]);
      }
    });

    it("comments on the open issue when what fails changes, with the time", () => {
      const r = run({
        answers: { "/health": "503", "/health/db": "503" },
        open: [12, 9],
        said: SAID_DB,
      });
      expect(r.status).toBe(0);
      const made = writes(r);
      expect(made).toHaveLength(1);
      expect(made[0]?.slice(0, 3)).toEqual(["issue", "comment", "12"]);
      const lines = (flagValue(made[0], "--body") ?? "").split("\n");
      expect(lines.slice(0, 4)).toEqual([
        NO_ANSWER,
        `- ${REAL}/health`,
        `- ${REAL}/health/db`,
        "",
      ]);
      expect(lines[4]).toMatch(TIME);
      expect(lines).toHaveLength(5);
    });

    it("comments and closes every open issue once both answer again", () => {
      const r = run({ open: [12, 9], said: SAID_DB });
      expect(r.status).toBe(0);
      const made = writes(r);
      expect(made.map((c) => c.slice(0, 3))).toEqual([
        ["issue", "close", "12"],
        ["issue", "close", "9"],
      ]);
      for (const close of made) {
        const lines = (flagValue(close, "--comment") ?? "").split("\n");
        expect(lines.slice(0, 4)).toEqual([
          ANSWERS,
          `- ${REAL}/health`,
          `- ${REAL}/health/db`,
          "",
        ]);
        expect(lines[4]).toMatch(TIME);
      }
    });

    it("checks an address typed by hand instead, to see the issue open", () => {
      const wrong = "https://wrong.conceptapp.co.il";
      for (const typed of [wrong, `${wrong}/`, `  ${wrong} `]) {
        const r = run({
          site: typed,
          host: wrong,
          answers: { "/health": "none", "/health/db": "none" },
        });
        expect(r.status, typed).toBe(0);
        expect(
          curlCalls(r).map((args) => args.at(-1)),
          typed,
        ).toEqual([`${wrong}/health`, `${wrong}/health/db`]);
        expect(flagValue(writes(r)[0], "--body"), typed).toContain(
          `- ${wrong}/health\n- ${wrong}/health/db\n`,
        );
      }
      // Empty, or only spaces, is the real site.
      for (const typed of ["", "   "]) {
        const r = run({ site: typed });
        expect(curlCalls(r)[0]?.at(-1), JSON.stringify(typed)).toBe(
          `${REAL}/health`,
        );
      }
    });

    it("asks nothing and prints nothing typed for an address it won't take", () => {
      for (const typed of [
        "http://plain.example",
        "https://user:secret@site.example",
        "https://site.example/health",
        "https://site.example:8443",
        "https://site.example?x=1",
        "https://Site.Example",
        "https://localhost",
        "https://10.0.0.1",
        "site.example",
        "https://site.example\n::warning::INJECTED",
        "https://site.example; curl https://other.example",
        "https://$(id).example",
      ]) {
        const r = run({ site: typed });
        expect(r.status, typed).toBe(2);
        expect(r.calls, typed).toEqual([]);
        expect(r.output, typed).toContain(`such as ${REAL}`);
        expect(r.output, typed).not.toContain("site.example");
        expect(r.output, typed).not.toContain("INJECTED");
        expect(r.output, typed).not.toContain("plain.example");
      }
    });

    it("fails the run only when it couldn't do its work", () => {
      const down = { "/health": "503", "/health/db": "503" };
      expect(run({ answers: down, fail: ["issue-create"] }).status).not.toBe(0);
      expect(run({ answers: down, fail: ["issue-list"] }).status).not.toBe(0);
      expect(run({ answers: down, fail: ["label-list"] }).status).not.toBe(0);
      expect(run({ fail: ["label-list"] }).status).not.toBe(0);
      expect(run({ open: [12], fail: ["issue-close"] }).status).not.toBe(0);
      // The site down is not the run failing.
      expect(run({ answers: down }).status).toBe(0);
    });
  },
);
