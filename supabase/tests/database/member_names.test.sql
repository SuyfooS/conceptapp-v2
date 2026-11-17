-- Fixing a name on /team/[person] (20261117000700_member_names.sql; ROADMAP
-- "תיקון שם"): only the server fixes the name a business shows for someone,
-- by the rule of changing a role (team.edit and the rank rule), never one's
-- own, never in a demo closed to invites. The name is one line of 1 to 80
-- characters, its spaces collapsed, and their own name is read the same way;
-- their own name, or none, keeps no row;
-- a name the screen didn't show is refused (40001); the same name writes
-- nothing. The log keeps the person only, never a name, and tells nobody.
-- The name is the business's alone: their own name (profiles.full_name) never
-- changes, no other business sees it, and it is read as their profile is
-- read, in that business. A demo's reset takes its names with it, and the
-- console lists people by the business's name for them. Fixed ids and
-- numbers of its own (9a…, 050-000-92xx) and explicit times, so nothing here
-- meets the seeded people or the clock; its slugs (mnam-…) are its own too.
begin;
select plan(50);
set local timezone = 'UTC';

insert into auth.users (id, aud, role, phone)
values
  ('9a000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500009201'),
  ('9a000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500009202'),
  ('9a000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', '972500009203'),
  ('9a000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', '972500009204'),
  ('9a000000-0000-4000-a000-000000000005', 'authenticated', 'authenticated', '972500009205'),
  ('9a000000-0000-4000-a000-000000000006', 'authenticated', 'authenticated', '972500009206'),
  ('9a000000-0000-4000-a000-000000000007', 'authenticated', 'authenticated', '972500009207'),
  ('9a000000-0000-4000-a000-000000000008', 'authenticated', 'authenticated', '972500009208'),
  ('9a000000-0000-4000-a000-000000000009', 'authenticated', 'authenticated', '972500009209'),
  ('9a000000-0000-4000-a000-000000000010', 'authenticated', 'authenticated', '972500009210'),
  ('9a000000-0000-4000-a000-000000000011', 'authenticated', 'authenticated', '972500009211'),
  ('9a000000-0000-4000-a000-000000000012', 'authenticated', 'authenticated', '972500009212'),
  ('9a000000-0000-4000-a000-000000000013', 'authenticated', 'authenticated', '972500009213'),
  ('9a000000-0000-4000-a000-000000000014', 'authenticated', 'authenticated', '972500009214'),
  ('9a000000-0000-4000-a000-000000000015', 'authenticated', 'authenticated', '972500009215'),
  ('9a000000-0000-4000-a000-000000000016', 'authenticated', 'authenticated', '972500009216');

update public.profiles set full_name = 'Noa Cohen'
where id = '9a000000-0000-4000-a000-000000000004';
update public.profiles set full_name = 'Galit Books'
where id = '9a000000-0000-4000-a000-000000000006';

-- X: 1, 2 owners; 3 a manager; 4 (Noa Cohen) and 5 workers; 6 (Galit Books)
-- its accountant, and Y's too; 7 a worker given team.view and team.edit; 8 a
-- manager given pay; 9 a worker who left. Y: 10 its owner. D, a demo closed
-- to invites: 11 its owner, 12 a worker. O, a demo open to invites: 13 its
-- owner, 14 a worker, from its definition. 15 and 16 are on the ConceptApp
-- team, viewing X as a worker and as an accountant.
insert into public.businesses (id, slug, name)
values
  ('9a000000-0000-4000-b000-000000000001', 'mnam-x', 'Names X'),
  ('9a000000-0000-4000-b000-000000000002', 'mnam-y', 'Names Y'),
  ('9a000000-0000-4000-b000-000000000003', 'mnam-d', 'Names D');

