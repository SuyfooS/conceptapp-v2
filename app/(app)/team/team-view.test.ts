import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TeamFiles } from "./file-status";

// The Team screen with the hiring file's lines (profile H6a), drawn on the
// server as a page first is, with the twin's people: a holder reads what
// each file lacks, anyone else who sees the team only how many and never a
// group's name, and someone who holds the files without seeing the team
// (the accountant) the files alone, with no numbers, no invites and each
// row leading to the file; the desktop table's two columns follow whether
// Form 101 is in the app. Every word there; nothing written.

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => "/team",
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

const { NextIntlClientProvider, createTranslator } = await import("next-intl");
const { TeamView } = await import("./team-view");
const { buildTeam } = await import("@domain/team");
const { fileStaff } = await import("@domain/file-holders");
const { teamFileStatusFor, teamInvites, teamMembers, teamToday } = await import(
  "../../design/shell/data"
);
const { baseWording } = await import("../wording");
const he = (await import("@/messages/he.json")).default;

const heT = createTranslator({ locale: "he", messages: he });
const groups = Object.values(he.app.team.file.groups);

const files = (
  reader: "holder" | "team",
  over: Partial<TeamFiles> = {},
): TeamFiles => ({
  reader,
  filesOnly: false,
  year: 2026,
  form101: true,
  byPerson: teamFileStatusFor(reader),
  ...over,
});

const resend = async () => ({}) as never;

function draw(
  shown: TeamFiles | null,
  viewer: { role: "owner" | "manager" | "accountant"; perms: string[] },
): string {
  const missing: string[] = [];
  const provider = {
    locale: "he",
    timeZone: "Asia/Jerusalem",
    messages: he,
    onError: (error: Error) => {
      missing.push(error.message);
    },
  } as unknown as Parameters<typeof NextIntlClientProvider>[0];
  const filesOnly = shown?.filesOnly === true;
  const html = renderToString(
    createElement(
      NextIntlClientProvider,
      provider,
      createElement(TeamView, {
        team: filesOnly
          ? buildTeam(
              fileStaff(teamMembers).map((m) => ({ ...m, phone: null })),
              [],
              teamToday,
            )
          : buildTeam(teamMembers, teamInvites, teamToday),
        viewer,
        inviteHref: filesOnly ? undefined : "/team/invite",
        peopleHref: "/team",
        resend,
        files: shown,
        wording: baseWording,
      }),
    ),
  );
  expect(missing).toEqual([]);
  return html;
}

const text = (html: string) => html.replace(/<[^>]+>/g, "");
const count = (page: string, part: string) => page.split(part).length - 1;

describe("the team's file lines", () => {
  it("name what a holder's file lacks, an account to look at and the 101", () => {
    const page = text(draw(files("holder"), { role: "owner", perms: [] }));
    expect(page).toContain(
      heT("app.team.file.line.missingGroups", { groups: "חשבון בנק ופנסיה" }),
    );
    expect(page).toContain(he.app.team.file.line.complete);
    expect(page).toContain(he.app.team.file.line.bankReview);
    expect(page).toContain(he.app.team.file.columns.details);
  });

  it("only count for a manager, never naming a group", () => {
    const page = text(
      draw(files("team"), {
        role: "manager",
        perms: ["team.view", "team.edit"],
      }),
    );
    expect(page).toContain(
      heT("app.team.file.line.missingCount", { count: 2 }),
    );
    expect(page).toContain(
      heT("app.team.file.line.form101Team", { state: "missing" }),
    );
    for (const group of groups) {
      expect(count(page, group), group).toBe(0);
    }
    expect(page).not.toContain(he.app.team.file.line.bankReview);
  });

  it("give the accountant the files alone: no numbers, no invites, rows to the file", () => {
    const html = draw(files("holder", { filesOnly: true }), {
      role: "accountant",
      perms: ["clock.payroll", "people.files"],
    });
    const page = text(html);
    expect(page).toContain(
      heT("app.team.file.filesOnly.subtitle", { count: 7 }),
    );
    expect(page).toContain(he.app.team.file.filesOnly.note);
    expect(page).not.toContain(he.app.team.invites.title);
    expect(page).not.toContain("דנה אברהם");
    expect(page).not.toContain(he.app.team.inviteAction);
    expect(page).not.toMatch(/05\d-\d{3}-\d{4}/);
    expect(page).not.toContain(he.app.team.columns.phone);
    expect(html).toContain('href="/team/noa/file"');
    expect(html).not.toContain('href="/team/noa"');
    // No owner, no accountant: managers and workers only.
    expect(page).not.toContain("אורי בן דוד");
  });

  it("draws the desktop's 101 column only while the business takes it in the app", () => {
    const owner = { role: "owner" as const, perms: [] };
    expect(text(draw(files("holder"), owner))).toContain(
      heT("app.team.file.columns.form101", { year: 2026 }),
    );
    const off = text(draw(files("holder", { form101: false }), owner));
    expect(off).toContain(he.app.team.file.columns.details);
    expect(off).not.toContain(
      heT("app.team.file.columns.form101", { year: 2026 }),
    );
  });

  it("draws nothing of the file without its status", () => {
    const page = text(draw(null, { role: "owner", perms: [] }));
    expect(page).not.toContain(he.app.team.file.columns.details);
    expect(page).not.toContain(he.app.team.file.line.complete);
  });
});
