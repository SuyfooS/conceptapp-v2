import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A business's sentences reach a server view only through its words
 * (`translator` in app/(app)/wording.ts). A server file under app/(app) that
 * asks next-intl for a translator itself would quietly show the app's
 * sentences instead, so it is refused here. Client files are fine: they get
 * the business's sentences from WordingProvider.
 */

const appDir = join(__dirname, "..", "app", "(app)");

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

/** Whether a server file asks next-intl for a translator of its own. */
function asksNextIntl(source: string): boolean {
  if (/^\s*["']use client["']/.test(source)) return false;
  const imports = [
    ...source.matchAll(
      /import\s*\{([^}]*)\}\s*from\s*["'](next-intl(?:\/server)?)["']/g,
    ),
  ];
  return imports.some(([, names]) =>
    /\b(getTranslations|useTranslations)\b/.test(names ?? ""),
  );
}

describe("a business's words on the server", () => {
  const asking = files(appDir)
    .filter((path) => asksNextIntl(readFileSync(path, "utf8")))
    .map((path) => relative(appDir, path).split("\\").join("/"))
    .sort();

  it("reach every server view", () => {
    expect(asking).toEqual([]);
  });

  it("tells a server file asking next-intl from a client one", () => {
    expect(
      asksNextIntl('import { getTranslations } from "next-intl/server";'),
    ).toBe(true);
    expect(asksNextIntl('import { useTranslations } from "next-intl";')).toBe(
      true,
    );
    expect(
      asksNextIntl(
        '"use client";\nimport { useTranslations } from "next-intl";',
      ),
    ).toBe(false);
    expect(asksNextIntl('import { createTranslator } from "next-intl";')).toBe(
      false,
    );
  });
});
