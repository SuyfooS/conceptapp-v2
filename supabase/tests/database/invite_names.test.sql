-- Joining by the invite's name (20261127000500_invite_names.sql; docs/ROADMAP.md,
-- known issue 20): the invite's name becomes the business's own name for the
-- claimant (public.member_names), read as public.set_member_name reads one
-- (one line, its spaces collapsed), unless it is their own. Their own name
-- (profiles.full_name) stays theirs, and someone with none still takes the
-- invite's. Their own name keeps no row, and one kept from an earlier time in
-- the business goes; an invite with no name leaves what the business had; a
-- name the table wouldn't keep is skipped and the join goes through. The log
-- keeps no name, the name is read as their profile is, in that business, and
-- only the server claims. Fixed ids and numbers of its own (9c…,
-- 050-000-93xx) and slugs (inam-…), so nothing here meets the seeded people.
begin;
select plan(22);
set local timezone = 'UTC';

insert into auth.users (id, aud, role, phone)
values
  ('9c000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500009301'),
  ('9c000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500009302'),
  ('9c000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', '972500009303'),
  ('9c000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', '972500009304'),
  ('9c000000-0000-4000-a000-000000000005', 'authenticated', 'authenticated', '972500009305'),
  ('9c000000-0000-4000-a000-000000000006', 'authenticated', 'authenticated', '972500009306'),
  ('9c000000-0000-4000-a000-000000000007', 'authenticated', 'authenticated', '972500009307');

update public.profiles set full_name = 'Noa Cohen'
where id = '9c000000-0000-4000-a000-000000000002';
update public.profiles set full_name = 'Dana Levi'
where id = '9c000000-0000-4000-a000-000000000004';
update public.profiles set full_name = 'Yael Bar'
where id = '9c000000-0000-4000-a000-000000000005';
update public.profiles set full_name = 'Shir Tal'
where id = '9c000000-0000-4000-a000-000000000006';

-- A: 1 its owner, 2 (Noa Cohen) a worker. B: 7 its owner, and 4 (Dana Levi),
-- who worked there once and whom B called "Dana L". 3 has no name; 5 (Yael
-- Bar) and 6 (Shir Tal) are in no business yet.
insert into public.businesses (id, slug, name)
values
  ('9c000000-0000-4000-b000-000000000001', 'inam-a', 'Invite names A'),
  ('9c000000-0000-4000-b000-000000000002', 'inam-b', 'Invite names B');

insert into public.memberships (business_id, user_id, role, active)
values
  ('9c000000-0000-4000-b000-000000000001', '9c000000-0000-4000-a000-000000000001', 'owner', true),
  ('9c000000-0000-4000-b000-000000000001', '9c000000-0000-4000-a000-000000000002', 'worker', true),
  ('9c000000-0000-4000-b000-000000000002', '9c000000-0000-4000-a000-000000000007', 'owner', true),
  ('9c000000-0000-4000-b000-000000000002', '9c000000-0000-4000-a000-000000000004', 'worker', false);

insert into public.member_names (business_id, user_id, name)
values ('9c000000-0000-4000-b000-000000000002', '9c000000-0000-4000-a000-000000000004', 'Dana L');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- An open invite to B for `person`'s number, from B's owner, by `hash`.
create function pg_temp.invite(person uuid, invite_role public.member_role, invite_name text, hash text)
returns void language sql as $$
  insert into public.invites (business_id, phone, role, full_name, token_hash, invited_by)
  select '9c000000-0000-4000-b000-000000000002', p.phone, invite_role, invite_name, hash,
    '9c000000-0000-4000-a000-000000000007'
  from public.profiles p
  where p.id = person;
$$;

-- What B calls `person`, or null.
create function pg_temp.kept(person uuid) returns text language sql as $$
  select n.name from public.member_names n
  where n.business_id = '9c000000-0000-4000-b000-000000000002' and n.user_id = person
$$;

------------------------------------------------------------------------------
-- Someone named elsewhere

select pg_temp.invite('9c000000-0000-4000-a000-000000000002', 'accountant', '  נועה   כ. ', repeat('a', 64));
set local role service_role;
select is(
  public.claim_invite(repeat('a', 64), '9c000000-0000-4000-a000-000000000002'),
  '9c000000-0000-4000-b000-000000000002'::uuid,
  'someone named in another business joins this one'
);
reset role;
select is(
  pg_temp.kept('9c000000-0000-4000-a000-000000000002'),
  'נועה כ.',
  'the invite''s name is the business''s own for them, one line with its spaces collapsed'
);
select is(
  (select full_name from public.profiles where id = '9c000000-0000-4000-a000-000000000002'),
  'Noa Cohen',
  'their own name stays theirs'
);
select is(
  (select count(*)::int from public.member_names n
    where n.user_id = '9c000000-0000-4000-a000-000000000002'),
  1,
  'and the business they were in keeps no name for them'
);

------------------------------------------------------------------------------
-- Someone with no name, or with the invite's

