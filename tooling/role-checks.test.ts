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
        name: "20261116000200_newer.sql",
        sql: [
          rule("private.new_gate"),
          "update public.memberships m set active = true where m.role in ('owner', 'manager');",
        ].join("\n"),
      },
      // Scheduling moved in R3, the clock in R4, lists in R5 and the team in
      // R6, and their entries are out: a rule by rank there counts again.
      {
        name: "20261116000300_scheduling.sql",
        sql: rule("private.builds_schedule"),
      },
      {
        name: "20261116000310_clock.sql",
        sql: rule("private.can_edit_clock"),
      },
      {
        name: "20261116000320_lists.sql",
        sql: rule("private.can_manage_lists"),
      },
      {
        name: "20261116000330_team.sql",
        sql: rule("public.team_phones"),
      },
    ];
    expect(violations(migrations)).toEqual([
      "20261116000200_newer.sql:3 has_role( in private.new_gate",
      "20261116000200_newer.sql:5 role in ('owner', 'manager') in top level",
      "20261116000300_scheduling.sql:3 has_role( in private.builds_schedule",
      "20261116000310_clock.sql:3 has_role( in private.can_edit_clock",
      "20261116000320_lists.sql:3 has_role( in private.can_manage_lists",
      "20261116000330_team.sql:3 has_role( in public.team_phones",
    ]);
    // What may still hold one doesn't count, the top level always does.
    expect(
      violations(
        migrations,
        new Set(["private.new_gate", "public.team_phones"]),
      ),
    ).toEqual([
      "20261116000200_newer.sql:5 role in ('owner', 'manager') in top level",
      "20261116000300_scheduling.sql:3 has_role( in private.builds_schedule",
      "20261116000310_clock.sql:3 has_role( in private.can_edit_clock",
      "20261116000320_lists.sql:3 has_role( in private.can_manage_lists",
    ]);
  });

  it("count only in the version that runs: one a later migration replaces, drops or rewrites is history", () => {
    const gate = (name: string, body: string) =>
      [
        `create or replace function ${name}(b uuid)`,
        "returns boolean language sql as $$",
        `  ${body}`,
        "$$;",
      ].join("\n");
    const byRank = "select private.has_role(b, 'manager')";
    const policy = (name: string) =>
      [
        `alter policy "${name}" on public.invites`,
        "  using (private.has_role(business_id, 'manager'));",
      ].join("\n");
    const migrations = [
      {
        name: "20261116000100_first.sql",
        sql: [
          gate("private.replaced", byRank),
          gate("private.dropped", byRank),
          gate("private.kept", byRank),
          policy("x"),
          policy("y"),
        ].join("\n"),
      },
      {
        name: "20261116000200_later.sql",
        sql: [
          gate(
            "private.replaced",
            "select private.holds_perm(b, null, 'team.view')",
          ),
          "drop function private.dropped(uuid);",
          `alter policy "x" on public.invites using (true);`,
          `alter policy "y" on public.invites rename to "z";`,
        ].join("\n"),
      },
    ];
    // Replaced, dropped and given a new `using`, three are history; the one
    // kept, and the policy only renamed (under its new name), still run.
    expect(violations(migrations)).toEqual([
      "20261116000100_first.sql:11 has_role( in private.kept",
      '20261116000100_first.sql:16 has_role( in policy "z" on public.invites',
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

  it("count only in the version that runs: one a later migration replaces or drops is history (R4)", () => {
    const gate = (name: string, body: string) =>
      [
        `create or replace function ${name}(b uuid)`,
        "returns boolean language sql as $$",
        `  select ${body}`,
        "$$;",
      ].join("\n");
    const byRank = "private.has_role(b, 'manager')";
    const migrations = [
      { name: "20261116000800_one.sql", sql: gate("private.gate", byRank) },
      { name: "20261116000900_two.sql", sql: gate("private.gate", "true") },
      { name: "20261116000800_drop.sql", sql: gate("private.gone", byRank) },
      {
        name: "20261116000900_dropped.sql",
        sql: "drop function private.gone(uuid);",
      },
      {
        name: "20261116000800_policy.sql",
        sql: `create policy "p" on public.things for select using (${byRank});`,
      },
      {
        name: "20261116000900_policy.sql",
        sql: `alter policy "p" on public.things using (true);\nselect ${byRank};`,
      },
    ];
    // Replaced, dropped or altered later: nothing counts but the top level.
    expect(violations(migrations)).toEqual([
      "20261116000900_policy.sql:2 has_role( in top level",
    ]);
    // Written again by rank, the newest version counts, and only it.
    expect(
      violations([
        ...migrations,
        { name: "20261116001000_three.sql", sql: gate("private.gate", byRank) },
      ]),
    ).toEqual([
      "20261116000900_policy.sql:2 has_role( in top level",
      "20261116001000_three.sql:3 has_role( in private.gate",
    ]);
  });

  it("follow their function or policy through a rename or a move, and stay where a later statement rewrites nothing of theirs (R4)", () => {
    const byRank = "private.has_role(b, 'manager')";
    const gate = (name: string, params: string, body: string) =>
      [
        `create or replace function ${name}(${params})`,
        "returns boolean language sql as $$",
        `  select ${body}`,
        "$$;",
      ].join("\n");
    const first = {
      name: "20261116001100_first.sql",
      sql: [
        `create policy "p" on public.things for select using (${byRank});`,
        `create policy "q" on public.things for all using (true) with check (${byRank});`,
        `create policy "r" on public.things for select using (${byRank});`,
        gate("private.gate", "b uuid", byRank),
        gate("private.pair", "b uuid, at_time timestamptz", byRank),
        gate("private.pair", "b uuid", byRank),
      ].join("\n"),
    };
    const later = {
      name: "20261116001200_later.sql",
      sql: [
        // Renamed: the same policy, its rule along.
        `alter policy "p" on public.things rename to "p2";`,
        // Its using rewritten: the rule in its with check still runs.
        `alter policy "q" on public.things using (false);`,
        // Its roles only.
        `alter policy "r" on public.things to authenticated;`,
        "alter function private.gate(uuid) rename to gate2;",
        // One of the two replaced, by its input types however written.
        gate(
          "private.pair",
          "business uuid, at_time timestamp with time zone default now()",
          "true",
        ),
      ].join("\n"),
    };
    expect(violations([first, later])).toEqual([
      '20261116001100_first.sql:1 has_role( in policy "p2" on public.things',
      '20261116001100_first.sql:2 has_role( in policy "q" on public.things',
      '20261116001100_first.sql:3 has_role( in policy "r" on public.things',
      "20261116001100_first.sql:6 has_role( in private.gate2",
      "20261116001100_first.sql:14 has_role( in private.pair",
    ]);
    // What lists a renamed one is its name now.
    expect(
      violations(
        [first, later],
        new Set(['policy "p" on public.things', "private.gate2"]),
      ),
    ).toEqual([
      '20261116001100_first.sql:1 has_role( in policy "p2" on public.things',
      '20261116001100_first.sql:2 has_role( in policy "q" on public.things',
      '20261116001100_first.sql:3 has_role( in policy "r" on public.things',
      "20261116001100_first.sql:14 has_role( in private.pair",
    ]);
    const third = {
      name: "20261116001300_third.sql",
      sql: [
        // Every one of the name, with no input types given.
        "drop function private.pair;",
        `drop policy "q" on public.things;`,
        "alter function private.gate2(uuid) set schema public;",
        `alter policy "p2" on public.things using (true);`,
      ].join("\n"),
    };
    expect(violations([first, later, third])).toEqual([
      '20261116001100_first.sql:3 has_role( in policy "r" on public.things',
      "20261116001100_first.sql:6 has_role( in public.gate2",
    ]);
  });

  it("know a policy by the name Postgres keeps, its first 63 bytes", () => {
    const long =
      "people read their own payroll details, pay holders the business's";
    const kept = long.slice(0, 63);
    const created = {
      name: "20261116001400_long.sql",
      sql: `create policy "${long}" on public.things for select using (private.has_role(business_id, 'manager'));`,
    };
    expect(violations([created])).toEqual([
      `20261116001400_long.sql:1 has_role( in policy "${kept}" on public.things`,
    ]);
    expect(
      violations([
        created,
        {
          name: "20261116001500_kept.sql",
          sql: `alter policy "${kept}" on public.things using (true);`,
        },
      ]),
    ).toEqual([]);
  });

  it("count again where the clock held one, once R4 moved it", () => {
    // Each of the clock's rules R4 moved, written by rank again in a later
    // migration, is a violation: nothing lists them any more. The notifier
    // kept its entry for the team's line until R6 moved that too.
    const later = [
      "private.can_edit_clock",
      "private.seed_demo_hours",
      "private.run_business_reminders",
    ].map((name, i) => ({
      name: `2026111600060${i}_back.sql`,
      sql: [
        `create or replace function ${name}(b uuid)`,
        "returns uuid[] language sql as $$",
        "  select private.members_in(b, '{owner,manager}'::public.member_role[])",
        "$$;",
      ].join("\n"),
    }));
    const policies = [
      `alter policy "people read their own entries, editors and pay holders all" on public.time_entries`,
      `alter policy "breaks are read like the entries they belong to" on public.time_breaks`,
      `alter policy "the clock's editors read the business's stations" on public.clock_stations`,
    ].map((statement, i) => ({
      name: `2026111600070${i}_back.sql`,
      sql: [
        statement,
        "  using (private.is_viewing(business_id, 'manager'));",
      ].join("\n"),
    }));
    expect(violations([...later, ...policies])).toHaveLength(
      later.length + policies.length,
    );
    expect(Object.keys(NOT_YET_MOVED)).not.toContain("private.notify_for");
  });

  it("count again where lists held one, once R5 moved it", () => {
    // Each of the lists' rules R5 moved, written by rank again in a later
    // migration, is a violation: nothing lists them any more.
    const later = [
      "private.can_manage_lists",
      "private.can_send_lists",
      "private.list_managers",
      "private.sees_list",
      "private.can_read_list_photo",
      "private.seed_demo_lists",
    ].map((name, i) => ({
      name: `2026111600080${i}_back.sql`,
      sql: [
        `create or replace function ${name}(b uuid)`,
        "returns boolean language sql as $$",
        "  select private.is_viewing(b, 'manager'::public.member_role)",
        "$$;",
      ].join("\n"),
    }));
    const policies = [
      `alter policy "members read their business's list templates" on public.list_templates`,
      `alter policy "list managers read the schedules" on public.list_schedules`,
      `alter policy "people read the lists they see" on public.lists`,
    ].map((statement, i) => ({
      name: `2026111600090${i}_back.sql`,
      sql: [
        statement,
        "  using (private.has_role(business_id, 'manager'));",
      ].join("\n"),
    }));
    expect(violations([...later, ...policies])).toHaveLength(
      later.length + policies.length,
    );
    expect(
      Object.keys(NOT_YET_MOVED).filter((name) => name.includes("list")),
    ).toEqual([]);
  });

  it("count again where the team held one, once R6 moved it", () => {
    // Each of the team's rules R6 moved, written by rank again in a later
    // migration, is a violation: nothing lists them any more, and the
    // notifier that tells of someone joining counts a line for managers by
    // rank again too.
    const later = ["public.team_phones", "public.team_youth"].map(
      (name, i) => ({
        name: `2026111600060${i}_back.sql`,
        sql: [
          `create or replace function ${name}(business uuid)`,
          "returns boolean language sql as $$",
          "  select private.has_role(business, 'manager') or private.is_viewing(business, 'manager')",
          "$$;",
        ].join("\n"),
      }),
    );
    const policy = {
      name: "20261116000700_back.sql",
      sql: [
        `alter policy "the team's viewers read its invites" on public.invites`,
        "  using (private.has_role(business_id, 'manager'));",
      ].join("\n"),
    };
    const joined = {
      name: "20261116000800_back.sql",
      sql: [
        "create or replace function private.notify_team_joined(b uuid)",
        "returns void language plpgsql as $$",
        "begin",
        "  perform private.notify(b, private.members_in(b, '{owner,manager}'::public.member_role[]),",
        "    'team.joined', '{}'::jsonb, null, null, 'manager', 'team.joined:x');",
        "end;",
        "$$;",
      ].join("\n"),
    };
    expect(violations([...later, policy, joined])).toEqual([
      "20261116000600_back.sql:3 has_role( in public.team_phones",
      "20261116000600_back.sql:3 is_viewing(…, 'manager') in public.team_phones",
      "20261116000601_back.sql:3 has_role( in public.team_youth",
      "20261116000601_back.sql:3 is_viewing(…, 'manager') in public.team_youth",
      '20261116000700_back.sql:2 has_role( in policy "the team\'s viewers read its invites" on public.invites',
      "20261116000800_back.sql:4 notify(…, audience 'manager') in private.notify_team_joined",
      "20261116000800_back.sql:4 members_in(…, '{owner,manager}') in private.notify_team_joined",
    ]);
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
