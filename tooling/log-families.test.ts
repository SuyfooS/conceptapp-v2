import { APP_ACTIONS } from "@domain/activity";
import { LOG_AREA_PERMISSIONS, MANAGE_VIEW } from "@domain/manage-access";
import { describe, expect, it } from "vitest";
import {
  actorlessActions,
  actorlessInMigrations,
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

// A row with no actor is the app's only for an action the activity log knows
// the app writes on its own (APP_ACTIONS); any other reads as someone no
// longer in the app. So each action a migration writes with no actor is one
// of them, and each of them is still written so.
describe("the actions a migration writes to the log with no actor", () => {
  it("are read from a null actor, cast or not, or none, never from a variable or a comment", () => {
    const sql = [
      "-- insert into public.audit_log (business_id, actor_id, action) values (b, null, 'ghost.fixture');",
      "insert into public.audit_log (business_id, actor_id, action, details)",
      "values (business, null::uuid, 'lists.missed', jsonb_build_object('name', 'a, b'));",
      "insert into public.audit_log (business_id, actor_id, action, details)",
      "values (business, actor, 'lists.finish', '{}'::jsonb);",
      "insert into public.audit_log (business_id, action, details)",
      "values (business, case when late then 'lists.late' else 'lists.due' end, '{}');",
      "insert into public.audit_log (business_id, actor_id, action)",
      "values (business, actor, 'swap.take'), (business, NULL, 'swap.cancel');",
      "insert into public.audit_log (business_id, actor_id, action, details)",
      "select l.business_id, null, 'lists.open', jsonb_build_object('list', l.id)",
      "from public.lists l, public.businesses b where l.business_id = b.id;",
      "insert into public.notifications (actor_id, kind) values (null, 'swap.waiting');",
    ].join("\n");
    expect(actorlessActions(sql)).toEqual([
      "lists.due",
      "lists.late",
      "lists.missed",
      "lists.open",
      "swap.cancel",
    ]);
  });

  it("are the app's own, as the activity log names them", () => {
    expect(actorlessInMigrations()).toEqual([...APP_ACTIONS].sort());
  });
});
