import { LOG_AREA_PERMISSIONS, MANAGE_VIEW } from "@domain/manage-access";
import { describe, expect, it } from "vitest";
import {
  familiesInMigrations,
  familiesWritten,
  logPermArms,
  newestBody,
  OWN_SIDE,
  payFamilies,
} from "./log-families";

// The activity log by area (the roles plan's R7): every family a migration
// writes to the log has a place in the policies, its area in
// private.log_perm or the pay holders' side, so a new one never shows to
// the wrong people (critique 7) nor silently to no one.

describe("the families a migration writes to the log", () => {
  it("are read from each insert's action-shaped strings, never from comments or other tables", () => {
    const sql = [
      "-- insert into public.audit_log values ('ghost.fixture');",
      "insert into public.audit_log (business_id, actor_id, action, details)",
      "values (business, actor,",
      "  case when granted then 'permission.grant' else 'permission.revoke' end,",
      "  jsonb_build_object('perm', 'clock.payroll', 'note', 'a; b'));",
      "insert into public.notifications (kind) values ('swap.waiting');",
      "insert into public.audit_log (business_id, action)",
      "select b.id, 'clock.station.add' from public.businesses b;",
    ].join("\n");
    expect(familiesWritten(sql)).toEqual(["clock", "permission"]);
  });
});

describe("private.log_perm's arms", () => {
  it("are each family with the permission it is read at, and what it says otherwise", () => {
    const body = [
      "select case",
      "  when what ~ '^clock\\.' then 'clock.edit'::text",
      "  when what ~ '^(schedule|swap)\\.' then 'schedule.edit'::text",
      "  when what ~ '^(module|business)\\.'",
      "    then 'manage.view'::text",
      "end",
    ].join("\n");
    const arms = logPermArms(body);
    expect(Object.fromEntries(arms.families)).toEqual({
      clock: "clock.edit",
      schedule: "schedule.edit",
      swap: "schedule.edit",
      module: "manage.view",
      business: "manage.view",
    });
    expect(arms.otherwise).toBe(null);
    expect(
      logPermArms(`${body.replace("end", "")} else 'manage.view'::text end`)
        .otherwise,
    ).toBe("manage.view");
  });
});

describe("the log's families in the migrations", () => {
  const arms = logPermArms(newestBody("private.log_perm"));
  const pay = payFamilies(newestBody("private.is_pay_action"));

  it("are read where the policies can find them", () => {
    expect(arms.families.size).toBeGreaterThan(0);
    expect(pay).toEqual(["wage", "payroll"]);
    expect([...familiesInMigrations().keys()].length).toBeGreaterThan(10);
  });

  it("each have a place: an area in private.log_perm, pay's or documents'", () => {
    const placed = new Set<string>([
      ...arms.families.keys(),
      ...pay,
      ...OWN_SIDE,
    ]);
    const unplaced = [...familiesInMigrations()]
      .filter(([family]) => !placed.has(family))
      .map(([family, file]) => `${family} (${file})`);
    expect(unplaced).toEqual([]);
  });

  it("and one named nowhere is read by no one through the management page: no else", () => {
    expect(arms.otherwise).toBe(null);
  });

  it("are read at the areas the screens know of, besides manage.view", () => {
    const areas = new Set(arms.families.values());
    expect(areas.has(MANAGE_VIEW)).toBe(true);
    areas.delete(MANAGE_VIEW);
    expect([...areas].sort()).toEqual([...LOG_AREA_PERMISSIONS].sort());
  });
});
