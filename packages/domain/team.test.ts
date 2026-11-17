import { describe, expect, it } from "vitest";
import type { Role, Viewer } from "./modules";
import {
  buildTeam,
  canCancelInvite,
  canEditTeam,
  canRemoveMember,
  canResendInvite,
  canSeeTeam,
  countShiftsAhead,
  type GivableNamedRole,
  givesNamedRole,
  givesRole,
  invitableRoles,
  inviteChoices,
  leavesNoOwner,
  leavesStaff,
  mayChangeRole,
  namedRoleShown,
  namedRolesBeyond,
  ownerOnlyRoles,
  parseTeamInvite,
  placeChoice,
  type RoleChoice,
  roleChangeClears,
  roleChoiceKey,
  roleChoiceOf,
  roleChoices,
  sameRoleChoice,
  TEAM_CHANGE_FAILURES,
  TEAM_NAME_MAX,
  type TeamInvite,
  type TeamMember,
  teamChangeFailureOf,
} from "./team";

const now = new Date("2026-10-23T10:00:00Z");

/**
 * Someone in `role` as the database answers by default (the roles plan's R6):
 * managers see and edit the team, workers neither, an accountant only pay,
 * and an owner holds everything without a key.
 */
const at = (role: Role): Viewer => ({
  role,
  perms:
    role === "manager"
      ? ["team.view", "team.edit"]
      : role === "accountant"
        ? ["clock.payroll"]
        : [],
});

const member = (name: string | null, role: TeamMember["role"]): TeamMember => ({
  userId: `u-${name}`,
  name,
  phone: null,
  role,
  photo: null,
  addressForm: null,
});

const invite = (
  name: string | null,
  role: TeamInvite["role"],
  expiresAt: string,
): TeamInvite => ({
  id: `i-${name}`,
  name,
  phone: "+972500000099",
  role,
  expiresAt,
});

describe("canSeeTeam", () => {
  it("lets owners and managers in and keeps workers out", () => {
    expect(canSeeTeam(at("owner"))).toBe(true);
    expect(canSeeTeam(at("manager"))).toBe(true);
    expect(canSeeTeam(at("worker"))).toBe(false);
    expect(canSeeTeam(at("accountant"))).toBe(false);
  });

  it("follow team view and team edit as the database answers them (R6)", () => {
    // A worker raised to view sees the team and changes nothing; at edit,
    // changes it; a manager lowered to view only sees it, and to none
    // doesn't.
    const raised: Viewer = { role: "worker", perms: ["team.view"] };
    expect(canSeeTeam(raised)).toBe(true);
    expect(canEditTeam(raised)).toBe(false);
    expect(
      canEditTeam({ role: "worker", perms: ["team.view", "team.edit"] }),
    ).toBe(true);
    expect(canEditTeam({ role: "manager", perms: ["team.view"] })).toBe(false);
    expect(canSeeTeam({ role: "manager", perms: [] })).toBe(false);
    // Edit without view (a personal grant alone) opens nothing.
    expect(canEditTeam({ role: "worker", perms: ["team.edit"] })).toBe(false);
    expect(canEditTeam(at("owner"))).toBe(true);
    expect(canEditTeam(at("manager"))).toBe(true);
  });
});

describe("buildTeam", () => {
  it("puts owners first, then managers, workers and accountants, unnamed last", () => {
    const team = buildTeam(
      [
        member("Zoe", "worker"),
        member(null, "worker"),
        member("Avi", "worker"),
        member("Gal", "accountant"),
        member("Dana", "manager"),
        member("Uri", "owner"),
      ],
      [],
      now,
    );
    expect(team.members.map((m) => m.name)).toEqual([
      "Uri",
      "Dana",
      "Avi",
      "Zoe",
      null,
      "Gal",
    ]);
    expect(team.counts).toEqual({ members: 6, open: 0, expired: 0 });
  });

  it("marks invites past their date as expired and lists them after open ones", () => {
    const team = buildTeam(
      [],
      [
        invite("Old", "manager", "2026-10-20T10:00:00Z"),
        invite("New", "worker", "2026-11-01T10:00:00Z"),
        invite("Boss", "owner", "2026-11-02T10:00:00Z"),
      ],
      now,
    );
    expect(team.invites.map((i) => [i.name, i.state])).toEqual([
      ["Boss", "open"],
      ["New", "open"],
      ["Old", "expired"],
    ]);
    expect(team.counts).toEqual({ members: 0, open: 2, expired: 1 });
  });

  it("treats an invite that expires right now as expired", () => {
    const team = buildTeam(
      [],
      [invite("Edge", "worker", now.toISOString())],
      now,
    );
    expect(team.invites[0]?.state).toBe("expired");
  });

  it("does not reorder the lists it was given", () => {
    const members = [member("B", "worker"), member("A", "owner")];
    buildTeam(members, [], now);
    expect(members.map((m) => m.name)).toEqual(["B", "A"]);
  });
});

