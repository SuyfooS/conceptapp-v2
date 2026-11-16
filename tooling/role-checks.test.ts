import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FIXED,
  MIGRATIONS,
  migrationFiles,
  NOT_YET_MOVED,
  newestChecks,
  roleChecks,
  violations,
} from "./role-checks";

// The roles plan's guard (R1): a migration after it writes no new rule by
// rank (`has_role(`, `role in ('owner', 'manager')`, `is_viewing(…,
// 'manager')`, `members_in(…, '{owner,manager}')`, a notification's audience
// `'manager'`) outside the rules that stay by role (FIXED) and those of the
// areas the plan has yet to move (NOT_YET_MOVED), which their phases take
// out as they move them.

describe("rules by rank in SQL", () => {
  it("are found in each of their five forms, with the function or policy they are in", () => {
    const sql = [
      "create or replace function private.gate(business uuid)",
      "returns boolean language sql as $$",
      "  select private.has_role(business, 'manager')",
      "$$;",
      'create policy "managers read" on public.things for select',
      "  using (private.is_viewing(business_id, 'manager'::public.member_role)",
      "    or exists (select 1 from public.memberships m",
      "      where m.role in ('manager', 'owner')));",
      "create function private.tell(b uuid) returns void language plpgsql as $$",
      "begin",
      "  perform private.notify(b, private.members_in(",
      "    b, case when true then '{owner}' else '{owner,manager}' end));",
      "end;",
      "$$;",
      "update public.memberships m set active = true where m.role in ('owner','manager');",
      "create function private.heads(b uuid) returns uuid[] language sql as $$",
      "  select private.members_in(b, array['owner','manager']::public.member_role[])",
      "    || private.members_in(b, array['manager'::public.member_role, 'owner'::public.member_role])",
      "$$;",
      "create function private.warn(b uuid) returns void language plpgsql as $$",
      "begin",
      "  perform private.notify(b, '{}'::uuid[], 'x'::text, '{}'::jsonb, null::uuid,",
      "    'scheduling'::public.module_key, 'manager'::public.member_role, at_time => now());",
      "  perform private.notify(b, '{}'::uuid[], 'y'::text, audience => 'manager');",
      "end;",
      "$$;",
    ].join("\n");
    expect(roleChecks(sql)).toEqual([
      { line: 3, check: "has_role(", where: "private.gate" },
      {
        line: 6,
        check: "is_viewing(…, 'manager')",
        where: 'policy "managers read" on public.things',
      },
      {
        line: 8,
        check: "role in ('owner', 'manager')",
        where: 'policy "managers read" on public.things',
      },
      {
        line: 11,
        check: "members_in(…, '{owner,manager}')",
        where: "private.tell",
      },
      { line: 15, check: "role in ('owner', 'manager')", where: "top level" },
      {
        line: 17,
        check: "members_in(…, '{owner,manager}')",
        where: "private.heads",
      },
      {
        line: 18,
        check: "members_in(…, '{owner,manager}')",
        where: "private.heads",
      },
      {
        line: 22,
        check: "notify(…, audience 'manager')",
        where: "private.warn",
      },
      {
        line: 24,
        check: "notify(…, audience 'manager')",
        where: "private.warn",
      },
    ]);
  });

  it("leave out comments, a function's own name, owner-only rules and other roles", () => {
    const sql = [
      "-- private.has_role(business, 'manager') once decided this",
      "create or replace function private.has_role(business uuid, min_role public.member_role)",
      "returns boolean language sql as $$ select true $$;",
      "revoke execute on function private.is_viewing(uuid, public.member_role) from anon;",
      "create function private.f(b uuid) returns boolean language sql as $$",
      "  select private.has_role(b, 'owner')",
      "    and private.is_viewing(b)",
      "    and private.is_viewing(b, 'worker')",
      "    and exists (select 1 from public.memberships m where m.role in ('manager', 'worker'))",
      "    and cardinality(private.members_in(b, '{accountant}'::public.member_role[])) > 0",
      "    and cardinality(private.members_in(b, array['worker','manager']::public.member_role[])) > 0",
      "    and private.notify(b, '{}'::uuid[], 'z', '{}'::jsonb, null, null, 'worker') > 0",
      "    and 'has_role(' <> ''",
      "$$;",
      "drop function private.has_role(uuid, public.member_role);",
      "drop function if exists private.has_role(uuid, public.member_role);",
      "drop function if exists public.has_role(uuid, public.member_role);",
    ].join("\n");
    expect(roleChecks(sql)).toEqual([]);
  });

  it("leave out a line for those who hold a permission, which the read policy asks instead (R3)", () => {
    const sql = [
      "create function private.tell(b uuid) returns void language plpgsql as $$",
      "begin",
      "  perform private.notify(b, private.members_holding(b, 'schedule.edit'::text), 'x'::text,",
      "    '{}'::jsonb, null::uuid, 'scheduling'::public.module_key, 'manager'::public.member_role,",
      "    'x:1', at_time => now(), holders_of => 'schedule.edit'::text);",
      "  perform private.notify(b, '{}'::uuid[], 'y', '{}', null, null, 'manager', null,",
      "    true, null, now(), '{}', 'schedule.edit');",
      "  perform private.notify(b, '{}'::uuid[], 'z'::text, audience => 'manager',",
      "    holders_of => null);",
      "  perform private.notify(b, '{}'::uuid[], 'w', '{}', null, null, 'manager', 'w:1',",
      "    realert => false, push_until => null, at_time => now(), leave_out => '{}');",
      "end;",
      "$$;",
    ].join("\n");
    // A permission named, by name or as the thirteenth by position, isn't a
    // rule by rank; none, or a null one, still is, whatever named arguments
    // come after the seventh.
    expect(roleChecks(sql)).toEqual([
      {
        line: 8,
        check: "notify(…, audience 'manager')",
        where: "private.tell",
      },
      {
        line: 10,
        check: "notify(…, audience 'manager')",
        where: "private.tell",
      },
    ]);
  });

  it("are credited to the function they are in, whatever tag quotes its body", () => {
    const sql = [
      "create or replace function private.builds_schedule(b uuid)",
      "returns boolean language sql as $fn$ select true $fn$;",
      "create function private.new_gate(b uuid) returns boolean language sql as $$",
      "  select private.has_role(b, 'manager')",
      "$$;",
      "create function private.quoted(b uuid) returns boolean language sql as 'select true';",
      "select private.has_role(gen_random_uuid(), 'manager');",
    ].join("\n");
    expect(roleChecks(sql)).toEqual([
      { line: 4, check: "has_role(", where: "private.new_gate" },
      { line: 7, check: "has_role(", where: "top level" },
    ]);
  });

  it("count against a migration after the guard's own only, outside what may still hold one", () => {
    const rule = (name: string) =>
      [
        `create or replace function ${name}(b uuid)`,
        "returns boolean language sql as $$",
        "  select private.has_role(b, 'manager')",
        "$$;",
      ].join("\n");
    const migrations = [
      { name: "20261110000100_older.sql", sql: rule("private.new_gate") },
      {
        name: "20261115000700_roles_catalogue.sql",
        sql: rule("private.new_gate"),
      },
      {
        name: "20261116000100_clock.sql",
        sql: rule("private.can_edit_clock"),
      },
      {
        name: "20261116000200_newer.sql",
        sql: [
          rule("private.new_gate"),
          "update public.memberships m set active = true where m.role in ('owner', 'manager');",
        ].join("\n"),
      },
      // Scheduling moved in R3 and its entries are out: a rule by rank there
      // counts again.
      {
        name: "20261116000300_scheduling.sql",
        sql: rule("private.builds_schedule"),
      },
    ];
    expect(violations(migrations)).toEqual([
      "20261116000200_newer.sql:3 has_role( in private.new_gate",
      "20261116000200_newer.sql:5 role in ('owner', 'manager') in top level",
      "20261116000300_scheduling.sql:3 has_role( in private.builds_schedule",
    ]);
    // Once the clock's phase takes can_edit_clock out, its rule counts too.
    expect(violations(migrations, new Set(["private.new_gate"]))).toEqual([
      "20261116000100_clock.sql:3 has_role( in private.can_edit_clock",
      "20261116000200_newer.sql:5 role in ('owner', 'manager') in top level",
      "20261116000300_scheduling.sql:3 has_role( in private.builds_schedule",
    ]);
  });

  it("count again where scheduling held one, once R3 moved it", () => {
    // Each of the rules R3 moved, written by rank again in a later migration,
    // is a violation: nothing lists them any more.
    const later = [
      "private.builds_schedule",
      "public.decide_shift_swap",
      "private.notify_for_team",
      "private.renew_demo_schedule",
    ].map((name, i) => ({
      name: `2026111600040${i}_back.sql`,
      sql: [
        `create or replace function ${name}(b uuid)`,
        "returns boolean language sql as $$",
        "  select exists (select 1 from public.memberships m where m.role in ('owner', 'manager'))",
        "$$;",
      ].join("\n"),
    }));
    const policy = {
      name: "20261116000500_back.sql",
      sql: [
        `alter policy "the schedule's builders read its shifts" on public.schedule_shifts`,
        "  using (private.has_role(business_id, 'manager'));",
      ].join("\n"),
    };
    expect(violations([...later, policy])).toHaveLength(later.length + 1);
  });

  it("are written in no migration after the guard but where a rule stays by role or waits for its area", () => {
    const migrations = migrationFiles().map((name) => ({
      name,
      sql: readFileSync(join(MIGRATIONS, name), "utf8"),
    }));
    expect(violations(migrations)).toEqual([]);
  });

  it("are listed exactly where the newest functions and policies still hold one", () => {
    // An area's phase that moves a rule takes its entry out; a rule by rank
    // still in place is named, with its phase.
    const holding = [...newestChecks()]
      .filter(([, checks]) => checks.length > 0)
      .map(([name]) => name)
      .sort();
    const listed = [...Object.keys(FIXED), ...Object.keys(NOT_YET_MOVED)];
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual(holding);
  });

  it("count again where the management page held one, once R7 moved it", () => {
    // Who saves settings and who reads the log, written by rank again in a
    // later migration: nothing lists them any more.
    const gate = {
      name: "20261116000600_back.sql",
      sql: [
        "create or replace function private.can_edit_settings(business uuid, person uuid)",
        "returns boolean language sql as $$",
        "  select exists (select 1 from public.memberships m where m.role in ('owner', 'manager'))",
        "$$;",
      ].join("\n"),
    };
    const policies = {
      name: "20261116000700_back.sql",
      sql: [
        'alter policy "members read the log by area, pay holders the pay rows" on public.audit_log',
        "  using (private.has_role(business_id, 'manager'));",
        'alter policy "a view reads the log as its role would" on public.audit_log',
        "  using (private.is_viewing(business_id, 'manager'));",
      ].join("\n"),
    };
    expect(violations([gate, policies])).toEqual([
      "20261116000600_back.sql:3 role in ('owner', 'manager') in private.can_edit_settings",
      '20261116000700_back.sql:2 has_role( in policy "members read the log by area, pay holders the pay rows" on public.audit_log',
      "20261116000700_back.sql:4 is_viewing(…, 'manager') in policy \"a view reads the log as its role would\" on public.audit_log",
    ]);
  });
});
