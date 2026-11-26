import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { describe, expect, it } from "vitest";
import { readRepoFile, withoutComments } from "./workflows";

/**
 * The test business of a few hundred people (measure/, docs/measure.md)
 * stays where it is made: on the local stack, by measure/'s own scripts.
 * Its ids, fictional numbers and the import's block of Israeli numbers
 * appear nowhere the app, the demo, the migrations or the browser tests
 * read; nothing that reaches a hosted project mentions measure/; the
 * browser tests never pick up a measuring file; and the never-send
 * settings the database job can't see (no auth server runs there) stay as
 * they are.
 */

const root = join(__dirname, "..");

/** The seed's patterns, built from pieces so this file doesn't match itself. */
const PREFIX = ["5ca1e", "300"].join("");
const FICTIONAL = new RegExp(
  ["\\+12(0[1-9]|1[0-2])", "555", "01\\d\\d"].join(""),
);
const IMPORT_BLOCK = new RegExp(
  ["(\\+9725|05)0-?000-?", "6[1-3]\\d\\d"].join(""),
);

const TEXT = /\.(ts|tsx|mts|mjs|js|sql|json|ya?ml|toml|md|sh|css|html)$/;

function files(dir: string): string[] {
  if (!existsSync(join(root, dir))) return [];
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      if (entry.name === "node_modules" || entry.name === ".next") return [];
      const path = posix.join(dir, entry.name);
      if (entry.isDirectory()) return files(path);
      return TEXT.test(entry.name) ? [path] : [];
    },
  );
}

/** Everything but measure/ itself, the docs that describe it, and this file. */
const elsewhere = [
  "app",
  "packages",
  "modules",
  "e2e",
  "supabase",
  "tooling",
  ".github",
  "public",
  "i18n",
  "messages",
]
  .flatMap(files)
  .filter((file) => file !== "tooling/measure-guards.test.ts");

describe("the test business stays in measure/", () => {
  it("its ids and numbers appear nowhere else", () => {
    const found = elsewhere.flatMap((file) => {
      const text = readFileSync(join(root, file), "utf8");
      return [
        text.includes(PREFIX) ? `${file}: the seed's id prefix` : "",
        FICTIONAL.test(text) ? `${file}: a fictional +1 555-01xx number` : "",
        IMPORT_BLOCK.test(text)
          ? `${file}: the import's block 050-000-61xx to 63xx`
          : "",
      ].filter(Boolean);
    });
    expect(found).toEqual([]);
  });

  it("nothing that reaches a hosted project mentions measure/", () => {
    const hosted = [
      ...files("supabase"),
      ...[
        ".github/workflows/migrate-dev.yml",
        ".github/workflows/migrate-prod.yml",
      ],
    ];
    const found = hosted.filter((file) =>
      /\bmeasure\//.test(readFileSync(join(root, file), "utf8")),
    );
    expect(found).toEqual([]);
  });

  it("CI's workflow never names it: its database job runs the test as one of `pnpm test:db`", () => {
    expect(
      withoutComments(readRepoFile(".github/workflows/ci.yml")),
    ).not.toMatch(/measure/i);
  });

  it("the browser tests never pick up a measuring file", () => {
    expect(
      files("e2e").filter((file) => /\.(measure|run)\.ts$/.test(file)),
    ).toEqual([]);
    expect(readRepoFile("playwright.config.ts")).toMatch(/testDir: "e2e"/);
    const seed = readRepoFile("measure/seed.config.ts");
    expect(seed).not.toMatch(/webServer|baseURL/);
    const scripts = JSON.parse(readRepoFile("package.json")).scripts as Record<
      string,
      string
    >;
    expect(scripts["measure:seed"]).toBe(
      "playwright test --config measure/seed.config.ts --project seed",
    );
    expect(scripts["measure:clean"]).toBe(
      "playwright test --config measure/seed.config.ts --project clean",
    );
  });
});

/** The keys of one `[section]` of config.toml. */
function section(toml: string, name: string): Record<string, string> {
  const lines = toml.split("\n");
  const start = lines.findIndex((line) => line.trim() === `[${name}]`);
  const values: Record<string, string> = {};
  if (start < 0) return values;
  for (const line of lines.slice(start + 1)) {
    if (line.trim().startsWith("[")) break;
    const match = /^\s*([a-z_]+)\s*=\s*(.+?)\s*$/.exec(line);
    if (match?.[1] && match[2]) values[match[1]] = match[2];
  }
  return values;
}

describe("the never-send settings the database job can't see", () => {
  const toml = readRepoFile("supabase/config.toml");

  it("nobody can sign up, so the auth server texts nobody new", () => {
    expect(section(toml, "auth").enable_signup).toBe("false");
  });

  it("every code goes to dev.sms_codes, never to a phone", () => {
    expect(section(toml, "auth.hook.send_sms")).toMatchObject({
      enabled: "true",
      uri: '"pg-functions://postgres/dev/send_sms"',
    });
  });

  it("a measuring workflow, once there, reads only and holds no secret", () => {
    const path = ".github/workflows/measure.yml";
    if (!existsSync(join(root, path))) return;
    const text = withoutComments(readRepoFile(path));
    expect(text).toMatch(/contents: read/);
    expect(text).not.toMatch(/secrets\./);
  });
});
