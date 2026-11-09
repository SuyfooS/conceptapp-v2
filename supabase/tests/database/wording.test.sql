-- Wording: members read their business's sentences and its template's, and
-- nobody else's; the team reads them while viewing; only the server writes,
-- for the team (a business) or a platform admin (a template), and each change
-- is logged.
begin;
select plan(26);

insert into auth.users (id, aud, role, phone)
values
  ('6f000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500000991'),
  ('6f000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500000992'),
  ('6f000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500000993'),
  ('6f000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500000994'),
  ('6f000000-0000-4000-a000-00000000000e', 'authenticated', 'authenticated', '972500000995');

-- a: owner of X (a shop); b: worker of X; c: manager of Y (a restaurant);
-- d: an onboarder; e: a platform admin.
insert into public.businesses (id, slug, name, template_key)
values
  ('6f000000-0000-4000-b000-000000000001', 'wd-shop', 'Wording Shop', 'retail'),
  ('6f000000-0000-4000-b000-000000000002', 'wd-place', 'Wording Place', 'restaurant');

insert into public.memberships (business_id, user_id, role)
values
  ('6f000000-0000-4000-b000-000000000001', '6f000000-0000-4000-a000-00000000000a', 'owner'),
  ('6f000000-0000-4000-b000-000000000001', '6f000000-0000-4000-a000-00000000000b', 'worker'),
  ('6f000000-0000-4000-b000-000000000002', '6f000000-0000-4000-a000-00000000000c', 'manager');

insert into public.platform_staff (user_id, role)
values
  ('6f000000-0000-4000-a000-00000000000d', 'onboarder'),
  ('6f000000-0000-4000-a000-00000000000e', 'platform_admin');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- Nobody but the server writes.
select ok(
  not has_function_privilege('authenticated', 'public.set_business_wording(uuid, uuid, text, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.set_business_wording(uuid, uuid, text, text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.set_template_wording(uuid, text, text, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.set_template_wording(uuid, text, text, text, text)', 'execute'),
  'browser roles may not change wording'
);
select ok(
  has_function_privilege('service_role', 'public.set_business_wording(uuid, uuid, text, text, text)', 'execute')
  and has_function_privilege('service_role', 'public.set_template_wording(uuid, text, text, text, text)', 'execute'),
  'the server may'
);

set local role service_role;

-- Who may write what.
select throws_ok(
  $$select public.set_business_wording('6f000000-0000-4000-a000-00000000000a',
    '6f000000-0000-4000-b000-000000000001', 'app.nav.home', 'הבית', 'היום')$$,
  '42501', null, 'an owner does not change wording in the first version'
);
select throws_ok(
  $$select public.set_template_wording('6f000000-0000-4000-a000-00000000000d',
    'retail', 'app.nav.home', 'הבית', 'היום')$$,
  '42501', null, 'an onboarder does not change a template'
);
select throws_ok(
  $$select public.set_business_wording('6f000000-0000-4000-a000-00000000000d',
    '6f000000-0000-4000-b000-0000000000ff', 'app.nav.home', 'הבית', 'היום')$$,
  'P0002', null, 'an unknown business is refused'
);
select throws_ok(
  $$select public.set_template_wording('6f000000-0000-4000-a000-00000000000e',
    'bakery', 'app.nav.home', 'הבית', 'היום')$$,
  'P0002', null, 'an unknown template is refused'
);
select throws_ok(
  $$select public.set_business_wording('6f000000-0000-4000-a000-00000000000d',
    '6f000000-0000-4000-b000-000000000001', 'admin.nav.businesses', 'עסקים', 'עסקים')$$,
  '23514', null, 'only sentences a business sees can be replaced'
);
select throws_ok(
  $$select public.set_business_wording('6f000000-0000-4000-a000-00000000000d',
    '6f000000-0000-4000-b000-000000000001', 'app.nav.home', '   ', 'היום')$$,
  '23514', null, 'an empty sentence is refused'
);

