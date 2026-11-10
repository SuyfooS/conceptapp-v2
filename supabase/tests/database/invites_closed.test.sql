-- Invites nobody may send or claim (20261108000300_sealed.sql): a demo business
-- takes none, unless its definition opens it (the local seed's, for the
-- browser tests); the console makes an owner only of a business with none,
-- and an owner invite no owner sent can't be claimed once the business has
-- one. Such an invite reads as expired on the join screen. The server asks
-- which businesses are closed (20261110001200_invites_open.sql), so the Team
-- screen offers no invite in one.
begin;
select plan(29);

insert into auth.users (id, aud, role, phone)
values
  ('6c000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500000971'),
  ('6c000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500000972'),
  ('6c000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500000973'),
  ('6c000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500000974'),
  ('6c000000-0000-4000-a000-00000000000e', 'authenticated', 'authenticated', '972500000975'),
  ('6c000000-0000-4000-a000-00000000000f', 'authenticated', 'authenticated', '972500000976');

-- D: a demo business, owned by a; O: a demo business opened to invites,
-- owned by b; R: a real business owned by c; N: a new business with no owner
-- yet. s is on the ConceptApp team; e and f have no business.
insert into public.businesses (id, slug, name)
values
  ('6c000000-0000-4000-b000-000000000001', 'closed-demo', 'Closed demo'),
  ('6c000000-0000-4000-b000-000000000002', 'open-demo', 'Open demo'),
  ('6c000000-0000-4000-b000-000000000003', 'closed-real', 'Real'),
  ('6c000000-0000-4000-b000-000000000004', 'closed-new', 'New');

insert into private.demo_businesses (business_id, definition)
values
  ('6c000000-0000-4000-b000-000000000001', '{"people": []}'),
  ('6c000000-0000-4000-b000-000000000002', '{"people": [], "invites": true}');

insert into public.memberships (business_id, user_id, role)
values
  ('6c000000-0000-4000-b000-000000000001', '6c000000-0000-4000-a000-00000000000a', 'owner'),
  ('6c000000-0000-4000-b000-000000000002', '6c000000-0000-4000-a000-00000000000b', 'owner'),
  ('6c000000-0000-4000-b000-000000000003', '6c000000-0000-4000-a000-00000000000c', 'owner');

insert into public.platform_staff (user_id, role)
values ('6c000000-0000-4000-a000-00000000000d', 'onboarder');

-- Invites already there: in D; and in R, an owner invite from the team (sent
-- before c joined) and one from c.
insert into public.invites (id, business_id, phone, role, token_hash, invited_by)
values
  ('6c000000-0000-4000-c000-000000000001', '6c000000-0000-4000-b000-000000000001',
   '+972500000975', 'worker', repeat('1', 64), '6c000000-0000-4000-a000-00000000000a'),
  ('6c000000-0000-4000-c000-000000000002', '6c000000-0000-4000-b000-000000000003',
   '+972500000975', 'owner', repeat('2', 64), '6c000000-0000-4000-a000-00000000000d'),
  ('6c000000-0000-4000-c000-000000000003', '6c000000-0000-4000-b000-000000000003',
   '+972500000976', 'owner', repeat('3', 64), '6c000000-0000-4000-a000-00000000000c');

set local role service_role;

-- Demo businesses.
select throws_ok(
  $$select public.team_invite('6c000000-0000-4000-a000-00000000000a', '6c000000-0000-4000-b000-000000000001',
    '+972500000979', 'Visitor', 'worker', repeat('4', 64))$$,
  '55000', 'A demo business takes no invites', 'a demo business''s owner invites nobody'
);
select throws_ok(
  $$select public.team_invite_link('6c000000-0000-4000-a000-00000000000a',
    '6c000000-0000-4000-c000-000000000001', repeat('5', 64))$$,
  '55000', 'A demo business takes no invites', 'nor sends a fresh link for an invite it has'
);
select throws_ok(
  $$select public.admin_invite('6c000000-0000-4000-a000-00000000000d', '6c000000-0000-4000-b000-000000000001',
    '+972500000979', 'Visitor', 'worker', repeat('6', 64))$$,
  '55000', 'A demo business takes no invites', 'the console invites nobody to a demo business'
);
select throws_ok(
  $$select public.issue_invite_link('6c000000-0000-4000-a000-00000000000d',
    '6c000000-0000-4000-c000-000000000001', repeat('7', 64))$$,
  '55000', 'A demo business takes no invites', 'nor renews an invite in one'
);
select is(
  public.invite_by_token(repeat('1', 64)) ->> 'status',
  'expired',
  'a demo business''s invite reads as expired'
);
select throws_ok(
  $$select public.claim_invite(repeat('1', 64), '6c000000-0000-4000-a000-00000000000e')$$,
  'P0002', 'No open invite', 'and nobody joins a demo business through one'
);
select lives_ok(
  $$select public.team_invite('6c000000-0000-4000-a000-00000000000b', '6c000000-0000-4000-b000-000000000002',
    '+972500000979', 'Tester', 'worker', repeat('8', 64))$$,
  'a demo business opened to invites takes them'
);
select lives_ok(
  $$select public.team_invite('6c000000-0000-4000-a000-00000000000c', '6c000000-0000-4000-b000-000000000003',
    '+972500000979', 'Worker', 'worker', repeat('9', 64))$$,
  'a real business invites as before'
);

