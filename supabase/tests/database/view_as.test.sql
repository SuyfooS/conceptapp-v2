-- "View as": someone on the ConceptApp team reads one business as one of
-- its roles while a session is open, writes nothing, and every start and
-- end is in the audit log. Only the server may open or end a session.
begin;
select plan(34);

insert into auth.users (id, aud, role, phone)
values
  ('63000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500000761'),
  ('63000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500000762'),
  ('63000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500000763'),
  ('63000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500000764');

-- a: platform admin; b: onboarder; c: owner of X; d: worker of Y (no staff).
insert into public.platform_staff (user_id, role)
values
  ('63000000-0000-4000-a000-00000000000a', 'platform_admin'),
  ('63000000-0000-4000-a000-00000000000b', 'onboarder');

insert into public.businesses (id, slug, name)
values
  ('63000000-0000-4000-b000-000000000001', 'va-x', 'View X'),
  ('63000000-0000-4000-b000-000000000002', 'va-y', 'View Y');

insert into public.memberships (business_id, user_id, role)
values
  ('63000000-0000-4000-b000-000000000001', '63000000-0000-4000-a000-00000000000c', 'owner'),
  ('63000000-0000-4000-b000-000000000002', '63000000-0000-4000-a000-00000000000d', 'worker');

insert into public.business_modules (business_id, module_key, enabled)
values
  ('63000000-0000-4000-b000-000000000001', 'scheduling', true),
  ('63000000-0000-4000-b000-000000000002', 'scheduling', true);

insert into public.invites (business_id, phone, role, token_hash, expires_at)
values
  ('63000000-0000-4000-b000-000000000001', '+972500000771', 'worker',
   repeat('7', 64), now() + interval '3 days');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- Nobody but the server may open or end a session.
select pg_temp.sign_in('63000000-0000-4000-a000-00000000000a');
select throws_ok(
  $$select public.start_view_session('63000000-0000-4000-a000-00000000000a',
    '63000000-0000-4000-b000-000000000001', 'worker')$$,
  '42501', null, 'a signed-in platform admin cannot open a session directly'
);
select throws_ok(
  $$select public.end_view_session('63000000-0000-4000-a000-00000000000a')$$,
  '42501', null, 'a signed-in platform admin cannot end a session directly'
);
select throws_ok(
  $$insert into public.view_sessions (staff_id, business_id, role)
    values ('63000000-0000-4000-a000-00000000000a',
      '63000000-0000-4000-b000-000000000001', 'owner')$$,
  '42501', null, 'nobody signed in writes view sessions'
);
reset role;
set local role anon;
select throws_ok(
  $$select public.start_view_session('63000000-0000-4000-a000-00000000000a',
    '63000000-0000-4000-b000-000000000001', 'worker')$$,
  '42501', null, 'an anonymous visitor cannot open a session'
);
reset role;

-- Before a session the team reads no business data.
select pg_temp.sign_in('63000000-0000-4000-a000-00000000000a');
select is_empty(
  $$select 1 from public.businesses$$,
  'without a session the team reads no business'
);
reset role;

-- Who may open a session.
set local role service_role;
select throws_ok(
  $$select public.start_view_session('63000000-0000-4000-a000-00000000000c',
    '63000000-0000-4000-b000-000000000001', 'worker')$$,
  '42501', null, 'an owner who is not on the team cannot view as'
);
select throws_ok(
  $$select public.start_view_session('63000000-0000-4000-a000-00000000000a',
    '63000000-0000-4000-b000-0000000000ff', 'worker')$$,
  'P0002', null, 'an unknown business cannot be viewed'
);
select throws_ok(
  $$select public.start_view_session('63000000-0000-4000-a000-00000000000a',
    '63000000-0000-4000-b000-000000000001', null)$$,
  '22023', null, 'a role is required'
);
select lives_ok(
  $$select public.start_view_session('63000000-0000-4000-a000-00000000000b',
    '63000000-0000-4000-b000-000000000001', 'manager')$$,
  'an onboarder can view as'
);

-- The platform admin views X as a worker.
select isnt(
  public.start_view_session('63000000-0000-4000-a000-00000000000a',
    '63000000-0000-4000-b000-000000000001', 'worker'),
  null,
  'a platform admin opens a session'
);
select is(
  (select count(*)::int from public.audit_log
    where actor_id = '63000000-0000-4000-a000-00000000000a'
      and business_id = '63000000-0000-4000-b000-000000000001'
      and action = 'view_as.start' and details ->> 'role' = 'worker'),
  1,
  'the start is in the business''s audit log with the role'
);
reset role;

