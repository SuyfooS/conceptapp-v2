-- Roles and permissions by module, R11c (20261115001800_named_roles_view.sql):
-- viewing the app as a role a business named. The team opens a view as one,
-- on its base, and reads exactly what the role holds, as someone in it
-- does: the drafts for a shift lead who builds the schedule, the team's
-- hours for one who edits the clock, the log and the invites for one who
-- reads the management page and the team, and less than managers for a
-- floor lead on managers who doesn't build; never pay, and never a write.
-- Its rank is its base's. An archived role, one of another business and one
-- on another base are refused, by the function and by the table. The shift
-- lead's view and the refusals start as the app starts them, as the service
-- role. A view as a built-in role is as it was. Each write is its own
-- statement and what it wrote is read in the next. Fixed ids (a3…) and
-- numbers (050-083-xxxx), so nothing here meets the seed or another test.
begin;
select plan(14);

-- 1 owner, 2 manager, 3 worker of A; 4 a worker of A in its shift lead; 5 a
-- manager of A in its floor lead; 7 owner of B; 10 on the ConceptApp team,
-- who views A.
insert into auth.users (id, aud, role, phone)
select
  ('a3000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250083' || lpad(n::text, 4, '0')
from unnest('{1,2,3,4,5,7,10}'::int[]) as n;

insert into public.businesses (id, slug, name)
values
  ('a3000000-0000-4000-b000-000000000001', 'rnv-one', 'Roles Viewed'),
  ('a3000000-0000-4000-b000-000000000002', 'rnv-two', 'Roles Viewed Elsewhere');

insert into public.memberships (business_id, user_id, role, perms)
values
  ('a3000000-0000-4000-b000-000000000001', 'a3000000-0000-4000-a000-000000000001', 'owner', '{}'),
  ('a3000000-0000-4000-b000-000000000001', 'a3000000-0000-4000-a000-000000000002', 'manager', '{}'),
  ('a3000000-0000-4000-b000-000000000001', 'a3000000-0000-4000-a000-000000000003', 'worker', '{}'),
  ('a3000000-0000-4000-b000-000000000001', 'a3000000-0000-4000-a000-000000000004', 'worker', '{}'),
  ('a3000000-0000-4000-b000-000000000001', 'a3000000-0000-4000-a000-000000000005', 'manager', '{}'),
  ('a3000000-0000-4000-b000-000000000002', 'a3000000-0000-4000-a000-000000000007', 'owner', '{}');

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('a3000000-0000-4000-b000-000000000001', 'scheduling', true, '{"weekStartsOn": 0}'),
  ('a3000000-0000-4000-b000-000000000001', 'time_clock', true, '{}');

insert into public.platform_staff (user_id, role)
values ('a3000000-0000-4000-a000-000000000010', 'onboarder');

create temporary table ids (name text primary key, id uuid) on commit drop;
grant select on ids to authenticated;
grant select, insert on ids to service_role;
-- What each view and member held and read, by its label.
create temporary table got (label text primary key, perms text[], seen text) on commit drop;
grant all on got to authenticated, service_role;

create function pg_temp.id(label text) returns uuid language sql as $$
  select i.id from ids i where i.name = label
$$;

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('a3000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;

-- Business A.
create function pg_temp.a() returns uuid language sql as $$
  select 'a3000000-0000-4000-b000-000000000001'::uuid
$$;

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- What a call is refused with: its code and hint, and its detail; none when
-- it goes through (and its writes stay).
create function pg_temp.refusal(call text) returns text language plpgsql as $$
declare
  got_code text;
  got_hint text;
  got_detail text;
begin
  execute call;
  return 'none';
exception when others then
  get stacked diagnostics
    got_code = returned_sqlstate, got_hint = pg_exception_hint, got_detail = pg_exception_detail;
  return concat_ws(' ', got_code, nullif(got_hint, ''), nullif(got_detail, ''));
end;
$$;

-- What a call does: 'lives', or the code it is refused with. Undone either way.
create function pg_temp.attempt(call text) returns text language plpgsql as $$
declare
  outcome text;
begin
  begin
    execute call;
    outcome := 'lives';
    raise exception 'tried' using errcode = 'P0001', hint = 'rnv-tried';
  exception when others then
    if outcome is null then
      outcome := sqlstate;
    end if;
  end;
  return outcome;
end;
$$;

-- The team member's view of A, as `r`, or as the named role labelled
-- `named` on it: today's call when there is none.
create function pg_temp.view_as(r text, named text default null) returns uuid language sql as $$
  select case
    when named is null then public.start_view_session(pg_temp.p(10), pg_temp.a(), r::public.member_role)
    else public.start_view_session(pg_temp.p(10), pg_temp.a(), r::public.member_role, pg_temp.id(named))
  end
$$;

-- What the signed-in person reads of A: the draft week's shifts, the team's
-- hours, the log's rows about roles and the invites; whether they view it
-- at a manager's rank, and as one who reads pay; and whether what the
-- policies ask (private.viewed_perms, private.businesses_holding) is what
-- the screens hold (public.my_permissions).
create function pg_temp.seen() returns text language sql as $$
  select concat_ws(' ',
    'drafts:' || (select count(*) from public.schedule_shifts s where s.week_id = pg_temp.id('draft')),
    'hours:' || (select count(*) from public.time_entries e where e.business_id = pg_temp.a()),
    'log:' || (select count(*) from public.audit_log l
               where l.business_id = pg_temp.a() and l.action like 'role.%'),
    'invites:' || (select count(*) from public.invites i where i.business_id = pg_temp.a()),
    'rank:' || private.is_viewing(pg_temp.a(), 'manager')::text,
    'pay:' || private.viewing_payroll(pg_temp.a())::text,
    'same:' || (
      (select coalesce(array_agg(h.perm order by h.perm), '{}'::text[])
       from private.viewed_perms() h
       where h.business_id = pg_temp.a()) = public.my_permissions(pg_temp.a())
      and (pg_temp.a() in (select private.businesses_holding('schedule.edit')))
        = ('schedule.edit' = any (public.my_permissions(pg_temp.a())))
      and (pg_temp.a() in (select private.businesses_holding('clock.edit')))
        = ('clock.edit' = any (public.my_permissions(pg_temp.a())))
      and (pg_temp.a() in (select private.businesses_holding('team.view')))
        = ('team.view' = any (public.my_permissions(pg_temp.a())))
    )::text)
$$;

-- What a view as a built-in role held before R11c (R1's view branch of
-- public.my_permissions, frozen): the role's rule for each key, every key
-- but pay as the owner, pay only as an accountant.
create function pg_temp.old_view_perms(r public.member_role) returns text[] language sql as $$
  select coalesce(array_agg(k.key order by k.key), '{}'::text[])
  from public.permission_keys k
  where (r = 'accountant' and k.key = any (private.accountant_perms()))
    or (not k.by_owner and (r = 'owner' or private.role_holds(pg_temp.a(), r, k.key)))
$$;

-- The keys one held that the other didn't.
create function pg_temp.beyond(one text, other text) returns text language sql as $$
  select coalesce(string_agg(x.k, ',' order by x.k), '')
  from (
    select unnest(g.perms) as k from got g where g.label = one
    except
    select unnest(g.perms) from got g where g.label = other
  ) as x
$$;

-- A's roles: a shift lead on workers who builds the schedule; a clock lead
-- on workers who edits the clock; an office role on workers who reads the
-- management page and the team; a floor lead on managers who doesn't build
-- the schedule, where managers see pay; one archived; and one of B.
insert into ids values ('lead', public.create_business_role(pg_temp.p(1), pg_temp.a(), 'worker', 'Shift lead'));
insert into ids values ('clock', public.create_business_role(pg_temp.p(1), pg_temp.a(), 'worker', 'Clock lead'));
insert into ids values ('office', public.create_business_role(pg_temp.p(1), pg_temp.a(), 'worker', 'Office'));
insert into ids values ('floor', public.create_business_role(pg_temp.p(1), pg_temp.a(), 'manager', 'Floor lead'));
insert into ids values ('old', public.create_business_role(pg_temp.p(1), pg_temp.a(), 'worker', 'Old role'));
insert into ids values ('far', public.create_business_role(pg_temp.p(7),
  'a3000000-0000-4000-b000-000000000002', 'worker', 'Elsewhere'));
select public.set_role_permission(pg_temp.p(1), pg_temp.a(), 'worker', 'schedule.edit', true, pg_temp.id('lead'));
select public.set_role_permission(pg_temp.p(1), pg_temp.a(), 'worker', 'clock.edit', true, pg_temp.id('clock'));
select public.set_role_permission(pg_temp.p(1), pg_temp.a(), 'worker', 'manage.view', true, pg_temp.id('office'));
select public.set_role_permission(pg_temp.p(1), pg_temp.a(), 'worker', 'team.view', true, pg_temp.id('office'));
select public.set_role_permission(pg_temp.p(1), pg_temp.a(), 'manager', 'schedule.edit', false, pg_temp.id('floor'));
select public.set_role_permission(pg_temp.p(1), pg_temp.a(), 'manager', 'clock.payroll', true);
select public.archive_business_role(pg_temp.p(1), pg_temp.id('old'));

-- 4 holds the shift lead, 5 the floor lead.
update public.memberships m set named_role = pg_temp.id('lead')
where m.business_id = pg_temp.a() and m.user_id = pg_temp.p(4);
update public.memberships m set named_role = pg_temp.id('floor')
where m.business_id = pg_temp.a() and m.user_id = pg_temp.p(5);

-- A's draft week (two shifts), the worker's hours and an invite.
set local role service_role;
insert into ids values ('draft',
  public.open_schedule_week(pg_temp.a(), '2026-12-13', '2026-12-09 16:00+00'));
select public.save_week_schedule(pg_temp.p(1), pg_temp.id('draft'),
  '[{"day": "2026-12-13", "name": "Morning", "start": "07:00", "end": "15:00", "needed": 1,
     "assignees": [{"user": "a3000000-0000-4000-a000-000000000003"}]},
    {"day": "2026-12-14", "name": "Evening", "start": "16:00", "end": "23:00", "needed": 1,
     "assignees": []}]',
  null, '2026-12-01 09:00+00');
