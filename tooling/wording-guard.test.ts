import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A business's sentences reach a server view only through its words
 * (`translator` in app/(app)/wording.ts). A server file under app/(app) that
 * asks next-intl for a translator itself would quietly show the app's
 * sentences instead, so it is refused here. Client files are fine: they get
 * the business's sentences from WordingProvider.
 *
 * PENDING lists the server files not moved over yet. It may only shrink: a
 * file that no longer asks next-intl must leave it.
 */
const PENDING = [
  "clock/clock-view.tsx",
  "clock/history/history-view.tsx",
  "clock/history/page.tsx",
  "clock/month-hero.tsx",
  "clock/shift-list.tsx",
  "clock/team/[person]/page.tsx",
  "clock/team/page.tsx",
  "clock/team/team-view.tsx",
  "home/page.tsx",
  "home/today-view.tsx",
  "manage/activity/activity-view.tsx",
  "manage/activity/page.tsx",
  "manage/business-details-view.tsx",
  "manage/business/page.tsx",
  "manage/manage-view.tsx",
  "manage/module-settings-view.tsx",
  "manage/page.tsx",
  "module-screen.tsx",
  "schedule/availability/availability-view.tsx",
  "schedule/availability/page.tsx",
  "schedule/availability/team/page.tsx",
  "schedule/availability/team/team-availability-view.tsx",
  "schedule/build/page.tsx",
  "schedule/build/schedule-build-view.tsx",
  "schedule/schedule-view.tsx",
  "schedule/shifts/my-shifts-view.tsx",
  "schedule/shifts/page.tsx",
  "schedule/swaps/page.tsx",
  "schedule/swaps/swap-approvals-view.tsx",
  "team/invite/invite-view.tsx",
  "team/invite/page.tsx",
  "team/page.tsx",
  "team/team-view.tsx",
];

const appDir = join(__dirname, "..", "app", "(app)");

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

/** Whether a server file asks next-intl for a translator of its own. */
export function asksNextIntl(source: string): boolean {
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

  it("reach every server view but those still pending", () => {
    expect(asking.filter((file) => !PENDING.includes(file))).toEqual([]);
  });

  it("keeps the pending list to files that still need moving", () => {
    expect(PENDING.filter((file) => !asking.includes(file))).toEqual([]);
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