insert into private.demo_businesses (business_id, definition)
values
  ('9a000000-0000-4000-b000-000000000003', '{"slug": "mnam-d"}'),
  ('9a000000-0000-4000-b000-000000000004', $json$
  {
    "slug": "mnam-o", "name": "Names O", "accent": "#7c3aed",
    "address": "Demo street 9", "shabbat_city": "haifa",
    "template": "retail", "renews": false, "invites": true,
    "people": [
      { "user_id": "9a000000-0000-4000-a000-000000000013", "role": "owner", "name": "Owner O" },
      { "user_id": "9a000000-0000-4000-a000-000000000014", "role": "worker", "name": "Worker W" }
    ]
  }
  $json$);

insert into public.memberships (business_id, user_id, role, perms, active)
values
  ('9a000000-0000-4000-b000-000000000001', '9a000000-0000-4000-a000-000000000001', 'owner', '{}', true),
  ('9a000000-0000-4000-b000-000000000001', '9a000000-0000-4000-a000-000000000002', 'owner', '{}', true),
  ('9a000000-0000-4000-b000-000000000001', '9a000000-0000-4000-a000-000000000003', 'manager', '{}', true),
  ('9a000000-0000-4000-b000-000000000001', '9a000000-0000-4000-a000-000000000004', 'worker', '{}', true),
  ('9a000000-0000-4000-b000-000000000001', '9a000000-0000-4000-a000-000000000005', 'worker', '{}', true),
  ('9a000000-0000-4000-b000-000000000001', '9a000000-0000-4000-a000-000000000006', 'accountant', '{}', true),
  ('9a000000-0000-4000-b000-000000000001', '9a000000-0000-4000-a000-000000000007', 'worker', '{team.view,team.edit}', true),
  ('9a000000-0000-4000-b000-000000000001', '9a000000-0000-4000-a000-000000000008', 'manager', '{clock.payroll}', true),
  ('9a000000-0000-4000-b000-000000000001', '9a000000-0000-4000-a000-000000000009', 'worker', '{}', false),
  ('9a000000-0000-4000-b000-000000000002', '9a000000-0000-4000-a000-000000000010', 'owner', '{}', true),
  ('9a000000-0000-4000-b000-000000000002', '9a000000-0000-4000-a000-000000000006', 'accountant', '{}', true),
  ('9a000000-0000-4000-b000-000000000003', '9a000000-0000-4000-a000-000000000011', 'owner', '{}', true),
  ('9a000000-0000-4000-b000-000000000003', '9a000000-0000-4000-a000-000000000012', 'worker', '{}', true);

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('9a000000-0000-4000-b000-000000000001', 'scheduling', true, '{"weekStartsOn": 0}'),
  ('9a000000-0000-4000-b000-000000000001', 'time_clock', true, '{}'),
  ('9a000000-0000-4000-b000-000000000001', 'notifications', true, '{}');

insert into public.platform_staff (user_id, role)
values
  ('9a000000-0000-4000-a000-000000000015', 'onboarder'),
  ('9a000000-0000-4000-a000-000000000016', 'onboarder');
insert into public.view_sessions (staff_id, business_id, role)
values
  ('9a000000-0000-4000-a000-000000000015', '9a000000-0000-4000-b000-000000000001', 'worker'),
  ('9a000000-0000-4000-a000-000000000016', '9a000000-0000-4000-b000-000000000001', 'accountant');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- Runs a statement and undoes it: 'ok', or the refusal's code and hint.
create function pg_temp.outcome(statement text) returns text language plpgsql as $$
declare
  code text;
  why text;
begin
  begin
    execute statement;
    raise exception 'tried' using errcode = 'P0001', hint = 'mn-tried';
  exception when others then
    get stacked diagnostics code = returned_sqlstate, why = pg_exception_hint;
    if why = 'mn-tried' then
      return 'ok';
    end if;
    return code || coalesce(':' || nullif(why, ''), '');
  end;
end;
$$;

-- `actor` fixes `person`'s name in X to `to`, having seen `seen`, undone.
create function pg_temp.fix(actor uuid, person uuid, to_name text, seen text)
returns text language sql as $$
  select pg_temp.outcome(format(
    'select public.set_member_name(%L, %L, %L, %L, %L, %L)',
    actor, '9a000000-0000-4000-b000-000000000001', person, to_name, seen,
    '2026-11-24 08:00+00'
  ))