/** Built-in roles as choices: no named role. */
const builtIn = (...roles: Role[]): RoleChoice[] =>
  roles.map((role) => ({ role, namedRole: null }));

/**
 * The business's named roles (R11b): a shift lead on workers who builds the
 * schedule, a bar lead on workers who holds nothing owners switch, and a
 * floor manager on managers who edits the team.
 */
const shiftLead: GivableNamedRole = {
  id: "lead",
  name: "אחראי משמרת",
  nameEn: "Shift lead",
  base: "worker",
  holds: ["schedule.edit"],
};
const barLead: GivableNamedRole = {
  id: "bar",
  name: "אחראי בר",
  nameEn: null,
  base: "worker",
  holds: [],
};
const floorManager: GivableNamedRole = {
  id: "floor",
  name: "מנהל רצפה",
  nameEn: null,
  base: "manager",
  holds: ["team.edit", "team.view"],
};
const named = [shiftLead, barLead, floorManager];

/** A manager as the database answers by default: building the schedule too. */
const manager: Viewer = {
  role: "manager",
  perms: ["schedule.edit", "team.view", "team.edit"],
};

describe("invitableRoles", () => {
  it("lets owners give any role and managers their own and below", () => {
    expect(invitableRoles(at("owner"))).toEqual(
      builtIn("owner", "manager", "worker", "accountant"),
    );
    expect(invitableRoles(at("manager"))).toEqual(builtIn("manager", "worker"));
    expect(invitableRoles(at("worker"))).toEqual([]);
  });

  it("keeps the accountant to owners, though an accountant ranks as a worker", () => {
    expect(invitableRoles(at("manager")).map((c) => c.role)).not.toContain(
      "accountant",
    );
    expect(invitableRoles(at("accountant"))).toEqual([]);
  });

  it("follow team edit, within the rank rule (R6)", () => {
    // A worker raised to edit the team invites workers only; at view, and a
    // manager lowered to view, nobody.
    expect(
      invitableRoles({ role: "worker", perms: ["team.view", "team.edit"] }),
    ).toEqual(builtIn("worker"));
    expect(invitableRoles({ role: "worker", perms: ["team.view"] })).toEqual(
      [],
    );
    expect(invitableRoles({ role: "manager", perms: ["team.view"] })).toEqual(
      [],
    );
  });

  it("offer the business's named roles after their base, to whoever gives them (R11b)", () => {
    // An owner every one of them.
    expect(invitableRoles(at("owner"), named).map(roleChoiceKey)).toEqual([
      "owner",
      "manager",
      "floor",
      "worker",
      "lead",
      "bar",
      "accountant",
    ]);
    // A manager those holding nothing they don't: here every one.
    expect(invitableRoles(manager, named)).toEqual([
      { role: "manager", namedRole: null },
      { role: "manager", namedRole: "floor" },
      { role: "worker", namedRole: null },
      { role: "worker", namedRole: "lead" },
      { role: "worker", namedRole: "bar" },
    ]);
    // A manager who doesn't build the schedule: not the shift lead, who does.
    expect(invitableRoles(at("manager"), named).map(roleChoiceKey)).toEqual([
      "manager",
      "floor",
      "worker",
      "bar",
    ]);
    // A worker raised to edit the team: by rank, only those on workers.
    expect(
      invitableRoles(
        { role: "worker", perms: ["team.view", "team.edit", "schedule.edit"] },
        named,
      ).map(roleChoiceKey),
    ).toEqual(["worker", "lead", "bar"]);
    // Nobody who doesn't edit the team.
    expect(invitableRoles(at("worker"), named)).toEqual([]);
  });
});

