-- The console sets up people: the ConceptApp team invites a number in any
-- role, renews an invite that expired, and sees expired invites on the
-- business and the list. Only the server writes; only the team reads.
begin;
select plan(22);

insert into auth.users (id, aud, role, phone)
values
  ('6e000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500000981'),
  ('6e000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500000982'),
  ('6e000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500000983');

-- a: an onboarder; b: the business's manager; c: nobody in particular.
insert into public.platform_staff (user_id, role)
values ('6e000000-0000-4000-a000-00000000000a', 'onboarder');

insert into public.businesses (id, slug, name)
values ('6e000000-0000-4000-b000-000000000001', 'cp-shop', 'Console Shop');

insert into public.memberships (business_id, user_id, role)
values ('6e000000-0000-4000-b000-000000000001', '6e000000-0000-4000-a000-00000000000b', 'manager');

-- An owner invite that ran out, and a worker invite still open.
insert into public.invites (id, business_id, phone, role, full_name, token_hash, expires_at)
values
  ('6e000000-0000-4000-c000-000000000001', '6e000000-0000-4000-b000-000000000001',
   '+972500000984', 'owner', 'Dana', repeat('0', 64), now() - interval '1 day'),
  ('6e000000-0000-4000-c000-000000000002', '6e000000-0000-4000-b000-000000000001',
   '+972500000985', 'worker', null, repeat('1', 64), now() + interval '3 days');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- Only the server may invite from the console.
select ok(
  not has_function_privilege('authenticated',
    'public.admin_invite(uuid, uuid, text, text, public.member_role, text)', 'execute')
  and not has_function_privilege('anon',
    'public.admin_invite(uuid, uuid, text, text, public.member_role, text)', 'execute'),
  'browser roles may not invite from the console'
);
select pg_temp.sign_in('6e000000-0000-4000-a000-00000000000a');
select throws_ok(
  $$select public.admin_invite('6e000000-0000-4000-a000-00000000000a',
    '6e000000-0000-4000-b000-000000000001', '+972500000986', 'Noam', 'worker', repeat('a', 64))$$,
  '42501', null, 'not even a signed-in onboarder, from the browser'
);
reset role;

-- What the console sees: members first, then open invites, then expired ones.
select pg_temp.sign_in('6e000000-0000-4000-a000-00000000000a');
select results_eq(
  $$select p ->> 'status', p ->> 'role', p ->> 'name'
    from jsonb_array_elements(public.admin_business('cp-shop') -> 'people')
      with ordinality as people (p, n)
    order by n$$,
  $$values ('member'::text, 'manager'::text, ''::text),
           ('invited', 'worker', ''),
           ('expired', 'owner', 'Dana')$$,
  'the business shows its members, its open invites and the expired one'
);
select ok(
  (select (p ->> 'expires_at')::timestamptz < now()
   from jsonb_array_elements(public.admin_business('cp-shop') -> 'people') p
   where p ->> 'status' = 'expired'),
  'with when it ran out'
);
select results_eq(
  $$select members, open_invites, expired_invites
    from public.admin_businesses() where slug = 'cp-shop'$$,
  $$values (1::bigint, 1::bigint, 1::bigint)$$,
  'the list counts expired invites apart'
);
reset role;
select pg_temp.sign_in('6e000000-0000-4000-a000-00000000000b');
select throws_ok(
  $$select public.admin_business('cp-shop')$$,
  '42501', null, 'a manager does not read the console'
);
reset role;

set local role service_role;

-- Someone not on the team is refused.
select throws_ok(
  $$select public.admin_invite('6e000000-0000-4000-a000-00000000000c',
    '6e000000-0000-4000-b000-000000000001', '+972500000986', 'Noam', 'worker', repeat('a', 64))$$,
  '42501', null, 'only the ConceptApp team invites from the console'
);
select throws_ok(
  $$select public.admin_invite('6e000000-0000-4000-a000-00000000000a',
    '6e000000-0000-4000-b000-000000000001', '+972500000986', 'Noam', 'worker', 'short')$$,
  '22023', null, 'a token hash that is not 64 hex digits is refused'
);
select throws_ok(
  $$select public.admin_invite('6e000000-0000-4000-a000-00000000000a',
    '6e000000-0000-4000-b000-0000000000ff', '+972500000986', 'Noam', 'worker', repeat('a', 64))$$,
  'P0002', null, 'an unknown business is refused'
);
select throws_ok(
  $$select public.admin_invite('6e000000-0000-4000-a000-00000000000a',
    '6e000000-0000-4000-b000-000000000001', '+972500000982', 'Again', 'worker', repeat('a', 64))$$,
  '23505', null, 'someone already in the team is not invited again'
);