select pg_temp.invite('9c000000-0000-4000-a000-000000000003', 'worker', ' Avi  Ron ', repeat('b', 64));
set local role service_role;
select is(
  public.claim_invite(repeat('b', 64), '9c000000-0000-4000-a000-000000000003'),
  '9c000000-0000-4000-b000-000000000002'::uuid,
  'someone with no name joins'
);
reset role;
select is(
  (select full_name from public.profiles where id = '9c000000-0000-4000-a000-000000000003'),
  'Avi  Ron',
  'and takes the invite''s name as their own, trimmed, as before'
);
select is(
  (select count(*)::int from public.member_names n
    where n.user_id = '9c000000-0000-4000-a000-000000000003'),
  0,
  'which is their own, so the business keeps none'
);

select pg_temp.invite('9c000000-0000-4000-a000-000000000006', 'worker', 'Shir  Tal', repeat('c', 64));
set local role service_role;
select is(
  public.claim_invite(repeat('c', 64), '9c000000-0000-4000-a000-000000000006'),
  '9c000000-0000-4000-b000-000000000002'::uuid,
  'someone invited by their own name joins'
);
reset role;
select is(
  pg_temp.kept('9c000000-0000-4000-a000-000000000006'),
  null,
  'their own name, however spaced, keeps no row'
);

------------------------------------------------------------------------------
-- Coming back

select pg_temp.invite('9c000000-0000-4000-a000-000000000004', 'worker', 'Dana Levi-Cohen', repeat('d', 64));
set local role service_role;
select is(
  public.claim_invite(repeat('d', 64), '9c000000-0000-4000-a000-000000000004'),
  '9c000000-0000-4000-b000-000000000002'::uuid,
  'someone the business named before comes back'
);
reset role;
select is(
  pg_temp.kept('9c000000-0000-4000-a000-000000000004'),
  'Dana Levi-Cohen',
  'by the invite''s name, over the one it kept'
);

update public.memberships set active = false
where business_id = '9c000000-0000-4000-b000-000000000002'
  and user_id = '9c000000-0000-4000-a000-000000000004';
select pg_temp.invite('9c000000-0000-4000-a000-000000000004', 'worker', 'Dana  Levi', repeat('e', 64));
set local role service_role;
select is(
  public.claim_invite(repeat('e', 64), '9c000000-0000-4000-a000-000000000004'),
  '9c000000-0000-4000-b000-000000000002'::uuid,
  'and again, invited by their own name'
);
reset role;
select is(
  pg_temp.kept('9c000000-0000-4000-a000-000000000004'),
  null,
  'the name kept from before goes: the business shows theirs'
);

update public.memberships set active = false
where business_id = '9c000000-0000-4000-b000-000000000002'
  and user_id = '9c000000-0000-4000-a000-000000000004';
insert into public.member_names (business_id, user_id, name)
values ('9c000000-0000-4000-b000-000000000002', '9c000000-0000-4000-a000-000000000004', 'Dana B');
select pg_temp.invite('9c000000-0000-4000-a000-000000000004', 'worker', null, repeat('f', 64));
set local role service_role;
select is(
  public.claim_invite(repeat('f', 64), '9c000000-0000-4000-a000-000000000004'),
  '9c000000-0000-4000-b000-000000000002'::uuid,
  'and again, by an invite with no name'
);
reset role;
select is(
  pg_temp.kept('9c000000-0000-4000-a000-000000000004'),
  'Dana B',
  'which leaves what the business had for them'
);

------------------------------------------------------------------------------
-- A name the table wouldn't keep

select pg_temp.invite('9c000000-0000-4000-a000-000000000005', 'worker', 'Yael' || chr(7) || ' Bar', repeat('0', 64));
set local role service_role;
select lives_ok(
  $$select public.claim_invite(repeat('0', 64), '9c000000-0000-4000-a000-000000000005')$$,
  'an invite''s name with a control character never stops a join'
);
reset role;
select ok(
  exists (
    select 1 from public.memberships m
    where m.business_id = '9c000000-0000-4000-b000-000000000002'
      and m.user_id = '9c000000-0000-4000-a000-000000000005' and m.active
  )
  and pg_temp.kept('9c000000-0000-4000-a000-000000000005') is null,
  'they join, and the business keeps no name it couldn''t hold'
);

------------------------------------------------------------------------------
-- The log, who reads it, who claims

select is(
  (select array_agg(k order by k)
    from public.audit_log l, jsonb_object_keys(l.details) k
    where l.business_id = '9c000000-0000-4000-b000-000000000002'
      and l.actor_id = '9c000000-0000-4000-a000-000000000002'
      and l.action = 'invite.claim'),
  array['invite', 'role'],
  'the log keeps the invite and the role, never a name'
);

select pg_temp.sign_in('9c000000-0000-4000-a000-000000000002');
select is(
  (select n.name from public.member_names n
    where n.business_id = '9c000000-0000-4000-b000-000000000002'
      and n.user_id = '9c000000-0000-4000-a000-000000000002'),
  'נועה כ.',
  'they read the business''s name for them there'
);
reset role;

select pg_temp.sign_in('9c000000-0000-4000-a000-000000000001');
select is(
  (select count(*)::int from public.member_names n
    where n.business_id = '9c000000-0000-4000-b000-000000000002'),
  0,
  'someone of another business reads none of its names'
);
reset role;

select ok(
  not has_function_privilege('authenticated', 'public.claim_invite(text, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.claim_invite(text, uuid)', 'execute'),
  'nobody signed in claims through the function'
);
select ok(
  has_function_privilege('service_role', 'public.claim_invite(text, uuid)', 'execute'),
  'the server claims, with the secret key'
);

select * from finish();
rollback;