reset role;

insert into public.time_entries (business_id, user_id, clock_in, clock_out, in_proof, out_proof)
values (pg_temp.a(), pg_temp.p(3), '2026-11-30 06:00+00', '2026-11-30 14:00+00', 'scan', 'scan');

insert into public.invites (business_id, phone, role, token_hash, expires_at)
values (pg_temp.a(), '+972500830099', 'worker', repeat('a3', 32), now() + interval '3 days');

-- What the two members in a named role hold, as the screens read it.
select pg_temp.sign_in(pg_temp.p(4));
insert into got values ('member lead', public.my_permissions(pg_temp.a()), null);
select pg_temp.sign_in(pg_temp.p(5));
insert into got values ('member floor', public.my_permissions(pg_temp.a()), null);
reset role;

------------------------------------------------------------------------------
-- The table

select ok(
  exists (
    select 1
    from pg_constraint c
    where c.conname = 'view_sessions_named_role_fkey'
      and c.conrelid = 'public.view_sessions'::regclass
      and c.confrelid = 'public.business_roles'::regclass
      and c.confdeltype = 'c'
      and (select array_agg(a.attname::text order by k.n)
           from unnest(c.conkey) with ordinality as k (attnum, n)
           join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)
        = '{business_id,named_role,role}'::text[]
      and (select array_agg(a.attname::text order by k.n)
           from unnest(c.confkey) with ordinality as k (attnum, n)
           join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum)
        = '{business_id,id,base}'::text[]
  )
  and exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public.view_sessions'::regclass
      and t.tgname = 'view_sessions_named_role_live'
      and t.tgfoid = 'private.refuse_archived_named_role()'::regprocedure
  ),
  'a view session''s named role is one of its business on its role, goes with it, and is never an archived one'
);

