import type { FileFilter } from "@domain/file-holders";
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
const {
  teamFileStatusComplete,
  teamFileStatusFor,
  teamInvites,
  teamMembers,
  teamToday,
} = await import("../../design/shell/data");
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
  timeZone: "Asia/Jerusalem",
  byPerson: teamFileStatusFor(reader),
  ...over,
});

const resend = async () => ({}) as never;

function draw(
  shown: TeamFiles | null,
  viewer: { role: "owner" | "manager" | "accountant"; perms: string[] },
  fileHref?: (userId: string) => string,
  staff = teamMembers,
  fileFilter: FileFilter = "all",
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
              fileStaff(staff).map((m) => ({ ...m, phone: null })),
              [],
              teamToday,
            )
          : buildTeam(teamMembers, teamInvites, teamToday),
        viewer,
        inviteHref: filesOnly ? undefined : "/team/invite",
        peopleHref: "/team",
        fileHref,
        resend,
        files: shown,
        fileFilter,
        wording: baseWording,
      }),
    ),
  );
  expect(missing).toEqual([]);
  return html;
}

const text = (html: string) => html.replace(/<[^>]+>/g, "");
const count = (page: string, part: string) => page.split(part).length - 1;
/** The desktop's table, apart from the phone's and the tablet's lists. */
const table = (html: string) =>
  html.slice(html.indexOf("<table"), html.indexOf("</table>"));
/** The class of the phone's and the tablet's lists, hidden on a desktop. */
const listsClass = (html: string) =>
  html.match(/class="(grid [^"]*xl:hidden[^"]*)"/)?.[1] ?? "";

const accountant = {
  role: "accountant" as const,
  perms: ["clock.payroll", "people.files"],
};

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

  // The same words in every shape: the desktop's cells say what the line
  // under each person says on a phone and a tablet.
  it("say the same in the desktop's table as under each person", () => {
    const holder = text(
      table(draw(files("holder"), { role: "owner", perms: [] })),
    );
    expect(holder).toContain(
      heT("app.team.file.line.missingGroups", { groups: "חשבון בנק ופנסיה" }),
    );
    expect(holder).toContain(he.app.team.file.line.complete);
    expect(holder).toContain(he.app.team.file.line.bankReview);
    const manager = text(
      table(
        draw(files("team"), {
          role: "manager",
          perms: ["team.view", "team.edit"],
        }),
      ),
    );
    expect(manager).toContain(
      heT("app.team.file.line.missingCount", { count: 2 }),
    );
  });

  it("give the accountant one list across a tablet, and a table named as its section", () => {
    const html = draw(files("holder", { filesOnly: true }), accountant);
    expect(listsClass(html)).toContain("md:max-w-2xl");
    expect(listsClass(html)).not.toContain("md:grid-cols-2");
    expect(html).toContain(
      `<caption class="sr-only">${he.app.team.members.title}</caption>`,
    );
    expect(html).not.toContain(he.app.team.everyone);

    const owner = draw(files("holder"), { role: "owner", perms: [] });
    expect(listsClass(owner)).toContain("md:grid-cols-2");
    expect(owner).toContain(
      `<caption class="sr-only">${he.app.team.everyone}</caption>`,
    );
  });

  it("lead the accountant's rows where `fileHref` says, as the twin reads them", () => {
    const html = draw(
      files("holder", { filesOnly: true }),
      accountant,
      (userId) => `/design/shell/team/${userId}/file?as=accountant`,
    );
    expect(html).toContain('href="/design/shell/team/noa/file?as=accountant"');
    expect(html).not.toContain('href="/team/noa/file"');
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

  // The second review: an owner who brought the accountant in before any
  // staff gets them an empty list and a table of headers no more.
  it("tell the accountant there is no one on the staff yet, in every shape", () => {
    const owners = teamMembers.filter(
      (m) => m.role === "owner" || m.role === "accountant",
    );
    const html = draw(
      files("holder", { filesOnly: true, byPerson: {} }),
      accountant,
      undefined,
      owners,
    );
    const page = text(html);
    expect(page).toContain(
      heT("app.team.file.filesOnly.subtitle", { count: 0 }),
    );
    expect(page).toContain(he.app.team.file.filesOnly.note);
    expect(page).toContain(he.app.team.file.filesOnly.empty.title);
    expect(page).toContain(he.app.team.file.filesOnly.empty.body);
    expect(html).toMatch(
      new RegExp(`<h2[^>]*>${he.app.team.file.filesOnly.empty.title}</h2>`),
    );
    expect(html).not.toContain("<table");
    expect(html).not.toContain(`aria-label="${he.app.team.members.title}"`);
    // Shown at every width: no shape hides it.
    expect(listsClass(html)).toBe("");
    expect(html).not.toContain("hidden xl:block");
  });

  it("draws nothing of the file without its status", () => {
    const page = text(draw(null, { role: "owner", perms: [] }));
    expect(page).not.toContain(he.app.team.file.columns.details);
    expect(page).not.toContain(he.app.team.file.line.complete);
  });
});

