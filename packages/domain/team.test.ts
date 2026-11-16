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
  givesRole,
  invitableRoles,
  leavesNoOwner,
  leavesStaff,
  mayChangeRole,
  ownerOnlyRoles,
  parseTeamInvite,
  roleChangeClears,
  roleChoices,
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

describe("invitableRoles", () => {
  it("lets owners give any role and managers their own and below", () => {
    expect(invitableRoles(at("owner"))).toEqual([
      "owner",
      "manager",
      "worker",
      "accountant",
    ]);
    expect(invitableRoles(at("manager"))).toEqual(["manager", "worker"]);
    expect(invitableRoles(at("worker"))).toEqual([]);
  });

  it("keeps the accountant to owners, though an accountant ranks as a worker", () => {
    expect(invitableRoles(at("manager"))).not.toContain("accountant");
    expect(invitableRoles(at("accountant"))).toEqual([]);
  });

  it("follow team edit, within the rank rule (R6)", () => {
    // A worker raised to edit the team invites workers only; at view, and a
    // manager lowered to view, nobody.
    expect(
      invitableRoles({ role: "worker", perms: ["team.view", "team.edit"] }),
    ).toEqual(["worker"]);
    expect(invitableRoles({ role: "worker", perms: ["team.view"] })).toEqual(
      [],
    );
    expect(invitableRoles({ role: "manager", perms: ["team.view"] })).toEqual(
      [],
    );
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
  it("follows the same rule as inviting", () => {
    expect(canResendInvite(at("owner"), "owner")).toBe(true);
    expect(canResendInvite(at("manager"), "worker")).toBe(true);
    expect(canResendInvite(at("manager"), "manager")).toBe(true);
    expect(canResendInvite(at("manager"), "owner")).toBe(false);
    expect(canResendInvite(at("worker"), "worker")).toBe(false);
    expect(canResendInvite(at("owner"), "accountant")).toBe(true);
    expect(canResendInvite(at("manager"), "accountant")).toBe(false);
    expect(canResendInvite(at("accountant"), "worker")).toBe(false);
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
      value: { name: "גל לוי", phone: "+972501234567", role: "worker" },
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
      value: { name: "גל", phone: "+972501234567", role: "accountant" },
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
    expect(roleChoices(place("o", "owner"), place("p", "worker"))).toEqual([
      "owner",
      "manager",
      "accountant",
    ]);
    expect(roleChoices(place("m", "manager"), place("p", "worker"))).toEqual([
      "manager",
    ]);
    expect(roleChoices(place("m", "manager"), place("p", "manager"))).toEqual([
      "worker",
    ]);
    expect(roleChoices(place("m", "manager"), place("p", "owner"))).toEqual([]);
    expect(
      roleChoices(place("m", "manager"), place("p", "accountant")),
    ).toEqual([]);
    expect(roleChoices(place("o", "owner"), place("o", "owner"))).toEqual([]);
    expect(roleChoices(place("w", "worker"), place("p", "worker"))).toEqual([]);
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