select ok(
  has_function_privilege('service_role',
    'public.start_view_session(uuid, uuid, public.member_role, uuid)', 'execute')
  and not has_function_privilege('authenticated',
    'public.start_view_session(uuid, uuid, public.member_role, uuid)', 'execute')
  and not has_function_privilege('anon',
    'public.start_view_session(uuid, uuid, public.member_role, uuid)', 'execute')
  and to_regprocedure('public.start_view_session(uuid, uuid, public.member_role)') is null
  and (select not p.prosecdef
         and exists (
           select 1 from unnest(p.proconfig) as c (setting)
           where c.setting in ('search_path=""', 'search_path=')
         )
       from pg_proc p
       where p.oid = 'public.start_view_session(uuid, uuid, public.member_role, uuid)'::regprocedure)
  and has_function_privilege('authenticated', 'public.my_permissions(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.my_permissions(uuid)', 'execute')
  and has_function_privilege('authenticated', 'private.businesses_holding(text)', 'execute')
  and not has_function_privilege('anon', 'private.businesses_holding(text)', 'execute')
  and has_function_privilege('authenticated', 'private.viewed_perms()', 'execute')
  and not has_function_privilege('anon', 'private.viewed_perms()', 'execute')
  and (select count(*)::int
       from pg_proc p
       where p.oid in (
           'public.my_permissions(uuid)'::regprocedure,
           'private.businesses_holding(text)'::regprocedure,
           'private.viewed_perms()'::regprocedure
         )
         and p.prosecdef
         and exists (
           select 1 from unnest(p.proconfig) as c (setting)
           where c.setting in ('search_path=""', 'search_path=')
         )) = 3,
  'starting a view is the secret key''s, one of it, as it ran; what a view reads runs as its owner with an empty search path'
);