-- The team sets the sentences.
select is(
  public.set_template_wording('6f000000-0000-4000-a000-00000000000e',
    'retail', 'app.team.title', 'הצוות של החנות', 'הצוות'),
  null,
  'a platform admin sets a template sentence, which replaced nothing'
);
select is(
  public.set_template_wording('6f000000-0000-4000-a000-00000000000e',
    'restaurant', 'app.team.title', 'הצוות של המסעדה', 'הצוות'),
  null,
  'and another template''s'
);
select is(
  public.set_business_wording('6f000000-0000-4000-a000-00000000000d',
    '6f000000-0000-4000-b000-000000000001', 'app.nav.home', '  הבית  ', 'היום'),
  null,
  'an onboarder sets a business sentence'
);
select is(
  public.set_business_wording('6f000000-0000-4000-a000-00000000000d',
    '6f000000-0000-4000-b000-000000000001', 'app.nav.home', 'החנות היום', 'היום'),
  'הבית',
  'changing it again returns what it replaced, trimmed, for an undo'
);
select is(
  public.set_business_wording('6f000000-0000-4000-a000-00000000000d',
    '6f000000-0000-4000-b000-000000000002', 'app.nav.home', 'המסעדה היום', 'היום'),
  null,
  'and another business''s'
);
reset role;

-- Who reads what.
select pg_temp.sign_in('6f000000-0000-4000-a000-00000000000b');
select results_eq(
  $$select key, sentence from public.business_wording order by key$$,
  $$values ('app.nav.home'::text, 'החנות היום'::text)$$,
  'a worker reads their business''s sentences and no other'
);
select results_eq(
  $$select template_key, sentence from public.template_wording order by template_key$$,
  $$values ('retail'::text, 'הצוות של החנות'::text)$$,
  'and their template''s, and no other'
);
reset role;
select pg_temp.sign_in('6f000000-0000-4000-a000-00000000000c');
select set_eq(
  $$select sentence from public.business_wording
    union all select sentence from public.template_wording$$,
  $$values ('המסעדה היום'::text), ('הצוות של המסעדה'::text)$$,
  'a manager elsewhere reads only their own'
);
select throws_ok(
  $$insert into public.business_wording (business_id, key, sentence, base_sentence)
    values ('6f000000-0000-4000-b000-000000000002', 'app.nav.home', 'x', 'היום')$$,
  '42501', null, 'a member cannot write a sentence'
);
select throws_ok(
  $$delete from public.template_wording$$,
  '42501', null, 'or delete a template''s'
);
reset role;
select pg_temp.sign_in('6f000000-0000-4000-a000-00000000000d');
select is(
  (select count(*)::integer from public.business_wording)
    + (select count(*)::integer from public.template_wording),
  0,
  'the team reads nothing without viewing a business'
);
reset role;

-- Viewing X as a worker, the team reads X's sentences and its template's.
insert into public.view_sessions (staff_id, business_id, role)
values ('6f000000-0000-4000-a000-00000000000d', '6f000000-0000-4000-b000-000000000001', 'worker');
select pg_temp.sign_in('6f000000-0000-4000-a000-00000000000d');
select set_eq(
  $$select sentence from public.business_wording
    union all select sentence from public.template_wording$$,
  $$values ('החנות היום'::text), ('הצוות של החנות'::text)$$,
  'viewing a business reads its sentences'
);
reset role;
set local role anon;
select throws_ok(
  $$select 1 from public.business_wording$$,
  '42501', null, 'an anonymous visitor reads no sentences'
);
reset role;

-- Clearing brings back the layer below, and every change is logged.
set local role service_role;
select is(
  public.set_business_wording('6f000000-0000-4000-a000-00000000000d',
    '6f000000-0000-4000-b000-000000000001', 'app.nav.home', null, null),
  'החנות היום',
  'clearing a sentence returns it'
);
select is(
  (select count(*)::integer from public.business_wording
   where business_id = '6f000000-0000-4000-b000-000000000001'),
  0,
  'and removes it'
);
select results_eq(
  $$select details ->> 'from', details ->> 'to' from public.audit_log
    where business_id = '6f000000-0000-4000-b000-000000000001'
      and action = 'wording.change'
    order by id$$,
  $$values (null::text, 'הבית'::text), ('הבית', 'החנות היום'), ('החנות היום', null)$$,
  'the business log holds each change, from and to'
);
select is(
  (select count(*)::integer from public.audit_log
   where business_id is null and action = 'wording.change'
     and details ->> 'template' in ('retail', 'restaurant')),
  2,
  'a template change is logged with no business'
);
reset role;

-- A business's sentences go with it; its template's stay.
delete from public.businesses where id = '6f000000-0000-4000-b000-000000000002';
select results_eq(
  $$select (select count(*)::integer from public.business_wording
              where business_id = '6f000000-0000-4000-b000-000000000002'),
           (select count(*)::integer from public.template_wording
              where template_key = 'restaurant' and key = 'app.team.title')$$,
  $$values (0, 1)$$,
  'deleting a business removes its sentences and keeps its template''s'
);

select * from finish();
rollback;
