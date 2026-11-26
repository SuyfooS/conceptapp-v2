import type { ActivityEntry } from "@domain/activity";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The business's activity log, drawn on the server as a page first is, with
// the hiring file's "נמסר ישירות לשכר" rows (profile H6b): each row holds the
// set left after its change, so a mark taken off one of two reads as what
// stayed marked from then on, never as the other part just marked, and the
// parts go by the file's own names. Every word there; nothing written.

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => "/manage/activity",
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

const { NextIntlClientProvider, createFormatter, createTranslator } =
  await import("next-intl");
const { ActivityView } = await import("./activity-view");
const { demoActivityPaths } = await import(
  "../../../design/shell/manage/activity/paths"
);
const { baseWording } = await import("../../wording");
const he = (await import("@/messages/he.json")).default;
const en = (await import("@/messages/en.json")).default;

const heT = createTranslator({ locale: "he", messages: he });
const enT = createTranslator({ locale: "en", messages: en });
const format = createFormatter({ locale: "he", timeZone: "Asia/Jerusalem" });
const e = he.app.manage.activity.actions.employee;

const GALIT = { kind: "member", name: "גלית הדגמה" } as const;
const NOA = { kind: "member", name: "נועה כהן" } as const;

/** A holder's press in Noa's file, the set the row holds after it. */
const direct = (
  id: number,
  groups: ("identity" | "bank" | "pension")[],
): ActivityEntry => ({
  id,
  at: `2026-11-22T1${id}:00:00Z`,
  actor: GALIT,
  line: { action: "employee.direct", person: NOA, groups },
});

function draw(entries: ActivityEntry[]): string {
  const missing: string[] = [];
  const provider = {
    locale: "he",
    timeZone: "Asia/Jerusalem",
    messages: he,
    onError: (error: Error) => {
      missing.push(error.message);
    },
  } as unknown as Parameters<typeof NextIntlClientProvider>[0];
  const html = renderToString(
    createElement(
      NextIntlClientProvider,
      provider,
      createElement(ActivityView, {
        days: [{ date: "2026-11-22", relative: "today", entries }],
        timeZone: "Asia/Jerusalem",
        older: null,
        earlier: false,
        manageable: [],
        clockOn: false,
        departmentsOn: false,
        everyArea: true,
        paths: demoActivityPaths,
        wording: baseWording,
      }),
    ),
  );
  expect(missing).toEqual([]);
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'");
}

describe("the activity log's marks handed directly to payroll", () => {
  it("says what stayed marked after a change, by the file's names", () => {
    // The bank and the pension marked, then the pension's mark taken off:
    // the newer row holds the bank alone.
    const shown = draw([direct(5, ["bank"]), direct(3, ["bank", "pension"])]);
    const markedSince = (groups: string[]) =>
      heT("app.manage.activity.actions.employee.direct", {
        person: NOA.name,
        groups: format.list(groups, { type: "conjunction" }),
      });
    expect(shown).toContain(markedSince([e.groups.bank]));
    expect(shown).toContain(markedSince([e.groups.bank, e.groups.pension]));
    // Tied to the row's own change, never to now or to a press that marked.
    expect(markedSince([e.groups.bank])).toContain("אחרי השינוי");
    expect(shown).not.toContain("עכשיו");
    expect(shown).not.toContain("עבור");
    expect(e.groups).toEqual(he.app.team.file.direct.groups);
  });

  it("names the identity part as the file does, and says the last mark came off", () => {
    const shown = draw([direct(5, []), direct(3, ["identity"])]);
    expect(shown).toContain(he.app.team.file.direct.groups.identity);
    expect(shown).not.toContain("פרטי הזהות");
    expect(shown).toContain(
      heT("app.manage.activity.actions.employee.directCleared", {
        person: NOA.name,
      }),
    );
  });
});

// A holder's read refused for no live SMS code on this sign-in
// (20261127000400_file_step_up.sql), in the log's own words.
describe("the activity log's refused views", () => {
  it("says a view refused without a valid SMS code, with and without a person", () => {
    const refused = (id: number, person: typeof NOA | null): ActivityEntry => ({
      id,
      at: `2026-11-22T1${id}:00:00Z`,
      actor: GALIT,
      line: { action: "employee.view_denied", person, reason: "step_up" },
    });
    const shown = draw([refused(5, NOA), refused(3, null)]);
    expect(shown).toContain(
      heT("app.manage.activity.actions.employee.viewDenied", {
        person: NOA.name,
        reason: "step_up",
      }),
    );
    expect(shown).toContain(
      heT("app.manage.activity.actions.employee.viewDeniedPlain", {
        reason: "step_up",
      }),
    );
    expect(shown).toContain("בלי קוד ב-SMS בתוקף");
    expect(shown).not.toContain(
      heT("app.manage.activity.actions.employee.viewDeniedPlain", {
        reason: "other",
      }),
    );
    expect(
      enT("app.manage.activity.actions.employee.viewDenied", {
        person: "Noa",
        reason: "step_up",
      }),
    ).toBe("A view of Noa's file was refused: without a valid SMS code");
  });
});

// A pasted list invited in one go, and taken back (inviting from a list,
// 20261128000300_people_import.sql): by its counts alone, never who.
describe("the activity log's lists of people", () => {
  it("says what a list made and updated, and what its undo deleted", () => {
    const at = (id: number) => `2026-11-22T1${id}:00:00Z`;
    const shown = draw([
      {
        id: 7,
        at: at(7),
        actor: GALIT,
        line: { action: "invite.import", made: 12, updated: 2 },
      },
      {
        id: 6,
        at: at(6),
        actor: GALIT,
        line: { action: "invite.import", made: 1, updated: 0 },
      },
      {
        id: 5,
        at: at(5),
        actor: GALIT,
        line: { action: "invite.import", made: 0, updated: 3 },
      },
      {
        id: 4,
        at: at(4),
        actor: GALIT,
        line: { action: "invite.import_undo", cancelled: 1 },
      },
      {
        id: 3,
        at: at(3),
        actor: GALIT,
        line: { action: "invite.import_undo", cancelled: 11 },
      },
    ]);
    for (const line of [
      "הזמנה מרשימה: 12 הזמנות חדשות, ועוד 2 הזמנות עודכנו",
      "הזמנה מרשימה: הזמנה חדשה אחת",
      "הזמנה מרשימה: 3 הזמנות עודכנו",
      "מחיקת הזמנה אחת מרשימה",
      "מחיקת 11 הזמנות מרשימה",
    ]) {
      expect(shown).toContain(line);
    }
    expect(shown).not.toContain("הזמנה מרשימה: הזמנה חדשה אחת,");
    expect(
      enT("app.manage.activity.actions.invite.import", {
        made: 1,
        updated: 1,
      }),
    ).toBe("Invited from a list: one new invite, and one invite updated");
    expect(
      enT("app.manage.activity.actions.invite.import", {
        made: 0,
        updated: 2,
      }),
    ).toBe("Invited from a list: 2 invites updated");
    expect(
      enT("app.manage.activity.actions.invite.importUndo", { count: 4 }),
    ).toBe("Deleted 4 invites from a list");
  });
});