------------------------------------------------------------------------------
-- Views as built-in roles, as before

insert into ids values ('worker view', pg_temp.view_as('worker'));
select pg_temp.sign_in(pg_temp.p(10));
insert into got values ('view worker', public.my_permissions(pg_temp.a()), pg_temp.seen());
reset role;
select pg_temp.view_as('manager');
select pg_temp.sign_in(pg_temp.p(10));
insert into got values ('view manager', public.my_permissions(pg_temp.a()), pg_temp.seen());
reset role;
select pg_temp.view_as('owner');
select pg_temp.sign_in(pg_temp.p(10));
insert into got values ('view owner', public.my_permissions(pg_temp.a()), pg_temp.seen());
reset role;
select pg_temp.view_as('accountant');
select pg_temp.sign_in(pg_temp.p(10));
insert into got values ('view accountant', public.my_permissions(pg_temp.a()), pg_temp.seen());
reset role;

select is(
  (select string_agg(
     g.label || ':' || (g.perms = pg_temp.old_view_perms(substr(g.label, 6)::public.member_role))::text,
     ' ' order by g.label)
   from got g
   where g.label in ('view owner', 'view manager', 'view worker', 'view accountant'))
  || ' ' ||
  (select coalesce(v.named_role::text, 'none') || '/'
     || (select string_agg(k, ',' order by k) from jsonb_object_keys(l.details) as k)
   from public.view_sessions v
   join public.audit_log l
     on l.action = 'view_as.start' and l.details ->> 'session' = v.id::text
   where v.id = pg_temp.id('worker view')),
  'view accountant:true view manager:true view owner:true view worker:true none/role,session',
  'a view as a built-in role holds what it held before, and today''s call opens it and logs it as before'
);

------------------------------------------------------------------------------
-- A view as a named role