describe("givesNamedRole", () => {
  it("is the rank rule of its base, and nothing beyond what the giver holds", () => {
    expect(givesNamedRole(at("owner"), shiftLead)).toBe(true);
    expect(givesNamedRole(at("owner"), floorManager)).toBe(true);
    expect(givesNamedRole(manager, shiftLead)).toBe(true);
    expect(givesNamedRole(at("manager"), shiftLead)).toBe(false);
    expect(
      givesNamedRole(
        { role: "worker", perms: ["team.view", "team.edit"] },
        floorManager,
      ),
    ).toBe(false);
    expect(givesNamedRole(at("worker"), barLead)).toBe(false);
    expect(givesNamedRole(at("accountant"), barLead)).toBe(false);
  });

  it("counts running the lists as fixing closed ones (L6b-2)", () => {
    const senior: GivableNamedRole = {
      id: "senior",
      name: "Senior",
      nameEn: null,
      base: "worker",
      holds: ["lists.fix"],
    };
    // A manager who runs the lists, whose own rule for fixing is off.
    expect(
      givesNamedRole(
        { role: "manager", perms: ["team.view", "team.edit", "lists.manage"] },
        senior,
      ),
    ).toBe(true);
    // A manager lowered on lists, without fixing: only an owner gives it.
    expect(
      givesNamedRole(
        { role: "manager", perms: ["team.view", "team.edit"] },
        senior,
      ),
    ).toBe(false);
    expect(
      givesNamedRole(
        { role: "manager", perms: ["team.view", "team.edit", "lists.fix"] },
        senior,
      ),
    ).toBe(true);
  });
});

describe("namedRolesBeyond", () => {
  it("are the named roles on a base the viewer gives that hold what they don't", () => {
    // A manager who doesn't build the schedule: the shift lead, who does.
    expect(namedRolesBeyond(at("manager"), named)).toEqual([
      { role: "worker", namedRole: "lead" },
    ]);
    // A worker raised to edit the team: the shift lead too, never the floor
    // manager, whose base they don't give.
    expect(
      namedRolesBeyond(
        { role: "worker", perms: ["team.view", "team.edit"] },
        named,
      ),
    ).toEqual([{ role: "worker", namedRole: "lead" }]);
    // None for an owner, for a manager who holds it all, or for anyone who
    // doesn't edit the team.
    expect(namedRolesBeyond(at("owner"), named)).toEqual([]);
    expect(namedRolesBeyond(manager, named)).toEqual([]);
    expect(namedRolesBeyond(at("worker"), named)).toEqual([]);
  });
});

describe("inviteChoices", () => {
  it("shows an owner every role, none held back", () => {
    expect(inviteChoices(at("owner"), named, [])).toEqual(
      invitableRoles(at("owner"), named).map((choice) => ({
        ...choice,
        blocked: null,
      })),
    );
  });

  it("shows a manager the roles only an owner gives, with why (Orel, 16 November 2026)", () => {
    // Workers see pay here, and the shift lead builds the schedule, which
    // this manager doesn't: both an owner's, shown in their places.
    expect(inviteChoices(at("manager"), named, ["worker"])).toEqual([
      { role: "manager", namedRole: null, blocked: null },
      { role: "manager", namedRole: "floor", blocked: null },
      { role: "worker", namedRole: null, blocked: "pay" },
      { role: "worker", namedRole: "lead", blocked: "held" },
      { role: "worker", namedRole: "bar", blocked: null },
    ]);
    // What it offers is invitableRoles' without the pay roles.
    expect(
      inviteChoices(at("manager"), named, ["worker"])
        .filter((choice) => !choice.blocked)
        .map(roleChoiceKey),
    ).toEqual(
      invitableRoles(at("manager"), named)
        .filter(
          (choice) => choice.namedRole !== null || choice.role !== "worker",
        )
        .map(roleChoiceKey),
    );
  });

  it("shows a worker raised to edit the team only the roles on workers", () => {
    expect(
      inviteChoices(
        { role: "worker", perms: ["team.view", "team.edit"] },
        named,
      ),
    ).toEqual([
      { role: "worker", namedRole: null, blocked: null },
      { role: "worker", namedRole: "lead", blocked: "held" },
      { role: "worker", namedRole: "bar", blocked: null },
    ]);
  });

  it("shows nothing to anyone who doesn't edit the team", () => {
    expect(inviteChoices(at("worker"), named, ["worker"])).toEqual([]);
    expect(
      inviteChoices({ role: "manager", perms: ["team.view"] }, named),
    ).toEqual([]);
  });
});

