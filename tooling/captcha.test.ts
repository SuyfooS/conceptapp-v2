import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { sourceFiles } from "./boundaries";

// The "אני לא רובוט" check before every SMS code (P9b). Every way the app
// asks the auth server for a code carries Cloudflare's token, and each of
// the four screens that send one draws the check; the demo door sends no
// code and draws none. Cloudflare's script and address are named in one
// place each, the site key is read in one place, no key or secret of
// Turnstile's is ever in the repo (it is public), and the local auth
// server's CAPTCHA stays off, so local, CI and e2e need no secret.

const root = join(__dirname, "..");
const code = ["app", "packages", "modules"]
  .flatMap((dir) => sourceFiles(dir, root))
  .filter((file) => !/\.test\.tsx?$/.test(file))
  .map((file) => ({ file, source: readFileSync(join(root, file), "utf8") }));

const read = (path: string) => readFileSync(join(root, path), "utf8");

/** The sends of `@/app/(auth)/otp`, and where they may be called from. */
const SENDS = new Set(["sendSignInCode", "sendCode", "sendJoinCode"]);
const OTP = "app/(auth)/otp.ts";

/** Each call of a send in `source`: its name, and whether it passes a token. */
function sendsIn(file: string, source: string) {
  const kind = file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  const found: { name: string; token: boolean }[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      SENDS.has(node.expression.text)
    ) {
      const name = node.expression.text;
      const second = node.arguments[1];
      // Sign-in takes the token itself; the others in their options.
      const token =
        name === "sendSignInCode"
          ? second !== undefined
          : second !== undefined &&
            ts.isObjectLiteralExpression(second) &&
            second.properties.some(
              (property) =>
                property.name !== undefined &&
                ts.isIdentifier(property.name) &&
                property.name.text === "captcha",
            );
      found.push({ name, token });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/** Every text file under `dir`, repo-relative, past what git leaves out. */
function textFiles(dir: string): string[] {
  if (!existsSync(join(root, dir))) return [];
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) {
        return [];
      }
      const path = posix.join(dir, entry.name);
      if (entry.isDirectory()) return textFiles(path);
      return /\.(tsx?|mts|mjs|js|md|sql|toml|json|ya?ml|html|css|sh|txt)$/.test(
        entry.name,
      )
        ? [path]
        : [];
    },
  );
}

describe("every SMS code", () => {
  it("goes to the auth server with the check's token, from one place", () => {
    const asking = code.filter(({ source }) =>
      source.includes("signInWithOtp("),
    );
    expect(asking.map(({ file }) => file)).toEqual([OTP]);
    const call = read(OTP).slice(read(OTP).indexOf("signInWithOtp("));
    const args = call.slice(0, call.indexOf("});"));
    expect(args).toContain("captchaToken: captcha");
  });

  it("is sent with the browser's token wherever the app sends one", () => {
    const callers = code
      .filter(({ file }) => file !== OTP)
      .map(({ file, source }) => ({ file, sends: sendsIn(file, source) }))
      .filter(({ sends }) => sends.length > 0);
    expect(callers.map(({ file }) => file).sort()).toEqual([
      "app/(app)/me/file/actions.ts",
      "app/(app)/team/[person]/file/actions.ts",
      "app/(auth)/actions.ts",
      "app/(auth)/join/actions.ts",
    ]);
    for (const { file, sends } of callers) {
      for (const send of sends) {
        expect(send.token, `${file}: ${send.name}`).toBe(true);
      }
    }
    // Each takes it from the browser through the one check of its shape.
    for (const { file } of callers) {
      expect(read(file), file).toContain("captchaTokenOf(");
    }
  });

  it("has the check drawn on each of the four screens that send one, and none on the demo door", () => {
    for (const file of [
      "app/(auth)/sign-in/sign-in-form.tsx",
      "app/(auth)/join/[token]/join-form.tsx",
      "app/(app)/team/[person]/file/file-gate.tsx",
      "app/(app)/me/file/steps/bank-step.tsx",
    ]) {
      const source = read(file);
      expect(source, file).toContain("useCaptcha(");
      expect(source, file).toContain("<CaptchaBox");
    }
    const door = read("app/(auth)/enter/enter-form.tsx");
    expect(door).not.toContain("CaptchaBox");
    expect(read("app/(auth)/enter/actions.ts")).not.toContain("signInWithOtp");
  });
});

describe("Cloudflare's script and address", () => {
  it("are named in one place each", () => {
    const named = (needle: string) =>
      code
        .filter(({ source }) => source.includes(needle))
        .map(({ file }) => file)
        .sort();
    expect(named("challenges.cloudflare.com")).toEqual([
      "packages/domain/turnstile.ts",
    ]);
    expect(named("TURNSTILE_SCRIPT")).toEqual([
      "packages/domain/turnstile.ts",
      "packages/ui/captcha.tsx",
    ]);
  });
});

describe("the site key", () => {
  const setting = "NEXT_PUBLIC_TURNSTILE_SITE_KEY";

  it("is read in one place, and listed with the deployment's settings", () => {
    const reads = code.filter(({ source }) =>
      source.includes(`process.env.${setting}`),
    );
    expect(reads.map(({ file }) => file)).toEqual(["packages/db/env.ts"]);
    expect(read(".env.example")).toMatch(new RegExp(`^${setting}=$`, "m"));
  });

  it("reaches no browser's file but as a page's prop", () => {
    const clients = code.filter(({ source }) =>
      /^\s*["']use client["']/.test(source),
    );
    expect(clients.length).toBeGreaterThan(10);
    for (const { file, source } of clients) {
      expect(source, file).not.toContain(setting);
      expect(source, file).not.toMatch(/\bturnstileSiteKey\b/);
    }
  });
});

describe("Turnstile's keys", () => {
  // Put together here, so this file holds neither.
  const secretName = new RegExp(["TURNSTILE", "SECRET"].join("_"));
  const realKey = new RegExp(["0x4", "[A-Za-z0-9_-]{18,}"].join(""));

  it("are in no file of the repo: the site key lives in Vercel, the secret in Supabase", () => {
    const files = [
      ...[
        "app",
        "packages",
        "modules",
        "e2e",
        "docs",
        "supabase",
        "tooling",
        ".github",
      ].flatMap(textFiles),
      ".env.example",
      "README.md",
      "CLAUDE.md",
    ];
    expect(files.length).toBeGreaterThan(500);
    for (const file of files) {
      const source = read(file);
      expect(source, file).not.toMatch(realKey);
      expect(source, file).not.toMatch(secretName);
    }
  });
});

describe("the local auth server's CAPTCHA", () => {
  it("stays off: commented out in supabase/config.toml", () => {
    const config = read("supabase/config.toml");
    expect(config).not.toMatch(/^\s*\[auth\.captcha\]/m);
    expect(config).toMatch(/^# \[auth\.captcha\]$/m);
    expect(config).not.toMatch(
      /^\s*enabled\s*=\s*true\s*\n\s*provider\s*=\s*"turnstile"/m,
    );
  });
});
