-- Inviting from a list, part 3 (20261128000300_people_import.sql): a pasted
-- list becomes many invites at once, all or none, each with no link yet.
-- Who may import (team.edit on the staff, giving by their own role; the
-- ConceptApp team as an owner), never in a demo closed to invites, staff
-- roles only and each written row held to the giver's rules (rank, a live
-- named role on its base, no pay and nothing held beyond them but for an
-- owner), every row checked first (a mobile, a name, each number once, 1 to
-- 300). Against the team: a member's number is left out, an owner's or an
-- accountant's invite kept, an invite with a link never touched, one with no
-- link the giver may not change left, and one they may updated keeping its
-- role unless the line names one; anything else is a new invite, pending,
-- of the import. One invite.import row, ids and counts only; nobody told.
-- From the console a number on another business's staff refuses it all.
-- The cap of 500 waiting. A full join through an imported invite. The undo:
-- only the import's invites still with no link, the rows kept, by rank, once.
-- Two connections at once are people-import.db.test.ts's. Fixed ids (d7…),
-- numbers of its own (050-000-77xx; the cap's 050-009-xxxx) and slugs
-- (pim-…), so nothing here meets the seed or another test.
begin;
select plan(59);

create temporary table ids (name text primary key, id uuid) on commit drop;

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('d7000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.b(n integer) returns uuid language sql as $$
  select ('d7000000-0000-4000-b000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.ph(n integer) returns text language sql as $$
  select '+9725000077' || lpad(n::text, 2, '0')
$$;
-- The business the wizard opens below.
create function pg_temp.a() returns uuid language sql as $$
  select b.id from public.businesses b where b.slug = 'pim-a'
$$;
create function pg_temp.id(label text) returns uuid language sql as $$
  select i.id from ids i where i.name = label
$$;
-- One person as the app sends them.
create function pg_temp.person(
  n integer,
  who text,
  as_role text default 'worker',
  from_line boolean default false,
  named uuid default null
) returns jsonb language sql as $$
  select jsonb_build_object('name', who, 'phone', pg_temp.ph(n), 'role', as_role,
      'role_from_line', from_line)
    || case when named is null then '{}'::jsonb
      else jsonb_build_object('named_role', named) end
$$;
-- What a call said: 'ok', or its SQLSTATE, then its hint and, after '@', its
-- detail (the rows' places) when it has them. A refusal writes nothing.
create function pg_temp.said_by(statement_text text) returns text language plpgsql as $$
declare
  why text;
  rows_at text;
begin
  execute statement_text;
  return 'ok';
exception when others then
  get stacked diagnostics why = pg_exception_hint, rows_at = pg_exception_detail;
  return sqlstate || coalesce(' ' || nullif(why, ''), '') || coalesce(' @' || nullif(rows_at, ''), '');
end;
$$;
create function pg_temp.team(actor integer, business uuid, people jsonb)
returns text language sql as $$
  select pg_temp.said_by(format('select public.team_import_people(%L::uuid, %L::uuid, %L::jsonb)',
    pg_temp.p(actor), business, people))
$$;
create function pg_temp.console(actor integer, business uuid, people jsonb)
returns text language sql as $$
  select pg_temp.said_by(format('select public.admin_import_people(%L::uuid, %L::uuid, %L::jsonb)',
    pg_temp.p(actor), business, people))
$$;
create function pg_temp.undo_team(actor integer, business uuid, batch uuid)
returns text language sql as $$
  select pg_temp.said_by(format('select public.team_import_undo(%L::uuid, %L::uuid, %L::uuid)',
    pg_temp.p(actor), business, batch))
$$;
create function pg_temp.undo_console(actor integer, business uuid, batch uuid)
returns text language sql as $$
  select pg_temp.said_by(format('select public.admin_import_undo(%L::uuid, %L::uuid, %L::uuid)',
    pg_temp.p(actor), business, batch))
$$;
create function pg_temp.count_in(business uuid) returns bigint language sql as $$
  select count(*) from public.invites i where i.business_id = business
$$;

-- 1 owner of A, 2 its manager, 3 a worker, 4 a worker raised to edit the
-- team, 5 on the ConceptApp team, 6 owner of B, 7 a worker of B, 8 B's
-- accountant, 9 a worker who left A, 10 A's accountant, 11 owner of C (a demo
-- closed to invites), 12 owner of D (a demo open to them), 13 joins A by an
-- imported invite, 14 claims one before its import is taken back, 15 owner
-- of F (the cap).
insert into auth.users (id, aud, role, phone)
select pg_temp.p(n), 'authenticated', 'authenticated', '9725000077' || lpad(n::text, 2, '0')
from generate_series(1, 15) as n;

insert into public.platform_staff (user_id, role) values (pg_temp.p(5), 'onboarder');

-- A, opened by the wizard with its staff list waiting for links: its owner
-- (who then joins), a second owner and an accountant, managers and workers.
select public.create_business(pg_temp.p(5), 'Import A', 'pim-a', null, '#0f766e', 'general',
  '[{"name": "Owner A", "phone": "+972500007701", "role": "owner"},
    {"name": "Second Owner", "phone": "+972500007725", "role": "owner"},
    {"name": "Books", "phone": "+972500007726", "role": "accountant"},
    {"name": "Same Name", "phone": "+972500007721", "role": "worker"},
    {"name": "Old Name", "phone": "+972500007722", "role": "worker"},
    {"name": "Wizard Manager", "phone": "+972500007723", "role": "manager"},
    {"name": "Promote Me", "phone": "+972500007724", "role": "manager"},
    {"name": "Pay Manager", "phone": "+972500007731", "role": "manager"},
    {"name": "Mgr Old", "phone": "+972500007732", "role": "manager"}]');

insert into public.businesses (id, slug, name)
values
  (pg_temp.b(2), 'pim-b', 'Import B'),
  (pg_temp.b(3), 'pim-c', 'Import C'),
  (pg_temp.b(4), 'pim-d', 'Import D'),
  (pg_temp.b(6), 'pim-f', 'Import F');
insert into private.demo_businesses (business_id, definition)
values
  (pg_temp.b(3), '{"slug": "pim-c"}'),
  (pg_temp.b(4), '{"slug": "pim-d", "invites": true}');

insert into public.memberships (business_id, user_id, role, perms, active, left_at)
values
  (pg_temp.a(), pg_temp.p(1), 'owner', '{}', true, null),
  (pg_temp.a(), pg_temp.p(2), 'manager', '{}', true, null),
  (pg_temp.a(), pg_temp.p(3), 'worker', '{}', true, null),
  (pg_temp.a(), pg_temp.p(4), 'worker', '{team.view,team.edit}', true, null),
  (pg_temp.a(), pg_temp.p(9), 'worker', '{}', false, now()),
  (pg_temp.a(), pg_temp.p(10), 'accountant', '{}', true, null),
  (pg_temp.b(2), pg_temp.p(6), 'owner', '{}', true, null),
  (pg_temp.b(2), pg_temp.p(7), 'worker', '{}', true, null),
  (pg_temp.b(2), pg_temp.p(8), 'accountant', '{}', true, null),
  (pg_temp.b(3), pg_temp.p(11), 'owner', '{}', true, null),
  (pg_temp.b(4), pg_temp.p(12), 'owner', '{}', true, null),
  (pg_temp.b(6), pg_temp.p(15), 'owner', '{}', true, null);

-- A's named roles: a shift lead, a bar lead holding the lists (which A's
-- managers don't), one to archive; and one of B's.
insert into ids values ('lead', public.create_business_role(pg_temp.p(1), pg_temp.a(), 'worker', 'Shift lead'));
insert into ids values ('bar', public.create_business_role(pg_temp.p(1), pg_temp.a(), 'worker', 'Bar lead'));
insert into ids values ('old', public.create_business_role(pg_temp.p(1), pg_temp.a(), 'worker', 'Old role'));
insert into ids values ('far', public.create_business_role(pg_temp.p(6), pg_temp.b(2), 'worker', 'Far lead'));
select public.set_role_permission(pg_temp.p(1), pg_temp.a(), 'worker', 'lists.manage', true, pg_temp.id('bar'));
select public.set_role_permission(pg_temp.p(1), pg_temp.a(), 'manager', 'lists.manage', false);

-- A's other invites: one sent and open, one sent and run out, one deleted,
-- one with no link to the role archived since (after its date, so the
-- archive went ahead), and one with no link to the bar lead.
insert into public.invites (
  business_id, phone, role, named_role, full_name, token_hash, invited_by,
  expires_at, claimed_at, cancelled_at, link_pending
)
values
  (pg_temp.a(), pg_temp.ph(27), 'worker', null, 'Linked',
   md5('pim 27') || md5('pim 27 b'), pg_temp.p(1), now() + interval '10 days', null, null, false),
  (pg_temp.a(), pg_temp.ph(28), 'worker', null, 'Lapsed',
   md5('pim 28') || md5('pim 28 b'), pg_temp.p(1), now() - interval '1 day', null, null, false),
  (pg_temp.a(), pg_temp.ph(29), 'worker', null, 'Cancelled',
   md5('pim 29') || md5('pim 29 b'), pg_temp.p(1), now() + interval '10 days', now(), now(), false),
  (pg_temp.a(), pg_temp.ph(30), 'worker', pg_temp.id('old'), 'Archived Role',
   md5('pim 30') || md5('pim 30 b'), pg_temp.p(1), now() - interval '1 day', null, null, true),
  (pg_temp.a(), pg_temp.ph(33), 'worker', pg_temp.id('bar'), 'Bar Person',
   md5('pim 33') || md5('pim 33 b'), pg_temp.p(1), now() + interval '10 days', null, null, true);
select public.archive_business_role(pg_temp.p(1), pg_temp.id('old'));

-- A's open invites as they were before any import.
create temporary table before on commit drop as
  select i.id, i.phone, i.full_name, i.role, i.named_role, i.invited_by,
    i.expires_at, i.token_hash, i.link_pending
  from public.invites i
  where i.business_id = pg_temp.a() and i.claimed_at is null;
create temporary table counted on commit drop as
  select pg_temp.count_in(pg_temp.a()) as n;

------------------------------------------------------------------------------
-- 1. The column, and who may call what

select has_column('public', 'invites', 'import_id', 'an invite says which import made it');
select ok(
  exists (
    select 1 from pg_indexes x
    where x.schemaname = 'public' and x.tablename = 'invites'
      and x.indexname = 'invites_import_idx'
  ),
  'and an import''s invites are found by it, for its undo'
);
select ok(
  not has_function_privilege('anon', 'public.team_import_people(uuid, uuid, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.team_import_people(uuid, uuid, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.admin_import_people(uuid, uuid, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.admin_import_people(uuid, uuid, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.team_import_undo(uuid, uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.team_import_undo(uuid, uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.admin_import_undo(uuid, uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.admin_import_undo(uuid, uuid, uuid)', 'execute'),
  'no browser role imports or takes an import back'
);
select ok(
  not has_function_privilege('anon',
    'private.import_invites(uuid, uuid, public.member_role, jsonb, boolean)', 'execute')
  and not has_function_privilege('authenticated',
    'private.import_invites(uuid, uuid, public.member_role, jsonb, boolean)', 'execute')
  and not has_function_privilege('service_role',
    'private.import_invites(uuid, uuid, public.member_role, jsonb, boolean)', 'execute')
  and not has_function_privilege('anon',
    'private.undo_import(uuid, uuid, public.member_role, uuid)', 'execute')
  and not has_function_privilege('authenticated',
    'private.undo_import(uuid, uuid, public.member_role, uuid)', 'execute')
  and not has_function_privilege('service_role',
    'private.undo_import(uuid, uuid, public.member_role, uuid)', 'execute'),
  'and nobody runs the two workers but the doors, not even the secret key: revoked from public too'
);
select ok(
  has_function_privilege('service_role', 'public.team_import_people(uuid, uuid, jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.admin_import_people(uuid, uuid, jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.team_import_undo(uuid, uuid, uuid)', 'execute')
  and has_function_privilege('service_role', 'public.admin_import_undo(uuid, uuid, uuid)', 'execute'),
  'the server does, with the secret key, for the signed-in person'
);

------------------------------------------------------------------------------
-- 2. Who may import

select is(
  pg_temp.team(3, pg_temp.a(), jsonb_build_array(pg_temp.person(40, 'Someone')))
    || ' | ' || pg_temp.team(6, pg_temp.a(), jsonb_build_array(pg_temp.person(40, 'Someone')))
    || ' | ' || pg_temp.team(5, pg_temp.a(), jsonb_build_array(pg_temp.person(40, 'Someone')))
    || ' | ' || pg_temp.team(10, pg_temp.a(), jsonb_build_array(pg_temp.person(40, 'Someone'))),
  '42501 | 42501 | 42501 | 42501',
  'the Team screen''s door refuses a worker who doesn''t edit the team, another business''s owner, the ConceptApp team and the accountant'
);
select is(
  pg_temp.console(1, pg_temp.a(), jsonb_build_array(pg_temp.person(40, 'Someone'))),
  '42501',
  'and the console''s door anyone not on the ConceptApp team, an owner too'
);

------------------------------------------------------------------------------
-- 3. Demo businesses

select is(
  pg_temp.team(11, pg_temp.b(3), jsonb_build_array(pg_temp.person(40, 'Someone')))
    || ' | ' || pg_temp.console(5, pg_temp.b(3), jsonb_build_array(pg_temp.person(40, 'Someone'))),
  '55000 | 55000',
  'a demo business closed to invites takes none from a list, from the team or the console'
);
select is(
  public.team_import_people(pg_temp.p(12), pg_temp.b(4),
    jsonb_build_array(pg_temp.person(41, 'Open Demo'))) -> 'rows' -> 0 ->> 'status',
  'created',
  'one its definition opens takes them, as the local seed''s demos'
);
select is_empty(
  $$select 1 from public.invites i where i.business_id = pg_temp.b(3)$$,
  'and the closed one has none'
);

------------------------------------------------------------------------------
-- 4. Staff roles only, each held to the giver's rules

select is(
  pg_temp.team(1, pg_temp.a(), jsonb_build_array(pg_temp.person(42, 'Owner Two', 'owner', true)))
    || ' | ' || pg_temp.console(5, pg_temp.a(), jsonb_build_array(
      pg_temp.person(42, 'Fine'), pg_temp.person(43, 'Books Two', 'accountant', true))),
  '22023 role @1 | 22023 role @2',
  'owners and accountants are invited one at a time, never from a list, whoever sends it'
);
select is(
  pg_temp.team(4, pg_temp.a(), jsonb_build_array(pg_temp.person(44, 'Editor New', 'manager', true))),
  '42501 @1',
  'a worker who edits the team invites no manager: the rank rule'
);
select is(
  pg_temp.team(2, pg_temp.a(), jsonb_build_array(
    pg_temp.person(45, 'Fine'), pg_temp.person(46, 'Bar New', 'worker', true, pg_temp.id('bar')))),
  '42501 held @2',
  'a manager invites to no role that holds what they don''t'
);

-- Managers see pay in A, as an owner may set it.
select public.set_role_permission(pg_temp.p(1), pg_temp.a(), 'manager', 'clock.payroll', true);

select is(
  pg_temp.team(2, pg_temp.a(), jsonb_build_array(pg_temp.person(47, 'Pay New', 'manager', true))),
  '42501 pay @1',
  'nor to one that sees pay, which only an owner gives'
);
select is(
  pg_temp.team(1, pg_temp.a(), jsonb_build_array(
    pg_temp.person(48, 'Old New', 'worker', true, pg_temp.id('old'))))
    || ' | ' || pg_temp.team(1, pg_temp.a(), jsonb_build_array(
      pg_temp.person(48, 'Base New', 'manager', true, pg_temp.id('lead'))))
    || ' | ' || pg_temp.team(1, pg_temp.a(), jsonb_build_array(
      pg_temp.person(48, 'Far New', 'worker', true, pg_temp.id('far')))),
  '22023 archived | 22023 base | P0002',
  'and an owner gives no role archived, none on another base and none of another business'
);

------------------------------------------------------------------------------
-- 5. Every row as the app sends it

select is(
  pg_temp.team(1, pg_temp.a(), jsonb_build_array(jsonb_build_object(
    'name', 'Landline', 'phone', '+97231234567', 'role', 'worker', 'role_from_line', false)))
    || ' | ' || pg_temp.team(1, pg_temp.a(), jsonb_build_array(jsonb_build_object(
      'name', 'Local', 'phone', '0501234567', 'role', 'worker', 'role_from_line', false)))
    || ' | ' || pg_temp.team(1, pg_temp.a(), jsonb_build_array(pg_temp.person(49, '')))
    || ' | ' || pg_temp.team(1, pg_temp.a(), jsonb_build_array(pg_temp.person(49, chr(8207))))
    || ' | ' || pg_temp.team(1, pg_temp.a(), jsonb_build_array(pg_temp.person(49, repeat('x', 81))))
    || ' | ' || pg_temp.team(1, pg_temp.a(), jsonb_build_array(
      pg_temp.person(49, 'Once'), pg_temp.person(49, 'Twice'))),
  '22023 phone @1 | 22023 phone @1 | 22023 name @1 | 22023 name @1 | 22023 name @1 | 22023 duplicate @2',
  'an Israeli mobile in E.164, a name as the app keeps names (1 to 80, what nobody sees dropped), each number once'
);
select is(
  pg_temp.team(1, pg_temp.a(), '[]')
    || ' | ' || pg_temp.team(1, pg_temp.a(), '{}')
    || ' | ' || pg_temp.team(1, pg_temp.a(), '[1]')
    || ' | ' || pg_temp.team(1, pg_temp.a(), jsonb_build_array(
      pg_temp.person(49, 'Aged') || '{"age": 30}'))
    || ' | ' || pg_temp.team(1, pg_temp.a(), jsonb_build_array(
      pg_temp.person(49, 'Unsure') || '{"role_from_line": "yes"}'))
    || ' | ' || pg_temp.team(1, pg_temp.a(), jsonb_build_array(
      pg_temp.person(49, 'Odd role') || '{"named_role": "lead"}'))
    || ' | ' || pg_temp.team(1, pg_temp.a(), jsonb_build_array(
      pg_temp.person(49, 'No role') - 'role')),
  '22023 | 22023 | 22023 @1 | 22023 @1 | 22023 | 22023 | 22023 role @1',
  'a list of objects, each a name, a number and a role, and nothing else: no ID number, no wage'
);
select is(
  pg_temp.team(1, pg_temp.a(), (
    select jsonb_agg(pg_temp.person(n % 90, 'Many')) from generate_series(1, 301) as n
  )),
  '54000 limit',
  'and at most 300 people at a time'
);
select is(
  pg_temp.count_in(pg_temp.a()),
  (select n from counted),
  'none of these refusals wrote anything'
);

------------------------------------------------------------------------------
-- 6. A manager pastes, while managers see pay

-- 31 and 23: the wizard's managers, whose role sees pay now; 33: the bar
-- lead's, which holds what the manager doesn't; 53 a new worker.
create temporary table managed on commit drop as
  select public.team_import_people(pg_temp.p(2), pg_temp.a(), jsonb_build_array(
    pg_temp.person(31, 'Pay Manager Renamed'),
    pg_temp.person(33, 'Bar Person Renamed'),
    pg_temp.person(23, 'Wizard Manager Two'),
    pg_temp.person(53, 'Manager New Worker')
  )) as answer;

select results_eq(
  $$select (r ->> 'i')::integer, r ->> 'status'
    from managed m, jsonb_array_elements(m.answer -> 'rows') r order by 1$$,
  $$values (1, 'invited'::text), (2, 'invited'), (3, 'invited'), (4, 'created')$$,
  'a manager leaves as they are the invites with no link they may not give: a role that sees pay, one that holds what they don''t'
);
select is_empty(
  $$select 1 from before b join public.invites i on i.id = b.id
    where b.phone in (pg_temp.ph(31), pg_temp.ph(33), pg_temp.ph(23))
      and (i.full_name, i.role, i.named_role, i.invited_by, i.expires_at, i.token_hash, i.link_pending)
        is distinct from
        (b.full_name, b.role, b.named_role, b.invited_by, b.expires_at, b.token_hash, b.link_pending)$$,
  'and each is unchanged'
);

select public.set_role_permission(pg_temp.p(1), pg_temp.a(), 'manager', 'clock.payroll', false);

-- What A's people were told so far, to compare with after the imports.
create temporary table told on commit drop as
  select count(*) as n from public.notifications x where x.business_id = pg_temp.a();

------------------------------------------------------------------------------
-- 7. The owner pastes A's list

create temporary table got on commit drop as
  select public.team_import_people(pg_temp.p(1), pg_temp.a(), jsonb_build_array(
    pg_temp.person(1, 'Owner A'),                        --  1 the owner's own line
    pg_temp.person(3, 'Worker Three'),                   --  2 a worker on the team
    pg_temp.person(10, 'Books Here'),                    --  3 the accountant on the team
    pg_temp.person(9, 'Former Worker'),                  --  4 left the team
    pg_temp.person(21, 'Same Name'),                     --  5 no link yet, as it is
    pg_temp.person(22, 'New Name'),                      --  6 no link yet, another name
    pg_temp.person(23, 'Wizard Manager'),                --  7 a manager, the list's role
    pg_temp.person(32, 'Mgr New'),                       --  8 a manager, another name
    pg_temp.person(24, 'Promote Me', 'worker', true),    --  9 the line names worker
    pg_temp.person(25, 'Second Owner'),                  -- 10 an owner's invite
    pg_temp.person(26, 'Books'),                         -- 11 an accountant's
    pg_temp.person(27, 'Linked'),                        -- 12 its link sent
    pg_temp.person(28, 'Lapsed'),                        -- 13 its link run out
    pg_temp.person(29, 'Cancelled Again'),               -- 14 deleted before
    pg_temp.person(30, 'Archived Role'),                 -- 15 its named role gone
    pg_temp.person(50, 'New Person'),                    -- 16 new
    pg_temp.person(51, 'New Manager', 'manager', true),  -- 17 new, a manager
    pg_temp.person(52, 'New Lead', 'worker', true, pg_temp.id('lead'))  -- 18 new, a named role
  )) as answer;

select results_eq(
  $$select (r ->> 'i')::integer, r ->> 'status'
    from got g, jsonb_array_elements(g.answer -> 'rows') r order by 1$$,
  $$values (1, 'member'::text), (2, 'member'), (3, 'member'), (4, 'created'),
    (5, 'same'), (6, 'updated'), (7, 'same'), (8, 'updated'), (9, 'updated'),
    (10, 'kept'), (11, 'kept'), (12, 'invited'), (13, 'expired'), (14, 'created'),
    (15, 'invited'), (16, 'created'), (17, 'created'), (18, 'created')$$,
  'each line against the team: members left out whatever the line says, an owner''s and an accountant''s invite kept, a link never touched, the list''s role only for new invites'
);
select ok(
  (select g.answer ->> 'import' is not null from got g)
  and (
    select array_agg(i.id order by i.id) from public.invites i
    where i.import_id = (select (g.answer ->> 'import')::uuid from got g)
  ) = (
    select array_agg((r ->> 'invite')::uuid order by (r ->> 'invite')::uuid)
    from got g, jsonb_array_elements(g.answer -> 'rows') r
    where r ->> 'status' = 'created'
  ),
  'the answer names the import, which every new invite carries and no other does'
);
select ok(
  (select array_agg(k order by k) from got g, jsonb_object_keys(g.answer) k) = '{import,rows}'
  and (
    select bool_and(
      (select array_agg(k order by k) from jsonb_object_keys(r) k) = '{i,invite,status}'
    )
    from got g, jsonb_array_elements(g.answer -> 'rows') r
  ),
  'and holds per row its place, status and invite: no token and no link, as none exists'
);
select results_eq(
  $$select i.phone, i.full_name, i.role::text, i.named_role is not distinct from pg_temp.id('lead'),
      i.link_pending, i.invited_by = pg_temp.p(1), i.expires_at > now() + interval '13 days'
    from public.invites i
    where i.import_id = (select (g.answer ->> 'import')::uuid from got g)
    order by i.phone$$,
  $$values
    (pg_temp.ph(9), 'Former Worker'::text, 'worker'::text, false, true, true, true),
    (pg_temp.ph(29), 'Cancelled Again', 'worker', false, true, true, true),
    (pg_temp.ph(50), 'New Person', 'worker', false, true, true, true),
    (pg_temp.ph(51), 'New Manager', 'manager', false, true, true, true),
    (pg_temp.ph(52), 'New Lead', 'worker', true, true, true, true)$$,
  'a new invite has the line''s name and role (the list''s, else its own), no link yet, from the owner, for 14 days'
);
select ok(
  (
    select bool_and(i.token_hash ~ '^[0-9a-f]{64}$') and count(distinct i.token_hash) = count(*)
    from public.invites i
    where i.import_id = (select (g.answer ->> 'import')::uuid from got g)
  )
  and public.invite_by_token(encode(sha256(convert_to('', 'UTF8')), 'hex')) is null
  and not exists (
    select 1 from public.invites i join before b on b.token_hash = i.token_hash
    where i.import_id is not null
  ),
  'each a hash of no token anyone holds, as the wizard saves them: no link leads to it'
);
select results_eq(
  $$select i.phone, i.full_name, i.role::text, i.link_pending, i.token_hash = b.token_hash,
      i.invited_by = pg_temp.p(1), i.import_id is null
    from public.invites i join before b on b.id = i.id
    where b.phone in (pg_temp.ph(22), pg_temp.ph(24), pg_temp.ph(32))
    order by i.phone$$,
  $$values
    (pg_temp.ph(22), 'New Name'::text, 'worker'::text, true, true, true, true),
    (pg_temp.ph(24), 'Promote Me', 'worker', true, true, true, true),
    (pg_temp.ph(32), 'Mgr New', 'manager', true, true, true, true)$$,
  'an invite with no link yet is updated in place: a new name, the role only where the line named one, still no link, the same hash, made by no import'
);
select is_empty(
  $$select 1 from before b join public.invites i on i.id = b.id
    where b.phone in (pg_temp.ph(21), pg_temp.ph(23), pg_temp.ph(25), pg_temp.ph(26),
      pg_temp.ph(27), pg_temp.ph(28), pg_temp.ph(30))
      and (i.full_name, i.role, i.named_role, i.invited_by, i.expires_at, i.token_hash,
        i.link_pending, i.claimed_at, i.import_id)
        is distinct from
        (b.full_name, b.role, b.named_role, b.invited_by, b.expires_at, b.token_hash,
        b.link_pending, null::timestamptz, null::uuid)$$,
  'and everything left out is as it was: the owner''s and the accountant''s invites, a link sent or run out, a role gone'
);
select results_eq(
  $$select a.actor_id, a.details ->> 'import' = (select g.answer ->> 'import' from got g),
      a.details - 'import'
    from public.audit_log a
    where a.business_id = pg_temp.a() and a.action = 'invite.import'
      and a.actor_id = pg_temp.p(1)$$,
  $$values (pg_temp.p(1), true,
    '{"created": 5, "updated": 3, "same": 2, "member": 3, "invited": 2, "expired": 1,
      "kept": 2, "roles": {"worker": 6, "manager": 2}, "by": "team"}'::jsonb)$$,
  'one invite.import row: the import''s id, its counts and roles, the Team screen''s'
);
select ok(
  not exists (
    select 1
    from public.audit_log a
    join public.invites i on i.business_id = a.business_id
    where a.business_id = pg_temp.a() and a.action = 'invite.import'
      and (position(right(i.phone, 9) in a.details::text) > 0
        or position(i.full_name in a.details::text) > 0)
  )
  and not exists (
    select 1 from public.audit_log a
    where a.business_id = pg_temp.a() and a.action = 'invite.import'
      and a.details ?| array['phone', 'phones', 'name', 'names', 'people']
  ),
  'which names nobody: no number and no name of anyone on the list'
);
select ok(
  (
    select g.answer -> 'import' = 'null'::jsonb
      and (
        select bool_and(r ->> 'status' not in ('created', 'updated'))
        from jsonb_array_elements(g.answer -> 'rows') r
      )
    from (
      select public.team_import_people(pg_temp.p(1), pg_temp.a(), jsonb_build_array(
        pg_temp.person(1, 'Owner A'), pg_temp.person(9, 'Former Worker'),
        pg_temp.person(22, 'New Name'), pg_temp.person(23, 'Wizard Manager'),
        pg_temp.person(24, 'Promote Me', 'worker', true), pg_temp.person(29, 'Cancelled Again'),
        pg_temp.person(32, 'Mgr New'), pg_temp.person(50, 'New Person'),
        pg_temp.person(51, 'New Manager', 'manager', true),
        pg_temp.person(52, 'New Lead', 'worker', true, pg_temp.id('lead'))
      )) as answer
    ) g
  ),
  'the same list again makes and updates nothing, and has no import to take back'
);
select is(
  (select count(*) from public.audit_log a
    where a.business_id = pg_temp.a() and a.action = 'invite.import'
      and a.actor_id = pg_temp.p(1)),
  1::bigint,
  'and writes no row to the log'
);

------------------------------------------------------------------------------
-- 8. The console pastes, giving as an owner

create temporary table consoled on commit drop as
  select public.admin_import_people(pg_temp.p(5), pg_temp.a(), jsonb_build_array(
    pg_temp.person(25, 'Second Owner As Worker'),
    pg_temp.person(26, 'Books As Worker'),
    pg_temp.person(1, 'Owner A'),
    pg_temp.person(54, 'Console New')
  )) as answer;

select results_eq(
  $$select (r ->> 'i')::integer, r ->> 'status'
    from consoled c, jsonb_array_elements(c.answer -> 'rows') r order by 1$$,
  $$values (1, 'kept'::text), (2, 'kept'), (3, 'member'), (4, 'created')$$,
  'the console never makes the wizard''s owner or accountant a worker, though it gives as an owner'
);
select is_empty(
  $$select 1 from before b join public.invites i on i.id = b.id
    where b.phone in (pg_temp.ph(25), pg_temp.ph(26))
      and (i.full_name, i.role, i.invited_by, i.expires_at, i.token_hash, i.link_pending)
        is distinct from
        (b.full_name, b.role, b.invited_by, b.expires_at, b.token_hash, b.link_pending)$$,
  'and their invites are as they were'
);
select results_eq(
  $$select a.actor_id, a.details ->> 'by', (a.details ->> 'created')::integer,
      (a.details ->> 'kept')::integer
    from public.audit_log a
    where a.business_id = pg_temp.a() and a.action = 'invite.import'
      and a.details ->> 'import' = (select c.answer ->> 'import' from consoled c)$$,
  $$values (pg_temp.p(5), 'console'::text, 1, 2)$$,
  'its row says the console wrote it'
);
-- 55 new; 7 a worker of B; 8 B's accountant, who may keep any business's
-- books; 6 B's owner.
select is(
  pg_temp.console(5, pg_temp.a(), jsonb_build_array(
    pg_temp.person(55, 'Fresh'), pg_temp.person(7, 'Works At B'),
    pg_temp.person(8, 'Books At B'), pg_temp.person(6, 'Owner Of B'))),
  '23505 elsewhere @2,4',
  'from the console, numbers on another business''s staff refuse the whole list, by their rows, never as an accountant'
);
select is_empty(
  $$select 1 from public.invites i
    where i.business_id = pg_temp.a() and i.phone in (pg_temp.ph(55), pg_temp.ph(8))$$,
  'and nothing of it is written'
);
select is(
  public.team_import_people(pg_temp.p(1), pg_temp.a(),
    jsonb_build_array(pg_temp.person(7, 'Works At B'))) -> 'rows' -> 0 ->> 'status',
  'created',
  'the Team screen''s door never asks where else a number works (#80)'
);
select is(
  (select count(*) from public.notifications x where x.business_id = pg_temp.a()),
  (select n from told),
  'and no import tells anyone anything'
);

------------------------------------------------------------------------------
-- 9. A full join, through an imported invite

create temporary table joiner on commit drop as
  select (public.team_import_people(pg_temp.p(1), pg_temp.a(),
    jsonb_build_array(pg_temp.person(13, 'Joiner'))) -> 'rows' -> 0 ->> 'invite')::uuid as invite;

select is(
  public.team_invite_link(pg_temp.p(1), (select j.invite from joiner j),
    md5('pim join') || md5('pim join b')),
  pg_temp.ph(13),
  'the owner makes an imported invite its link, as from "עוד לא קיבלו קישור"'
);
select is(
  (select i.link_pending from public.invites i where i.id = (select j.invite from joiner j)),
  false,
  'which it has now'
);
select ok(
  public.claim_invite(md5('pim join') || md5('pim join b'), pg_temp.p(13)) = pg_temp.a()
  and exists (
    select 1 from public.memberships m
    where m.business_id = pg_temp.a() and m.user_id = pg_temp.p(13)
      and m.active and m.role = 'worker'
  ),
  'and the person joins by it'
);

------------------------------------------------------------------------------
-- 10. Taking an import back

create temporary table taken on commit drop as
  select public.team_import_people(pg_temp.p(1), pg_temp.a(), jsonb_build_array(
    pg_temp.person(60, 'Undo One'),
    pg_temp.person(61, 'Undo Linked'),
    pg_temp.person(14, 'Undo Claimed'),
    pg_temp.person(62, 'Undo Manager', 'manager', true)
  )) as answer;
create function pg_temp.batch() returns uuid language sql as $$
  select (t.answer ->> 'import')::uuid from taken t
$$;
create function pg_temp.taken_invite(n integer) returns uuid language sql as $$
  select i.id from public.invites i
  where i.business_id = pg_temp.a() and i.import_id = pg_temp.batch() and i.phone = pg_temp.ph(n)
$$;

-- 61 got its link meanwhile; 14 got one and joined.
select public.team_invite_link(pg_temp.p(1), pg_temp.taken_invite(61), md5('pim 61') || md5('pim 61 b'));
select public.team_invite_link(pg_temp.p(1), pg_temp.taken_invite(14), md5('pim 14') || md5('pim 14 b'));
select public.claim_invite(md5('pim 14') || md5('pim 14 b'), pg_temp.p(14));

select is(
  pg_temp.undo_team(4, pg_temp.a(), pg_temp.batch()),
  '42501',
  'a worker who edits the team can''t take back a list with a manager''s invite in it: the rank rule, as deleting one'
);
select is(
  (select count(*) from public.invites i
    where i.import_id = pg_temp.batch() and i.cancelled_at is not null),
  0::bigint,
  'and nothing of it is deleted'
);
select is(
  public.team_import_undo(pg_temp.p(6), pg_temp.b(2), pg_temp.batch()),
  '{"cancelled": 0, "kept": 0}'::jsonb,
  'another business''s import id deletes nothing in one''s own'
);
select is(
  pg_temp.undo_team(6, pg_temp.a(), pg_temp.batch()),
  '42501',
  'and nobody takes back an import of a business whose team they don''t edit'
);
select is(
  public.team_import_undo(pg_temp.p(1), pg_temp.a(), pg_temp.batch()),
  '{"cancelled": 2, "kept": 2}'::jsonb,
  'the owner takes it back: the invites still with no link go, one that got a link and one claimed stay'
);
select results_eq(
  $$select i.phone, i.claimed_at is not null, i.cancelled_at is not null, i.claimed_by is null,
      i.link_pending
    from public.invites i where i.import_id = pg_temp.batch() order by i.phone$$,
  $$values
    (pg_temp.ph(14), true, false, false, false),
    (pg_temp.ph(60), true, true, true, true),
    (pg_temp.ph(61), false, false, true, false),
    (pg_temp.ph(62), true, true, true, true)$$,
  'each deleted as one invite is, the rows kept for the log; the linked one still open, the claimed one claimed'
);
select results_eq(
  $$select a.actor_id, a.details from public.audit_log a
    where a.business_id = pg_temp.a() and a.action = 'invite.import_undo'$$,
  $$values (pg_temp.p(1), jsonb_build_object('import', pg_temp.batch(), 'cancelled', 2, 'kept', 2))$$,
  'one invite.import_undo row: the import and its counts, nobody named'
);
select is(
  public.team_import_undo(pg_temp.p(1), pg_temp.a(), pg_temp.batch()),
  '{"cancelled": 0, "kept": 2}'::jsonb,
  'taken back again, it deletes nothing more'
);
select is(
  (select count(*) from public.audit_log a
    where a.business_id = pg_temp.a() and a.action = 'invite.import_undo'),
  1::bigint,
  'and writes no second row'
);
select is(
  pg_temp.undo_console(1, pg_temp.a(), pg_temp.batch()),
  '42501',
  'the console''s undo is the ConceptApp team''s alone'
);
select is(
  public.admin_import_undo(pg_temp.p(5), pg_temp.a(), (
    public.admin_import_people(pg_temp.p(5), pg_temp.a(),
      jsonb_build_array(pg_temp.person(63, 'Console Undo'))) ->> 'import')::uuid),
  '{"cancelled": 1, "kept": 0}'::jsonb,
  'which takes back its own import'
);
select is(
  public.team_import_undo(pg_temp.p(1), pg_temp.a(), (select (g.answer ->> 'import')::uuid from got g)),
  '{"cancelled": 5, "kept": 0}'::jsonb,
  'the owner''s first list taken back deletes the five it made'
);
select is_empty(
  $$select 1 from public.invites i
    where i.business_id = pg_temp.a() and i.phone in (pg_temp.ph(22), pg_temp.ph(24), pg_temp.ph(32))
      and (i.claimed_at is not null or not i.link_pending)$$,
  'and never the invites it only updated, which no import made'
);
select is(
  (select count(*) from public.notifications x
    where x.business_id = pg_temp.a() and x.kind <> 'team.joined'),
  (select n from told),
  'nobody is told of an undo either; only the two who joined are announced, as ever'
);

------------------------------------------------------------------------------
-- 11. At most 500 waiting

-- F: 499 invites with no link yet; one sent and run out and one deleted,
-- which don't wait.
insert into public.invites (business_id, phone, role, full_name, token_hash, invited_by, link_pending)
select pg_temp.b(6), '+97250009' || lpad(n::text, 4, '0'), 'worker', 'Waiting ' || n,
  md5('pim cap ' || n) || md5('pim cap b ' || n), pg_temp.p(15), true
from generate_series(1, 499) as n;
insert into public.invites (
  business_id, phone, role, full_name, token_hash, invited_by, expires_at, claimed_at, cancelled_at
)
values
  (pg_temp.b(6), '+972500095000', 'worker', 'Ran Out', md5('pim cap x') || md5('pim cap y'),
   pg_temp.p(15), now() - interval '1 day', null, null),
  (pg_temp.b(6), '+972500095001', 'worker', 'Deleted', md5('pim cap z') || md5('pim cap w'),
   pg_temp.p(15), now() + interval '1 day', now(), now());

select is(
  pg_temp.team(15, pg_temp.b(6), jsonb_build_array(
    pg_temp.person(70, 'Cap One'), pg_temp.person(71, 'Cap Two'))),
  '54000 open @499',
  'a list that would leave more than 500 invites waiting is refused, saying how many wait'
);
select is(
  pg_temp.count_in(pg_temp.b(6)),
  501::bigint,
  'and writes nothing'
);
select is(
  public.team_import_people(pg_temp.p(15), pg_temp.b(6),
    jsonb_build_array(pg_temp.person(70, 'Cap One'))) -> 'rows' -> 0 ->> 'status',
  'created',
  'the five hundredth is taken'
);

select * from finish();
rollback;