-- Started as the app starts it: with the secret key, as the service role
-- (the function runs as its caller and reads the business's roles).
set local role service_role;
insert into ids values ('lead view', pg_temp.view_as('worker', 'lead'));
reset role;
select pg_temp.sign_in(pg_temp.p(10));
insert into got values ('view lead', public.my_permissions(pg_temp.a()), pg_temp.seen());
reset role;

select is(
  (select v.role::text || '/' || coalesce((select i.name from ids i where i.id = v.named_role), 'none')
   from public.view_sessions v
   where v.id = pg_temp.id('lead view'))
  || ' ' ||
  (select (l.details ->> 'role') || '/'
     || (l.details ->> 'named_role' = pg_temp.id('lead')::text)::text || '/'
     || (l.details ->> 'role_name')
   from public.audit_log l
   where l.action = 'view_as.start' and l.details ->> 'session' = pg_temp.id('lead view')::text),
  'worker/lead worker/true/Shift lead',
  'the team views A as its shift lead, on its base, and the log names it'
);

select pg_temp.sign_in(pg_temp.p(10));
select is(
  (select br.name || '/' || br.base::text
   from public.view_sessions v
   join public.business_roles br on br.id = v.named_role
   where v.ended_at is null),
  'Shift lead/worker',
  'the team member reads the view''s named role, its name and base, as the app shows them'
);
reset role;

-- Refused: an archived role, one of another business, one on another base
-- (and the owner, who has none). As the service role too.
set local role service_role;
select is(
  concat_ws(' | ',
    pg_temp.refusal(format('select public.start_view_session(%L::uuid, %L::uuid, %L, %L::uuid)',
      pg_temp.p(10), pg_temp.a(), 'worker', pg_temp.id('old'))),
    pg_temp.refusal(format('select public.start_view_session(%L::uuid, %L::uuid, %L, %L::uuid)',
      pg_temp.p(10), pg_temp.a(), 'worker', pg_temp.id('far'))),
    pg_temp.refusal(format('select public.start_view_session(%L::uuid, %L::uuid, %L, %L::uuid)',
      pg_temp.p(10), pg_temp.a(), 'manager', pg_temp.id('lead'))),
    pg_temp.refusal(format('select public.start_view_session(%L::uuid, %L::uuid, %L, %L::uuid)',
      pg_temp.p(10), pg_temp.a(), 'owner', pg_temp.id('lead')))),
  '22023 archived | P0002 | 22023 base | 22023 base',
  'an archived role, a role of another business and one on another base are refused'
);
reset role;
select is(
  (select v.id from public.view_sessions v
   where v.staff_id = pg_temp.p(10) and v.ended_at is null),
  pg_temp.id('lead view'),
  'and a refused start leaves the open view as it was'
);

-- Written straight to the table, the same (a session already over, so the
-- open one stays): archived by the trigger, the rest by the foreign key,
-- compared by its code, as its detail names the row.
select is(
  concat_ws(' | ',
    pg_temp.refusal(format(
      'insert into public.view_sessions (staff_id, business_id, role, named_role, ended_at)
       values (%L, %L, %L, %L, now())',
      pg_temp.p(10), pg_temp.a(), 'worker', pg_temp.id('old'))),
    left(pg_temp.refusal(format(
      'insert into public.view_sessions (staff_id, business_id, role, named_role, ended_at)
       values (%L, %L, %L, %L, now())',
      pg_temp.p(10), pg_temp.a(), 'worker', pg_temp.id('far'))), 5),
    left(pg_temp.refusal(format(
      'insert into public.view_sessions (staff_id, business_id, role, named_role, ended_at)
       values (%L, %L, %L, %L, now())',
      pg_temp.p(10), pg_temp.a(), 'worker', pg_temp.id('floor'))), 5)),
  '22023 archived | 23503 | 23503',
  'the table refuses them too, whoever writes it'
);

-- A view never writes: the draft through the secret key, with the team
-- member as the actor, and straight from the browser.
set local role service_role;
select is(
  pg_temp.attempt(format(
    'select public.save_week_schedule(%L::uuid, %L::uuid, %L::jsonb, null, %L::timestamptz)',
    pg_temp.p(10), pg_temp.id('draft'), '[]', '2026-12-01 10:00+00')),
  '42501',
  'a view as the shift lead, who builds the schedule, saves no draft through the server'
);
reset role;
select pg_temp.sign_in(pg_temp.p(10));
select is(
  pg_temp.attempt(format(
    'update public.schedule_shifts set needed = 9 where week_id = %L', pg_temp.id('draft')))
  || ' ' ||
  pg_temp.attempt(format(
    'update public.memberships set named_role = null where business_id = %L', pg_temp.a())),
  '42501 42501',
  'nor changes the draft or the team from the browser'
);
reset role;

-- The clock lead, the office role and the floor lead.
select pg_temp.view_as('worker', 'clock');
select pg_temp.sign_in(pg_temp.p(10));
insert into got values ('view clock', public.my_permissions(pg_temp.a()), pg_temp.seen());
reset role;
select pg_temp.view_as('worker', 'office');
select pg_temp.sign_in(pg_temp.p(10));
insert into got values ('view office', public.my_permissions(pg_temp.a()), pg_temp.seen());
reset role;
select pg_temp.view_as('manager', 'floor');
select pg_temp.sign_in(pg_temp.p(10));
insert into got values ('view floor', public.my_permissions(pg_temp.a()), pg_temp.seen());
reset role;

------------------------------------------------------------------------------
-- What each view holds and reads

select is(
  (select g.perms from got g where g.label = 'view lead'),
  (select g.perms from got g where g.label = 'member lead'),
  'a view as the shift lead holds exactly what someone in it holds'
);
select is(
  (select g.perms from got g where g.label = 'view floor'),
  (select g.perms from got g where g.label = 'member floor'),
  'so does a view as the floor lead, on managers: never the managers'' pay'
);
select is(
  concat_ws(' | ',
    'lead +' || pg_temp.beyond('view lead', 'view worker')
      || ' -' || pg_temp.beyond('view worker', 'view lead'),
    'clock +' || pg_temp.beyond('view clock', 'view worker')
      || ' -' || pg_temp.beyond('view worker', 'view clock'),
    'office +' || pg_temp.beyond('view office', 'view worker')
      || ' -' || pg_temp.beyond('view worker', 'view office'),
    'floor +' || pg_temp.beyond('view floor', 'view manager')
      || ' -' || pg_temp.beyond('view manager', 'view floor')),
  'lead +schedule.edit - | clock +clock.edit - | office +manage.view,team.view - | floor + -schedule.edit,schedule.publish',
  'each holds its base''s and its own rules, and nothing more: publishing goes with building'
);

select is(
  (select string_agg(g.label || ' ' || g.seen, ' | ' order by g.label)
   from got g
   where g.label in ('view worker', 'view manager', 'view lead', 'view clock', 'view office', 'view floor')),
  (select format(
     'view clock drafts:0 hours:1 log:0 invites:0 rank:false pay:false same:true | '
     'view floor drafts:0 hours:1 log:%1$s invites:1 rank:true pay:false same:true | '
     'view lead drafts:2 hours:0 log:0 invites:0 rank:false pay:false same:true | '
     'view manager drafts:2 hours:1 log:%1$s invites:1 rank:true pay:false same:true | '
     'view office drafts:0 hours:0 log:%1$s invites:1 rank:false pay:false same:true | '
     'view worker drafts:0 hours:0 log:0 invites:0 rank:false pay:false same:true',
     (select count(*) from public.audit_log l
      where l.business_id = pg_temp.a() and l.action like 'role.%'))),
  'each view reads what its role holds: the drafts as a builder, the hours as the clock''s editor, the log and the invites as the office; its rank is its base''s, and none reads pay'
);

select * from finish();
rollback;