describe("namedRoleShown", () => {
  it("keeps a named role's names and base, and leaves what it holds behind", () => {
    expect(namedRoleShown(shiftLead)).toEqual({
      id: "lead",
      name: "אחראי משמרת",
      nameEn: "Shift lead",
      base: "worker",
    });
    expect(namedRoleShown(shiftLead)).not.toHaveProperty("holds");
    expect(
      namedRoleShown({ ...barLead, archived: true } as GivableNamedRole),
    ).not.toHaveProperty("archived");
  });
});

describe("role choices", () => {
  it("carry a built-in role by its name and a named one by its id", () => {
    const choices = invitableRoles(at("owner"), named);
    expect(roleChoiceKey({ role: "worker", namedRole: null })).toBe("worker");
    expect(roleChoiceKey({ role: "worker", namedRole: "lead" })).toBe("lead");
    expect(roleChoiceOf("lead", choices)).toEqual({
      role: "worker",
      namedRole: "lead",
    });
    expect(roleChoiceOf("manager", choices)).toEqual({
      role: "manager",
      namedRole: null,
    });
    expect(roleChoiceOf("gone", choices)).toBeNull();
    expect(
      sameRoleChoice(
        { role: "worker", namedRole: "lead" },
        { role: "worker", namedRole: "lead" },
      ),
    ).toBe(true);
    expect(
      sameRoleChoice(
        { role: "worker", namedRole: "lead" },
        { role: "worker", namedRole: null },
      ),
    ).toBe(false);
    expect(placeChoice({ userId: "p", role: "worker" })).toEqual({
      role: "worker",
      namedRole: null,
    });
    expect(
      placeChoice({ userId: "p", role: "worker", namedRole: "bar" }),
    ).toEqual({ role: "worker", namedRole: "bar" });
  });
});

describe("givesRole", () => {
  it("is the rank rule: an owner every role, anyone else the staff's at or below their own", () => {
    const roles = ["owner", "manager", "worker", "accountant"] as const;
    expect(
      Object.fromEntries(
        roles.map((giver) => [
          giver,
          roles.filter((role) => givesRole(giver, role)),
        ]),
      ),
    ).toEqual({
      owner: ["owner", "manager", "worker", "accountant"],
      manager: ["manager", "worker"],
      worker: ["worker"],
      accountant: [],
    });
  });
});

describe("canResendInvite", () => {
  const to = (role: Role, namedRole: string | null = null): RoleChoice => ({
    role,
    namedRole,
  });

  it("follows the same rule as inviting", () => {
    expect(canResendInvite(at("owner"), to("owner"))).toBe(true);
    expect(canResendInvite(at("manager"), to("worker"))).toBe(true);
    expect(canResendInvite(at("manager"), to("manager"))).toBe(true);
    expect(canResendInvite(at("manager"), to("owner"))).toBe(false);
    expect(canResendInvite(at("worker"), to("worker"))).toBe(false);
    expect(canResendInvite(at("owner"), to("accountant"))).toBe(true);
    expect(canResendInvite(at("manager"), to("accountant"))).toBe(false);
    expect(canResendInvite(at("accountant"), to("worker"))).toBe(false);
  });

  it("gives an invite to a named role a new link only from whoever gives it now (R11b)", () => {
    expect(canResendInvite(manager, to("worker", "lead"), named)).toBe(true);
    expect(canResendInvite(at("manager"), to("worker", "lead"), named)).toBe(
      false,
    );
    // Removed since: among the live ones no more.
    expect(canResendInvite(at("owner"), to("worker", "gone"), named)).toBe(
      false,
    );
    // Deleting it stays by the rank of its base.
    expect(canCancelInvite(at("manager"), "worker")).toBe(true);
  });
});

