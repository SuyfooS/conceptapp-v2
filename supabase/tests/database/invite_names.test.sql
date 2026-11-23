-- Joining by the invite's name (20261127000500_invite_names.sql; docs/ROADMAP.md,
-- known issue 20): the invite's name becomes the business's own name for the
-- claimant (public.member_names), read as the app keeps a name
-- (private.team_name: what nobody sees dropped, letters composed, spaces
-- collapsed), unless it is their own, read the same way, or they join as an
-- owner. Their own name (profiles.full_name) stays theirs, and someone with
-- none takes the invite's, clean. Their own name keeps no row, and one kept
-- from an earlier time in the business goes; an owner keeps none either; an
-- invite with no name leaves what the business had; a character nobody sees
-- is dropped, so it never stops a join, makes a row for their own name or
-- leaves an old one. The log keeps no name, the name is read as their
-- profile is, in that business, and only the server claims. Fixed ids and
-- numbers of its own (9c…, 050-000-93xx) and slugs (inam-…), so nothing here
-- meets the seeded people.
begin;
select plan(38);
set local timezone = 'UTC';

insert into auth.users (id, aud, role, phone)
values
  ('9c000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500009301'),
  ('9c000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500009302'),
  ('9c000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', '972500009303'),
  ('9c000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', '972500009304'),
  ('9c000000-0000-4000-a000-000000000005', 'authenticated', 'authenticated', '972500009305'),
  ('9c000000-0000-4000-a000-000000000006', 'authenticated', 'authenticated', '972500009306'),
  ('9c000000-0000-4000-a000-000000000007', 'authenticated', 'authenticated', '972500009307'),
  ('9c000000-0000-4000-a000-000000000008', 'authenticated', 'authenticated', '972500009308'),
  ('9c000000-0000-4000-a000-000000000009', 'authenticated', 'authenticated', '972500009309'),
  ('9c000000-0000-4000-a000-000000000010', 'authenticated', 'authenticated', '972500009310');

update public.profiles set full_name = 'Noa Cohen'
where id = '9c000000-0000-4000-a000-000000000002';
update public.profiles set full_name = 'Dana Levi'
where id = '9c000000-0000-4000-a000-000000000004';
update public.profiles set full_name = 'Yael Bar'
where id = '9c000000-0000-4000-a000-000000000005';
update public.profiles set full_name = 'Shir Tal'
where id = '9c000000-0000-4000-a000-000000000006';
update public.profiles set full_name = 'Gil Or'
where id = '9c000000-0000-4000-a000-000000000008';
-- An own name an earlier claim copied with a right-to-left mark (U+200F).
update public.profiles set full_name = chr(8207) || 'Lior Ben'
where id = '9c000000-0000-4000-a000-000000000009';
update public.profiles set full_name = 'Tal Gat'
where id = '9c000000-0000-4000-a000-000000000010';

-- A: 1 its owner, 2 (Noa Cohen) a worker. B: 7 its owner, 4 (Dana Levi),
-- who worked there once and whom B called "Dana L", and 8 (Gil Or), who did
-- too, as "Gil O.". 3 has no name; 5 (Yael Bar), 6 (Shir Tal), 9 (Lior Ben,
-- with a mark) and 10 (Tal Gat) are in no business yet.
insert into public.businesses (id, slug, name)
values
  ('9c000000-0000-4000-b000-000000000001', 'inam-a', 'Invite names A'),
  ('9c000000-0000-4000-b000-000000000002', 'inam-b', 'Invite names B');

insert into public.memberships (business_id, user_id, role, active)
values
  ('9c000000-0000-4000-b000-000000000001', '9c000000-0000-4000-a000-000000000001', 'owner', true),
  ('9c000000-0000-4000-b000-000000000001', '9c000000-0000-4000-a000-000000000002', 'worker', true),
  ('9c000000-0000-4000-b000-000000000002', '9c000000-0000-4000-a000-000000000007', 'owner', true),
  ('9c000000-0000-4000-b000-000000000002', '9c000000-0000-4000-a000-000000000004', 'worker', false),
  ('9c000000-0000-4000-b000-000000000002', '9c000000-0000-4000-a000-000000000008', 'worker', false);

insert into public.member_names (business_id, user_id, name)
values
  ('9c000000-0000-4000-b000-000000000002', '9c000000-0000-4000-a000-000000000004', 'Dana L'),
  ('9c000000-0000-4000-b000-000000000002', '9c000000-0000-4000-a000-000000000008', 'Gil O.');

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
  'Avi Ron',
  'and takes the invite''s name as their own, as the app keeps a name'
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
-- An owner

