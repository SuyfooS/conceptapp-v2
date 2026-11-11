-- Tenant isolation: a member of business A never sees business B, and each
-- role sees only what it should inside its own business.
begin;
select plan(33);

-- Fixtures: business A (owner, manager, worker) and business B (owner).
insert into auth.users (id, aud, role, phone)
values
  ('20000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500000101'),
  ('20000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500000102'),
  ('20000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500000103'),
  ('20000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500000104'),
  ('20000000-0000-4000-a000-00000000000e', 'authenticated', 'authenticated', '972500000105');

insert into public.businesses (id, slug, name)
values
  ('20000000-0000-4000-b000-00000000000a', 'business-a', 'Business A'),
  ('20000000-0000-4000-b000-00000000000b', 'business-b', 'Business B');

insert into public.memberships (business_id, user_id, role, active)
values
  ('20000000-0000-4000-b000-00000000000a', '20000000-0000-4000-a000-00000000000a', 'owner', true),
  ('20000000-0000-4000-b000-00000000000a', '20000000-0000-4000-a000-00000000000b', 'manager', true),
  ('20000000-0000-4000-b000-00000000000a', '20000000-0000-4000-a000-00000000000c', 'worker', true),
  ('20000000-0000-4000-b000-00000000000b', '20000000-0000-4000-a000-00000000000d', 'owner', true),
  -- A former worker of A: membership switched off.
  ('20000000-0000-4000-b000-00000000000a', '20000000-0000-4000-a000-00000000000e', 'worker', false);

insert into public.business_modules (business_id, module_key)
values
  ('20000000-0000-4000-b000-00000000000a', 'scheduling'),
  ('20000000-0000-4000-b000-00000000000b', 'scheduling');

insert into public.invites (business_id, phone, token_hash)
values
  ('20000000-0000-4000-b000-00000000000a', '+972500000201', 'hash-a'),
  ('20000000-0000-4000-b000-00000000000b', '+972500000202', 'hash-b');

insert into public.audit_log (business_id, action)
values
  ('20000000-0000-4000-b000-00000000000a', 'test.a'),
  ('20000000-0000-4000-b000-00000000000b', 'test.b');

-- Act as a signed-in user.
create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- Worker of A ---------------------------------------------------------------
select pg_temp.sign_in('20000000-0000-4000-a000-00000000000c');

select results_eq(
  'select slug from public.businesses',
  array['business-a'],
  'worker of A sees business A only'
);
select results_eq(
  'select count(*)::int from public.memberships',
  array[4],
  'worker of A sees the four memberships of A and none of B'
);
select is_empty(
  $$select 1 from public.memberships where business_id = '20000000-0000-4000-b000-00000000000b'$$,
  'worker of A sees no membership of B'
);
select results_eq(
  'select count(*)::int from public.business_modules',
  array[1],
  'worker of A sees the modules of A only'
);
select results_eq(
  'select count(*)::int from public.profiles',
  array[3],
  'worker of A sees themself and the active members of A'
);
select is_empty(
  $$select 1 from public.profiles where id = '20000000-0000-4000-a000-00000000000d'$$,
  'worker of A does not see the owner of B'
);
select is_empty('select 1 from public.invites', 'a worker reads no invites');
select is_empty('select 1 from public.audit_log', 'a worker reads no audit log');
select throws_ok('select 1 from public.templates', '42501', null, 'templates are server-only');

select throws_ok(
  $$update public.businesses set name = 'Hacked' where slug = 'business-a'$$,
  '42501',
  null,
  'a worker cannot rename the business'
);
select throws_ok(
  $$update public.memberships set role = 'owner' where user_id = '20000000-0000-4000-a000-00000000000c'$$,
  '42501',
  null,
  'a worker cannot change their own role'
);
select throws_ok(
  $$insert into public.memberships (business_id, user_id, role)
    values ('20000000-0000-4000-b000-00000000000b', '20000000-0000-4000-a000-00000000000c', 'owner')$$,
  '42501',
  null,
  'a worker cannot join business B'
);
select throws_ok(
  $$update public.profiles set full_name = 'Noa' where id = '20000000-0000-4000-a000-00000000000c'$$,
  '42501',
  null,
  'a worker renames themself only through the server (set_own_profile)'
);
select throws_ok(
  $$update public.profiles set phone = '+972500000999' where id = '20000000-0000-4000-a000-00000000000c'$$,
  '42501',
  null,
  'a worker cannot change their phone number directly'
);

-- Manager of A ---------------------------------------------------------------
select pg_temp.sign_in('20000000-0000-4000-a000-00000000000b');

select results_eq(
  'select token_hash from public.invites',
  array['hash-a'],
  'manager of A reads the invites of A only'
);
select results_eq(
  'select action from public.audit_log',
  array['test.a'],
  'manager of A reads the audit log of A only'
);
select throws_ok(
  $$update public.businesses set name = 'Renamed' where slug = 'business-a'$$,
  '42501',
  null,
  'a manager does not rename the business from the browser'
);

-- Owner of A ---------------------------------------------------------------
select pg_temp.sign_in('20000000-0000-4000-a000-00000000000a');