$$;

-- What `who` reads of a business's names, signed in: 'person=name' each.
create function pg_temp.names_read(who uuid, business uuid) returns text[]
language plpgsql as $$
declare
  read_names text[];
begin
  perform pg_temp.sign_in(who);
  select coalesce(array_agg(n.user_id::text || '=' || n.name order by n.user_id), '{}')
  into read_names
  from public.member_names n
  where n.business_id = business;
  perform set_config('role', 'postgres', true);
  return read_names;
end;
$$;

------------------------------------------------------------------------------
-- Only the server

select ok(
  not has_function_privilege('authenticated', 'public.set_member_name(uuid, uuid, uuid, text, text, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.set_member_name(uuid, uuid, uuid, text, text, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.set_member_name(uuid, uuid, uuid, text, text, timestamptz)', 'execute'),
  'only the server fixes a name'
);
select ok(
  has_table_privilege('authenticated', 'public.member_names', 'select')
  and not has_table_privilege('authenticated', 'public.member_names', 'insert')
  and not has_table_privilege('authenticated', 'public.member_names', 'update')
  and not has_table_privilege('authenticated', 'public.member_names', 'delete')
  and not has_table_privilege('anon', 'public.member_names', 'select')
  and not has_table_privilege('service_role', 'public.member_names', 'insert')
  and not has_table_privilege('service_role', 'public.member_names', 'update')
  and not has_table_privilege('service_role', 'public.member_names', 'delete'),
  'signed-in people only read the names, and even the secret key writes them only through the function'
);
set local role service_role;
select throws_ok(
  $$insert into public.member_names (business_id, user_id, name)
    values ('9a000000-0000-4000-b000-000000000001', '9a000000-0000-4000-a000-000000000004', 'Sneaky')$$,
  '42501', null, 'the secret key writes no name past the function'
);
reset role;
select pg_temp.sign_in('9a000000-0000-4000-a000-000000000001');
select throws_ok(
  $$select public.set_member_name('9a000000-0000-4000-a000-000000000001',
    '9a000000-0000-4000-b000-000000000001', '9a000000-0000-4000-a000-000000000004', 'Noa Levi', 'Noa Cohen')$$,
  '42501', null, 'a signed-in owner cannot fix a name through the function'
);
reset role;

------------------------------------------------------------------------------
-- Fixing one

set local role service_role;
select is(
  public.set_member_name('9a000000-0000-4000-a000-000000000001',
    '9a000000-0000-4000-b000-000000000001', '9a000000-0000-4000-a000-000000000004',
    'Noa Levi', 'Noa Cohen', '2026-11-24 08:00+00'),
  '{"changed": true, "name": "Noa Levi"}'::jsonb,
  'an owner fixes a worker''s name, as the screen showed it'
);
reset role;
select results_eq(
  $$select user_id, name, updated_at from public.member_names
    where business_id = '9a000000-0000-4000-b000-000000000001'$$,
  $$values ('9a000000-0000-4000-a000-000000000004'::uuid, 'Noa Levi'::text,
    '2026-11-24 08:00+00'::timestamptz)$$,
  'the business keeps it, as of the moment it was fixed'
);
select is(
  (select full_name from public.profiles where id = '9a000000-0000-4000-a000-000000000004'),
  'Noa Cohen',
  'their own name stays theirs'
);
select results_eq(
  $$select actor_id, details from public.audit_log
    where business_id = '9a000000-0000-4000-b000-000000000001' and action = 'member.name'$$,
  $$values ('9a000000-0000-4000-a000-000000000001'::uuid,
    '{"person": "9a000000-0000-4000-a000-000000000004"}'::jsonb)$$,
  'the log keeps who fixed whose name, never a name'
);
select is(
  (select count(*)::int from public.notifications
    where business_id = '9a000000-0000-4000-b000-000000000001'),
  0,
  'and tells nobody, the person included'
);

