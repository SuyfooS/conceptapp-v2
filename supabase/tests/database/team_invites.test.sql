-- Inviting from the Team screen: owners and managers invite by phone and
-- send fresh links, never above their own role and never in another
-- business. Only the server may call either function.
begin;
select plan(24);

insert into auth.users (id, aud, role, phone)
values
  ('62000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500000661'),
  ('62000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500000662'),
  ('62000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500000663'),
  ('62000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500000664'),
  ('62000000-0000-4000-a000-00000000000e', 'authenticated', 'authenticated', '972500000665');

-- a: owner of X; b: manager of X; c: worker of X; d: manager of Y;
-- e: an inactive manager of X.
insert into public.businesses (id, slug, name)
values
  ('62000000-0000-4000-b000-000000000001', 'ti-x', 'Team X'),
  ('62000000-0000-4000-b000-000000000002', 'ti-y', 'Team Y');

insert into public.memberships (business_id, user_id, role, active)
values
  ('62000000-0000-4000-b000-000000000001', '62000000-0000-4000-a000-00000000000a', 'owner', true),
  ('62000000-0000-4000-b000-000000000001', '62000000-0000-4000-a000-00000000000b', 'manager', true),
  ('62000000-0000-4000-b000-000000000001', '62000000-0000-4000-a000-00000000000c', 'worker', true),
  ('62000000-0000-4000-b000-000000000002', '62000000-0000-4000-a000-00000000000d', 'manager', true),
  ('62000000-0000-4000-b000-000000000001', '62000000-0000-4000-a000-00000000000e', 'manager', false);

-- An owner invite still open, an expired worker invite, a claimed one.
insert into public.invites (id, business_id, phone, role, full_name, token_hash, expires_at, claimed_at)
values
  ('62000000-0000-4000-c000-000000000001', '62000000-0000-4000-b000-000000000001',
   '+972500000671', 'owner', 'Partner', repeat('1', 64), now() + interval '3 days', null),
  ('62000000-0000-4000-c000-000000000002', '62000000-0000-4000-b000-000000000001',
   '+972500000672', 'worker', 'Late', repeat('2', 64), now() - interval '1 day', null),
  ('62000000-0000-4000-c000-000000000003', '62000000-0000-4000-b000-000000000001',
   '+972500000673', 'worker', 'Done', repeat('3', 64), now() + interval '3 days', now());

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- Nobody but the server may call them.
select pg_temp.sign_in('62000000-0000-4000-a000-00000000000a');
select throws_ok(
  $$select public.team_invite('62000000-0000-4000-a000-00000000000a',
    '62000000-0000-4000-b000-000000000001', '+972500000681', 'New', 'worker', repeat('a', 64))$$,
  '42501', null, 'a signed-in owner cannot invite through the function'
);
select throws_ok(
  $$select public.team_invite_link('62000000-0000-4000-a000-00000000000a',
    '62000000-0000-4000-c000-000000000002', repeat('a', 64))$$,
  '42501', null, 'a signed-in owner cannot issue links through the function'
);
reset role;
set local role anon;
select throws_ok(
  $$select public.team_invite('62000000-0000-4000-a000-00000000000a',
    '62000000-0000-4000-b000-000000000001', '+972500000681', 'New', 'worker', repeat('a', 64))$$,
  '42501', null, 'an anonymous visitor cannot invite'
);
reset role;

set local role service_role;

-- Who may invite whom.
select throws_ok(
  $$select public.team_invite('62000000-0000-4000-a000-00000000000c',
    '62000000-0000-4000-b000-000000000001', '+972500000681', 'New', 'worker', repeat('a', 64))$$,
  '42501', null, 'a worker cannot invite'
);
select throws_ok(
  $$select public.team_invite('62000000-0000-4000-a000-00000000000d',
    '62000000-0000-4000-b000-000000000001', '+972500000681', 'New', 'worker', repeat('a', 64))$$,
  '42501', null, 'a manager of another business cannot invite here'
);
select throws_ok(
  $$select public.team_invite('62000000-0000-4000-a000-00000000000e',
    '62000000-0000-4000-b000-000000000001', '+972500000681', 'New', 'worker', repeat('a', 64))$$,
  '42501', null, 'an inactive manager cannot invite'
);
select throws_ok(
  $$select public.team_invite('62000000-0000-4000-a000-00000000000b',
    '62000000-0000-4000-b000-000000000001', '+972500000681', 'New', 'owner', repeat('a', 64))$$,
  '42501', null, 'a manager cannot invite an owner'
);
select throws_ok(
  $$select public.team_invite('62000000-0000-4000-a000-00000000000b',
    '62000000-0000-4000-b000-000000000001', '+972500000681', 'New', 'worker', 'not-a-hash')$$,
  '22023', null, 'a token hash must be 64 hex digits'
);
select throws_ok(
  $$select public.team_invite('62000000-0000-4000-a000-00000000000b',
    '62000000-0000-4000-b000-000000000001', '+972500000663', 'Again', 'worker', repeat('a', 64))$$,
  '23505', null, 'someone already in the team cannot be invited'
);
select throws_ok(
  $$select public.team_invite('62000000-0000-4000-a000-00000000000b',
    '62000000-0000-4000-b000-000000000001', '+972500000671', 'Partner', 'worker', repeat('a', 64))$$,
  '42501', null, 'a manager cannot change an owner''s invite'
);

