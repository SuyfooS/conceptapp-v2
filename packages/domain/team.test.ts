import { describe, expect, it } from "vitest";
import {
  buildTeam,
  canCancelInvite,
  canRemoveMember,
  canResendInvite,
  canSeeTeam,
  countShiftsAhead,
  invitableRoles,
  leavesNoOwner,
  leavesStaff,
  mayChangeRole,
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
    expect(canSeeTeam("owner")).toBe(true);
    expect(canSeeTeam("manager")).toBe(true);
    expect(canSeeTeam("worker")).toBe(false);
    expect(canSeeTeam("accountant")).toBe(false);
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
    expect(invitableRoles("owner")).toEqual([
      "owner",
      "manager",
      "worker",
      "accountant",
    ]);
    expect(invitableRoles("manager")).toEqual(["manager", "worker"]);
    expect(invitableRoles("worker")).toEqual([]);
  });

  it("keeps the accountant to owners, though an accountant ranks as a worker", () => {
    expect(invitableRoles("manager")).not.toContain("accountant");
    expect(invitableRoles("accountant")).toEqual([]);
  });
});

describe("canResendInvite", () => {
  it("follows the same rule as inviting", () => {
    expect(canResendInvite("owner", "owner")).toBe(true);
    expect(canResendInvite("manager", "worker")).toBe(true);
    expect(canResendInvite("manager", "manager")).toBe(true);
    expect(canResendInvite("manager", "owner")).toBe(false);
    expect(canResendInvite("worker", "worker")).toBe(false);
    expect(canResendInvite("owner", "accountant")).toBe(true);
    expect(canResendInvite("manager", "accountant")).toBe(false);
    expect(canResendInvite("accountant", "worker")).toBe(false);
  });
});

describe("parseTeamInvite", () => {
  it("accepts a name, a mobile in any format and an allowed role", () => {
    expect(
      parseTeamInvite(
        { name: "  גל   לוי ", phone: "050-123-4567", role: "worker" },
        "manager",
      ),
    ).toEqual({
      ok: true,
      value: { name: "גל לוי", phone: "+972501234567", role: "worker" },
    });
  });

  it("names each missing field", () => {
    expect(parseTeamInvite({}, "owner")).toEqual({
      ok: false,
      errors: { name: "required", phone: "required", role: "required" },
    });
  });

  it("rejects a number that is not an Israeli mobile", () => {
    const result = parseTeamInvite(
      { name: "גל", phone: "03-123-4567", role: "worker" },
      "owner",
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
      "owner",
    );
    expect(result).toEqual({ ok: false, errors: { name: "tooLong" } });
  });

  it("refuses a role above the inviter's own or one that does not exist", () => {
    const base = { name: "גל", phone: "0501234567" };
    expect(parseTeamInvite({ ...base, role: "owner" }, "manager")).toEqual({
      ok: false,
      errors: { role: "notAllowed" },
    });
    expect(parseTeamInvite({ ...base, role: "chef" }, "owner")).toEqual({
      ok: false,
      errors: { role: "notAllowed" },
    });
    expect(parseTeamInvite({ ...base, role: "worker" }, "worker")).toEqual({
      ok: false,
      errors: { role: "notAllowed" },
    });
    expect(parseTeamInvite({ ...base, role: "accountant" }, "manager")).toEqual(
      { ok: false, errors: { role: "notAllowed" } },
    );
    expect(parseTeamInvite({ ...base, role: "accountant" }, "owner")).toEqual({
      ok: true,
      value: { name: "גל", phone: "+972501234567", role: "accountant" },
    });
  });
});

describe("team changes (Orel, 14 November 2026)", () => {
  const place = (userId: string, role: TeamMember["role"]) => ({
    userId,
    role,
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
            .filter((to) => mayChangeRole(viewer, from, to))
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
    expect(mayChangeRole("manager", "worker", "manager")).toBe(true);
    expect(mayChangeRole("manager", "worker", "accountant")).toBe(false);
    expect(mayChangeRole("manager", "accountant", "worker")).toBe(false);
    expect(mayChangeRole("manager", "owner", "worker")).toBe(false);
    expect(mayChangeRole("owner", "accountant", "worker")).toBe(true);
    expect(mayChangeRole("accountant", "worker", "worker")).toBe(false);
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
        allRoles.filter((role) => canCancelInvite(viewer, role)),
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
