import type { Role } from "@domain/modules";
import {
  againstTeam,
  importRolesOf,
  type KnownInvite,
  knownTeamOf,
  listRoleOf,
  parsePeopleList,
} from "@domain/people-import";
import { inviteChoices, type RoleChoice, roleChoiceKey } from "@domain/team";
import { describe, expect, it } from "vitest";
import { doneLinksOf } from "./done-links";

// Whom the Team screen's done screen sends links to after an import
// (inviting from a list, part 5): by the database's answer for the rows sent
// and the team read at the press, never by what the preview guessed.

const LABELS: Record<Role, string> = {
  owner: "בעלים",
  manager: "ניהול",
  worker: "צוות",
  accountant: "הנהלת חשבונות",
};
const roles = importRolesOf({
  choices: inviteChoices({ role: "owner", perms: [] }, [], []),
  named: [],
  labels: LABELS,
});
const labelOf = (role: RoleChoice) =>
  roles.choices.find((one) => roleChoiceKey(one) === roleChoiceKey(role))
    ?.label ?? role.role;

const invite = (over: Partial<KnownInvite> & { id: string; phone: string }) =>
  ({
    name: null,
    role: "worker",
    namedRole: null,
    linkPending: true,
    expired: false,
    touchable: true,
    ...over,
  }) satisfies KnownInvite;

function checked(text: string, invites: KnownInvite[]) {
  const fallback = listRoleOf(roles);
  if (!fallback) throw new Error("No role");
  const team = knownTeamOf(
    [{ phone: "+972500007990", name: "משה לוי" }],
    invites,
  );
  const check = againstTeam(parsePeopleList(text, roles, fallback), team);
  return { check, team };
}

