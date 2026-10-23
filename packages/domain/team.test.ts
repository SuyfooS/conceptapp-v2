import { describe, expect, it } from "vitest";
import {
  buildTeam,
  canSeeTeam,
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