describe("ownerOnlyRoles", () => {
  it("leaves the roles that hold pay to an owner (R6)", () => {
    // Where an owner gave managers pay: an owner gives it, anyone else not.
    expect(ownerOnlyRoles(at("owner"), ["manager"])).toEqual([]);
    expect(ownerOnlyRoles(at("manager"), ["manager"])).toEqual(["manager"]);
    expect(
      ownerOnlyRoles({ role: "worker", perms: ["team.view", "team.edit"] }, [
        "manager",
        "worker",
      ]),
    ).toEqual(["manager", "worker"]);
    // Where no role holds pay, nothing is.
    expect(ownerOnlyRoles(at("manager"), [])).toEqual([]);
  });
});

describe("parseTeamInvite", () => {
  it("accepts a name, a mobile in any format and an allowed role", () => {
    expect(
      parseTeamInvite(
        { name: "  גל   לוי ", phone: "050-123-4567", role: "worker" },
        at("manager"),
      ),
    ).toEqual({
      ok: true,
      value: {
        name: "גל לוי",
        phone: "+972501234567",
        role: "worker",
        namedRole: null,
      },
    });
  });

  it("takes a named role the inviter gives by its id, on its base (R11b)", () => {
    const base = { name: "גל", phone: "0501234567" };
    expect(parseTeamInvite({ ...base, role: "lead" }, manager, named)).toEqual({
      ok: true,
      value: {
        name: "גל",
        phone: "+972501234567",
        role: "worker",
        namedRole: "lead",
      },
    });
    // One they don't give, one not of the business, or none offered.
    expect(
      parseTeamInvite({ ...base, role: "lead" }, at("manager"), named),
    ).toEqual({ ok: false, errors: { role: "notAllowed" } });
    expect(
      parseTeamInvite({ ...base, role: "elsewhere" }, at("owner"), named),
    ).toEqual({ ok: false, errors: { role: "notAllowed" } });
    expect(parseTeamInvite({ ...base, role: "lead" }, at("owner"))).toEqual({
      ok: false,
      errors: { role: "notAllowed" },
    });
  });

  it("names each missing field", () => {
    expect(parseTeamInvite({}, at("owner"))).toEqual({
      ok: false,
      errors: { name: "required", phone: "required", role: "required" },
    });
  });

  it("rejects a number that is not an Israeli mobile", () => {
    const result = parseTeamInvite(
      { name: "גל", phone: "03-123-4567", role: "worker" },
      at("owner"),
    );
    expect(result).toEqual({ ok: false, errors: { phone: "invalid" } });
  });

  it("rejects a name over the limit", () => {
    const result = parseTeamInvite(
      {
        name: "א".repeat(TEAM_NAME_MAX + 1),
        phone: "0501234567",
        role: "worker",
      },
      at("owner"),
    );
    expect(result).toEqual({ ok: false, errors: { name: "tooLong" } });
  });

  it("refuses a role above the inviter's own or one that does not exist", () => {
    const base = { name: "גל", phone: "0501234567" };
    expect(parseTeamInvite({ ...base, role: "owner" }, at("manager"))).toEqual({
      ok: false,
      errors: { role: "notAllowed" },
    });
    expect(parseTeamInvite({ ...base, role: "chef" }, at("owner"))).toEqual({
      ok: false,
      errors: { role: "notAllowed" },
    });
    expect(parseTeamInvite({ ...base, role: "worker" }, at("worker"))).toEqual({
      ok: false,
      errors: { role: "notAllowed" },
    });
    expect(
      parseTeamInvite({ ...base, role: "accountant" }, at("manager")),
    ).toEqual({ ok: false, errors: { role: "notAllowed" } });
    expect(
      parseTeamInvite({ ...base, role: "accountant" }, at("owner")),
    ).toEqual({
      ok: true,
      value: {
        name: "גל",
        phone: "+972501234567",
        role: "accountant",
        namedRole: null,
      },
    });
  });
});