describe("doneLinksOf", () => {
  it("lists everyone the database made or updated with no link yet, in the role each ends with", () => {
    const { check, team } = checked(
      [
        "אביגיל חדשה 050-000-7911",
        "בנימין חדש 050-000-7912 ניהול",
        "דליה מהאשף 050-000-7914",
        "משה לוי 050-000-7990 בעלים",
      ].join("\n"),
      [
        // The wizard's manager, with no link: her line names no role.
        invite({
          id: "wizard",
          phone: "+972500007914",
          name: "דליה",
          role: "manager",
        }),
      ],
    );
    expect(check.send.map((person) => person.phone)).toEqual([
      "+972500007911",
      "+972500007912",
      "+972500007914",
    ]);
    const { links, expired } = doneLinksOf({
      rows: [
        { i: 1, status: "created", invite: "new-1" },
        { i: 2, status: "created", invite: "new-2" },
        { i: 3, status: "updated", invite: "wizard" },
      ],
      sent: check.send,
      lines: check.lines,
      team,
      labelOf,
      noName: "בלי שם",
    });
    expect(links).toEqual([
      {
        id: "new-1",
        name: "אביגיל חדשה",
        shown: "אביגיל חדשה",
        phone: "+972500007911",
        role: "צוות",
        send: "link",
        cancels: false,
      },
      expect.objectContaining({ id: "new-2", role: "ניהול" }),
      // Renamed, and still a manager: the list's role is for new invites.
      expect.objectContaining({
        id: "wizard",
        name: "דליה מהאשף",
        role: "ניהול",
      }),
    ]);
    // The owner's own line is on the team: no link, no row.
    expect(links.map((row) => row.phone)).not.toContain("+972500007990");
    expect(expired).toEqual([]);
  });

  it("leaves out whatever the database left as it was: a link made meanwhile, a member, an owner's or an accountant's", () => {
    const { check, team } = checked(
      [
        "אביגיל 050-000-7911",
        "בנימין 050-000-7912",
        "גלעד 050-000-7913",
        "דליה 050-000-7914",
      ].join("\n"),
      [],
    );
    const { links } = doneLinksOf({
      rows: [
        { i: 1, status: "invited", invite: "linked-meanwhile" },
        { i: 2, status: "member", invite: null },
        { i: 3, status: "kept", invite: "owners" },
        { i: 4, status: "created", invite: "made" },
      ],
      sent: check.send,
      lines: check.lines,
      team,
      labelOf,
      noName: "בלי שם",
    });
    expect(links.map((row) => row.id)).toEqual(["made"]);
  });

  it("also lists the lines already waiting with no link, unchanged, whose link the viewer may make", () => {
    const { check, team } = checked(
      [
        "אביגיל 050-000-7911",
        "דליה מהאשף 050-000-7914",
        "רון נעול 050-000-7915",
      ].join("\n"),
      [
        invite({
          id: "wizard",
          phone: "+972500007914",
          name: "דליה מהאשף",
          role: "manager",
        }),
        // Not this viewer's to change: left out, its link not theirs either.
        invite({
          id: "locked",
          phone: "+972500007915",
          name: "רון",
          touchable: false,
        }),
      ],
    );
    expect(check.lines.map((line) => line.outcome)).toEqual([
      "new",
      "same",
      "locked",
    ]);
    const { links } = doneLinksOf({
      rows: [{ i: 1, status: "created", invite: "made" }],
      sent: check.send,
      lines: check.lines,
      team,
      labelOf,
      noName: "בלי שם",
    });
    expect(links).toEqual([
      expect.objectContaining({ id: "made", role: "צוות" }),
      expect.objectContaining({
        id: "wizard",
        name: "דליה מהאשף",
        phone: "+972500007914",
        role: "ניהול",
      }),
    ]);
  });

  it("names no role for an invite made meanwhile elsewhere, read as new, that the database kept", () => {
    const { check, team } = checked("אביגיל 050-000-7911", []);
    const { links } = doneLinksOf({
      rows: [{ i: 1, status: "updated", invite: "made-elsewhere" }],
      sent: check.send,
      lines: check.lines,
      team,
      labelOf,
      noName: "בלי שם",
    });
    expect(links).toEqual([
      expect.objectContaining({ id: "made-elsewhere", role: "" }),
    ]);
  });

  it("lists each line once, however the answer and the preview meet", () => {
    const { check, team } = checked("אביגיל 050-000-7911", []);
    const { links } = doneLinksOf({
      rows: [
        { i: 1, status: "created", invite: "made" },
        { i: 1, status: "created", invite: "made" },
        { i: 9, status: "created", invite: "nobody-sent" },
      ],
      sent: check.send,
      lines: check.lines,
      team,
      labelOf,
      noName: "בלי שם",
    });
    expect(links.map((row) => row.id)).toEqual(["made"]);
  });

  it("offers a new link for an invite whose link ran out, only one the viewer may renew, by the invite's own name", () => {
    const { check, team } = checked(
      [
        "אביגיל 050-000-7911",
        "בנימין 050-000-7912",
        "גלעד 050-000-7913",
        "דליה 050-000-7914",
      ].join("\n"),
      [
        invite({
          id: "ran-out",
          phone: "+972500007911",
          name: "אביגיל כהן",
          role: "manager",
          linkPending: false,
          expired: true,
        }),
        invite({
          id: "nameless",
          phone: "+972500007912",
          linkPending: false,
          expired: true,
        }),
        invite({
          id: "not-theirs",
          phone: "+972500007913",
          linkPending: false,
          expired: true,
          touchable: false,
        }),
        invite({
          id: "still-open",
          phone: "+972500007914",
          linkPending: false,
        }),
      ],
    );
    expect(check.lines.map((line) => line.outcome)).toEqual([
      "expired",
      "expired",
      "expired",
      "invited",
    ]);
    const { links, expired } = doneLinksOf({
      rows: [],
      sent: check.send,
      lines: check.lines,
      team,
      labelOf,
      noName: "בלי שם",
    });
    expect(links).toEqual([]);
    expect(expired).toEqual([
      {
        id: "ran-out",
        shown: "אביגיל כהן",
        phone: "+972500007911",
        role: "ניהול",
      },
      {
        id: "nameless",
        shown: "בלי שם",
        phone: "+972500007912",
        role: "צוות",
      },
    ]);
  });

  it("offers it for a line with a problem too: its number's invite is what counts", () => {
    const { check, team } = checked("050-000-7911", [
      invite({
        id: "ran-out",
        phone: "+972500007911",
        name: "אביגיל",
        linkPending: false,
        expired: true,
      }),
    ]);
    expect(check.lines[0]).toMatchObject({
      kind: "problem",
      outcome: "expired",
    });
    const { expired } = doneLinksOf({
      rows: [],
      sent: check.send,
      lines: check.lines,
      team,
      labelOf,
      noName: "בלי שם",
    });
    expect(expired.map((row) => row.id)).toEqual(["ran-out"]);
  });
});