-- A new number, in any role.
create temporary table ids (name text primary key, id uuid) on commit drop;
insert into ids values ('new', public.admin_invite('6e000000-0000-4000-a000-00000000000a',
  '6e000000-0000-4000-b000-000000000001', '+972500000986', '  Noam ', 'owner', repeat('a', 64)));
select results_eq(
  $$select phone, role::text, full_name, token_hash, invited_by
    from public.invites where id = (select id from ids where name = 'new')$$,
  $$values ('+972500000986'::text, 'owner'::text, 'Noam'::text, repeat('a', 64),
    '6e000000-0000-4000-a000-00000000000a'::uuid)$$,
  'the team invites a new number, even as an owner'
);
select ok(
  (select expires_at between now() + interval '13 days' and now() + interval '15 days'
   from public.invites where id = (select id from ids where name = 'new')),
  'for 14 days'
);
select is(
  (select action || ' ' || (details ->> 'role') from public.audit_log
   where business_id = '6e000000-0000-4000-b000-000000000001'
     and details ->> 'invite' = (select id::text from ids where name = 'new')),
  'invite.create owner',
  'and the log says who was invited, in which role'
);

-- The expired owner invite: inviting the number again renews it.
insert into ids values ('renewed', public.admin_invite('6e000000-0000-4000-a000-00000000000a',
  '6e000000-0000-4000-b000-000000000001', '+972500000984', '', 'owner', repeat('b', 64)));
select is(
  (select id from ids where name = 'renewed'),
  '6e000000-0000-4000-c000-000000000001'::uuid,
  'a number whose invite expired gets that invite back'
);
select results_eq(
  $$select full_name, token_hash, expires_at > now() + interval '13 days'
    from public.invites where id = '6e000000-0000-4000-c000-000000000001'$$,
  $$values ('Dana'::text, repeat('b', 64), true)$$,
  'with its name kept, a new link and 14 more days'
);
select is(
  (select count(*)::integer from public.invites
   where business_id = '6e000000-0000-4000-b000-000000000001' and phone = '+972500000984'),
  1,
  'and no second invite for the number'
);
select is(
  (select action from public.audit_log
   where business_id = '6e000000-0000-4000-b000-000000000001'
     and details ->> 'invite' = '6e000000-0000-4000-c000-000000000001'),
  'invite.send',
  'logged as a new link'
);

-- issue_invite_link renews an expired invite too, which the console's
-- "new link" button relies on.
update public.invites set expires_at = now() - interval '1 day'
where id = '6e000000-0000-4000-c000-000000000002';
select lives_ok(
  $$select public.issue_invite_link('6e000000-0000-4000-a000-00000000000a',
    '6e000000-0000-4000-c000-000000000002', repeat('c', 64))$$,
  'a new link for an expired invite'
);
select ok(
  (select expires_at > now() from public.invites where id = '6e000000-0000-4000-c000-000000000002'),
  'opens it again'
);
reset role;

-- And the business is no longer stuck.
select pg_temp.sign_in('6e000000-0000-4000-a000-00000000000a');
select is(
  (select count(*)::integer
   from jsonb_array_elements(public.admin_business('cp-shop') -> 'people') p
   where p ->> 'status' = 'expired'),
  0,
  'nothing expired is left on the business'
);
select results_eq(
  $$select open_invites, expired_invites from public.admin_businesses() where slug = 'cp-shop'$$,
  $$values (3::bigint, 0::bigint)$$,
  'and the list counts three open invites'
);
reset role;

-- The new function is in the console's set of server-only writes.
select ok(
  has_function_privilege('service_role',
    'public.admin_invite(uuid, uuid, text, text, public.member_role, text)', 'execute'),
  'the server may invite from the console'
);

select * from finish();
rollback;
