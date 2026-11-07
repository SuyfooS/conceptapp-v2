-- A business's own details: only the server writes. An owner, a manager or the
-- ConceptApp team saves some of them, and the rest stays. Nobody reaches another
-- business, what doesn't fit is refused whole, and only real changes go to the
-- audit log.
begin;
select plan(34);

insert into auth.users (id, aud, role, phone)
values
  ('6b000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500000931'),
  ('6b000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500000932'),
  ('6b000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500000933'),
  ('6b000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500000934'),
  ('6b000000-0000-4000-a000-00000000000e', 'authenticated', 'authenticated', '972500000935'),
  ('6b000000-0000-4000-a000-00000000000f', 'authenticated', 'authenticated', '972500000936');

-- a: owner of X; b: manager of X; c: worker of X; d: manager of Y; e: on the team;
-- f: manager of X who has left.
insert into public.businesses (id, slug, name, accent, address)
values
  ('6b000000-0000-4000-b000-000000000001', 'bd-x', 'Details X', '#2563eb', 'Old street 1'),
  ('6b000000-0000-4000-b000-000000000002', 'bd-y', 'Details Y', '#2563eb', null);

insert into public.memberships (business_id, user_id, role, active)
values
  ('6b000000-0000-4000-b000-000000000001', '6b000000-0000-4000-a000-00000000000a', 'owner', true),
  ('6b000000-0000-4000-b000-000000000001', '6b000000-0000-4000-a000-00000000000b', 'manager', true),
  ('6b000000-0000-4000-b000-000000000001', '6b000000-0000-4000-a000-00000000000c', 'worker', true),
  ('6b000000-0000-4000-b000-000000000002', '6b000000-0000-4000-a000-00000000000d', 'manager', true),
  ('6b000000-0000-4000-b000-000000000001', '6b000000-0000-4000-a000-00000000000f', 'manager', false);

insert into public.platform_staff (user_id, role)
values ('6b000000-0000-4000-a000-00000000000e', 'onboarder');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- Nobody but the server writes.
select pg_temp.sign_in('6b000000-0000-4000-a000-00000000000b');
select throws_ok(
  $$select public.set_business_details('6b000000-0000-4000-a000-00000000000b',
    '6b000000-0000-4000-b000-000000000001', '{"name": "Mine"}')$$,
  '42501', null, 'a signed-in manager cannot call it directly'
);
reset role;
select pg_temp.sign_in('6b000000-0000-4000-a000-00000000000a');
select throws_ok(
  $$update public.businesses set name = 'Direct'
    where id = '6b000000-0000-4000-b000-000000000001'$$,
  '42501', null, 'an owner can no longer write the row from the browser'
);
reset role;
set local role anon;
select throws_ok(
  $$select public.set_business_details('6b000000-0000-4000-a000-00000000000e',
    '6b000000-0000-4000-b000-000000000001', '{"name": "Mine"}')$$,
  '42501', null, 'an anonymous visitor cannot call it'
);
reset role;

set local role service_role;

-- Who may save, and what stays.
select lives_ok(
  $$select public.set_business_details('6b000000-0000-4000-a000-00000000000b',
    '6b000000-0000-4000-b000-000000000001', '{"name": "  Renamed X  "}')$$,
  'a manager renames the business'
);
select is(
  (select name from public.businesses where id = '6b000000-0000-4000-b000-000000000001'),
  'Renamed X',
  'the name is stored trimmed'
);
select is(
  (select accent || ' ' || address from public.businesses
    where id = '6b000000-0000-4000-b000-000000000001'),
  '#2563eb Old street 1',
  'the other details stay'
);
select lives_ok(
  $$select public.set_business_details('6b000000-0000-4000-a000-00000000000a',
    '6b000000-0000-4000-b000-000000000001', '{"accent": "#AA3300"}')$$,
  'an owner changes the colour'
);
select is(
  (select accent from public.businesses where id = '6b000000-0000-4000-b000-000000000001'),
  '#aa3300',
  'colours are stored in lower case'
);
select lives_ok(
  $$select public.set_business_details('6b000000-0000-4000-a000-00000000000e',
    '6b000000-0000-4000-b000-000000000001', '{"shabbat_city": "jerusalem"}')$$,
  'the team sets the city'
);
select is(
  (select shabbat_city from public.businesses where id = '6b000000-0000-4000-b000-000000000001'),
  'jerusalem',
  'the city is stored'
);
select lives_ok(
  $$select public.set_business_details('6b000000-0000-4000-a000-00000000000b',
    '6b000000-0000-4000-b000-000000000001', '{"address": "   "}')$$,
  'a manager clears the address'
);
select is(
  (select address from public.businesses where id = '6b000000-0000-4000-b000-000000000001'),
  null,
  'a blank address is no address'
);
select throws_ok(
  $$select public.set_business_details('6b000000-0000-4000-a000-00000000000c',
    '6b000000-0000-4000-b000-000000000001', '{"name": "Mine"}')$$,
  '42501', null, 'a worker cannot'
);
select throws_ok(
  $$select public.set_business_details('6b000000-0000-4000-a000-00000000000f',
    '6b000000-0000-4000-b000-000000000001', '{"name": "Mine"}')$$,
  '42501', null, 'a manager who left cannot'
);
select throws_ok(
  $$select public.set_business_details('6b000000-0000-4000-a000-00000000000d',
    '6b000000-0000-4000-b000-000000000001', '{"name": "Mine"}')$$,
  '42501', null, 'a manager of another business cannot'
);

