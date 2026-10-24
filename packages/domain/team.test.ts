import { describe, expect, it } from "vitest";
import {
  buildTeam,
  canResendInvite,
  canSeeTeam,
  invitableRoles,
  parseTeamInvite,
  TEAM_NAME_MAX,
  type TeamInvite,
  type TeamMember,
} from "./team";

const now = new Date("2026-10-23T10:00:00Z");

const member = (name: string | null, role: TeamMember["role"]): TeamMember => ({
  userId: `u-${name}`,
  name,
  phone: null,
  role,
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
  });
});

describe("buildTeam", () => {
  it("puts owners first, then managers, then workers, unnamed last", () => {
    const team = buildTeam(
      [
        member("Zoe", "worker"),
        member(null, "worker"),
        member("Avi", "worker"),
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
    ]);
    expect(team.counts).toEqual({ members: 5, open: 0, expired: 0 });
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
    expect(invitableRoles("owner")).toEqual(["owner", "manager", "worker"]);
    expect(invitableRoles("manager")).toEqual(["manager", "worker"]);
    expect(invitableRoles("worker")).toEqual([]);
  });
});

describe("canResendInvite", () => {
  it("follows the same rule as inviting", () => {
    expect(canResendInvite("owner", "owner")).toBe(true);
    expect(canResendInvite("manager", "worker")).toBe(true);
    expect(canResendInvite("manager", "manager")).toBe(true);
    expect(canResendInvite("manager", "owner")).toBe(false);
    expect(canResendInvite("worker", "worker")).toBe(false);
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
  });
});
