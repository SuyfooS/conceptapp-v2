-- Invite links: the team issues a link for an open invite, the join screen
-- reads it by token hash, and only the invited number can claim it, once.
begin;
select plan(19);

insert into auth.users (id, aud, role, phone)
values
  ('61000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500000651'),
  ('61000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500000652'),
  ('61000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500000653');

-- a: an onboarder; b: the invited person; c: someone else.
insert into public.platform_staff (user_id, role)
values ('61000000-0000-4000-a000-00000000000a', 'onboarder');

insert into public.businesses (id, slug, name)
values ('61000000-0000-4000-b000-000000000001', 'il-cafe', 'Link Cafe');

-- An earlier, inactive membership comes back with the invite's role.
insert into public.memberships (business_id, user_id, role, active)
values ('61000000-0000-4000-b000-000000000001',
  '61000000-0000-4000-a000-00000000000b', 'worker', false);

insert into public.invites (id, business_id, phone, role, full_name, token_hash, expires_at)
values
  ('61000000-0000-4000-c000-000000000001', '61000000-0000-4000-b000-000000000001',
   '+972500000652', 'manager', 'Shai', repeat('0', 64), now() - interval '1 day'),
  ('61000000-0000-4000-c000-000000000002', '61000000-0000-4000-b000-000000000001',
   '+972500000699', 'worker', null, repeat('9', 64), now() + interval '1 day');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- Nobody but the server may call them.
select pg_temp.sign_in('61000000-0000-4000-a000-00000000000a');
select throws_ok(
  $$select public.issue_invite_link('61000000-0000-4000-a000-00000000000a',
    '61000000-0000-4000-c000-000000000001', repeat('a', 64))$$,
  '42501', null, 'a signed-in person cannot issue links, even on the team'
);
select throws_ok(
  $$select public.invite_by_token(repeat('0', 64))$$,
  '42501', null, 'a signed-in person cannot look links up'
);
select throws_ok(
  $$select public.claim_invite(repeat('0', 64), '61000000-0000-4000-a000-00000000000b')$$,
  '42501', null, 'a signed-in person cannot claim through the function'
);
reset role;
set local role anon;
select throws_ok(
  $$select public.invite_by_token(repeat('0', 64))$$,
  '42501', null, 'an anonymous visitor cannot look links up'
);
reset role;

set local role service_role;
select is(
  public.invite_by_token(repeat('0', 64)) ->> 'status', 'expired',
  'an invite past its date reads as expired'
);
select throws_ok(
  $$select public.claim_invite(repeat('0', 64), '61000000-0000-4000-a000-00000000000b')$$,
  'P0002', null, 'an expired invite cannot be claimed'
);
select throws_ok(
  $$select public.issue_invite_link('61000000-0000-4000-a000-00000000000b',
    '61000000-0000-4000-c000-000000000001', repeat('a', 64))$$,
  '42501', null, 'someone off the team cannot issue a link'
);
select throws_ok(
  $$select public.issue_invite_link('61000000-0000-4000-a000-00000000000a',
    '61000000-0000-4000-c000-000000000001', 'not-a-hash')$$,
  '22023', null, 'a token hash must be 64 hex digits'
);
select is(
  public.issue_invite_link('61000000-0000-4000-a000-00000000000a',
    '61000000-0000-4000-c000-000000000001', repeat('a', 64)),
  '+972500000652',
  'the team issues a fresh link and gets the number to send it to'
);
select ok(
  (select expires_at > now() + interval '13 days' from public.invites
    where id = '61000000-0000-4000-c000-000000000001'),
  'a fresh link gives the invite another 14 days'
);
select is(
  public.invite_by_token(repeat('0', 64)), null,
  'the old link stops working'
);
select is(
  public.invite_by_token(repeat('a', 64)),
  jsonb_build_object(
    'id', '61000000-0000-4000-c000-000000000001',
    'phone', '+972500000652', 'role', 'manager', 'name', 'Shai',
    'business', jsonb_build_object('id', '61000000-0000-4000-b000-000000000001',
      'name', 'Link Cafe', 'accent', '#2563eb'),
    'status', 'open'),
  'the new link reads as open, with its business'
);
select throws_ok(
  $$select public.claim_invite(repeat('a', 64), '61000000-0000-4000-a000-00000000000c')$$,
  '42501', null, 'another number cannot claim the invite'
);
select is(
  public.claim_invite(repeat('a', 64), '61000000-0000-4000-a000-00000000000b'),
  '61000000-0000-4000-b000-000000000001'::uuid,
  'the invited number claims it'
);
reset role;

select results_eq(
  $$select role::text, active from public.memberships
    where business_id = '61000000-0000-4000-b000-000000000001'
      and user_id = '61000000-0000-4000-a000-00000000000b'$$,
  $$values ('manager'::text, true)$$,
  'the inactive membership comes back with the invite''s role'
);
select is(
  (select full_name from public.profiles where id = '61000000-0000-4000-a000-00000000000b'),
  'Shai', 'the invite''s name goes to a profile that had none'
);
select results_eq(
  $$select action, actor_id from public.audit_log
    where business_id = '61000000-0000-4000-b000-000000000001' order by id$$,
  $$values ('invite.send'::text, '61000000-0000-4000-a000-00000000000a'::uuid),
    ('invite.claim', '61000000-0000-4000-a000-00000000000b'::uuid)$$,
  'sending and claiming are both in the audit log'
);

set local role service_role;
select is(
  public.invite_by_token(repeat('a', 64)) ->> 'status', 'claimed',
  'a claimed link reads as claimed'
);
select throws_ok(
  $$select public.claim_invite(repeat('a', 64), '61000000-0000-4000-a000-00000000000b')$$,
  'P0002', null, 'a link is claimed once'
);
reset role;

select * from finish();
rollback;