-- A manager invites a worker.
create temporary table new_invite on commit drop as
select public.team_invite('62000000-0000-4000-a000-00000000000b',
  '62000000-0000-4000-b000-000000000001', '+972500000681', '  Gal  ', 'worker',
  repeat('a', 64)) as id;

select is(
  (select row(i.business_id, i.role, i.full_name, i.invited_by, i.token_hash)::text
   from public.invites i join new_invite n on n.id = i.id),
  row('62000000-0000-4000-b000-000000000001'::uuid, 'worker'::public.member_role,
    'Gal'::text, '62000000-0000-4000-a000-00000000000b'::uuid, repeat('a', 64))::text,
  'the invite is stored with the trimmed name, the role and who invited'
);
select ok(
  (select i.expires_at between now() + interval '13 days' and now() + interval '15 days'
   from public.invites i join new_invite n on n.id = i.id),
  'the invite is open for 14 days'
);
select is(
  (select count(*)::int from public.audit_log a join new_invite n
   on a.details ->> 'invite' = n.id::text
   where a.action = 'invite.create' and a.actor_id = '62000000-0000-4000-a000-00000000000b'),
  1, 'the new invite is in the audit log'
);

-- The same number again refreshes the same invite.
select is(
  public.team_invite('62000000-0000-4000-a000-00000000000b',
    '62000000-0000-4000-b000-000000000001', '+972500000681', '', 'manager', repeat('b', 64)),
  (select id from new_invite),
  'inviting the same number again returns the same invite'
);
select is(
  (select row(i.role, i.full_name, i.token_hash)::text
   from public.invites i join new_invite n on n.id = i.id),
  row('manager'::public.member_role, 'Gal'::text, repeat('b', 64))::text,
  'the refresh takes the new role and token and keeps the name when none was given'
);
select is(
  (select count(*)::int from public.invites where phone = '+972500000681'),
  1, 'there is still one invite for the number'
);

select ok(
  public.team_invite('62000000-0000-4000-a000-00000000000a',
    '62000000-0000-4000-b000-000000000001', '+972500000682', 'Co-owner', 'owner',
    repeat('c', 64)) is not null,
  'an owner may invite another owner'
);

-- A fresh link for an invite nobody claimed.
select is(
  public.team_invite_link('62000000-0000-4000-a000-00000000000b',
    '62000000-0000-4000-c000-000000000002', repeat('d', 64)),
  '+972500000672', 'a manager sends a new link for an expired worker invite'
);
select ok(
  (select expires_at > now() + interval '13 days' and token_hash = repeat('d', 64)
   from public.invites where id = '62000000-0000-4000-c000-000000000002'),
  'the expired invite is open again with the new token'
);
select throws_ok(
  $$select public.team_invite_link('62000000-0000-4000-a000-00000000000c',
    '62000000-0000-4000-c000-000000000002', repeat('e', 64))$$,
  '42501', null, 'a worker cannot send a link'
);
select throws_ok(
  $$select public.team_invite_link('62000000-0000-4000-a000-00000000000d',
    '62000000-0000-4000-c000-000000000002', repeat('e', 64))$$,
  '42501', null, 'a manager of another business cannot send a link here'
);
select throws_ok(
  $$select public.team_invite_link('62000000-0000-4000-a000-00000000000b',
    '62000000-0000-4000-c000-000000000001', repeat('e', 64))$$,
  '42501', null, 'a manager cannot send an owner''s invite'
);
select throws_ok(
  $$select public.team_invite_link('62000000-0000-4000-a000-00000000000a',
    '62000000-0000-4000-c000-000000000003', repeat('e', 64))$$,
  'P0002', null, 'a claimed invite gets no new link'
);
select throws_ok(
  $$select public.team_invite_link('62000000-0000-4000-a000-00000000000a',
    '62000000-0000-4000-c000-000000000002', 'nope')$$,
  '22023', null, 'a link''s token hash must be 64 hex digits'
);

select * from finish();
rollback;