-- The wrong shape.
select throws_ok(
  $$select public.set_business_details('6b000000-0000-4000-a000-00000000000b',
    '6b000000-0000-4000-b000-000000000001', '[1]')$$,
  '22023', null, 'details must be an object'
);
select throws_ok(
  $$select public.set_business_details('6b000000-0000-4000-a000-00000000000b',
    '6b000000-0000-4000-b000-000000000001', '{}')$$,
  '22023', null, 'with something in it'
);
select throws_ok(
  $$select public.set_business_details('6b000000-0000-4000-a000-00000000000e',
    '6b000000-0000-4000-b000-000000000001', '{"slug": "elsewhere"}')$$,
  '22023', null, 'the slug is not a detail it changes'
);
select throws_ok(
  $$select public.set_business_details('6b000000-0000-4000-a000-00000000000b',
    '6b000000-0000-4000-b000-000000000001', '{"name": 5}')$$,
  '22023', null, 'a name is text'
);
select throws_ok(
  $$select public.set_business_details('6b000000-0000-4000-a000-00000000000b',
    '6b000000-0000-4000-b000-000000000001', '{"name": null}')$$,
  '22023', null, 'a business always has a name'
);

-- What doesn't fit the table.
select throws_ok(
  $$select public.set_business_details('6b000000-0000-4000-a000-00000000000b',
    '6b000000-0000-4000-b000-000000000001', '{"name": "   "}')$$,
  '23514', null, 'a blank name is refused'
);
select throws_ok(
  $$select public.set_business_details('6b000000-0000-4000-a000-00000000000b',
    '6b000000-0000-4000-b000-000000000001', '{"accent": "blue"}')$$,
  '23514', null, 'a colour is a hex colour'
);
select throws_ok(
  $$select public.set_business_details('6b000000-0000-4000-a000-00000000000b',
    '6b000000-0000-4000-b000-000000000001', jsonb_build_object('address', repeat('a', 201)))$$,
  '23514', null, 'an address of more than 200 characters is refused'
);
select throws_ok(
  $$select public.set_business_details('6b000000-0000-4000-a000-00000000000b',
    '6b000000-0000-4000-b000-000000000001', '{"shabbat_city": "Tel Aviv"}')$$,
  '23514', null, 'a city is a key, not a name'
);
select throws_ok(
  $$select public.set_business_details('6b000000-0000-4000-a000-00000000000b',
    '6b000000-0000-4000-b000-000000000001', '{"name": "Fine", "accent": "blue"}')$$,
  '23514', null, 'one bad field refuses the whole save'
);
select is(
  (select name from public.businesses where id = '6b000000-0000-4000-b000-000000000001'),
  'Renamed X',
  'so the good field did not save either'
);

-- The audit log keeps what changed, and only that.
select is(
  (select count(*)::int from public.audit_log
    where business_id = '6b000000-0000-4000-b000-000000000001' and action = 'business.details'),
  4,
  'each saved change is in the log, and nothing refused'
);
select is(
  (select details from public.audit_log
    where business_id = '6b000000-0000-4000-b000-000000000001'
      and action = 'business.details'
      and actor_id = '6b000000-0000-4000-a000-00000000000b'
      and details -> 'to' ? 'name'),
  '{"from": {"name": "Details X"}, "to": {"name": "Renamed X"}}'::jsonb,
  'the log has the name before and after'
);
select lives_ok(
  $$select public.set_business_details('6b000000-0000-4000-a000-00000000000b',
    '6b000000-0000-4000-b000-000000000001', '{"name": "Renamed X", "accent": "#AA3300"}')$$,
  'saving what is already there works'
);
select is(
  (select count(*)::int from public.audit_log
    where business_id = '6b000000-0000-4000-b000-000000000001' and action = 'business.details'),
  4,
  'and is not logged'
);
select lives_ok(
  $$select public.set_business_details('6b000000-0000-4000-a000-00000000000e',
    '6b000000-0000-4000-b000-000000000001', '{"name": "Details X", "accent": "#aa3300"}')$$,
  'the team saves two fields, one of them unchanged'
);
select is(
  (select details from public.audit_log
    where business_id = '6b000000-0000-4000-b000-000000000001'
      and action = 'business.details'
      and actor_id = '6b000000-0000-4000-a000-00000000000e'
      and details -> 'to' ? 'name'),
  '{"from": {"name": "Renamed X"}, "to": {"name": "Details X"}}'::jsonb,
  'only the field that changed is logged'
);

-- Only that business.
select is(
  (select name || ' ' || accent from public.businesses
    where id = '6b000000-0000-4000-b000-000000000002'),
  'Details Y #2563eb',
  'the other business is untouched'
);
select throws_ok(
  $$select public.set_business_details('6b000000-0000-4000-a000-00000000000e',
    '6b000000-0000-4000-b000-0000000000ff', '{"name": "Nowhere"}')$$,
  'P0002', null, 'a business that does not exist'
);
reset role;

select * from finish();
rollback;