set local role service_role;
select is(
  public.set_member_name('9a000000-0000-4000-a000-000000000001',
    '9a000000-0000-4000-b000-000000000001', '9a000000-0000-4000-a000-000000000004',
    ' Noa   Levi ', 'Noa Levi', '2026-11-24 08:05+00'),
  '{"changed": false, "name": "Noa Levi"}'::jsonb,
  'the same name, however spaced, changes nothing'
);
reset role;
select is(
  (select count(*)::int from public.audit_log
    where business_id = '9a000000-0000-4000-b000-000000000001' and action = 'member.name'),
  1,
  'and logs nothing'
);

set local role service_role;
select is(
  public.set_member_name('9a000000-0000-4000-a000-000000000001',
    '9a000000-0000-4000-b000-000000000001', '9a000000-0000-4000-a000-000000000004',
    E'  Noa \t Levi   Two  ', 'Noa Levi', '2026-11-24 08:10+00'),
  '{"changed": true, "name": "Noa Levi Two"}'::jsonb,
  'a name is kept on one line, its spaces collapsed'
);
reset role;
select is(
  (select name from public.member_names
    where business_id = '9a000000-0000-4000-b000-000000000001'
      and user_id = '9a000000-0000-4000-a000-000000000004'),
  'Noa Levi Two',
  'as it is shown'
);

set local role service_role;
select is(
  public.set_member_name('9a000000-0000-4000-a000-000000000001',
    '9a000000-0000-4000-b000-000000000001', '9a000000-0000-4000-a000-000000000004',
    'Noa Cohen', 'Noa Levi Two', '2026-11-24 08:15+00'),
  '{"changed": true, "name": "Noa Cohen"}'::jsonb,
  'their own name back is a change'
);
reset role;
select is(
  (select count(*)::int from public.member_names
    where business_id = '9a000000-0000-4000-b000-000000000001'),
  0,
  'and keeps no name of the business''s own'
);

set local role service_role;
select public.set_member_name('9a000000-0000-4000-a000-000000000001',
  '9a000000-0000-4000-b000-000000000001', '9a000000-0000-4000-a000-000000000004',
  'Noa L', 'Noa Cohen', '2026-11-24 08:20+00');
select is(
  public.set_member_name('9a000000-0000-4000-a000-000000000001',
    '9a000000-0000-4000-b000-000000000001', '9a000000-0000-4000-a000-000000000004',
    null, 'Noa L', '2026-11-24 08:25+00'),
  '{"changed": true, "name": "Noa Cohen"}'::jsonb,
  'none, the undo of a first fix, is their own name again'
);
reset role;
select is(
  (select count(*)::int from public.member_names
    where business_id = '9a000000-0000-4000-b000-000000000001'),
  0,
  'with no row left'
);

-- Their own name with odd spaces is read as the screens show it, collapsed,
-- so the name the screen showed for them is never a change meanwhile (40001
-- on every try). 5's own name is put back to none after.
update public.profiles set full_name = 'Pe  Ter'
where id = '9a000000-0000-4000-a000-000000000005';
set local role service_role;
select is(
  array[
    pg_temp.fix('9a000000-0000-4000-a000-000000000001', '9a000000-0000-4000-a000-000000000005',
      'Peter', 'Pe  Ter'),
    pg_temp.fix('9a000000-0000-4000-a000-000000000001', '9a000000-0000-4000-a000-000000000005',
      'Peter', 'Pe Ter')
  ],
  array['ok', 'ok'],
  'their own name with odd spaces is the name the screen showed, as typed or collapsed'
);
select is(
  public.set_member_name('9a000000-0000-4000-a000-000000000001',
    '9a000000-0000-4000-b000-000000000001', '9a000000-0000-4000-a000-000000000005',
    'Pe Ter', 'Pe  Ter', '2026-11-24 08:30+00'),
  '{"changed": false, "name": "Pe Ter"}'::jsonb,
  'and that name with its spaces collapsed is their own, which changes nothing'
);
reset role;
select is(
  (select count(*)::int from public.member_names
    where business_id = '9a000000-0000-4000-b000-000000000001'),
  0,
  'nor keeps a row'
);
update public.profiles set full_name = null
where id = '9a000000-0000-4000-a000-000000000005';

