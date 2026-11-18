-- Chat on (C2 of the chat plan, 20261111000300_chat_on.sql): chat is on in
-- every template, inside the tab bar, and in every business; the demo reset's
-- seed (private.seed_demo_chat) writes the demo's conversations through the
-- chat functions, all the demo's own and in the past, read by its people as
-- people who were there, with no row of the log; a visitor's message and
-- notice go with the next reset; and the chat's notice (public.chat_notices,
-- public.see_chat_notice) is kept once, for someone on the staff with chat on,
-- by the server alone, and read by its own person alone. Fixed ids of its own;
-- the seed's times are relative to now.
begin;
select plan(33);

------------------------------------------------------------------------------
-- On everywhere (before anything of the test's own)

select is(
  (select count(*)::integer from public.templates t
   where (t.definition #>> '{modules,chat,enabled}')::boolean is distinct from true),
  0,
  'every template switches chat on'
);
select is(
  (select count(*)::integer from public.templates t
   where (
     select count(*) from jsonb_each(t.definition -> 'modules') as entry
     where entry.key in ('scheduling', 'time_clock', 'reservations', 'storefront', 'lists', 'chat')
       and (entry.value ->> 'enabled')::boolean
   ) > 4),
  0,
  'and its tab fits the tab bar in each: four module tabs at most'
);
select is(
  (select count(*)::integer from public.businesses b
   where not private.module_enabled(b.id, 'chat'::public.module_key)),
  0,
  'every business has chat on'
);

------------------------------------------------------------------------------
-- A demo business of the test's own

insert into auth.users (id, aud, role, phone)
values
  ('87000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500003901'),
  ('87000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500003902'),
  ('87000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', '972500003903'),
  ('87000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', '972500003904'),
  ('87000000-0000-4000-a000-000000000005', 'authenticated', 'authenticated', '972500003905'),
  ('87000000-0000-4000-a000-000000000006', 'authenticated', 'authenticated', '972500003906'),
  ('87000000-0000-4000-a000-000000000007', 'authenticated', 'authenticated', '972500003907');

-- 1 the owner, 2 the manager (floor), 3 the first worker (checkout and
-- stock), 4 the second worker (stock), 5 the accountant; 6 in no business; 7
-- on the ConceptApp team.
insert into private.demo_businesses (business_id, definition)
values ('87000000-0000-4000-b000-000000000001', $json$
  {
    "slug": "chat-on-demo", "name": "Chat on demo", "accent": "#7c3aed",
    "address": "Demo street 3", "shabbat_city": "haifa",
    "template": "retail", "renews": false,
    "people": [
      { "user_id": "87000000-0000-4000-a000-000000000001", "role": "owner", "name": "Owner O" },
      { "user_id": "87000000-0000-4000-a000-000000000002", "role": "manager", "name": "Manager M", "departments": ["floor"] },
      { "user_id": "87000000-0000-4000-a000-000000000003", "role": "worker", "name": "Worker W", "departments": ["checkout", "stock"] },
      { "user_id": "87000000-0000-4000-a000-000000000004", "role": "worker", "name": "Worker V", "departments": ["stock"] },
      { "user_id": "87000000-0000-4000-a000-000000000005", "role": "accountant", "name": "Accountant A" }
    ]
  }
  $json$);

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated, service_role;

create function pg_temp.id_of(saved text) returns uuid language sql as $$
  select i.id from ids i where i.name = saved
$$;
-- The demo business's conversations, saved by kind (and department key).
create function pg_temp.save_chats() returns void language sql as $$
  delete from ids;
  insert into ids
  select coalesce(d.key, c.kind), c.id
  from public.chat_conversations c
  left join public.departments d on d.id = c.department_id
  where c.business_id = '87000000-0000-4000-b000-000000000001';
$$;

set local role service_role;
select lives_ok(
  $$select public.reset_demo_business('87000000-0000-4000-b000-000000000001')$$,
  'the reset makes the demo business'
);
reset role;
select pg_temp.save_chats();

select ok(
  private.module_enabled('87000000-0000-4000-b000-000000000001', 'chat'::public.module_key),
  'with chat on, from its template'
);

------------------------------------------------------------------------------
-- The seed

select results_eq(
  $$select m.author_id, m.kind, m.pinned from public.chat_messages m
    where m.conversation_id = pg_temp.id_of('team') order by m.created_at$$,
  $$values
    ('87000000-0000-4000-a000-000000000001'::uuid, 'text'::text, false),
    ('87000000-0000-4000-a000-000000000002'::uuid, 'text'::text, false),
    ('87000000-0000-4000-a000-000000000002'::uuid, 'announcement'::text, true)$$,
  'the team''s group: the owner''s thanks, the manager''s morning message and, from C3, her pinned announcement'
);
-- From C3 (20261111000400_chat_announce.sql): chat_announce.test.sql has the
-- rest of the announcement.
select is(
  (select count(*)::integer from public.chat_messages m
   where m.business_id = '87000000-0000-4000-b000-000000000001'
     and (m.kind = 'announcement' or m.pinned))
  || '|' || (select count(*)::integer from public.chat_acks a
   where a.business_id = '87000000-0000-4000-b000-000000000001')
  || '|' || (select count(*)::integer from public.notifications n
   where n.business_id = '87000000-0000-4000-b000-000000000001'
     and n.kind = 'chat.announcement'),
  '1|2|3',
  'one announcement, which the first two workers confirmed, and its lines for the owner and both workers'
);
select is(
  (select count(*)::integer from public.chat_reads r
   where r.conversation_id = pg_temp.id_of('team')
     and r.user_id in ('87000000-0000-4000-a000-000000000003', '87000000-0000-4000-a000-000000000004')
     and r.read_at >= (select max(m.created_at) from public.chat_messages m
                       where m.conversation_id = pg_temp.id_of('team')))
  || '|' || (select string_agg((n.read_at is not null)::text, ',' order by n.user_id)
     from public.notifications n
     where n.business_id = '87000000-0000-4000-b000-000000000001'
       and n.dedupe_key = 'chat.' || pg_temp.id_of('team')::text
       and n.user_id in ('87000000-0000-4000-a000-000000000001',
         '87000000-0000-4000-a000-000000000003', '87000000-0000-4000-a000-000000000004')),
  '2|false,true,true',
  'the first two workers read the group up to then, and their lines about it; the owner''s waits'
);
select results_eq(
  $$select d.key, m.author_id from public.chat_messages m
    join public.chat_conversations c on c.id = m.conversation_id
    join public.departments d on d.id = c.department_id
    where c.business_id = '87000000-0000-4000-b000-000000000001' and c.kind = 'department'
    order by m.created_at$$,
  $$values
    ('checkout'::text, '87000000-0000-4000-a000-000000000003'::uuid),
    ('checkout'::text, '87000000-0000-4000-a000-000000000002'::uuid)$$,
  'the first worker''s first department: their message and the manager''s answer, and no other group'
);
select results_eq(
  $$select c.person_a, c.person_b, m.author_id from public.chat_conversations c
    join public.chat_messages m on m.conversation_id = c.id
    where c.business_id = '87000000-0000-4000-b000-000000000001' and c.kind = 'direct'
    order by m.created_at$$,
  $$values
    ('87000000-0000-4000-a000-000000000002'::uuid, '87000000-0000-4000-a000-000000000003'::uuid,
     '87000000-0000-4000-a000-000000000002'::uuid),
    ('87000000-0000-4000-a000-000000000002'::uuid, '87000000-0000-4000-a000-000000000003'::uuid,
     '87000000-0000-4000-a000-000000000003'::uuid)$$,
  'one private chat, the manager''s question and the first worker''s answer'
);
select pg_temp.save_chats();

select pg_temp.sign_in('87000000-0000-4000-a000-000000000002');
select is(
  (select i.unread || '|' || (
     public.chat_seen(i.conversation) >= (
       select min(m.created_at) from public.chat_messages m where m.conversation_id = i.conversation
     ))::text
   from public.chat_inbox('87000000-0000-4000-b000-000000000001') i
   where i.kind = 'direct'),
  '1|true',
  'the worker read the question, and the answer waits for the manager'
);
reset role;

select is(
  (select count(*)::integer || '/' || (count(*) filter (where m.seeded and m.created_at < now()))::integer
   from public.chat_messages m
   where m.business_id = '87000000-0000-4000-b000-000000000001'),
  '7/7',
  'everything the seed wrote is the demo''s own, and in the past'
);

select pg_temp.sign_in('87000000-0000-4000-a000-000000000003');
select is(
  (select count(*) from public.chat_page('87000000-0000-4000-b000-000000000001', pg_temp.id_of('team')))::text
  || '|' || (select count(*) from public.chat_page('87000000-0000-4000-b000-000000000001',
    pg_temp.id_of('checkout')))::text,
  '3|2',
  'a worker reads the groups'' history, as someone who was there'
);
reset role;

select is(
  (select count(*)::integer from public.audit_log a
   where a.business_id = '87000000-0000-4000-b000-000000000001' and a.action ~ '^chat\.'),
  0,
  'the seed writes no row of the log'
);
-- Chat lines only: the demo's sick note (20261111000700_documents.sql) is a
-- line for the office, the accountant included.
select is(
  (select count(*)::integer from public.notifications n
   where n.business_id = '87000000-0000-4000-b000-000000000001'
     and n.user_id = '87000000-0000-4000-a000-000000000005'
     and n.kind ~ '^chat\.'),
  0,
  'and tells the accountant, who is in no chat, nothing of it'
);
-- The demo's documents (C6), from the same people as the conversations, and
-- the accountant: samples with the category's words, no note and no file.
select results_eq(
  $$select d.sample, d.author_id, d.title, d.note is null and d.file_path is null,
      (select string_agg(r.person_id::text || '=' || (r.confirmed_at is not null)::text, ','
         order by r.person_id)
       from public.document_recipients r where r.document_id = d.id),
      d.opened_by
    from public.documents d
    where d.business_id = '87000000-0000-4000-b000-000000000001'
    order by d.sample collate "C"$$,
  $$values
    ('payslip'::text, '87000000-0000-4000-a000-000000000005'::uuid, 'תלוש שכר'::text, true,
     '87000000-0000-4000-a000-000000000003=false'::text, null::uuid),
    ('procedure'::text, '87000000-0000-4000-a000-000000000002'::uuid, 'נוהל'::text, true,
     '87000000-0000-4000-a000-000000000001=false,87000000-0000-4000-a000-000000000003=false,87000000-0000-4000-a000-000000000004=true'::text,
     null::uuid),
    ('sick_note'::text, '87000000-0000-4000-a000-000000000003'::uuid, 'אישור מחלה'::text, true,
     null::text, '87000000-0000-4000-a000-000000000001'::uuid)$$,
  'the reset''s seed writes the demo''s documents: the accountant''s payslip to the first worker, the manager''s procedure to everyone else on the staff, confirmed by the second worker, and the first worker''s sick note, opened by the owner'
);

------------------------------------------------------------------------------
-- A visitor writes; the reset takes it back

select public.send_chat_message('87000000-0000-4000-a000-000000000004',
  '87000000-0000-4000-b000-000000000001', gen_random_uuid(), 'A visitor wrote this',
  pg_temp.id_of('team'));
select public.see_chat_notice('87000000-0000-4000-a000-000000000004',
  '87000000-0000-4000-b000-000000000001');
select is(
  (select count(*)::integer from public.chat_messages m
   where m.business_id = '87000000-0000-4000-b000-000000000001' and not m.seeded),
  1,
  'a visitor''s message is not the demo''s own'
);

set local role service_role;
select lives_ok(
  $$select public.reset_demo_business('87000000-0000-4000-b000-000000000001')$$,
  'the reset goes through with a visitor''s message and notice'
);
reset role;
select pg_temp.save_chats();

select is(
  (select (count(*) filter (where m.body = 'A visitor wrote this'))::integer
     || '/' || (count(*) filter (where m.seeded))::integer || '/' || count(*)::integer
   from public.chat_messages m
   where m.business_id = '87000000-0000-4000-b000-000000000001'),
  '0/7/7',
  'the visitor''s message goes with it, and the demo''s come back'
);
select is(
  (select count(*)::integer from public.chat_notices n
   where n.business_id = '87000000-0000-4000-b000-000000000001'),
  0,
  'and so does the visitor''s notice'
);

------------------------------------------------------------------------------
-- The notice

select ok(
  has_table_privilege('authenticated', 'public.chat_notices', 'select')
  and not has_table_privilege('authenticated', 'public.chat_notices', 'insert, update, delete')
  and not has_table_privilege('anon', 'public.chat_notices', 'select, insert, update, delete')
  and not has_table_privilege('service_role', 'public.chat_notices', 'select, insert, update, delete'),
  'the browser reads notices and writes none, and the server role reads none'
);
select ok(
  has_function_privilege('service_role', 'public.see_chat_notice(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.see_chat_notice(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.see_chat_notice(uuid, uuid)', 'execute'),
  'only the server marks a notice read'
);
select ok(
  not has_function_privilege('service_role', 'private.seed_demo_chat(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.seed_demo_chat(uuid)', 'execute')
  and not has_function_privilege('anon', 'private.seed_demo_chat(uuid)', 'execute'),
  'and only the reset seeds the demo''s chats'
);

select lives_ok(
  $$select public.see_chat_notice('87000000-0000-4000-a000-000000000003',
    '87000000-0000-4000-b000-000000000001')$$,
  'someone on the staff reads the notice'
);
update public.chat_notices set seen_at = '2026-11-01 08:00+00'
where business_id = '87000000-0000-4000-b000-000000000001'
  and user_id = '87000000-0000-4000-a000-000000000003';
select public.see_chat_notice('87000000-0000-4000-a000-000000000003',
  '87000000-0000-4000-b000-000000000001');
select is(
  (select n.seen_at from public.chat_notices n
   where n.business_id = '87000000-0000-4000-b000-000000000001'
     and n.user_id = '87000000-0000-4000-a000-000000000003'),
  '2026-11-01 08:00+00'::timestamptz,
  'once: reading it again keeps the first time'
);
select throws_ok(
  $$select public.see_chat_notice('87000000-0000-4000-a000-000000000005',
    '87000000-0000-4000-b000-000000000001')$$,
  '42501', null, 'the accountant, who is in no chat, is refused'
);
select throws_ok(
  $$select public.see_chat_notice('87000000-0000-4000-a000-000000000006',
    '87000000-0000-4000-b000-000000000001')$$,
  '42501', null, 'and so is someone not in the business'
);
update public.business_modules set enabled = false
where business_id = '87000000-0000-4000-b000-000000000001' and module_key = 'chat';
select throws_ok(
  $$select public.see_chat_notice('87000000-0000-4000-a000-000000000002',
    '87000000-0000-4000-b000-000000000001')$$,
  '55000', null, 'and anyone while chat is off'
);
update public.business_modules set enabled = true
where business_id = '87000000-0000-4000-b000-000000000001' and module_key = 'chat';
select public.see_chat_notice('87000000-0000-4000-a000-000000000002',
  '87000000-0000-4000-b000-000000000001');
select is(
  (select count(*)::integer from public.audit_log a
   where a.business_id = '87000000-0000-4000-b000-000000000001' and a.action ~ '^chat\.'),
  0,
  'reading it writes no row of the log'
);

insert into public.platform_staff (user_id, role)
values ('87000000-0000-4000-a000-000000000007', 'onboarder');
insert into public.view_sessions (staff_id, business_id, role)
values ('87000000-0000-4000-a000-000000000007', '87000000-0000-4000-b000-000000000001', 'manager');

select pg_temp.sign_in('87000000-0000-4000-a000-000000000003');
select results_eq(
  'select user_id from public.chat_notices',
  $$values ('87000000-0000-4000-a000-000000000003'::uuid)$$,
  'each person reads their own notice'
);
select pg_temp.sign_in('87000000-0000-4000-a000-000000000002');
select results_eq(
  'select user_id from public.chat_notices',
  $$values ('87000000-0000-4000-a000-000000000002'::uuid)$$,
  'and nobody else''s, a manager neither'
);
select pg_temp.sign_in('87000000-0000-4000-a000-000000000001');
select is_empty(
  'select 1 from public.chat_notices',
  'the owner, who hasn''t read it, reads no row'
);
select pg_temp.sign_in('87000000-0000-4000-a000-000000000007');
select is_empty(
  'select 1 from public.chat_notices',
  'and the ConceptApp team viewing the business as a manager reads none'
);
reset role;

select * from finish();
rollback;
