import type { Viewer } from "@domain/modules";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The Team screen's import, drawn on the server as a page first is, for
// each kind of viewer who edits the team: an owner invites owners and
// accountants one at a time on "הזמנה לצוות", so the words lead there;
// anyone else finds neither role on that form, so the words say only the
// owners invite them, and a role above their rank says who invites to it,
// never "from here". Nothing is sent.

vi.mock("server-only", () => ({}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

const { NextIntlClientProvider, createTranslator } = await import("next-intl");
const { PeopleImportView } = await import("./import-view");
const { importRolesOf, knownTeamOf } = await import("@domain/people-import");
const { inviteChoices } = await import("@domain/team");
const he = (await import("@/messages/he.json")).default;

const heT = createTranslator({ locale: "he", messages: he });
/** Nothing is sent from here: each press would be refused. */
const FAILED = { ok: false, failure: "failed" } as const;
const labels = he.app.roles;
const oneByOne = {
  owner: labels.owner,
  accountant: labels.accountant,
};

const OWNER: Viewer = { role: "owner", perms: [] };
const MANAGER: Viewer = { role: "manager", perms: ["team.view", "team.edit"] };
/** A worker raised to edit the team. */
const EDITOR: Viewer = { role: "worker", perms: ["team.view", "team.edit"] };

function drawn(viewer: Viewer, paste: string): string {
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
      createElement(PeopleImportView, {
        roles: importRolesOf({
          choices: inviteChoices(viewer, [], []),
          named: [],
          labels,
        }),
        known: knownTeamOf([], []),
        importPeople: async () => FAILED,
        undoImport: async () => FAILED,
        paths: {
          back: { href: "/team", label: he.app.team.import.back },
          done: { href: "/team", label: he.app.team.import.done.toTeam },
        },
        initialPaste: paste,
      }),
    ),
  );
  expect(missing).toEqual([]);
  return html.replace(/<[^>]+>/g, "");
}

const ownerLine = `דנה כהן 050-123-4567 ${labels.owner}`;

describe("the import's words for owners and accountants", () => {
  it("lead an owner to “הזמנה לצוות”, on the role card and on a line naming one", () => {
    const page = drawn(OWNER, ownerLine);
    expect(page).toContain(heT("app.team.import.role.oneByOne", oneByOne));
    expect(page).toContain(
      heT("app.team.import.problem.oneByOne", { role: labels.owner }),
    );
    expect(page).not.toContain(
      heT("app.team.import.role.oneByOneOwners", oneByOne),
    );
  });

  it("tell a manager and a worker who edits the team that only the owners invite them", () => {
    for (const viewer of [MANAGER, EDITOR]) {
      const page = drawn(viewer, ownerLine);
      expect(page, viewer.role).toContain(
        heT("app.team.import.role.oneByOneOwners", oneByOne),
      );
      expect(page, viewer.role).toContain(
        heT("app.team.import.problem.oneByOneOwners", { role: labels.owner }),
      );
      // Never sent to a form that offers neither role.
      expect(page, viewer.role).not.toContain(he.app.team.invite.title);
      expect(page, viewer.role).not.toContain("ב„הזמנה לצוות”");
    }
  });

  it("tell a worker who edits the team who invites to a role above theirs", () => {
    const page = drawn(EDITOR, `יוסי לוי 052-765-4321 ${labels.manager}`);
    expect(page).toContain(
      heT("app.team.import.problem.notAllowed", { role: labels.manager }),
    );
    expect(page).not.toContain("מכאן");
  });
});