select pg_temp.sign_in('63000000-0000-4000-a000-00000000000a');
select results_eq(
  $$select slug from public.businesses$$,
  $$values ('va-x')$$,
  'viewing X, the team reads X and not Y'
);
select is(
  (select count(*)::int from public.memberships),
  1,
  'and only X''s team'
);
select results_eq(
  $$select id::text from public.profiles
    where id <> '63000000-0000-4000-a000-00000000000a'$$,
  $$values ('63000000-0000-4000-a000-00000000000c')$$,
  'and the profiles of X''s people only'
);
select is_empty(
  $$select 1 from public.profiles where id = '63000000-0000-4000-a000-00000000000d'$$,
  'but not Y''s people'
);
select is(
  (select count(*)::int from public.business_modules),
  1,
  'and only X''s modules'
);
select is_empty(
  $$select 1 from public.invites$$,
  'a worker''s view reads no invites'
);
select is_empty(
  $$select 1 from public.audit_log$$,
  'nor the audit log'
);
select results_eq(
  $$select role::text from public.view_sessions where ended_at is null$$,
  $$values ('worker')$$,
  'the team member reads their own open session'
);

-- Writes stay closed while viewing, whatever the role.
select throws_ok(
  $$update public.businesses set name = 'Changed'
    where id = '63000000-0000-4000-b000-000000000001'$$,
  '42501', null, 'a viewer cannot write the business row'
);
reset role;
select is(
  (select name from public.businesses where id = '63000000-0000-4000-b000-000000000001'),
  'View X',
  'a viewer cannot rename the business'
);

-- Viewing as owner: invites open up, writes still do not.
set local role service_role;
select lives_ok(
  $$select public.start_view_session('63000000-0000-4000-a000-00000000000a',
    '63000000-0000-4000-b000-000000000001', 'owner')$$,
  'the platform admin switches to viewing X as owner'
);
select is(
  (select count(*)::int from public.view_sessions
    where staff_id = '63000000-0000-4000-a000-00000000000a' and ended_at is null),
  1,
  'a new session ends the previous one'
);
select throws_ok(
  $$select public.team_invite('63000000-0000-4000-a000-00000000000a',
    '63000000-0000-4000-b000-000000000001', '+972500000781', 'New', 'worker', repeat('a', 64))$$,
  '42501', null, 'a viewer cannot invite through the server function'
);
reset role;

select pg_temp.sign_in('63000000-0000-4000-a000-00000000000a');
select is(
  (select count(*)::int from public.invites),
  1,
  'an owner''s view reads the business''s invites'
);
select throws_ok(
  $$update public.businesses set name = 'Changed'
    where id = '63000000-0000-4000-b000-000000000001'$$,
  '42501', null, 'an owner''s view cannot write the business row'
);
select is_empty(
  $$select 1 from public.businesses where name = 'Changed'$$,
  'an owner''s view cannot rename the business either'
);
select is_empty(
  $$select 1 from public.view_sessions
    where staff_id = '63000000-0000-4000-a000-00000000000b'$$,
  'the team reads only its own sessions'
);
reset role;

-- Another business member never sees the viewer's session or X.
select pg_temp.sign_in('63000000-0000-4000-a000-00000000000d');
select is_empty($$select 1 from public.view_sessions$$, 'a member reads no view sessions');
select results_eq(
  $$select slug from public.businesses$$,
  $$values ('va-y')$$,
  'a member of Y still reads only Y'
);
reset role;

-- An expired session reads nothing.
update public.view_sessions set expires_at = now() - interval '1 minute'
  where staff_id = '63000000-0000-4000-a000-00000000000b';
select pg_temp.sign_in('63000000-0000-4000-a000-00000000000b');
select is_empty($$select 1 from public.businesses$$, 'an expired session reads nothing');
reset role;

-- Ending.
set local role service_role;
select is(
  public.end_view_session('63000000-0000-4000-a000-00000000000a'),
  '63000000-0000-4000-b000-000000000001'::uuid,
  'ending returns the business that was viewed'
);
select is(
  (select count(*)::int from public.audit_log
    where actor_id = '63000000-0000-4000-a000-00000000000a'
      and action = 'view_as.end' and details ->> 'role' = 'owner'),
  1,
  'the end is in the audit log'
);
reset role;

select pg_temp.sign_in('63000000-0000-4000-a000-00000000000a');
select is_empty($$select 1 from public.businesses$$, 'after the end the team reads nothing again');
reset role;

select * from finish();
rollback;