-- What the Team screen asks first.
select is(
  public.closed_to_invites('6c000000-0000-4000-b000-000000000001'),
  true,
  'the server reads a demo business as closed to invites'
);
select is(
  public.closed_to_invites('6c000000-0000-4000-b000-000000000002'),
  false,
  'one its definition opens as open'
);
select is(
  public.closed_to_invites('6c000000-0000-4000-b000-000000000003'),
  false,
  'and a real business as open'
);

-- The owner role from the console.
select throws_ok(
  $$select public.admin_invite('6c000000-0000-4000-a000-00000000000d', '6c000000-0000-4000-b000-000000000003',
    '+972500000978', 'Partner', 'owner', repeat('a', 64))$$,
  '23P01', 'The business has an owner, who invites another',
  'the console makes no second owner'
);
select throws_ok(
  $$select public.admin_invite('6c000000-0000-4000-a000-00000000000d', '6c000000-0000-4000-b000-000000000003',
    '+972500000975', 'Partner', 'owner', repeat('b', 64))$$,
  '23P01', 'The business has an owner, who invites another',
  'not even by renewing an owner invite it sent before'
);
select lives_ok(
  $$select public.admin_invite('6c000000-0000-4000-a000-00000000000d', '6c000000-0000-4000-b000-000000000003',
    '+972500000978', 'Manager', 'manager', repeat('c', 64))$$,
  'the console still adds a manager to it'
);
select lives_ok(
  $$select public.admin_invite('6c000000-0000-4000-a000-00000000000d', '6c000000-0000-4000-b000-000000000004',
    '+972500000978', 'First owner', 'owner', repeat('d', 64))$$,
  'and an owner to a business that has none'
);
select throws_ok(
  $$select public.issue_invite_link('6c000000-0000-4000-a000-00000000000d',
    '6c000000-0000-4000-c000-000000000002', repeat('e', 64))$$,
  '23P01', 'The business has an owner, who invites another',
  'the console renews no owner invite of a business that has an owner'
);
select lives_ok(
  $$select public.issue_invite_link('6c000000-0000-4000-a000-00000000000d',
    '6c000000-0000-4000-c000-000000000003', repeat('f', 64))$$,
  'unless its owner sent it'
);
select is(
  public.invite_by_token(repeat('2', 64)) ->> 'status',
  'expired',
  'an owner invite from the team reads as expired once the business has an owner'
);
select is(
  public.invite_by_token(repeat('f', 64)) ->> 'status',
  'open',
  'one from the owner is open'
);
select throws_ok(
  $$select public.claim_invite(repeat('2', 64), '6c000000-0000-4000-a000-00000000000e')$$,
  'P0002', 'No open invite', 'nobody becomes a second owner through the team''s old invite'
);
select lives_ok(
  $$select public.claim_invite(repeat('f', 64), '6c000000-0000-4000-a000-00000000000f')$$,
  'a second owner joins through the owner''s invite'
);
select lives_ok(
  $$select public.team_invite_link('6c000000-0000-4000-a000-00000000000c',
    '6c000000-0000-4000-c000-000000000002', repeat('0', 64))$$,
  'the owner sends a fresh link for the team''s old owner invite'
);
select is(
  public.invite_by_token(repeat('0', 64)) ->> 'status',
  'open',
  'and it opens, since the owner now stands behind it'
);
reset role;
select is(
  (select count(*)::int from public.memberships
   where business_id = '6c000000-0000-4000-b000-000000000003' and role = 'owner' and active),
  2,
  'so the business has the owners its owner chose'
);

-- Still for the secret key only.
select ok(
  not has_function_privilege('authenticated', 'public.claim_invite(text, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.claim_invite(text, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.invite_by_token(text)', 'execute')
  and not has_function_privilege('anon', 'public.invite_by_token(text)', 'execute'),
  'nobody signed in, or signed out, calls the join functions'
);
select ok(
  not has_function_privilege('authenticated',
    'public.team_invite(uuid, uuid, text, text, public.member_role, text)', 'execute')
  and not has_function_privilege('authenticated',
    'public.admin_invite(uuid, uuid, text, text, public.member_role, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.team_invite_link(uuid, uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.issue_invite_link(uuid, uuid, text)', 'execute'),
  'nor the invite functions'
);
select ok(
  not has_function_privilege('authenticated', 'private.invite_closed(uuid, public.member_role, uuid)', 'execute')
  and not has_function_privilege('anon', 'private.closed_to_invites(uuid)', 'execute'),
  'the private checks are the server functions'' own'
);
select ok(
  not has_function_privilege('authenticated', 'public.closed_to_invites(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.closed_to_invites(uuid)', 'execute'),
  'browser roles cannot ask which businesses are closed to invites'
);
select ok(
  has_function_privilege('service_role', 'public.closed_to_invites(uuid)', 'execute'),
  'the server can'
);

select * from finish();
rollback;