describe("team changes (Orel, 14 November 2026)", () => {
  // Someone on the team, with what they hold by default when they act.
  const place = (userId: string, role: TeamMember["role"]) => ({
    userId,
    ...at(role),
  });
  const allRoles = ["owner", "manager", "worker", "accountant"] as const;

  it("let whoever invites to a role remove from it, never oneself", () => {
    const allowed = Object.fromEntries(
      allRoles.map((viewer) => [
        viewer,
        allRoles.filter((person) =>
          canRemoveMember(place("v", viewer), place("p", person)),
        ),
      ]),
    );
    expect(allowed).toEqual({
      owner: ["owner", "manager", "worker", "accountant"],
      manager: ["manager", "worker"],
      worker: [],
      accountant: [],
    });
    for (const role of allRoles) {
      expect(canRemoveMember(place("v", role), place("v", role)), role).toBe(
        false,
      );
    }
  });

  it("change a role only between roles the viewer invites to", () => {
    // Every change each viewer may make, as `from -> to`, spelled out.
    const allowed = Object.fromEntries(
      allRoles.map((viewer) => [
        viewer,
        allRoles.flatMap((from) =>
          allRoles
            .filter((to) => mayChangeRole(at(viewer), from, to))
            .map((to) => `${from} -> ${to}`),
        ),
      ]),
    );
    expect(allowed).toEqual({
      owner: [
        "owner -> owner",
        "owner -> manager",
        "owner -> worker",
        "owner -> accountant",
        "manager -> owner",
        "manager -> manager",
        "manager -> worker",
        "manager -> accountant",
        "worker -> owner",
        "worker -> manager",
        "worker -> worker",
        "worker -> accountant",
        "accountant -> owner",
        "accountant -> manager",
        "accountant -> worker",
        "accountant -> accountant",
      ],
      manager: [
        "manager -> manager",
        "manager -> worker",
        "worker -> manager",
        "worker -> worker",
      ],
      worker: [],
      accountant: [],
    });
    expect(mayChangeRole(at("manager"), "worker", "manager")).toBe(true);
    expect(mayChangeRole(at("manager"), "worker", "accountant")).toBe(false);
    expect(mayChangeRole(at("manager"), "accountant", "worker")).toBe(false);
    expect(mayChangeRole(at("manager"), "owner", "worker")).toBe(false);
    expect(mayChangeRole(at("owner"), "accountant", "worker")).toBe(true);
    expect(mayChangeRole(at("accountant"), "worker", "worker")).toBe(false);
    // A worker raised to edit the team (R6): between workers only.
    const raised: Viewer = {
      role: "worker",
      perms: ["team.view", "team.edit"],
    };
    expect(mayChangeRole(raised, "worker", "worker")).toBe(true);
    expect(mayChangeRole(raised, "worker", "manager")).toBe(false);
    expect(mayChangeRole(raised, "manager", "worker")).toBe(false);
  });

  it("offer the other roles the viewer gives, and none they may not touch", () => {
    expect(roleChoices(place("o", "owner"), place("p", "worker"))).toEqual(
      builtIn("owner", "manager", "accountant"),
    );
    expect(roleChoices(place("m", "manager"), place("p", "worker"))).toEqual(
      builtIn("manager"),
    );
    expect(roleChoices(place("m", "manager"), place("p", "manager"))).toEqual(
      builtIn("worker"),
    );
    expect(roleChoices(place("m", "manager"), place("p", "owner"))).toEqual([]);
    expect(
      roleChoices(place("m", "manager"), place("p", "accountant")),
    ).toEqual([]);
    expect(roleChoices(place("o", "owner"), place("o", "owner"))).toEqual([]);
    expect(roleChoices(place("w", "worker"), place("p", "worker"))).toEqual([]);
  });

  it("offer named roles too, and the person's base for someone in one (R11b)", () => {
    const lead = { userId: "p", role: "worker" as const, namedRole: "lead" };
    expect(
      roleChoices({ userId: "m", ...manager }, lead, named).map(roleChoiceKey),
    ).toEqual(["manager", "floor", "worker", "bar"]);
    expect(
      roleChoices(place("o", "owner"), place("p", "worker"), named).map(
        roleChoiceKey,
      ),
    ).toEqual(["owner", "manager", "floor", "lead", "bar", "accountant"]);
    // Someone in a named role the viewer doesn't give is still theirs to
    // change, by the rank of its base.
    expect(canRemoveMember(place("m", "manager"), lead)).toBe(true);
  });

  it("cancel invites by the rule of sending their link", () => {
    const allowed = Object.fromEntries(
      allRoles.map((viewer) => [
        viewer,
        allRoles.filter((role) => canCancelInvite(at(viewer), role)),
      ]),
    );
    expect(allowed).toEqual({
      owner: ["owner", "manager", "worker", "accountant"],
      manager: ["manager", "worker"],
      worker: [],
      accountant: [],
    });
  });

  it("know when a change would leave no owner", () => {
    const team = [place("a", "owner"), place("b", "manager")];
    expect(leavesNoOwner(team, "a", null)).toBe(true);
    expect(leavesNoOwner(team, "a", "manager")).toBe(true);
    expect(leavesNoOwner(team, "a", "owner")).toBe(false);
    expect(leavesNoOwner(team, "b", null)).toBe(false);
    expect(leavesNoOwner([...team, place("c", "owner")], "a", null)).toBe(
      false,
    );
  });

  it("take shifts off whoever leaves the staff", () => {
    expect(leavesStaff("worker", null)).toBe(true);
    expect(leavesStaff("manager", "accountant")).toBe(true);
    expect(leavesStaff("owner", "manager")).toBe(false);
    expect(leavesStaff("accountant", null)).toBe(false);
    expect(leavesStaff("accountant", "worker")).toBe(false);
  });

  it("hold the changes that changing back can't undo", () => {
    // Off the staff: the shifts ahead come off.
    expect(roleChangeClears("worker", "accountant")).toBe(true);
    expect(roleChangeClears("owner", "accountant")).toBe(true);
    // An owner's place clears personal permissions.
    expect(roleChangeClears("manager", "owner")).toBe(true);
    expect(roleChangeClears("worker", "owner")).toBe(true);
    // An accountant has none to clear, and no shifts.
    expect(roleChangeClears("accountant", "owner")).toBe(false);
    expect(roleChangeClears("accountant", "worker")).toBe(false);
    // Between manager and worker, and down from owner, nothing is lost.
    expect(roleChangeClears("worker", "manager")).toBe(false);
    expect(roleChangeClears("manager", "worker")).toBe(false);
    expect(roleChangeClears("owner", "manager")).toBe(false);
    expect(roleChangeClears("worker", "worker")).toBe(false);
  });

  it("read the database's refusals as the screens explain them", () => {
    expect(teamChangeFailureOf("42501")).toBe("notAllowed");
    expect(teamChangeFailureOf("42501", "held")).toBe("beyondHeld");
    expect(teamChangeFailureOf("42501", "pay")).toBe("givesPay");
    expect(teamChangeFailureOf("P0002")).toBe("gone");
    expect(teamChangeFailureOf("22023")).toBe("yourself");
    expect(teamChangeFailureOf("22023", "archived")).toBe("roleGone");
    expect(teamChangeFailureOf("23P01")).toBe("lastOwner");
    expect(teamChangeFailureOf("55000", "demo")).toBe("demo");
    expect(teamChangeFailureOf("55000", "clocked_in")).toBe("clockedIn");
    expect(teamChangeFailureOf("55000", null)).toBe("failed");
    expect(teamChangeFailureOf("23505")).toBe("elsewhere");
    expect(teamChangeFailureOf("40001")).toBe("changed");
    expect(teamChangeFailureOf("XX000")).toBe("failed");
    expect(teamChangeFailureOf(undefined)).toBe("failed");
    expect(TEAM_CHANGE_FAILURES).toContain("failed");
  });
});

describe("countShiftsAhead", () => {
  const now = new Date("2026-11-24T08:00:00Z"); // 10:00 in Israel
  const zone = "Asia/Jerusalem";

  it("counts the shifts still to start, published and drafts apart", () => {
    expect(
      countShiftsAhead(
        [
          { day: "2026-11-22", start: "07:00", published: true },
          { day: "2026-11-24", start: "07:00", published: true },
          { day: "2026-11-24", start: "16:00", published: true },
          { day: "2026-11-25", start: "07:00", published: true },
          { day: "2026-11-29", start: "07:00", published: false },
        ],
        zone,
        now,
      ),
    ).toEqual({ shifts: 2, drafts: 1 });
  });

  it("keeps a shift that starts right now, as the database does", () => {
    expect(
      countShiftsAhead(
        [{ day: "2026-11-24", start: "10:00", published: true }],
        zone,
        now,
      ),
    ).toEqual({ shifts: 0, drafts: 0 });
    expect(countShiftsAhead([], zone, now)).toEqual({ shifts: 0, drafts: 0 });
  });
});
