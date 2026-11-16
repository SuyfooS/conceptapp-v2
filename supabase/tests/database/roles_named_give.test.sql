-- Roles and permissions by module, R11b (20261115001600_named_roles_give.sql):
-- giving a role a business named. An owner invites to one and the person
-- claims it, holding its rules; a fresh link sends it on; a change of role
-- gives one and takes it away. An owner gives any live one; someone else who
-- edits the team only one built on a role they give, holding nothing they
-- don't, and never pay, which a named role never holds, not even its base's.
-- A role of another business, an archived one or one on another base is
-- refused; an open invite holds a role as a person does, and an expired one
-- to a role archived since is closed until it comes back. A fresh invite to
-- a number's open one replaces its named role or clears it; someone taken
-- off the team who claims an invite again holds the invite's named role, or
-- none; the log names the named role on a removal and an invite deleted too.
-- Today's invites and role changes, with no named role, are as they were.
-- Each write is its own statement and what it wrote is read in the next.
-- Fixed ids (a2…) and numbers (050-082-xxxx), so nothing here meets the seed
-- or another test.
begin;
select plan(35);

-- 1 owner, 2 manager, 3 worker of A; 4 joins as A's shift lead; 5 joins
-- from a fresh link (both leave, and come back later); 6 a worker of A whose
-- role changes; 7 owner of B; 9 a
-- worker of A raised to edit the team; 10 on the ConceptApp team; 11 joins
-- as a worker, as today; 12 the manager invites.
insert into auth.users (id, aud, role, phone)
select
  ('a2000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250082' || lpad(n::text, 4, '0')
from unnest('{1,2,3,4,5,6,7,9,10,11,12}'::int[]) as n;

insert into public.businesses (id, slug, name)
values
  ('a2000000-0000-4000-b000-000000000001', 'rng-one', 'Roles Given'),
  ('a2000000-0000-4000-b000-000000000002', 'rng-two', 'Roles Given Elsewhere');

insert into public.memberships (business_id, user_id, role, perms)
values
  ('a2000000-0000-4000-b000-000000000001', 'a2000000-0000-4000-a000-000000000001', 'owner', '{}'),
  ('a2000000-0000-4000-b000-000000000001', 'a2000000-0000-4000-a000-000000000002', 'manager', '{}'),
  ('a2000000-0000-4000-b000-000000000001', 'a2000000-0000-4000-a000-000000000003', 'worker', '{}'),
  ('a2000000-0000-4000-b000-000000000001', 'a2000000-0000-4000-a000-000000000006', 'worker', '{}'),
  ('a2000000-0000-4000-b000-000000000001', 'a2000000-0000-4000-a000-000000000009', 'worker',
   '{team.view,team.edit}'),
  ('a2000000-0000-4000-b000-000000000002', 'a2000000-0000-4000-a000-000000000007', 'owner', '{}');

insert into public.platform_staff (user_id, role)
values ('a2000000-0000-4000-a000-000000000010', 'onboarder');

create temporary table ids (name text primary key, id uuid) on commit drop;
-- What each step of an assertion said, in order.
create temporary table said (n serial primary key, got text) on commit drop;

create function pg_temp.id(label text) returns uuid language sql as $$
  select i.id from ids i where i.name = label
$$;

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('a2000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;

-- Business A.
create function pg_temp.a() returns uuid language sql as $$
  select 'a2000000-0000-4000-b000-000000000001'::uuid
$$;

-- Number `n` as an invite writes it.
create function pg_temp.phone(n integer) returns text language sql as $$
  select '+97250082' || lpad(n::text, 4, '0')
$$;

-- A link's hash, one a number.
create function pg_temp.token(n integer) returns text language sql as $$
  select lpad(to_hex(n), 64, 'a2')
$$;

-- The open invite to number `n`.
create function pg_temp.invite_to(n integer) returns uuid language sql as $$
  select i.id from public.invites i
  where i.business_id = pg_temp.a() and i.phone = pg_temp.phone(n) and i.claimed_at is null
$$;

create function pg_temp.say(what text) returns void language sql as $$
  insert into said (got) values (what)
$$;

-- What the steps said, and a fresh start for the next assertion's.
create function pg_temp.heard() returns text language plpgsql as $$
declare
  all_said text;
begin
  select string_agg(s.got, ' | ' order by s.n) into all_said from said s;
  delete from said;
  return all_said;
end;
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

-- `actor` invites number `n` to `r`, or to the named role `named` on it.
create function pg_temp.invite(actor integer, n integer, r text, named text default null)
returns text language sql as $$
  select pg_temp.refusal(format(
    'select public.team_invite(%L::uuid, %L::uuid, %L, %L, %L, %L, %L::uuid)',
    pg_temp.p(actor), pg_temp.a(), pg_temp.phone(n), 'Person ' || n, r,
    pg_temp.token(n), pg_temp.id(named)))
$$;

-- `actor` sends a fresh link for the open invite to number `n`.
create function pg_temp.link(actor integer, n integer, fresh integer) returns text language sql as $$
  select pg_temp.refusal(format(
    'select public.team_invite_link(%L::uuid, %L::uuid, %L)',
    pg_temp.p(actor), pg_temp.invite_to(n), pg_temp.token(fresh)))
$$;

-- `actor` gives person `n` the role `r`, or the named role `named` on it.
create function pg_temp.change(actor integer, n integer, r text, named text default null)
returns text language sql as $$
  select pg_temp.refusal(format(
    'select public.set_member_role(%L::uuid, %L::uuid, %L::uuid, %L, new_named => %L::uuid)',
    pg_temp.p(actor), pg_temp.a(), pg_temp.p(n), r, pg_temp.id(named)))
$$;

-- Person `n`'s role in A, and the named role they hold, by its label here.
create function pg_temp.place(n integer) returns text language sql as $$
  select m.role::text || '/' || coalesce(
    (select i.name from ids i where i.id = m.named_role), 'none')
  from public.memberships m
  where m.business_id = pg_temp.a() and m.user_id = pg_temp.p(n)
$$;

-- The open invite to number `n`: its role and named role, by its label here.
create function pg_temp.invited(n integer) returns text language sql as $$
  select i.role::text || '/' || coalesce(
    (select x.name from ids x where x.id = i.named_role), 'none')
  from public.invites i
  where i.id = pg_temp.invite_to(n)
$$;

-- The keys owners switch per role that person `n` holds in A.
create function pg_temp.holds(n integer) returns text language sql as $$
  select coalesce(string_agg(k.key, ',' order by k.key), '')
  from public.permission_keys k
  where k.settable
    and private.holds_perm(pg_temp.a(), pg_temp.p(n), k.key)
$$;

-- A's roles: a shift lead on workers who builds the schedule; a bar lead on
-- workers who runs the lists, which A's managers don't; a floor manager on
-- managers, as managers are; one archived; and one of B.
insert into ids values ('lead', public.create_business_role(pg_temp.p(1), pg_temp.a(), 'worker', 'Shift lead'));
insert into ids values ('bar', public.create_business_role(pg_temp.p(1), pg_temp.a(), 'worker', 'Bar lead'));
insert into ids values ('floor', public.create_business_role(pg_temp.p(1), pg_temp.a(), 'manager', 'Floor manager'));
insert into ids values ('old', public.create_business_role(pg_temp.p(1), pg_temp.a(), 'worker', 'Old role'));
insert into ids values ('far', public.create_business_role(pg_temp.p(7),
  'a2000000-0000-4000-b000-000000000002', 'worker', 'Elsewhere'));
select public.set_role_permission(pg_temp.p(1), pg_temp.a(), 'worker', 'schedule.edit', true, pg_temp.id('lead'));
select public.set_role_permission(pg_temp.p(1), pg_temp.a(), 'worker', 'lists.manage', true, pg_temp.id('bar'));
select public.set_role_permission(pg_temp.p(1), pg_temp.a(), 'manager', 'lists.manage', false);
select public.archive_business_role(pg_temp.p(1), pg_temp.id('old'));

------------------------------------------------------------------------------
-- An invite to a named role, and claiming it

insert into ids values ('lead invite', public.team_invite(pg_temp.p(1), pg_temp.a(),
  pg_temp.phone(4), 'Person 4', 'worker', pg_temp.token(4), pg_temp.id('lead')));

select is(
  pg_temp.invited(4),
  'worker/lead',
  'an owner invites to a named role: the invite''s role is its base, and it names the role'
);
select is(
  (select (l.details ->> 'named_role') || '/' || (l.details ->> 'role_name')
   from public.audit_log l
   where l.action = 'invite.create' and l.details ->> 'invite' = pg_temp.id('lead invite')::text),
  pg_temp.id('lead')::text || '/Shift lead',
  'and the log names it'
);
select is(
  (public.invite_by_token(pg_temp.token(4)) ->> 'role_name') || '/'
    || (public.invite_by_token(pg_temp.token(4)) ->> 'status'),
  'Shift lead/open',
  'the join screen reads its name'
);

select public.claim_invite(pg_temp.token(4), pg_temp.p(4));

select is(
  pg_temp.place(4),
  'worker/lead',
  'claiming it puts the person in the named role, on its base'
);
select is(
  pg_temp.holds(4) || ' | ' || pg_temp.holds(3),
  'schedule.edit | ',
  'and they hold what its rules give, where a worker holds nothing owners switch'
);
select ok(
  exists (
    select 1 from public.audit_log l
    where l.action = 'invite.claim' and l.actor_id = pg_temp.p(4)
      and l.details ->> 'named_role' = pg_temp.id('lead')::text
      and l.details ->> 'role_name' = 'Shift lead'
  ),
  'the claim''s log names the named role'
);

------------------------------------------------------------------------------
-- Which named role an invite gives

select pg_temp.say(pg_temp.invite(1, 101, 'manager', 'lead'));
select pg_temp.say(pg_temp.invite(1, 102, 'worker', 'far'));
select pg_temp.say(pg_temp.invite(1, 103, 'worker', 'old'));
select is(
  pg_temp.heard(),
  '22023 base | P0002 | 22023 archived',
  'an invite is refused a named role on another base, of another business, or archived'
);

select pg_temp.say(pg_temp.refusal(format(
  'insert into public.invites (business_id, phone, role, named_role, token_hash) values (%L, %L, %L, %L, %L)',
  pg_temp.a(), pg_temp.phone(104), 'worker', pg_temp.id('old'), pg_temp.token(104))));
-- The code alone: a foreign key's refusal carries the key in its detail.
select pg_temp.say(left(pg_temp.refusal(format(
  'insert into public.invites (business_id, phone, role, named_role, token_hash) values (%L, %L, %L, %L, %L)',
  pg_temp.a(), pg_temp.phone(105), 'manager', pg_temp.id('lead'), pg_temp.token(105))), 5));
select is(
  pg_temp.heard(),
  '22023 archived | 23503',
  'whoever writes the invite: never an archived role, and always one on its role'
);

-- A fresh invite to the number's open one: to another named role, then to
-- the role itself.
select pg_temp.say(pg_temp.invite(1, 131, 'worker', 'lead'));
select pg_temp.say(pg_temp.invited(131));
select pg_temp.say(pg_temp.invite(1, 131, 'worker', 'bar'));
select pg_temp.say(pg_temp.invited(131));
select pg_temp.say(pg_temp.invite(1, 131, 'worker'));
select pg_temp.say(pg_temp.invited(131));
select is(
  pg_temp.heard(),
  'none | worker/lead | none | worker/bar | none | worker/none',
  'a fresh invite to the number''s open one replaces its named role, or clears it'
);

------------------------------------------------------------------------------
-- The giver's rule

select pg_temp.say('manager:lead ' || pg_temp.invite(2, 12, 'worker', 'lead'));
select pg_temp.say('manager:bar ' || pg_temp.invite(2, 111, 'worker', 'bar'));
select pg_temp.say('manager:floor ' || pg_temp.invite(2, 112, 'manager', 'floor'));
select pg_temp.say('editor:floor ' || pg_temp.invite(9, 113, 'manager', 'floor'));
select pg_temp.say('editor:lead ' || pg_temp.invite(9, 114, 'worker', 'lead'));
select pg_temp.say('owner:bar ' || pg_temp.invite(1, 115, 'worker', 'bar'));
select is(
  pg_temp.heard(),
  'manager:lead none | manager:bar 42501 held | manager:floor none | editor:floor 42501'
    || ' | editor:lead 42501 held | owner:bar none',
  'an owner gives any named role; anyone else only one on a role they give, holding nothing they don''t'
);

-- Workers see pay in A, as an owner may set it.
select public.set_role_permission(pg_temp.p(1), pg_temp.a(), 'worker', 'clock.payroll', true);

select pg_temp.say('manager:worker ' || pg_temp.invite(2, 121, 'worker'));
select pg_temp.say('manager:lead ' || pg_temp.invite(2, 122, 'worker', 'lead'));
select is(
  pg_temp.heard(),
  'manager:worker 42501 pay | manager:lead none',
  'with workers seeing pay, a manager invites no worker, and still invites to a named role on workers'
);
select is(
  private.role_holds_pay(pg_temp.a(), 'worker')::text || '/'
    || private.role_holds_pay(pg_temp.a(), 'worker', pg_temp.id('lead'))::text,
  'true/false',
  'a named role never holds pay, not even its base''s'
);
select is(
  private.invite_closed(pg_temp.a(), 'worker', pg_temp.p(2))::text || '/'
    || private.invite_closed(pg_temp.a(), 'worker', pg_temp.p(2), pg_temp.id('lead'))::text,
  'true/false',
  'so a manager''s invite to workers is closed, and theirs to the named role on workers isn''t'
);
select is(
  private.holds_perm(pg_temp.a(), pg_temp.p(3), 'clock.payroll')::text || '/'
    || private.holds_perm(pg_temp.a(), pg_temp.p(4), 'clock.payroll')::text,
  'true/false',
  'and the person in it doesn''t take their base''s pay'
);

select public.set_role_permission(pg_temp.p(1), pg_temp.a(), 'worker', 'clock.payroll', false);

------------------------------------------------------------------------------
-- A fresh link

select public.team_invite(pg_temp.p(2), pg_temp.a(), pg_temp.phone(5), 'Person 5', 'worker',
  pg_temp.token(5), pg_temp.id('lead'));

select pg_temp.say('manager:lead ' || pg_temp.link(2, 5, 500));
select pg_temp.say('manager:bar ' || pg_temp.link(2, 115, 501));
select pg_temp.say('owner:bar ' || pg_temp.link(1, 115, 502));
select is(
  pg_temp.heard(),
  'manager:lead none | manager:bar 42501 held | owner:bar none',
  'a fresh link asks the giver''s rule of the invite''s named role'
);

select public.claim_invite(pg_temp.token(500), pg_temp.p(5));

select is(
  pg_temp.place(5),
  'worker/lead',
  'and claiming from it puts the person in the named role'
);

------------------------------------------------------------------------------
-- A change of role

select pg_temp.say(pg_temp.change(1, 6, 'worker', 'lead'));
select pg_temp.say(pg_temp.place(6));
select is(
  pg_temp.heard(),
  'none | worker/lead',
  'an owner changes a worker to a named role on workers'
);

select pg_temp.say(public.set_member_role(pg_temp.p(1), pg_temp.a(), pg_temp.p(6), 'worker',
  new_named => pg_temp.id('lead')) ->> 'changed');
select pg_temp.say(pg_temp.holds(6));
select is(
  pg_temp.heard(),
  'false | schedule.edit',
  'the same named role again changes nothing, and they hold its rules'
);

select is(
  pg_temp.refusal(format(
    'select public.set_member_role(%L::uuid, %L::uuid, %L::uuid, %L, seen_role => %L)',
    pg_temp.p(1), pg_temp.a(), pg_temp.p(6), 'manager', 'worker')),
  '40001',
  'a change that saw the base alone, and no named role, is refused as changed meanwhile'
);

select pg_temp.say(public.set_member_role(pg_temp.p(1), pg_temp.a(), pg_temp.p(6), 'worker',
  seen_role => 'worker', seen_named => pg_temp.id('lead')) ->> 'changed');
select pg_temp.say(pg_temp.place(6));
select pg_temp.say(pg_temp.holds(6));
select is(
  pg_temp.heard(),
  'true | worker/none | ',
  'back to the built-in role: the named role and its rules are gone'
);
select ok(
  exists (
    select 1 from public.audit_log l
    where l.action = 'member.role' and l.details ->> 'person' = pg_temp.p(6)::text
      and l.details ->> 'named_role' = pg_temp.id('lead')::text
      and l.details ->> 'role_name' = 'Shift lead'
      and not l.details ? 'was_named'
  )
  and exists (
    select 1 from public.audit_log l
    where l.action = 'member.role' and l.details ->> 'person' = pg_temp.p(6)::text
      and l.details ->> 'was_named' = pg_temp.id('lead')::text
      and l.details ->> 'was_role_name' = 'Shift lead'
      and not l.details ? 'named_role'
  ),
  'the log names the named role given, and the one left'
);

select pg_temp.say('manager:lead ' || pg_temp.change(2, 6, 'worker', 'lead'));
select pg_temp.say('manager:bar ' || pg_temp.change(2, 6, 'worker', 'bar'));
select pg_temp.say('editor:floor ' || pg_temp.change(9, 6, 'manager', 'floor'));
select pg_temp.say('owner:bar ' || pg_temp.change(1, 6, 'worker', 'bar'));
select pg_temp.say(pg_temp.holds(6));
select is(
  pg_temp.heard(),
  'manager:lead none | manager:bar 42501 held | editor:floor 42501 | owner:bar none | lists.manage',
  'a change of role keeps the giver''s rule, and the person holds the new named role''s rules'
);

select pg_temp.say(pg_temp.change(1, 6, 'worker', 'floor'));
select pg_temp.say(pg_temp.change(1, 6, 'worker', 'old'));
select pg_temp.say(pg_temp.change(1, 6, 'worker', 'far'));
select is(
  pg_temp.heard(),
  '22023 base | 22023 archived | P0002',
  'a change is refused a named role on another base, archived, or of another business'
);

select pg_temp.say(pg_temp.change(1, 6, 'manager', 'floor'));
select pg_temp.say(pg_temp.place(6));
select pg_temp.say(pg_temp.change(1, 6, 'worker'));
select pg_temp.say(pg_temp.place(6));
select is(
  pg_temp.heard(),
  'none | manager/floor | none | worker/none',
  'a named role on managers makes the person a manager in it; a built-in role clears it'
);

------------------------------------------------------------------------------
-- Archiving a role an invite names

select is(
  pg_temp.refusal(format('select public.archive_business_role(%L::uuid, %L::uuid)',
    pg_temp.p(1), pg_temp.id('bar'))),
  '55000 held 1',
  'a role an open invite names, and nobody holds, is not archived'
);

-- The invite to the bar lead expires.
update public.invites i set expires_at = now() - interval '1 day'
where i.id = pg_temp.invite_to(115);

select is(
  pg_temp.refusal(format('select public.archive_business_role(%L::uuid, %L::uuid)',
    pg_temp.p(1), pg_temp.id('bar'))),
  'none',
  'once it expired, the role is archived'
);

-- As if its link were fresh: still closed, its role archived.
update public.invites i set expires_at = now() + interval '1 day'
where i.id = pg_temp.invite_to(115);

select pg_temp.say('owner link ' || pg_temp.link(1, 115, 503));
select pg_temp.say('team link ' || pg_temp.refusal(format(
  'select public.issue_invite_link(%L::uuid, %L::uuid, %L)',
  pg_temp.p(10), pg_temp.invite_to(115), pg_temp.token(504))));
select pg_temp.say(public.invite_by_token(pg_temp.token(502)) ->> 'status');
select pg_temp.say('claim ' || pg_temp.refusal(format('select public.claim_invite(%L, %L::uuid)',
  pg_temp.token(502), pg_temp.p(4))));
select is(
  pg_temp.heard(),
  'owner link 22023 archived | team link 22023 archived | expired | claim P0002',
  'an invite whose named role was archived since is closed: no fresh link, the join screen says expired, no claim'
);

select public.restore_business_role(pg_temp.p(1), pg_temp.id('bar'));

select pg_temp.say(pg_temp.link(1, 115, 505));
select pg_temp.say(public.invite_by_token(pg_temp.token(505)) ->> 'status');
select is(
  pg_temp.heard(),
  'none | open',
  'restored, it is open again'
);

------------------------------------------------------------------------------
-- Today's invites and role changes

select public.team_invite(pg_temp.p(1), pg_temp.a(), pg_temp.phone(11), 'Person 11', 'worker',
  pg_temp.token(11));
select public.claim_invite(pg_temp.token(11), pg_temp.p(11));

select is(
  pg_temp.place(11) || ' | ' || coalesce(
    public.invite_by_token(pg_temp.token(11)) ->> 'named_role', 'none'),
  'worker/none | none',
  'an invite to a built-in role gives it as before, naming no role'
);

select pg_temp.say(pg_temp.change(1, 3, 'manager'));
select pg_temp.say(pg_temp.place(3));
select pg_temp.say(pg_temp.change(1, 3, 'worker'));
select pg_temp.say(pg_temp.place(3));
select is(
  pg_temp.heard(),
  'none | manager/none | none | worker/none',
  'and a change between built-in roles is as before'
);

-- The manager's invites to numbers 12 and 122 name the shift lead: one gets
-- another base, the console invites the other again as a worker.
update public.invites i set role = 'manager' where i.id = pg_temp.invite_to(122);
select public.admin_invite(pg_temp.p(10), pg_temp.a(), pg_temp.phone(12), 'Person 12', 'worker',
  pg_temp.token(612));

select is(
  pg_temp.invited(122) || ' | ' || pg_temp.invited(12),
  'manager/none | worker/none',
  'an invite''s role changed to another base leaves its named role, and the console''s fresh invite is to the role it names'
);

------------------------------------------------------------------------------
-- Leaving, and coming back

-- The shift leads 4 and 5 are taken off the team, and the invite to the bar
-- lead (number 115) is deleted.
insert into ids values ('bar invite', pg_temp.invite_to(115));
select public.remove_member(pg_temp.p(1), pg_temp.a(), pg_temp.p(4));
select public.remove_member(pg_temp.p(1), pg_temp.a(), pg_temp.p(5));
select public.team_invite_cancel(pg_temp.p(1), pg_temp.id('bar invite'));

select ok(
  exists (
    select 1 from public.audit_log l
    where l.action = 'member.remove' and l.details ->> 'person' = pg_temp.p(4)::text
      and l.details ->> 'named_role' = pg_temp.id('lead')::text
      and l.details ->> 'role_name' = 'Shift lead'
  )
  and exists (
    select 1 from public.audit_log l
    where l.action = 'invite.cancel' and l.details ->> 'invite' = pg_temp.id('bar invite')::text
      and l.details ->> 'named_role' = pg_temp.id('bar')::text
      and l.details ->> 'role_name' = 'Bar lead'
  ),
  'the log names the named role of someone taken off the team, and of an invite deleted'
);

-- Invited back: 4 to workers, 5 to the bar lead.
select public.team_invite(pg_temp.p(1), pg_temp.a(), pg_temp.phone(4), 'Person 4', 'worker',
  pg_temp.token(404));
select public.team_invite(pg_temp.p(1), pg_temp.a(), pg_temp.phone(5), 'Person 5', 'worker',
  pg_temp.token(405), pg_temp.id('bar'));

select public.claim_invite(pg_temp.token(404), pg_temp.p(4));
select public.claim_invite(pg_temp.token(405), pg_temp.p(5));

select is(
  pg_temp.place(4) || ' | ' || pg_temp.place(5),
  'worker/none | worker/bar',
  'claiming an invite on a rejoin: to a built-in role leaves the named role they left in, to another named role puts them in that one'
);

------------------------------------------------------------------------------
-- Who may call what

select ok(
  not has_function_privilege('authenticated',
    'public.team_invite(uuid, uuid, text, text, public.member_role, text, uuid)', 'execute')
  and not has_function_privilege('anon',
    'public.team_invite(uuid, uuid, text, text, public.member_role, text, uuid)', 'execute')
  and has_function_privilege('service_role',
    'public.team_invite(uuid, uuid, text, text, public.member_role, text, uuid)', 'execute')
  and not has_function_privilege('authenticated',
    'public.set_member_role(uuid, uuid, uuid, public.member_role, public.member_role, timestamptz, uuid, uuid)',
    'execute')
  and has_function_privilege('service_role',
    'public.set_member_role(uuid, uuid, uuid, public.member_role, public.member_role, timestamptz, uuid, uuid)',
    'execute')
  and not has_function_privilege('authenticated', 'public.team_invite_link(uuid, uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.claim_invite(text, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.invite_by_token(text)', 'execute')
  and (select count(*) from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname = 'public' and p.proname in ('team_invite', 'set_member_role')) = 2,
  'the writes are the secret key''s, one of each'
);
select ok(
  not has_function_privilege('authenticated', 'private.live_named_role(uuid, public.member_role, uuid)', 'execute')
  and not has_function_privilege('authenticated',
    'private.role_holds_beyond(uuid, public.member_role, uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.role_holds_pay(uuid, public.member_role, uuid)', 'execute')
  and not has_function_privilege('authenticated',
    'private.invite_closed(uuid, public.member_role, uuid, uuid)', 'execute')
  and (select count(*)::int from pg_proc p
       join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname = 'private'
         and p.proname in ('live_named_role', 'role_holds_beyond', 'role_holds_pay', 'invite_closed')
         and p.prosecdef
         and exists (
           select 1 from unnest(p.proconfig) as c (setting)
           where c.setting in ('search_path=""', 'search_path=')
         )) = 4,
  'the helpers run as their owner with an empty search path, one of each, and nobody else calls them'
);

select * from finish();
rollback;