// Profile H6b: the person's own "לא שיניתי" said apart, the desktop's last
// change for a holder, and the filter over every shape.
describe("the team's files after H6b", () => {
  const owner = { role: "owner" as const, perms: [] };
  const manager = { role: "manager" as const, perms: ["team.view"] };

  it("says the person's own “לא שיניתי” apart, to a holder only", () => {
    const holder = text(draw(files("holder"), owner));
    expect(holder).toContain(he.app.team.file.line.bankDisputed);
    expect(holder).toContain(he.app.team.file.line.bankReview);
    expect(text(table(draw(files("holder"), owner)))).toContain(
      he.app.team.file.line.bankDisputed,
    );
    const team = text(draw(files("team"), manager));
    expect(team).not.toContain(he.app.team.file.line.bankDisputed);
    expect(team).not.toContain(he.app.team.file.line.bankReview);
  });

  it("shows a holder the day each file last changed, on the desktop only", () => {
    const html = draw(files("holder"), owner);
    const desktop = text(table(html));
    expect(desktop).toContain(he.app.team.file.columns.changed);
    expect(desktop).toContain("22.11.2026");
    expect(desktop).toContain(he.app.team.file.cells.neverChanged);
    const lists = html.slice(0, html.indexOf("<table"));
    expect(text(lists)).not.toContain(he.app.team.file.columns.changed);
    expect(text(table(draw(files("team"), manager)))).not.toContain(
      he.app.team.file.columns.changed,
    );
  });

  it("filters by what each reader sees, the 101 only while it is in the app", () => {
    const f = he.app.team.file.filter;
    for (const viewer of [owner, manager]) {
      const page = text(
        draw(files(viewer === owner ? "holder" : "team"), viewer),
      );
      for (const words of [f.all, f.missing, f.form101]) {
        expect(page).toContain(words);
      }
    }
    const outside = draw(files("holder", { form101: false }), owner);
    expect(text(outside)).toContain(f.missing);
    expect(text(outside)).not.toContain(f.form101);
    expect(outside).toContain(`<legend class="sr-only">${f.label}</legend>`);
    // Everyone shows to begin with: the choice isn't kept.
    expect(text(draw(files("holder"), owner))).toContain("דנה אברהם");
    expect(text(draw(null, owner))).not.toContain(f.label);
  });

  // The review: each choice in each shape, from what each reader sees; the
  // invites and the owner, who have no file, hidden under one; the tablet's
  // members then one list across; and a choice that shows nobody saying so,
  // with its way back to everyone.
  const filter = he.app.team.file.filter;
  const invitesList = `aria-label="${he.app.team.invites.title}"`;
  const everyone = [
    ...teamMembers.map((m) => [m.userId, m.name ?? ""] as const),
    ...teamInvites.map((i) => [i.id, i.name ?? ""] as const),
  ];
  const who = (page: string) =>
    everyone.filter(([, n]) => page.includes(n)).map(([id]) => id);
  /** Whose rows the phone's and the tablet's lists, and the desktop's table, hold. */
  const rows = (html: string) => ({
    lists: who(text(html.slice(0, html.indexOf("<table")))),
    table: who(text(table(html))),
  });
  const pressed = (label: string) =>
    new RegExp(`aria-pressed="true"[^>]*>${label}</button>`);

  it("shows under each choice whom it names, in every shape, as each reader sees them", () => {
    const cases = [
      [owner, "holder", "missing", ["yoav", "maya"]],
      // Shiran's 101 needs an updated form, which only a holder reads.
      [owner, "holder", "form101", ["shiran", "yoav"]],
      [manager, "team", "missing", ["yoav", "maya"]],
      [manager, "team", "form101", ["yoav"]],
    ] as const;
    for (const [viewer, reader, choice, shown] of cases) {
      const html = draw(files(reader), viewer, undefined, teamMembers, choice);
      expect(rows(html), `${reader} ${choice}`).toEqual({
        lists: shown,
        table: shown,
      });
      expect(html).toMatch(pressed(filter[choice]));
      expect(html).not.toMatch(pressed(filter.all));
      expect(html).not.toContain(invitesList);
      // One list across the tablet: no empty column where the invites were.
      expect(listsClass(html)).toContain("md:max-w-2xl");
      expect(listsClass(html)).not.toContain("md:grid-cols-2");
    }
    const all = draw(files("holder"), owner);
    expect(rows(all)).toEqual({
      lists: everyone.map(([id]) => id),
      table: everyone.map(([id]) => id),
    });
    expect(all).toMatch(pressed(filter.all));
    expect(all).toContain(invitesList);
    expect(listsClass(all)).toContain("md:grid-cols-2");
  });

  it("says a choice shows nobody, and leads back to everyone, for each reader", () => {
    const empty = [
      ["missing", filter.emptyMissing],
      ["form101", heT("app.team.file.filter.emptyForm101", { year: 2026 })],
    ] as const;
    for (const [viewer, reader] of [
      [owner, "holder"],
      [manager, "team"],
    ] as const) {
      const complete = files(reader, {
        byPerson: teamFileStatusComplete(reader),
      });
      for (const [choice, words] of empty) {
        const html = draw(complete, viewer, undefined, teamMembers, choice);
        const page = text(html);
        expect(page, `${reader} ${choice}`).toContain(words);
        expect(page).toContain(filter.showAll);
        // The choice stays, to choose another; nobody's row in any shape.
        expect(html).toMatch(pressed(filter[choice]));
        expect(html).not.toContain("<table");
        expect(who(page)).toEqual([]);
      }
      // Under "כולם" everyone, as ever, and no line saying otherwise.
      const all = text(draw(complete, viewer));
      expect(who(all)).toHaveLength(everyone.length);
      expect(all).not.toContain(filter.showAll);
      expect(all).not.toContain(filter.emptyMissing);
    }
  });
});