select pg_temp.invite('9c000000-0000-4000-a000-000000000008', 'owner', 'Gili', repeat('1', 64));
set local role service_role;
select is(
  public.claim_invite(repeat('1', 64), '9c000000-0000-4000-a000-000000000008'),
  '9c000000-0000-4000-b000-000000000002'::uuid,
  'someone named, whom the business named once, comes back as an owner'
);
reset role;
select is(
  pg_temp.kept('9c000000-0000-4000-a000-000000000008'),
  null,
  'an owner keeps no name of the business''s, the invite''s nor the old one: only another owner could change it'
);
select is(
  (select full_name from public.profiles where id = '9c000000-0000-4000-a000-000000000008'),
  'Gil Or',
  'so their own name shows there, which they change themselves'
);

------------------------------------------------------------------------------
-- What nobody sees

-- A control character (U+0007), never a stop: dropped, the rest is their
-- own name.
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
  'they join, and the name without the character is their own: no row'
);

-- Coming back by such a name: the old row is replaced by the clean name, or
-- goes when the clean name is their own.
update public.memberships set active = false
where business_id = '9c000000-0000-4000-b000-000000000002'
  and user_id = '9c000000-0000-4000-a000-000000000004';
select pg_temp.invite('9c000000-0000-4000-a000-000000000004', 'worker', 'Dana' || chr(7) || ' Ray', repeat('2', 64));
set local role service_role;
select is(
  public.claim_invite(repeat('2', 64), '9c000000-0000-4000-a000-000000000004'),
  '9c000000-0000-4000-b000-000000000002'::uuid,
  'someone the business named comes back by a name with a control character'
);
reset role;
select is(
  pg_temp.kept('9c000000-0000-4000-a000-000000000004'),
  'Dana Ray',
  'the old row takes the invite''s name, without the character'
);

update public.memberships set active = false
where business_id = '9c000000-0000-4000-b000-000000000002'
  and user_id = '9c000000-0000-4000-a000-000000000004';
select pg_temp.invite('9c000000-0000-4000-a000-000000000004', 'worker', 'Dana' || chr(7) || ' Levi', repeat('3', 64));
set local role service_role;
select is(
  public.claim_invite(repeat('3', 64), '9c000000-0000-4000-a000-000000000004'),
  '9c000000-0000-4000-b000-000000000002'::uuid,
  'and again, by their own name with a control character'
);
reset role;
select is(
  pg_temp.kept('9c000000-0000-4000-a000-000000000004'),
  null,
  'the old row goes: without the character, it is their own name'
);

-- A right-to-left mark (U+200F) on one side only, as a WhatsApp copy has it.
select pg_temp.invite('9c000000-0000-4000-a000-000000000009', 'worker', 'Lior Ben', repeat('4', 64));
set local role service_role;
select is(
  public.claim_invite(repeat('4', 64), '9c000000-0000-4000-a000-000000000009'),
  '9c000000-0000-4000-b000-000000000002'::uuid,
  'someone whose own name holds a mark joins by it written clean'
);
reset role;
select is(
  pg_temp.kept('9c000000-0000-4000-a000-000000000009'),
  null,
  'it is their own name: no row'
);

select pg_temp.invite('9c000000-0000-4000-a000-000000000010', 'worker', chr(8207) || 'Tal  Gat', repeat('5', 64));
set local role service_role;
select is(
  public.claim_invite(repeat('5', 64), '9c000000-0000-4000-a000-000000000010'),
  '9c000000-0000-4000-b000-000000000002'::uuid,
  'someone joins by an invite whose name holds a mark'
);
reset role;
select is(
  pg_temp.kept('9c000000-0000-4000-a000-000000000010'),
  null,
  'it is their own name too: no row'
);

-- The rule itself, as parseTeamName keeps a name.
select is(
  private.team_name(' Noe' || chr(776) || 'l' || chr(160) || chr(12288) || 'Ka '),
  'No' || chr(235) || 'l Ka',
  'letters composed, every kind of space one, the ends trimmed'
);
select is(
  private.team_name(chr(8205) || 'Noa' || chr(8204) || ' a' || chr(8205) || 'b ' || chr(10084) || chr(65039)),
  'Noa a' || chr(8205) || 'b ' || chr(10084) || chr(65039),
  'a joiner at a word''s edge goes; inside a word, and an emoji''s selector, stay'
);
select is(
  private.team_name(chr(8203) || ' ' || chr(8207) || chr(65279) || chr(173)),
  null,
  'nothing but what nobody sees is no name'
);
select is(
  private.team_name(repeat(chr(2392), 41)),
  null,
  'nor a name longer than 80 once its letters are composed'
);
select ok(
  not has_function_privilege('authenticated', 'private.team_name(text)', 'execute')
  and not has_function_privilege('anon', 'private.team_name(text)', 'execute'),
  'nobody signed in calls the rule'
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