-- Renaming goes through the server (set_business_details), for owners too.
select throws_ok(
  $$update public.businesses set name = 'Business A2' where slug = 'business-a'$$,
  '42501',
  null,
  'the owner renames only through the server'
);
select throws_ok(
  $$update public.businesses set name = 'Taken over' where slug = 'business-b'$$,
  '42501',
  null,
  'the owner of A cannot rename business B'
);
select throws_ok(
  $$update public.businesses set slug = 'new-slug' where slug = 'business-a'$$,
  '42501',
  null,
  'the slug changes only through the server'
);
select throws_ok(
  $$delete from public.businesses where slug = 'business-a'$$,
  '42501',
  null,
  'nobody deletes a business from the browser'
);
select throws_ok(
  $$insert into public.audit_log (business_id, action) values ('20000000-0000-4000-b000-00000000000a', 'forged')$$,
  '42501',
  null,
  'the audit log is written only by the server'
);

-- Former worker of A ----------------------------------------------------------
select pg_temp.sign_in('20000000-0000-4000-a000-00000000000e');

select is_empty('select 1 from public.businesses', 'an inactive member sees no business');
select results_eq(
  'select count(*)::int from public.profiles',
  array[1],
  'an inactive member sees only themself'
);

-- Chats (20261111000200_chat.sql), with chat on in both ---------------------
reset role;
insert into public.business_modules (business_id, module_key)
values
  ('20000000-0000-4000-b000-00000000000a', 'chat'),
  ('20000000-0000-4000-b000-00000000000b', 'chat');

select pg_temp.sign_in('20000000-0000-4000-a000-00000000000c');
select results_eq(
  'select business_id from public.chat_conversations',
  array['20000000-0000-4000-b000-00000000000a'::uuid],
  'worker of A reads the team''s group of A only'
);
select throws_ok(
  $$insert into public.chat_messages (business_id, conversation_id, author_id, draft_id, body)
    select c.business_id, c.id, '20000000-0000-4000-a000-00000000000c', gen_random_uuid(), 'Hi'
    from public.chat_conversations c$$,
  '42501',
  null,
  'and writes no message from the browser'
);

select pg_temp.sign_in('20000000-0000-4000-a000-00000000000d');
select results_eq(
  'select business_id from public.chat_conversations',
  array['20000000-0000-4000-b000-00000000000b'::uuid],
  'the owner of B reads B''s only'
);

select pg_temp.sign_in('20000000-0000-4000-a000-00000000000e');
select is_empty('select 1 from public.chat_conversations', 'an inactive member reads no chat');

-- Chat's notice (20261111000300_chat_on.sql): the worker and the manager of A
-- and the owner of B have read it.
reset role;
insert into public.chat_notices (business_id, user_id)
values
  ('20000000-0000-4000-b000-00000000000a', '20000000-0000-4000-a000-00000000000c'),
  ('20000000-0000-4000-b000-00000000000a', '20000000-0000-4000-a000-00000000000b'),
  ('20000000-0000-4000-b000-00000000000b', '20000000-0000-4000-a000-00000000000d');

select pg_temp.sign_in('20000000-0000-4000-a000-00000000000c');
select results_eq(
  'select business_id, user_id from public.chat_notices',
  $$values ('20000000-0000-4000-b000-00000000000a'::uuid, '20000000-0000-4000-a000-00000000000c'::uuid)$$,
  'worker of A reads their own notice only, not the manager''s or B''s'
);
select throws_ok(
  $$insert into public.chat_notices (business_id, user_id)
    values ('20000000-0000-4000-b000-00000000000a', '20000000-0000-4000-a000-00000000000c')$$,
  '42501',
  null,
  'and writes none from the browser'
);
select pg_temp.sign_in('20000000-0000-4000-a000-00000000000a');
select is_empty('select 1 from public.chat_notices', 'the owner of A reads none of their people''s');

-- Chat files (20261111000500_chat_files.sql): the manager of A's picture in
-- A's team group, and its thumbnail, in the bucket as the server puts them.
reset role;
insert into public.chat_messages (business_id, conversation_id, author_id, draft_id,
  file_kind, file_path, thumb_path, file_size)
select c.business_id, c.id, '20000000-0000-4000-a000-00000000000b', gen_random_uuid(), 'image',
  c.business_id::text || '/' || c.id::text || '/' || md5('isolation') || '.webp',
  c.business_id::text || '/' || c.id::text || '/' || md5('isolation') || '-s.webp', 42000
from public.chat_conversations c
where c.business_id = '20000000-0000-4000-b000-00000000000a' and c.kind = 'team';
insert into storage.objects (bucket_id, name, metadata)
select 'chat-files', f.name, jsonb_build_object('size', f.bytes, 'mimetype', 'image/webp')
from public.chat_messages m
cross join lateral (values (m.file_path, 40000), (m.thumb_path, 2000)) as f (name, bytes)
where m.business_id = '20000000-0000-4000-b000-00000000000a' and m.file_path is not null;

select pg_temp.sign_in('20000000-0000-4000-a000-00000000000c');
select results_eq(
  $$select count(*)::int from storage.objects
    where bucket_id = 'chat-files' and name like '20000000-0000-4000-b000-00000000000a/%'$$,
  array[2],
  'worker of A reads the picture of A''s team group and its thumbnail'
);
select pg_temp.sign_in('20000000-0000-4000-a000-00000000000d');
select is_empty(
  $$select 1 from storage.objects
    where bucket_id = 'chat-files' and name like '20000000-0000-4000-b000-00000000000a/%'$$,
  'the owner of B reads neither'
);

select * from finish();
rollback;