------------------------------------------------------------------------------
-- And never

set local role service_role;
select is(
  array[
    pg_temp.fix('9a000000-0000-4000-a000-000000000001', '9a000000-0000-4000-a000-000000000004',
      repeat('n', 81), 'Noa Cohen'),
    pg_temp.fix('9a000000-0000-4000-a000-000000000001', '9a000000-0000-4000-a000-000000000004',
      E'Noa\u0001Levi', 'Noa Cohen'),
    pg_temp.fix('9a000000-0000-4000-a000-000000000001', '9a000000-0000-4000-a000-000000000004',
      repeat('n', 80), 'Noa Cohen')
  ],
  array['22023:name', '22023:name', 'ok'],
  'a name is one line of 1 to 80 characters'
);
select is(
  pg_temp.fix('9a000000-0000-4000-a000-000000000001', '9a000000-0000-4000-a000-000000000004',
    'Noa Levi', 'Someone else'),
  '40001',
  'a name the screen didn''t show is refused'
);
select is(
  pg_temp.fix('9a000000-0000-4000-a000-000000000001', '9a000000-0000-4000-a000-000000000001',
    'Me', null),
  '22023',
  'nobody fixes their own name here'
);
select is(
  array[
    pg_temp.fix('9a000000-0000-4000-a000-000000000001', '9a000000-0000-4000-a000-000000000002', 'O', null),
    pg_temp.fix('9a000000-0000-4000-a000-000000000001', '9a000000-0000-4000-a000-000000000006', 'G', 'Galit Books'),
    pg_temp.fix('9a000000-0000-4000-a000-000000000003', '9a000000-0000-4000-a000-000000000005', 'W', null),
    pg_temp.fix('9a000000-0000-4000-a000-000000000003', '9a000000-0000-4000-a000-000000000008', 'M', null),
    pg_temp.fix('9a000000-0000-4000-a000-000000000003', '9a000000-0000-4000-a000-000000000002', 'O', null),
    pg_temp.fix('9a000000-0000-4000-a000-000000000003', '9a000000-0000-4000-a000-000000000006', 'G', 'Galit Books')
  ],
  array['ok', 'ok', 'ok', 'ok', '42501', '42501'],
  'an owner fixes another owner''s and the accountant''s name; a manager a worker''s and a manager''s, never an owner''s or the accountant''s'
);
select is(
  array[
    pg_temp.fix('9a000000-0000-4000-a000-000000000007', '9a000000-0000-4000-a000-000000000005', 'W', null),
    pg_temp.fix('9a000000-0000-4000-a000-000000000007', '9a000000-0000-4000-a000-000000000003', 'M', null),
    pg_temp.fix('9a000000-0000-4000-a000-000000000005', '9a000000-0000-4000-a000-000000000004', 'N', 'Noa Cohen'),
    pg_temp.fix('9a000000-0000-4000-a000-000000000006', '9a000000-0000-4000-a000-000000000005', 'W', null)
  ],
  array['ok', '42501', '42501', '42501'],
  'a worker who edits the team fixes a worker''s name and no higher; a worker or an accountant fixes none'
);
select is(
  array[
    pg_temp.fix('9a000000-0000-4000-a000-000000000001', '9a000000-0000-4000-a000-000000000009', 'Left', null),
    pg_temp.fix('9a000000-0000-4000-a000-000000000001', gen_random_uuid(), 'Nobody', null),
    pg_temp.fix('9a000000-0000-4000-a000-000000000010', '9a000000-0000-4000-a000-000000000004', 'N', 'Noa Cohen'),
    pg_temp.fix('9a000000-0000-4000-a000-000000000015', '9a000000-0000-4000-a000-000000000004', 'N', 'Noa Cohen')
  ],
  array['P0002', 'P0002', '42501', '42501'],
  'someone who left, or never joined, is not found; another business''s owner and the ConceptApp team fix nobody here'
);
select is(
  pg_temp.outcome($$select public.set_member_name('9a000000-0000-4000-a000-000000000011',
    '9a000000-0000-4000-b000-000000000003', '9a000000-0000-4000-a000-000000000012', 'Renamed')$$),
  '55000:demo',
  'a demo business closed to invites keeps its people as they are'
);
reset role;

