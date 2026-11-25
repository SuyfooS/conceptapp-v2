-- Who hasn't got a link yet (20261128000200_invite_links_pending.sql;
-- inviting from a list, part 2): invites.link_pending, marked once from the
-- audit log for the invites saved before, set by the console's wizard
-- (public.create_business), and cleared by whichever function next makes the
-- invite a link, by a trigger, never by a cancel. Read under the invites'
-- policy as before. The Team screen's first link
-- (public.team_invite_first_link) is refused once one was made, and the
-- console says 'pending' for these, never 'expired' (public.admin_business,
-- public.admin_businesses).
begin;
select plan(45);

insert into auth.users (id, aud, role, phone)
values
  ('c5000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500007601'),
  ('c5000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500007602'),
  ('c5000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500007603'),
  ('c5000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500007604'),
  ('c5000000-0000-4000-a000-00000000000e', 'authenticated', 'authenticated', '972500007605');

-- a: an onboarder; b: the owner of X (the wizard's); c: a worker of X;
-- d: a manager of Y; e: someone who joined Y.
insert into public.platform_staff (user_id, role)
values ('c5000000-0000-4000-a000-00000000000a', 'onboarder');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
-- The business the wizard opens below.
create function pg_temp.x() returns uuid language sql as $$
  select b.id from public.businesses b where b.slug = 'ilp-x'
$$;
-- X's invite to this number, claimed or not (one each here).
create function pg_temp.inv(number text) returns uuid language sql as $$
  select i.id from public.invites i
  where i.business_id = pg_temp.x() and i.phone = number
$$;
create function pg_temp.pending(number text) returns boolean language sql as $$
  select i.link_pending from public.invites i where i.id = pg_temp.inv(number)
$$;
create function pg_temp.hash(number text) returns text language sql as $$
  select i.token_hash from public.invites i where i.id = pg_temp.inv(number)
$$;
-- Why a first link is refused: its SQLSTATE, then its hint if it has one;
-- 'made' when it is not.
create function pg_temp.first_link_refusal(actor uuid, invite uuid)
returns text language plpgsql as $$
declare
  why text;
begin
  perform public.team_invite_first_link(actor, invite, repeat('9', 64));
  return 'made';
exception when others then
  get stacked diagnostics why = pg_exception_hint;
  return sqlstate || coalesce(' ' || nullif(why, ''), '');
end;
$$;

-- 1. The column ---------------------------------------------------------------
select has_column('public', 'invites', 'link_pending',
  'an invite says whether a link was ever made for it');
select col_not_null('public', 'invites', 'link_pending', 'never unknown');
select is(
  (select c.column_default::text from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'invites'
      and c.column_name = 'link_pending'),
  'false',
  'false unless its writer says so'
);

-- 2. The invites saved before: marked once, from the log ----------------------
insert into public.businesses (id, slug, name)
values ('c5000000-0000-4000-b000-000000000002', 'ilp-y', 'Pending Y');
insert into public.memberships (business_id, user_id, role)
values
  ('c5000000-0000-4000-b000-000000000002', 'c5000000-0000-4000-a000-00000000000d', 'manager'),
  ('c5000000-0000-4000-b000-000000000002', 'c5000000-0000-4000-a000-00000000000e', 'worker');

-- Saved before the column, so false: one nobody was sent, one sent, one made
-- with its link, one claimed, and one only another business's log names.
insert into public.invites (id, business_id, phone, role, full_name, token_hash, claimed_at, claimed_by)
values
  ('c5000000-0000-4000-c000-000000000001', 'c5000000-0000-4000-b000-000000000002',
   '+972500007621', 'worker', 'Never sent', repeat('1', 64), null, null),
  ('c5000000-0000-4000-c000-000000000002', 'c5000000-0000-4000-b000-000000000002',
   '+972500007622', 'worker', 'Sent', repeat('2', 64), null, null),
  ('c5000000-0000-4000-c000-000000000003', 'c5000000-0000-4000-b000-000000000002',
   '+972500007623', 'manager', 'Made', repeat('3', 64), null, null),
  ('c5000000-0000-4000-c000-000000000004', 'c5000000-0000-4000-b000-000000000002',
   '+972500007605', 'worker', 'Joined', repeat('4', 64), now(),
   'c5000000-0000-4000-a000-00000000000e'),
  ('c5000000-0000-4000-c000-000000000005', 'c5000000-0000-4000-b000-000000000002',
   '+972500007625', 'worker', 'Elsewhere', repeat('5', 64), null, null);
insert into public.businesses (id, slug, name)
values ('c5000000-0000-4000-b000-000000000003', 'ilp-z', 'Pending Z');
insert into public.audit_log (business_id, actor_id, action, details)
values
  ('c5000000-0000-4000-b000-000000000002', 'c5000000-0000-4000-a000-00000000000d',
   'invite.send', jsonb_build_object('invite', 'c5000000-0000-4000-c000-000000000002')),
  ('c5000000-0000-4000-b000-000000000002', 'c5000000-0000-4000-a000-00000000000d',
   'invite.create', jsonb_build_object('invite', 'c5000000-0000-4000-c000-000000000003',
     'role', 'manager')),
  -- Not a link: a cancel names it too, and another business's row counts for nothing.
  ('c5000000-0000-4000-b000-000000000002', 'c5000000-0000-4000-a000-00000000000d',
   'invite.cancel', jsonb_build_object('invite', 'c5000000-0000-4000-c000-000000000001')),
  ('c5000000-0000-4000-b000-000000000003', 'c5000000-0000-4000-a000-00000000000d',
   'invite.send', jsonb_build_object('invite', 'c5000000-0000-4000-c000-000000000005'));

select cmp_ok(private.mark_links_pending(), '>=', 2,
  'the backfill marks what no log row says got a link');
select results_eq(
  $$select right(id::text, 1), link_pending from public.invites
    where business_id = 'c5000000-0000-4000-b000-000000000002' order by id$$,
  $$values ('1'::text, true), ('2', false), ('3', false), ('4', false), ('5', true)$$,
  'an open invite with no invite.create or invite.send of its own business is marked; one sent, one made with its link and one claimed are not'
);
select is(private.mark_links_pending(), 0,
  'once: a second run finds nothing left to mark');

-- 3. The wizard saves its invites as pending ---------------------------------
set local role service_role;
select lives_ok(
  $$select public.create_business('c5000000-0000-4000-a000-00000000000a',
    'Pending X', 'ilp-x', null, '#0f766e', 'general',
    '[{"name": "Owner X", "phone": "+972500007611", "role": "owner"},
      {"name": "Manager X", "phone": "+972500007612", "role": "manager"},
      {"name": "Linked X", "phone": "+972500007613", "role": "worker"},
      {"name": "Refreshed X", "phone": "+972500007614", "role": "worker"},
      {"name": "Console X", "phone": "+972500007615", "role": "worker"},
      {"name": "Cancelled X", "phone": "+972500007616", "role": "worker"},
      {"name": "First X", "phone": "+972500007618", "role": "worker"}]')$$,
  'the wizard opens a business with its staff list'
);
reset role;
select results_eq(
  $$select i.full_name, i.link_pending from public.invites i
    where i.business_id = pg_temp.x() order by i.phone$$,
  $$values ('Owner X'::text, true), ('Manager X', true), ('Linked X', true),
    ('Refreshed X', true), ('Console X', true), ('Cancelled X', true),
    ('First X', true)$$,
  'every invite the wizard saves has no link yet'
);
select is(
  (select a.details -> 'invites' from public.audit_log a
    where a.business_id = pg_temp.x() and a.action = 'business.create'),
  '7'::jsonb,
  'and the wizard logs them as before'
);

-- The owner joined (by the console's link, as the app does it); a worker too.
insert into public.memberships (business_id, user_id, role)
values
  (pg_temp.x(), 'c5000000-0000-4000-a000-00000000000b', 'owner'),
  (pg_temp.x(), 'c5000000-0000-4000-a000-00000000000c', 'worker');

-- 4. Each way a link is made clears it ----------------------------------------
set local role service_role;
-- The Team screen's "קישור חדש", which the first link below goes through.
select is(
  public.team_invite_link('c5000000-0000-4000-a000-00000000000b',
    pg_temp.inv('+972500007613'), repeat('a', 64)),
  '+972500007613',
  'the owner makes a pending invite its link'
);
select is(pg_temp.pending('+972500007613'), false, 'team_invite_link clears it');
select is(public.invite_by_token(repeat('a', 64)) ->> 'status', 'open',
  'and its new link reads open');

-- The Team screen's "יצירת קישור": the first link, and only while it is the
-- first, so a screen not read again never replaces one already sent.
select is(
  public.team_invite_first_link('c5000000-0000-4000-a000-00000000000b',
    pg_temp.inv('+972500007618'), repeat('f', 64)),
  '+972500007618',
  'the owner makes a pending invite its first link'
);
select is(pg_temp.pending('+972500007618'), false,
  'team_invite_first_link clears it');
select is(
  pg_temp.first_link_refusal('c5000000-0000-4000-a000-00000000000b',
    pg_temp.inv('+972500007618')),
  'P0002 linked',
  'a second first link is refused, as one from a screen not read again: it has its link'
);
select is(
  pg_temp.first_link_refusal('c5000000-0000-4000-a000-00000000000c',
    pg_temp.inv('+972500007618')),
  '42501',
  'a worker of the business is refused as ever, and learns nothing of its link'
);
select is(
  pg_temp.first_link_refusal('c5000000-0000-4000-a000-00000000000d',
    pg_temp.inv('+972500007618')),
  '42501',
  'and so is another business''s manager'
);
select is(pg_temp.hash('+972500007618'), repeat('f', 64),
  'none of them replaces the link made first');
select is(public.invite_by_token(repeat('f', 64)) ->> 'status', 'open',
  'which still reads open');
select is(
  pg_temp.first_link_refusal('c5000000-0000-4000-a000-00000000000c',
    pg_temp.inv('+972500007611')),
  '42501',
  'a pending invite''s first link takes every check of team_invite_link'
);

-- The invite form, to a number with an invite open: refreshed with a link.
select is(
  public.team_invite('c5000000-0000-4000-a000-00000000000b', pg_temp.x(),
    '+972500007614', 'Refreshed X', 'worker', repeat('b', 64)),
  pg_temp.inv('+972500007614'),
  'inviting the number again refreshes its pending invite'
);
select is(pg_temp.pending('+972500007614'), false, 'team_invite''s refresh clears it');
select is(public.invite_by_token(repeat('b', 64)) ->> 'status', 'open',
  'and the refreshed link reads open');

-- The console's link for an invite, and its renewal of one.
select is(
  public.issue_invite_link('c5000000-0000-4000-a000-00000000000a',
    pg_temp.inv('+972500007615'), repeat('c', 64)),
  '+972500007615',
  'the team makes a pending invite its link from the console'
);
select is(pg_temp.pending('+972500007615'), false, 'issue_invite_link clears it');
select is(public.invite_by_token(repeat('c', 64)) ->> 'status', 'open',
  'and the console''s link reads open');
select is(
  public.admin_invite('c5000000-0000-4000-a000-00000000000a', pg_temp.x(),
    '+972500007612', 'Manager X', 'manager', repeat('d', 64)),
  pg_temp.inv('+972500007612'),
  'adding the number from the console renews its pending invite'
);
select is(pg_temp.pending('+972500007612'), false, 'admin_invite''s renewal clears it');
select is(public.invite_by_token(repeat('d', 64)) ->> 'status', 'open',
  'and the renewed link reads open');

-- A new invite comes with its link: never pending.
select lives_ok(
  $$select public.team_invite('c5000000-0000-4000-a000-00000000000b',
    pg_temp.x(), '+972500007617', 'New X', 'worker', repeat('e', 64))$$,
  'the owner invites a new number'
);
select is(pg_temp.pending('+972500007617'), false,
  'an invite made with its link is no pending one');
reset role;

-- 5. What makes no link leaves it -------------------------------------------
create temporary table hashes on commit drop as
  select '+972500007616'::text as number, pg_temp.hash('+972500007616') as hash;
grant all on hashes to service_role;

set local role service_role;
select lives_ok(
  $$select public.team_invite_cancel('c5000000-0000-4000-a000-00000000000b',
    pg_temp.inv('+972500007616'))$$,
  'the owner deletes a pending invite'
);
reset role;
select is(pg_temp.pending('+972500007616'), true,
  'a cancel writes a hash of no token and closes the row, leaving the flag');
select ok(
  (select i.claimed_at is not null and i.cancelled_at is not null
      and i.token_hash <> h.hash
    from public.invites i, hashes h
    where i.id = pg_temp.inv('+972500007616')),
  'and the row is closed, its hash another'
);
set local role service_role;
select is(public.invite_by_token((select h.hash from hashes h)), null,
  'nothing reads the deleted invite by its old hash');
reset role;

-- The owner's own invite, untouched: still pending. A change of anything but
-- its hash, or its hash written the same, leaves it.
update public.invites set full_name = 'Owner X again'
where id = pg_temp.inv('+972500007611');
update public.invites set token_hash = token_hash
where id = pg_temp.inv('+972500007611');
select is(pg_temp.pending('+972500007611'), true,
  'only a new hash on an open invite clears it');
-- And a link once made is never undone by a later write.
update public.invites set full_name = 'Linked X again'
where id = pg_temp.inv('+972500007613');
select is(pg_temp.pending('+972500007613'), false,
  'nothing sets it back');

-- 6. Who may run the functions, and who reads the column ---------------------
select ok(
  not has_function_privilege('authenticated', 'private.mark_links_pending()', 'execute')
  and not has_function_privilege('anon', 'private.mark_links_pending()', 'execute')
  and not has_function_privilege('authenticated', 'private.invite_link_given()', 'execute')
  and not has_function_privilege('anon', 'private.invite_link_given()', 'execute'),
  'browser roles run neither of the new private functions'
);
select ok(
  not has_function_privilege('authenticated',
    'public.team_invite_first_link(uuid, uuid, text)', 'execute')
  and not has_function_privilege('anon',
    'public.team_invite_first_link(uuid, uuid, text)', 'execute'),
  'nor make a first link: the server does, for the signed-in person'
);

select pg_temp.sign_in('c5000000-0000-4000-a000-00000000000c');
select is_empty(
  $$select 1 from public.invites$$,
  'a worker reads no invites, pending or not'
);
reset role;

select pg_temp.sign_in('c5000000-0000-4000-a000-00000000000b');
select results_eq(
  $$select phone, link_pending from public.invites
    where claimed_at is null order by phone$$,
  $$values ('+972500007611'::text, true), ('+972500007612', false),
    ('+972500007613', false), ('+972500007614', false),
    ('+972500007615', false), ('+972500007617', false),
    ('+972500007618', false)$$,
  'the owner reads their own business''s open invites, each with whether it has a link'
);
reset role;

select pg_temp.sign_in('c5000000-0000-4000-a000-00000000000d');
select results_eq(
  $$select distinct business_id from public.invites$$,
  $$values ('c5000000-0000-4000-b000-000000000002'::uuid)$$,
  'a manager reads only their own business''s invites'
);
reset role;

-- 7. The console says what the Team screen says ------------------------------
-- The owner's invite, still waiting for its link, and the console's, made,
-- both past their date.
update public.invites set expires_at = now() - interval '1 day'
where id in (pg_temp.inv('+972500007611'), pg_temp.inv('+972500007615'));

select pg_temp.sign_in('c5000000-0000-4000-a000-00000000000a');
select results_eq(
  $$select p ->> 'phone', p ->> 'status'
    from jsonb_array_elements(public.admin_business('ilp-x') -> 'people') p
    where p ->> 'invite_id' is not null
    order by 1$$,
  $$values ('+972500007611'::text, 'pending'::text),
    ('+972500007612', 'invited'), ('+972500007613', 'invited'),
    ('+972500007614', 'invited'), ('+972500007615', 'expired'),
    ('+972500007617', 'invited'), ('+972500007618', 'invited')$$,
  'the console says an invite with no link yet waits for one, past its date too, never expired'
);
select ok(
  (select max(n) filter (where p ->> 'status' = 'pending')
      < min(n) filter (where p ->> 'status' = 'expired')
    from jsonb_array_elements(public.admin_business('ilp-x') -> 'people')
      with ordinality as people (p, n)),
  'and lists it with the open invites, before the expired one'
);
select results_eq(
  $$select members, open_invites, expired_invites
    from public.admin_businesses() where slug = 'ilp-x'$$,
  $$values (2::bigint, 6::bigint, 1::bigint)$$,
  'the list counts it among the open invites, never the expired'
);
reset role;

select * from finish();
rollback;