------------------------------------------------------------------------------
-- The business's alone

set local role service_role;
select is(
  public.set_member_name('9a000000-0000-4000-a000-000000000001',
    '9a000000-0000-4000-b000-000000000001', '9a000000-0000-4000-a000-000000000006',
    'Galit X', 'Galit Books', '2026-11-24 09:00+00'),
  '{"changed": true, "name": "Galit X"}'::jsonb,
  'an owner fixes the name of an accountant who is also another business''s'
);
reset role;
select is(
  (select count(*)::int from public.member_names
    where business_id = '9a000000-0000-4000-b000-000000000002'),
  0,
  'the other business keeps no name for them'
);
select is(
  (select full_name from public.profiles where id = '9a000000-0000-4000-a000-000000000006'),
  'Galit Books',
  'and their own name, which it shows, stays as it was'
);
select is(
  pg_temp.names_read('9a000000-0000-4000-a000-000000000010', '9a000000-0000-4000-b000-000000000001'),
  '{}'::text[],
  'another business''s owner reads none of its names'
);
select is(
  pg_temp.names_read('9a000000-0000-4000-a000-000000000006', '9a000000-0000-4000-b000-000000000002'),
  '{}'::text[],
  'nor does the accountant read one in the other business'
);

------------------------------------------------------------------------------
-- Who reads it: as the person's profile is read, in that business

set local role service_role;
select public.set_member_name('9a000000-0000-4000-a000-000000000001',
  '9a000000-0000-4000-b000-000000000001', '9a000000-0000-4000-a000-000000000004',
  'Noa Levi', 'Noa Cohen', '2026-11-24 09:05+00');
reset role;

select is(
  pg_temp.names_read('9a000000-0000-4000-a000-000000000005', '9a000000-0000-4000-b000-000000000001'),
  array[
    '9a000000-0000-4000-a000-000000000004=Noa Levi',
    '9a000000-0000-4000-a000-000000000006=Galit X'
  ],
  'a colleague reads the business''s names'
);
select is(
  pg_temp.names_read('9a000000-0000-4000-a000-000000000004', '9a000000-0000-4000-b000-000000000001'),
  array[
    '9a000000-0000-4000-a000-000000000004=Noa Levi',
    '9a000000-0000-4000-a000-000000000006=Galit X'
  ],
  'the person reads the name the business gave them'
);
select is(
  pg_temp.names_read('9a000000-0000-4000-a000-000000000015', '9a000000-0000-4000-b000-000000000001'),
  array[
    '9a000000-0000-4000-a000-000000000004=Noa Levi',
    '9a000000-0000-4000-a000-000000000006=Galit X'
  ],
  'so does the ConceptApp team viewing the business'
);

set local role service_role;
select public.remove_member('9a000000-0000-4000-a000-000000000001',
  '9a000000-0000-4000-b000-000000000001', '9a000000-0000-4000-a000-000000000004',
  '2026-11-24 09:10+00');
reset role;

select is(
  pg_temp.names_read('9a000000-0000-4000-a000-000000000005', '9a000000-0000-4000-b000-000000000001'),
  array['9a000000-0000-4000-a000-000000000006=Galit X'],
  'once they are off the team, a colleague no longer reads their name'
);
select is(
  pg_temp.names_read('9a000000-0000-4000-a000-000000000015', '9a000000-0000-4000-b000-000000000001'),
  array['9a000000-0000-4000-a000-000000000006=Galit X'],
  'nor does a view as a worker'
);
select is(
  pg_temp.names_read('9a000000-0000-4000-a000-000000000004', '9a000000-0000-4000-b000-000000000001'),
  '{}'::text[],
  'nor do they, who read nothing of the business now'
);
select is(
  pg_temp.names_read('9a000000-0000-4000-a000-000000000008', '9a000000-0000-4000-b000-000000000001'),
  array[
    '9a000000-0000-4000-a000-000000000004=Noa Levi',
    '9a000000-0000-4000-a000-000000000006=Galit X'
  ],
  'whoever holds pay still reads it, for the hours they keep paying'
);
select is(
  pg_temp.names_read('9a000000-0000-4000-a000-000000000001', '9a000000-0000-4000-b000-000000000001'),
  array[
    '9a000000-0000-4000-a000-000000000004=Noa Levi',
    '9a000000-0000-4000-a000-000000000006=Galit X'
  ],
  'so does an owner'
);
select is(
  pg_temp.names_read('9a000000-0000-4000-a000-000000000016', '9a000000-0000-4000-b000-000000000001'),
  array[
    '9a000000-0000-4000-a000-000000000004=Noa Levi',
    '9a000000-0000-4000-a000-000000000006=Galit X'
  ],
  'and a view as an accountant'
);
select is(
  (select name from public.member_names
    where business_id = '9a000000-0000-4000-b000-000000000001'
      and user_id = '9a000000-0000-4000-a000-000000000004'),
  'Noa Levi',
  'taking someone off the team keeps the name the business gave them'
);
select is(
  array[
    (select count(*)::int from public.audit_log
      where business_id = '9a000000-0000-4000-b000-000000000001' and action = 'member.name'),
    (select count(*)::int from public.audit_log
      where business_id = '9a000000-0000-4000-b000-000000000001' and action = 'member.name'
        and details::text ~ 'Noa|Galit|Levi')
  ],
  array[7, 0],
  'every fix is logged, and no log row holds a name'
);

-- The log's line is read as the team's are (team.view).
create function pg_temp.lines_read(who uuid) returns int language plpgsql as $$
declare
  read_lines int;
begin
  perform pg_temp.sign_in(who);
  select count(*)::int into read_lines
  from public.audit_log l
  where l.business_id = '9a000000-0000-4000-b000-000000000001' and l.action = 'member.name';
  perform set_config('role', 'postgres', true);
  return read_lines;
end;
$$;
select is(
  array[
    pg_temp.lines_read('9a000000-0000-4000-a000-000000000003'),
    pg_temp.lines_read('9a000000-0000-4000-a000-000000000005')
  ],
  array[7, 0],
  'whoever sees the team reads the log''s lines, a worker none'
);

------------------------------------------------------------------------------
-- A demo's reset takes its names with it

set local role service_role;
select lives_ok(
  $$select public.reset_demo_business('9a000000-0000-4000-b000-000000000004')$$,
  'the reset makes the demo business open to invites'
);
select is(
  public.set_member_name('9a000000-0000-4000-a000-000000000013',
    '9a000000-0000-4000-b000-000000000004', '9a000000-0000-4000-a000-000000000014',
    'Worker Renamed', 'Worker W', '2026-11-24 09:15+00'),
  '{"changed": true, "name": "Worker Renamed"}'::jsonb,
  'its owner fixes a name there'
);
select lives_ok(
  $$select public.reset_demo_business('9a000000-0000-4000-b000-000000000004')$$,
  'and the reset still puts it back'
);
reset role;
select is(
  (select count(*)::int from public.member_names
    where business_id = '9a000000-0000-4000-b000-000000000004'),
  0,
  'with no name of its own left'
);
select is(
  (select full_name from public.profiles where id = '9a000000-0000-4000-a000-000000000014'),
  'Worker W',
  'and the person by the name its definition gives them'
);

------------------------------------------------------------------------------
-- The console

select pg_temp.sign_in('9a000000-0000-4000-a000-000000000015');
select is(
  (select array_agg(p ->> 'name' order by p ->> 'phone')
    from jsonb_array_elements(public.admin_business('mnam-x') -> 'people') p
    where p ->> 'phone' in ('+972500009205', '+972500009206')),
  array['', 'Galit X'],
  'the console lists people by the business''s name for them, as the business sees them'
);
reset role;

select * from finish();
rollback;
