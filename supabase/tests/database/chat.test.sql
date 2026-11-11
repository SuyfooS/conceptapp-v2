-- Chat in the database (C1 of the chat plan): every business has its team's
-- group and every department its own; a private chat is read by its two people
-- and by nobody else (not the owner, not a manager, not the accountant, not
-- the ConceptApp team, not a view session as any role, not another business);
-- someone new reads a group from when they joined it, and someone who comes
-- back from their return, a pinned announcement whenever, and a page stops
-- there; the list and the sync's version; the rules for sending, removing and
-- pinning, each before anything is written; no row of the activity log about
-- chats for a view session, and no row at all for sending, opening, reading or
-- muting; and the job that empties removed texts and a demo's visitors'
-- messages. Fixed ids of its own, so nothing here meets the seeded people, and
-- explicit times before now (but for the last message, sent now).
begin;
select plan(132);

insert into auth.users (id, aud, role, phone)
values
  ('85000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500003701'),
  ('85000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500003702'),
  ('85000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', '972500003703'),
  ('85000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', '972500003704'),
  ('85000000-0000-4000-a000-000000000005', 'authenticated', 'authenticated', '972500003705'),
  ('85000000-0000-4000-a000-000000000006', 'authenticated', 'authenticated', '972500003706'),
  ('85000000-0000-4000-a000-000000000007', 'authenticated', 'authenticated', '972500003707'),
  ('85000000-0000-4000-a000-000000000008', 'authenticated', 'authenticated', '972500003708'),
  ('85000000-0000-4000-a000-000000000009', 'authenticated', 'authenticated', '972500003709'),
  ('85000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', '972500003710'),
  ('85000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', '972500003711'),
  ('85000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', '972500003712'),
  ('85000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', '972500003713');

-- N: 1 Uri the owner, 2 Shiran a manager, 3 Noa (kitchen) and 4 Yoav (bar)
-- workers, 5 Galit the accountant, 6 Tal a worker who joined on the 10th and
-- the kitchen with him, 7 Rina who left (still in the kitchen's rows).
-- The ConceptApp team: 8 views N as an owner, 9 as a manager, a as an
-- accountant, c views nothing. M: b Moshe its owner. D, a demo: d its owner.
insert into public.businesses (id, slug, name)
values
  ('85000000-0000-4000-b000-000000000001', 'chat-n', 'Chat N'),
  ('85000000-0000-4000-b000-000000000002', 'chat-m', 'Chat M'),
  ('85000000-0000-4000-b000-000000000003', 'chat-d', 'Chat D');

insert into public.memberships (business_id, user_id, role, active, created_at)
values
  ('85000000-0000-4000-b000-000000000001', '85000000-0000-4000-a000-000000000001', 'owner', true, '2026-11-01 08:00+00'),
  ('85000000-0000-4000-b000-000000000001', '85000000-0000-4000-a000-000000000002', 'manager', true, '2026-11-01 08:00+00'),
  ('85000000-0000-4000-b000-000000000001', '85000000-0000-4000-a000-000000000003', 'worker', true, '2026-11-01 08:00+00'),
  ('85000000-0000-4000-b000-000000000001', '85000000-0000-4000-a000-000000000004', 'worker', true, '2026-11-01 08:00+00'),
  ('85000000-0000-4000-b000-000000000001', '85000000-0000-4000-a000-000000000005', 'accountant', true, '2026-11-01 08:00+00'),
  ('85000000-0000-4000-b000-000000000001', '85000000-0000-4000-a000-000000000006', 'worker', true, '2026-11-10 08:00+00'),
  ('85000000-0000-4000-b000-000000000001', '85000000-0000-4000-a000-000000000007', 'worker', false, '2026-11-01 08:00+00'),
  ('85000000-0000-4000-b000-000000000002', '85000000-0000-4000-a000-00000000000b', 'owner', true, '2026-11-01 08:00+00'),
  ('85000000-0000-4000-b000-000000000003', '85000000-0000-4000-a000-00000000000d', 'owner', true, '2026-11-01 08:00+00');

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('85000000-0000-4000-b000-000000000001', 'chat', true, '{}'),
  ('85000000-0000-4000-b000-000000000002', 'chat', true, '{}'),
  ('85000000-0000-4000-b000-000000000003', 'chat', true, '{}');

insert into private.demo_businesses (business_id, definition)
values ('85000000-0000-4000-b000-000000000003', '{"slug": "chat-d"}');

insert into public.platform_staff (user_id, role)
values
  ('85000000-0000-4000-a000-000000000008', 'onboarder'),
  ('85000000-0000-4000-a000-000000000009', 'onboarder'),
  ('85000000-0000-4000-a000-00000000000a', 'onboarder'),
  ('85000000-0000-4000-a000-00000000000c', 'onboarder');
insert into public.view_sessions (staff_id, business_id, role)
values
  ('85000000-0000-4000-a000-000000000008', '85000000-0000-4000-b000-000000000001', 'owner'),
  ('85000000-0000-4000-a000-000000000009', '85000000-0000-4000-b000-000000000001', 'manager'),
  ('85000000-0000-4000-a000-00000000000a', '85000000-0000-4000-b000-000000000001', 'accountant');

insert into public.departments (id, business_id, key, name, position)
values
  ('85000000-0000-4000-d000-000000000001', '85000000-0000-4000-b000-000000000001', 'kitchen', 'Kitchen', 0),
  ('85000000-0000-4000-d000-000000000002', '85000000-0000-4000-b000-000000000001', 'bar', 'Bar', 1);
insert into public.department_members (department_id, business_id, user_id, added_at)
values
  ('85000000-0000-4000-d000-000000000001', '85000000-0000-4000-b000-000000000001', '85000000-0000-4000-a000-000000000003', '2026-11-01 08:00+00'),
  ('85000000-0000-4000-d000-000000000001', '85000000-0000-4000-b000-000000000001', '85000000-0000-4000-a000-000000000006', '2026-11-10 08:00+00'),
  ('85000000-0000-4000-d000-000000000001', '85000000-0000-4000-b000-000000000001', '85000000-0000-4000-a000-000000000007', '2026-11-01 08:00+00'),
  ('85000000-0000-4000-d000-000000000002', '85000000-0000-4000-b000-000000000001', '85000000-0000-4000-a000-000000000004', '2026-11-01 08:00+00');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create temporary table ids (name text primary key, id uuid) on commit drop;
create temporary table sent (name text primary key, result jsonb) on commit drop;
grant all on ids, sent to authenticated, service_role;

create function pg_temp.id_of(saved text) returns uuid language sql as $$
  select i.id from ids i where i.name = saved
$$;
-- What the caller reads of a conversation: the conversation, its messages, and
-- the read marks on it, counted.
create function pg_temp.seen(saved text) returns text language sql as $$
  select (select count(*) from public.chat_conversations c where c.id = pg_temp.id_of(saved))::text
    || '/' || (select count(*) from public.chat_messages m where m.conversation_id = pg_temp.id_of(saved))::text
    || '/' || (select count(*) from public.chat_reads r where r.conversation_id = pg_temp.id_of(saved))::text
$$;
-- Sends as `actor` in N, and keeps what came back under `saved`.
create function pg_temp.send(saved text, actor uuid, words text, at_time timestamptz,
  in_conversation uuid default null, to_person uuid default null,
  announce boolean default false) returns uuid language sql as $$
  insert into sent values (saved, public.send_chat_message(actor,
    '85000000-0000-4000-b000-000000000001', gen_random_uuid(), words,
    in_conversation, to_person, announce, at_time));
  insert into ids select saved, (s.result ->> 'message')::uuid from sent s where s.name = saved;
  select i.id from ids i where i.name = saved
$$;

insert into ids
select 'team', c.id from public.chat_conversations c
where c.business_id = '85000000-0000-4000-b000-000000000001' and c.kind = 'team';
insert into ids
select 'm-team', c.id from public.chat_conversations c
where c.business_id = '85000000-0000-4000-b000-000000000002' and c.kind = 'team';
insert into ids
select 'd-team', c.id from public.chat_conversations c
where c.business_id = '85000000-0000-4000-b000-000000000003' and c.kind = 'team';
insert into ids
select 'kitchen', c.id from public.chat_conversations c
where c.department_id = '85000000-0000-4000-d000-000000000001';
insert into ids
select 'bar', c.id from public.chat_conversations c
where c.department_id = '85000000-0000-4000-d000-000000000002';

------------------------------------------------------------------------------
-- Made with their business and department

select is(
  (select count(*)::integer from public.chat_conversations c
   where c.kind = 'team' and c.business_id in ('85000000-0000-4000-b000-000000000001',
     '85000000-0000-4000-b000-000000000002', '85000000-0000-4000-b000-000000000003')),
  3,
  'a new business has its team''s group from the start'
);
select is(
  (select count(*)::integer from public.businesses b
   where (select count(*) from public.chat_conversations c
          where c.business_id = b.id and c.kind = 'team') <> 1),
  0,
  'and every business has exactly one, those from before chat too'
);
select is(
  (select count(*)::integer from public.departments d
   where not exists (select 1 from public.chat_conversations c
                     where c.department_id = d.id and c.kind = 'department')),
  0,
  'every department has its group'
);

-- The bar is removed: its group closes.
select public.set_departments('85000000-0000-4000-a000-000000000001',
  '85000000-0000-4000-b000-000000000001', '[{"key": "kitchen", "name": "Kitchen"}]');
select isnt(
  (select c.closed_at from public.chat_conversations c where c.id = pg_temp.id_of('bar')),
  null,
  'removing a department closes its group'
);
select throws_ok(
  $$select public.send_chat_message('85000000-0000-4000-a000-000000000002',
    '85000000-0000-4000-b000-000000000001', gen_random_uuid(), 'Anyone?',
    pg_temp.id_of('bar'), at_time => '2026-11-05 08:30+00')$$,
  '55000', null, 'a closed group takes no message'
);
select pg_temp.sign_in('85000000-0000-4000-a000-000000000004');
select is(pg_temp.seen('bar'), '0/0/0', 'its people no longer read it');
select pg_temp.sign_in('85000000-0000-4000-a000-000000000002');
select is(pg_temp.seen('bar'), '1/0/0', 'a moderator still does');
reset role;
select public.set_departments('85000000-0000-4000-a000-000000000001',
  '85000000-0000-4000-b000-000000000001',
  '[{"key": "kitchen", "name": "Kitchen"}, {"key": "bar", "name": "Bar"}]');
select is(
  (select c.closed_at from public.chat_conversations c where c.id = pg_temp.id_of('bar')),
  null,
  'bringing it back opens it'
);

------------------------------------------------------------------------------
-- Nobody but the server writes

select pg_temp.sign_in('85000000-0000-4000-a000-000000000003');
select throws_ok(
  $$select public.send_chat_message('85000000-0000-4000-a000-000000000003',
    '85000000-0000-4000-b000-000000000001', gen_random_uuid(), 'From the browser',
    pg_temp.id_of('team'))$$,
  '42501', null, 'a signed-in person cannot send from the browser'
);
select throws_ok(
  $$insert into public.chat_messages (business_id, conversation_id, author_id, draft_id, body)
    values ('85000000-0000-4000-b000-000000000001', pg_temp.id_of('team'),
      '85000000-0000-4000-a000-000000000003', gen_random_uuid(), 'Forged')$$,
  '42501', null, 'nor write a message'
);
select throws_ok(
  $$select count(*) from private.chat_removed$$,
  '42501', null, 'nor read what removed messages said'
);
reset role;
select ok(
  not has_table_privilege('service_role', 'public.chat_messages', 'select')
  and not has_table_privilege('service_role', 'public.chat_conversations', 'select')
  and not has_table_privilege('service_role', 'public.chat_reads', 'select')
  and not has_table_privilege('service_role', 'private.chat_removed', 'select')
  and not has_table_privilege('service_role', 'private.file_uploads', 'select')
  -- With C4's `upload` last (20261111000500_chat_files.sql).
  and has_function_privilege('service_role',
    'public.send_chat_message(uuid, uuid, uuid, text, uuid, uuid, boolean, timestamptz, uuid)', 'execute'),
  'the server role reads no chat, so no console page can; it only calls the functions'
);

------------------------------------------------------------------------------
-- Sending

select pg_temp.send('t1', '85000000-0000-4000-a000-000000000002', 'Good morning, team',
  '2026-11-05 09:00+00', pg_temp.id_of('team'));
select pg_temp.send('k1', '85000000-0000-4000-a000-000000000003', 'Kitchen, old',
  '2026-11-05 09:05+00', pg_temp.id_of('kitchen'));
select pg_temp.send('ka', '85000000-0000-4000-a000-000000000002', 'From management',
  '2026-11-05 09:10+00', pg_temp.id_of('kitchen'), announce => true);
insert into sent values ('dm1', public.send_chat_message('85000000-0000-4000-a000-000000000003',
  '85000000-0000-4000-b000-000000000001', '85000000-0000-4000-e000-000000000001',
  '  Just between us  ', to_person => '85000000-0000-4000-a000-000000000004',
  at_time => '2026-11-05 10:00+00'));
insert into ids
select 'dm1', (s.result ->> 'message')::uuid from sent s where s.name = 'dm1';
insert into ids
select 'dm', (s.result ->> 'conversation')::uuid from sent s where s.name = 'dm1';
select pg_temp.send('t2', '85000000-0000-4000-a000-000000000001', 'Welcome, Tal',
  '2026-11-10 09:00+00', pg_temp.id_of('team'));

select is(
  (select c.kind || '/' || (c.person_a < c.person_b)::text || '/' || m.body
   from public.chat_conversations c
   join public.chat_messages m on m.conversation_id = c.id
   where c.id = pg_temp.id_of('dm')),
  'direct/true/Just between us',
  'the first message opens their private chat, the lower id first, and keeps the text trimmed'
);
select is(
  public.send_chat_message('85000000-0000-4000-a000-000000000003',
    '85000000-0000-4000-b000-000000000001', '85000000-0000-4000-e000-000000000001',
    'Just between us', to_person => '85000000-0000-4000-a000-000000000004',
    at_time => '2026-11-05 10:00:05+00'),
  (select s.result from sent s where s.name = 'dm1'),
  'sending the same draft again gives back the same message'
);
select is(
  (select m.pinned::text || '/' || m.kind from public.chat_messages m where m.id = pg_temp.id_of('ka')),
  'true/announcement',
  'an announcement is pinned'
);
select throws_ok(
  $$select public.send_chat_message('85000000-0000-4000-a000-000000000007',
    '85000000-0000-4000-b000-000000000001', gen_random_uuid(), 'Still here?',
    pg_temp.id_of('team'), at_time => '2026-11-05 11:00+00')$$,
  '42501', null, 'someone who left sends nothing'
);
select throws_ok(
  $$select public.send_chat_message('85000000-0000-4000-a000-000000000005',
    '85000000-0000-4000-b000-000000000001', gen_random_uuid(), 'From the office',
    pg_temp.id_of('team'), at_time => '2026-11-05 11:00+00')$$,
  '42501', null, 'nor does the accountant, who is off the staff'
);
select throws_ok(
  $$select public.send_chat_message('85000000-0000-4000-a000-000000000003',
    '85000000-0000-4000-b000-000000000001', gen_random_uuid(), 'Hello',
    to_person => '85000000-0000-4000-a000-000000000005', at_time => '2026-11-05 11:00+00')$$,
  '42501', null, 'and nobody opens a private chat with them'
);
select throws_ok(
  $$select public.send_chat_message('85000000-0000-4000-a000-000000000003',
    '85000000-0000-4000-b000-000000000001', gen_random_uuid(), 'To whom?',
    at_time => '2026-11-05 11:00+00')$$,
  '22023', null, 'a message goes to a conversation or a person'
);
select throws_ok(
  $$select public.send_chat_message('85000000-0000-4000-a000-000000000004',
    '85000000-0000-4000-b000-000000000001', gen_random_uuid(), 'Hi kitchen',
    pg_temp.id_of('kitchen'), at_time => '2026-11-05 11:00+00')$$,
  'P0002', null, 'nobody writes in a group they are not in'
);
select throws_ok(
  $$select public.send_chat_message('85000000-0000-4000-a000-000000000003',
    '85000000-0000-4000-b000-000000000001', gen_random_uuid(), 'Hi M',
    pg_temp.id_of('m-team'), at_time => '2026-11-05 11:00+00')$$,
  'P0002', null, 'nor in another business''s'
);
select throws_ok(
  $$select public.send_chat_message('85000000-0000-4000-a000-000000000003',
    '85000000-0000-4000-b000-000000000001', gen_random_uuid(), 'Hear me',
    pg_temp.id_of('team'), announce => true, at_time => '2026-11-05 11:00+00')$$,
  '42501', null, 'a worker posts no announcement'
);
select throws_ok(
  $$select public.send_chat_message('85000000-0000-4000-a000-000000000002',
    '85000000-0000-4000-b000-000000000001', gen_random_uuid(), 'Hear me',
    to_person => '85000000-0000-4000-a000-000000000003', announce => true,
    at_time => '2026-11-05 11:00+00')$$,
  '42501', null, 'and a manager none in a private chat'
);

update public.business_modules set settings = '{"teamGroupWho": "announcers"}'
where business_id = '85000000-0000-4000-b000-000000000001' and module_key = 'chat';
select throws_ok(
  $$select public.send_chat_message('85000000-0000-4000-a000-000000000003',
    '85000000-0000-4000-b000-000000000001', gen_random_uuid(), 'Me too',
    pg_temp.id_of('team'), at_time => '2026-11-05 09:30+00')$$,
  '42501', null, 'when only management writes in the team''s group, a worker doesn''t'
);
select lives_ok(
  $$select pg_temp.send('t-announcer', '85000000-0000-4000-a000-000000000002', 'Noted',
    '2026-11-05 09:30+00', pg_temp.id_of('team'))$$,
  'and a manager does'
);
update public.business_modules set settings = '{}'
where business_id = '85000000-0000-4000-b000-000000000001' and module_key = 'chat';

select throws_ok(
  $$select public.send_chat_message('85000000-0000-4000-a000-000000000003',
    '85000000-0000-4000-b000-000000000001', gen_random_uuid(), E'  \n\t  ',
    pg_temp.id_of('kitchen'), at_time => '2026-11-05 11:00+00')$$,
  '22023', null, 'an empty message is refused'
);
select throws_ok(
  $$select public.send_chat_message('85000000-0000-4000-a000-000000000003',
    '85000000-0000-4000-b000-000000000001', gen_random_uuid(), repeat('א', 2001),
    pg_temp.id_of('dm'), at_time => '2026-11-05 10:01+00')$$,
  '22023', null, 'and one of 2001 characters'
);
select lives_ok(
  $$select pg_temp.send('dm2', '85000000-0000-4000-a000-000000000003', repeat('א', 2000),
    '2026-11-05 10:01+00', pg_temp.id_of('dm'))$$,
  'one of 2000 goes'
);
select count(public.send_chat_message('85000000-0000-4000-a000-000000000004',
  '85000000-0000-4000-b000-000000000001', gen_random_uuid(), 'Quick ' || g::text,
  pg_temp.id_of('team'), at_time => '2026-11-06 10:00:00+00'::timestamptz + g * interval '1 second'))
from generate_series(1, 30) as g;
select throws_ok(
  $$select public.send_chat_message('85000000-0000-4000-a000-000000000004',
    '85000000-0000-4000-b000-000000000001', gen_random_uuid(), 'One more',
    pg_temp.id_of('team'), at_time => '2026-11-06 10:00:45+00')$$,
  '54000', null, 'the 31st message in a minute waits'
);

update public.business_modules set enabled = false
where business_id = '85000000-0000-4000-b000-000000000001' and module_key = 'chat';
select throws_ok(
  $$select public.send_chat_message('85000000-0000-4000-a000-000000000003',
    '85000000-0000-4000-b000-000000000001', gen_random_uuid(), 'Anyone?',
    pg_temp.id_of('team'), at_time => '2026-11-05 11:00+00')$$,
  '55000', null, 'with chat off nothing is sent'
);
select pg_temp.sign_in('85000000-0000-4000-a000-000000000003');
select is(
  (select count(*)::integer from public.chat_conversations)
  + (select count(*)::integer from public.chat_messages),
  0,
  'and nothing is read'
);
reset role;
update public.business_modules set enabled = true
where business_id = '85000000-0000-4000-b000-000000000001' and module_key = 'chat';

------------------------------------------------------------------------------
-- A private chat: its two people and nobody else

select public.read_chat('85000000-0000-4000-a000-000000000004', pg_temp.id_of('dm'),
  null, '2026-11-05 10:30+00');

select pg_temp.sign_in('85000000-0000-4000-a000-000000000003');
select is(pg_temp.seen('dm'), '1/2/1', 'Noa reads her private chat with Yoav, and her own read mark');
select pg_temp.sign_in('85000000-0000-4000-a000-000000000004');
select is(pg_temp.seen('dm'), '1/2/1', 'and so does Yoav');
select pg_temp.sign_in('85000000-0000-4000-a000-000000000001');
select is(pg_temp.seen('dm'), '0/0/0', 'the owner reads nothing of it, not even who read it');
select is(
  (select count(*)::integer from public.chat_inbox('85000000-0000-4000-b000-000000000001') i
   where i.conversation = pg_temp.id_of('dm'))
  + (select count(*)::integer
     from public.chat_page('85000000-0000-4000-b000-000000000001', pg_temp.id_of('dm'))),
  0,
  'nor lists it, nor reads a page of it'
);
select pg_temp.sign_in('85000000-0000-4000-a000-000000000002');
select is(pg_temp.seen('dm'), '0/0/0', 'nor does a manager');
select is(
  (select count(*)::integer from public.chat_inbox('85000000-0000-4000-b000-000000000001') i
   where i.conversation = pg_temp.id_of('dm'))
  + (select count(*)::integer
     from public.chat_page('85000000-0000-4000-b000-000000000001', pg_temp.id_of('dm'))),
  0,
  'who lists it no more than the owner, nor reads a page of it'
);
select pg_temp.sign_in('85000000-0000-4000-a000-000000000005');
select is(pg_temp.seen('dm'), '0/0/0', 'nor the accountant');
select is(
  (select count(*)::integer from public.chat_conversations)
  + (select count(*)::integer from public.chat_messages)
  + (select count(*)::integer from public.chat_inbox('85000000-0000-4000-b000-000000000001'))
  + (select count(*)::integer
     from public.chat_page('85000000-0000-4000-b000-000000000001', pg_temp.id_of('team')))
  + (select count(*)::integer from public.announcement_readers(pg_temp.id_of('ka')))
  + (public.chat_seen(pg_temp.id_of('dm')) is not null)::integer,
  0,
  'the accountant reads no group either, and lists none'
);
select pg_temp.sign_in('85000000-0000-4000-a000-00000000000c');
select is(pg_temp.seen('dm'), '0/0/0', 'nor the ConceptApp team');
select pg_temp.sign_in('85000000-0000-4000-a000-000000000008');
select is(pg_temp.seen('dm'), '0/0/0', 'nor the team viewing as an owner');
select is(
  (select count(*)::integer from public.chat_conversations)
  + (select count(*)::integer from public.chat_messages)
  + (select count(*)::integer from public.chat_inbox('85000000-0000-4000-b000-000000000001'))
  + (select count(*)::integer
     from public.chat_page('85000000-0000-4000-b000-000000000001', pg_temp.id_of('team'))),
  0,
  'which reads no group either, and lists none'
);
select pg_temp.sign_in('85000000-0000-4000-a000-000000000009');
select is(pg_temp.seen('dm'), '0/0/0', 'or as a manager');
select is(
  (select count(*)::integer from public.chat_conversations)
  + (select count(*)::integer from public.chat_messages)
  + (select count(*)::integer from public.chat_acks),
  0,
  'a view reads no chat at all, groups included'
);
select is(
  (select count(*)::integer from public.chat_inbox('85000000-0000-4000-b000-000000000001'))
  + (select count(*)::integer
     from public.chat_page('85000000-0000-4000-b000-000000000001', pg_temp.id_of('team'))),
  0,
  'and lists none, nor reads a page of one'
);
select pg_temp.sign_in('85000000-0000-4000-a000-00000000000a');
select is(pg_temp.seen('dm'), '0/0/0', 'or as an accountant');
select is(
  (select count(*)::integer from public.chat_conversations)
  + (select count(*)::integer from public.chat_messages)
  + (select count(*)::integer from public.chat_inbox('85000000-0000-4000-b000-000000000001'))
  + (select count(*)::integer
     from public.chat_page('85000000-0000-4000-b000-000000000001', pg_temp.id_of('team'))),
  0,
  'which reads no group either, and lists none'
);
select pg_temp.sign_in('85000000-0000-4000-a000-00000000000b');
select is(
  (select count(*)::integer from public.chat_conversations c
   where c.business_id = '85000000-0000-4000-b000-000000000001')
  + (select count(*)::integer from public.chat_messages m
     where m.business_id = '85000000-0000-4000-b000-000000000001'),
  0,
  'another business''s owner reads nothing of N''s chats'
);
select pg_temp.sign_in('85000000-0000-4000-a000-000000000003');
select is(pg_temp.seen('m-team'), '0/0/0', 'and N''s people nothing of M''s');
select is_empty(
  $$select 1 from public.chat_page('85000000-0000-4000-b000-000000000002', pg_temp.id_of('kitchen'))$$,
  'a page is of the business it is asked in: N''s kitchen asked as M''s is nothing'
);
select pg_temp.sign_in('85000000-0000-4000-a000-000000000004');
select is(
  (select count(*)::integer from public.chat_reads r
   where r.user_id <> '85000000-0000-4000-a000-000000000004'),
  0,
  'read marks are their own person''s: Yoav reads none of Noa''s'
);
select is(
  (select string_agg(i.kind, ',' order by i.kind)
   from public.chat_inbox('85000000-0000-4000-b000-000000000001') i),
  'department,direct,team',
  'Yoav''s list: his department''s group, his private chat and the team''s'
);
select pg_temp.sign_in('85000000-0000-4000-a000-000000000003');
select is(
  public.chat_seen(pg_temp.id_of('dm')),
  '2026-11-05 10:30+00'::timestamptz,
  'Noa sees how far Yoav read their chat'
);
select pg_temp.sign_in('85000000-0000-4000-a000-000000000001');
select is(public.chat_seen(pg_temp.id_of('dm')), null, 'and nobody else does');
reset role;

------------------------------------------------------------------------------
-- Groups: from when one joined, and departments

select pg_temp.sign_in('85000000-0000-4000-a000-000000000006');
select results_eq(
  $$select m.id from public.chat_messages m where m.conversation_id = pg_temp.id_of('team')$$,
  $$select pg_temp.id_of('t2')$$,
  'Tal reads the team''s group from when he joined: nothing said before'
);
select results_eq(
  $$select m.id from public.chat_messages m where m.conversation_id = pg_temp.id_of('kitchen')$$,
  $$select pg_temp.id_of('ka')$$,
  'and the kitchen''s from when he was added, but for its pinned announcement'
);
select results_eq(
  $$select p.id
    from public.chat_page('85000000-0000-4000-b000-000000000001', pg_temp.id_of('team')) p$$,
  $$select pg_temp.id_of('t2')$$,
  'a page of the team''s group stops where Tal joined'
);
select is_empty(
  $$select 1 from public.chat_page('85000000-0000-4000-b000-000000000001', pg_temp.id_of('kitchen'))$$,
  'and the kitchen''s holds nothing from before he was added: its pinned announcement is read on its own'
);
select is(
  (select i.last_preview from public.chat_inbox('85000000-0000-4000-b000-000000000001') i
   where i.conversation = pg_temp.id_of('team')),
  'Welcome, Tal',
  'his list shows the last of the team''s messages he reads'
);
select is(
  (select coalesce(i.last_at::text, 'none') || '/' || i.pinned_waiting::text
   from public.chat_inbox('85000000-0000-4000-b000-000000000001') i
   where i.conversation = pg_temp.id_of('kitchen')),
  'none/1',
  'and the kitchen with no message of his time yet, but its announcement waiting for him'
);
select pg_temp.sign_in('85000000-0000-4000-a000-000000000003');
select is(
  (select count(*)::integer from public.chat_messages m
   where m.id in (pg_temp.id_of('k1'), pg_temp.id_of('ka'))),
  2,
  'Noa, in the kitchen since the first, reads all of it'
);
select is(
  (select i.unread from public.chat_inbox('85000000-0000-4000-b000-000000000001') i
   where i.conversation = pg_temp.id_of('kitchen')),
  1,
  'her list counts the kitchen''s announcement as waiting, and not her own message'
);
select results_eq(
  $$select p.id from public.chat_page('85000000-0000-4000-b000-000000000001',
    pg_temp.id_of('kitchen'), page_limit => 1) p$$,
  $$select pg_temp.id_of('ka')$$,
  'a page of one is the newest message'
);
select results_eq(
  $$select p.id from public.chat_page('85000000-0000-4000-b000-000000000001',
    pg_temp.id_of('kitchen'), before_at => '2026-11-05 09:10+00',
    before_id => pg_temp.id_of('ka')) p$$,
  $$select pg_temp.id_of('k1')$$,
  'the page before it, the older ones'
);
select results_eq(
  $$select p.id from public.chat_page('85000000-0000-4000-b000-000000000001',
    pg_temp.id_of('kitchen'), after_at => '2026-11-05 09:05+00',
    after_id => pg_temp.id_of('k1')) p$$,
  $$select pg_temp.id_of('ka')$$,
  'and the page after one, what came since'
);
select pg_temp.sign_in('85000000-0000-4000-a000-000000000002');
select is(
  (select count(*)::integer from public.chat_messages m
   where m.id in (pg_temp.id_of('k1'), pg_temp.id_of('t1'))),
  2,
  'a moderator, in no department, reads every department''s group, all of it'
);
select pg_temp.sign_in('85000000-0000-4000-a000-000000000004');
select is(pg_temp.seen('kitchen'), '0/0/0', 'someone in another department reads nothing of it');
select pg_temp.sign_in('85000000-0000-4000-a000-000000000007');
select is(
  (select count(*)::integer from public.chat_conversations)
  + (select count(*)::integer from public.chat_messages),
  0,
  'someone who left reads no chat'
);
reset role;
select throws_ok(
  $$select public.read_chat('85000000-0000-4000-a000-000000000004', pg_temp.id_of('kitchen'),
    null, '2026-11-05 11:00+00')$$,
  'P0002', null, 'nobody marks read a chat they are not in'
);

------------------------------------------------------------------------------
-- Announcements

select public.confirm_announcement('85000000-0000-4000-a000-000000000003',
  pg_temp.id_of('ka'), '2026-11-05 09:20+00');
select pg_temp.sign_in('85000000-0000-4000-a000-000000000002');
select results_eq(
  $$select r.person, r.acked_at from public.announcement_readers(pg_temp.id_of('ka')) r$$,
  $$values
    ('85000000-0000-4000-a000-000000000001'::uuid, null::timestamptz),
    ('85000000-0000-4000-a000-000000000003'::uuid, '2026-11-05 09:20+00'::timestamptz),
    ('85000000-0000-4000-a000-000000000006'::uuid, null::timestamptz)$$,
  'its author sees who of the kitchen''s group now confirmed it, the moderators with them'
);
select pg_temp.sign_in('85000000-0000-4000-a000-000000000001');
select is(
  (select count(*)::integer from public.announcement_readers(pg_temp.id_of('ka'))),
  3,
  'and so does a moderator'
);
select pg_temp.sign_in('85000000-0000-4000-a000-000000000003');
select is_empty(
  $$select * from public.announcement_readers(pg_temp.id_of('ka'))$$,
  'anyone else sees nobody'
);
select is(
  (select count(*)::integer from public.chat_acks),
  1,
  'and only their own confirmation'
);
reset role;
select throws_ok(
  $$select public.confirm_announcement('85000000-0000-4000-a000-000000000003',
    pg_temp.id_of('t2'), '2026-11-10 10:00+00')$$,
  '22023', null, 'only an announcement is confirmed'
);
select throws_ok(
  $$select public.pin_announcement('85000000-0000-4000-a000-000000000003',
    pg_temp.id_of('ka'), false, '2026-11-10 10:00+00')$$,
  '42501', null, 'a worker doesn''t unpin it'
);
select public.pin_announcement('85000000-0000-4000-a000-000000000001',
  pg_temp.id_of('ka'), false, '2026-11-10 10:00+00');
select pg_temp.sign_in('85000000-0000-4000-a000-000000000006');
select is(
  pg_temp.seen('kitchen'),
  '1/0/0',
  'unpinned, an old announcement is history like the rest: Tal no longer reads it'
);
reset role;
select public.pin_announcement('85000000-0000-4000-a000-000000000001',
  pg_temp.id_of('ka'), true, '2026-11-10 10:05+00');

------------------------------------------------------------------------------
-- Removing

select lives_ok(
  $$select public.remove_chat_message('85000000-0000-4000-a000-000000000003',
    pg_temp.id_of('dm1'), '2026-11-05 11:00+00')$$,
  'Noa removes her own message in her private chat'
);
select is(
  (select m.body is null and m.removed_by = '85000000-0000-4000-a000-000000000003'
     and m.removed_at = '2026-11-05 11:00+00'
   from public.chat_messages m where m.id = pg_temp.id_of('dm1'))
  and (select h.body = 'Just between us'
       from private.chat_removed h where h.message_id = pg_temp.id_of('dm1')),
  true,
  'its text leaves the message and waits only for the undo'
);
select throws_ok(
  $$select public.remove_chat_message('85000000-0000-4000-a000-000000000002',
    pg_temp.id_of('dm2'), '2026-11-05 11:00+00')$$,
  'P0002', null, 'a moderator can''t reach a private chat she isn''t in'
);
select pg_temp.send('sn1', '85000000-0000-4000-a000-000000000003', 'Can we talk?',
  '2026-11-05 10:05+00', to_person => '85000000-0000-4000-a000-000000000002');
select throws_ok(
  $$select public.remove_chat_message('85000000-0000-4000-a000-000000000002',
    pg_temp.id_of('sn1'), '2026-11-05 11:00+00')$$,
  '42501', null, 'and in her own, only its author removes a message'
);
select throws_ok(
  $$select public.remove_chat_message('85000000-0000-4000-a000-000000000004',
    pg_temp.id_of('t2'), '2026-11-10 11:00+00')$$,
  '42501', null, 'in a group, only a moderator removes someone else''s'
);
select pg_temp.sign_in('85000000-0000-4000-a000-000000000001');
select is(
  (select i.unread from public.chat_inbox('85000000-0000-4000-b000-000000000001') i
   where i.conversation = pg_temp.id_of('kitchen')),
  2,
  'the owner, who never read the kitchen''s group, has both of its messages waiting'
);
reset role;
select lives_ok(
  $$select public.remove_chat_message('85000000-0000-4000-a000-000000000002',
    pg_temp.id_of('k1'), '2026-11-05 12:00+00')$$,
  'a moderator removes Noa''s message in the kitchen''s group'
);
select pg_temp.sign_in('85000000-0000-4000-a000-000000000001');
select is(
  (select i.unread from public.chat_inbox('85000000-0000-4000-b000-000000000001') i
   where i.conversation = pg_temp.id_of('kitchen')),
  1,
  'and once it is removed, only the announcement'
);
reset role;
select results_eq(
  $$select a.action, a.details from public.audit_log a
    where a.business_id = '85000000-0000-4000-b000-000000000001' and a.action ~ '^chat\.'$$,
  $$values ('chat.remove'::text, jsonb_build_object(
    'conversation', pg_temp.id_of('kitchen'), 'message', pg_temp.id_of('k1'),
    'author', '85000000-0000-4000-a000-000000000003'::uuid,
    'department', '85000000-0000-4000-d000-000000000001'::uuid))$$,
  'which logs chat.remove, with ids and never the text; Noa''s own removal logs nothing'
);
select throws_ok(
  $$select public.restore_chat_message('85000000-0000-4000-a000-000000000001',
    pg_temp.id_of('k1'), '2026-11-05 12:05+00')$$,
  '42501', null, 'nobody but who removed it puts it back'
);
select public.restore_chat_message('85000000-0000-4000-a000-000000000002',
  pg_temp.id_of('k1'), '2026-11-05 12:05+00');
select is(
  (select m.body || '/' || (m.removed_at is null)::text
   from public.chat_messages m where m.id = pg_temp.id_of('k1'))
  || '/' || (select count(*) from private.chat_removed h where h.message_id = pg_temp.id_of('k1'))::text,
  'Kitchen, old/true/0',
  'who removed it puts it back within 10 minutes'
);
select is(
  (select count(*)::integer from public.audit_log a
   where a.business_id = '85000000-0000-4000-b000-000000000001' and a.action = 'chat.restore'),
  1,
  'and that is logged too'
);
select public.remove_chat_message('85000000-0000-4000-a000-000000000002',
  pg_temp.id_of('k1'), '2026-11-05 12:10+00');
select throws_ok(
  $$select public.restore_chat_message('85000000-0000-4000-a000-000000000002',
    pg_temp.id_of('k1'), '2026-11-05 12:21+00')$$,
  '55000', null, 'but not after 10 minutes'
);

------------------------------------------------------------------------------
-- Muting

select throws_ok(
  $$select public.mute_chat('85000000-0000-4000-a000-000000000004', pg_temp.id_of('kitchen'), true)$$,
  'P0002', null, 'nobody mutes a chat they are not in'
);
select public.mute_chat('85000000-0000-4000-a000-000000000003', pg_temp.id_of('team'), true);
select is(
  (select r.muted::text || '/' || coalesce(r.read_at::text, 'none') from public.chat_reads r
   where r.conversation_id = pg_temp.id_of('team')
     and r.user_id = '85000000-0000-4000-a000-000000000003'),
  'true/none',
  'muting a chat never read marks nothing read'
);

------------------------------------------------------------------------------
-- The activity log

select pg_temp.sign_in('85000000-0000-4000-a000-000000000001');
select is(
  (select count(*)::integer from public.audit_log a where a.action ~ '^chat\.'),
  3,
  'the owner reads a moderator''s removals and undo'
);
select pg_temp.sign_in('85000000-0000-4000-a000-000000000002');
select is(
  (select count(*)::integer from public.audit_log a where a.action ~ '^chat\.'),
  3,
  'and so does a manager'
);
select pg_temp.sign_in('85000000-0000-4000-a000-000000000008');
select is(
  (select count(*)::integer from public.audit_log a where a.action ~ '^chat\.'),
  0,
  'a view as an owner reads none of them'
);
select is(
  (select count(*)::integer from public.audit_log a
   where a.business_id = '85000000-0000-4000-b000-000000000001'
     and a.action = 'departments.change'),
  2,
  'while it still reads the rest of the log'
);
select pg_temp.sign_in('85000000-0000-4000-a000-000000000009');
select is(
  (select count(*)::integer from public.audit_log a where a.action ~ '^chat\.'),
  0,
  'nor a view as a manager'
);
select pg_temp.sign_in('85000000-0000-4000-a000-00000000000a');
select is(
  (select count(*)::integer from public.audit_log a where a.action ~ '^chat\.'),
  0,
  'nor a view as an accountant'
);
reset role;
select is(
  (select count(*)::integer from public.audit_log a
   where a.business_id = '85000000-0000-4000-b000-000000000001'
     and a.action not in ('chat.remove', 'chat.restore', 'departments.change')),
  0,
  'sending, opening a private chat, reading, confirming and muting write no row at all'
);
select ok(
  private.is_private_action('chat.remove') and private.is_private_action('document.open')
  and not private.is_private_action('lists.send') and not private.is_private_action('chatty.x')
  and not private.is_private_action(null),
  'the rows kept from a view: chat.* and document.*'
);

------------------------------------------------------------------------------
-- The job

select is(
  (select j.schedule from cron.job j where j.jobname = 'chat'),
  '*/10 * * * *',
  'the job runs every 10 minutes'
);
select is(
  (select j.active from cron.job j where j.jobname = 'chat'),
  false,
  'and stays off here (supabase/seed.sql)'
);
select public.send_chat_message('85000000-0000-4000-a000-00000000000d',
  '85000000-0000-4000-b000-000000000003', gen_random_uuid(), 'A visitor wrote this',
  pg_temp.id_of('d-team'), at_time => '2026-11-05 08:00+00');
insert into public.chat_messages (business_id, conversation_id, author_id, draft_id, body, seeded, created_at)
values ('85000000-0000-4000-b000-000000000003', pg_temp.id_of('d-team'),
  '85000000-0000-4000-a000-00000000000d', gen_random_uuid(), 'From the seed', true,
  '2026-11-05 08:00+00');
select is(
  private.clean_chat('2026-11-05 13:00+00'),
  3,
  'the job deletes a demo visitor''s message after an hour, and the texts held past their undo'
);
select is(
  (select string_agg(m.body, ',') from public.chat_messages m
   where m.business_id = '85000000-0000-4000-b000-000000000003'),
  'From the seed',
  'and keeps what the demo''s seed wrote'
);
select is(
  (select count(*)::integer from private.chat_removed h
   where h.message_id in (pg_temp.id_of('dm1'), pg_temp.id_of('k1'))),
  0,
  'a removed text is gone once its undo is over'
);
select is(
  (select count(*)::integer from public.chat_messages m
   where m.business_id = '85000000-0000-4000-b000-000000000001'),
  38,
  'and nothing of a business that is not a demo goes'
);
select count(public.send_chat_message('85000000-0000-4000-a000-00000000000d',
  '85000000-0000-4000-b000-000000000003', gen_random_uuid(), 'Visitor ' || g::text,
  pg_temp.id_of('d-team'), at_time => '2026-11-07 10:00:00+00'::timestamptz + g * interval '30 seconds'))
from generate_series(1, 100) as g;
select throws_ok(
  $$select public.send_chat_message('85000000-0000-4000-a000-00000000000d',
    '85000000-0000-4000-b000-000000000003', gen_random_uuid(), 'One more',
    pg_temp.id_of('d-team'), at_time => '2026-11-07 10:51+00')$$,
  '54000', null, 'a demo business takes 100 visitors'' messages in an hour, and no more'
);
select lives_ok(
  $$select public.send_chat_message('85000000-0000-4000-a000-00000000000d',
    '85000000-0000-4000-b000-000000000003', gen_random_uuid(), 'Later',
    pg_temp.id_of('d-team'), at_time => '2026-11-07 12:00+00')$$,
  'and more an hour later'
);

------------------------------------------------------------------------------
-- The sync's "anything new?": Noa's moves with every change in her chats; a
-- view's and an outsider's never do. Times before now, as everything above.

create temporary table versions (step text primary key, v text) on commit drop;
grant all on versions to authenticated;
create function pg_temp.version_at(step_name text) returns text language sql as $$
  select x.v from versions x where x.step = step_name
$$;

select pg_temp.sign_in('85000000-0000-4000-a000-000000000003');
insert into versions values ('start', public.chat_version('85000000-0000-4000-b000-000000000001'));
select pg_temp.sign_in('85000000-0000-4000-a000-000000000009');
insert into versions
values ('view-start', public.chat_version('85000000-0000-4000-b000-000000000001'));
select pg_temp.sign_in('85000000-0000-4000-a000-00000000000b');
insert into versions
values ('outsider-start', public.chat_version('85000000-0000-4000-b000-000000000001'));
reset role;

select pg_temp.send('v-sent', '85000000-0000-4000-a000-000000000002', 'Fresh bread at noon',
  '2026-11-08 12:00+00', pg_temp.id_of('kitchen'));
select pg_temp.sign_in('85000000-0000-4000-a000-000000000003');
insert into versions values ('sent', public.chat_version('85000000-0000-4000-b000-000000000001'));
reset role;
select isnt(pg_temp.version_at('sent'), pg_temp.version_at('start'),
  'the sync''s version moves when a message is sent');

select public.remove_chat_message('85000000-0000-4000-a000-000000000002',
  pg_temp.id_of('v-sent'), '2026-11-08 12:01+00');
select pg_temp.sign_in('85000000-0000-4000-a000-000000000003');
insert into versions
values ('removed', public.chat_version('85000000-0000-4000-b000-000000000001'));
reset role;
select isnt(pg_temp.version_at('removed'), pg_temp.version_at('sent'),
  'when one is removed');

select public.restore_chat_message('85000000-0000-4000-a000-000000000002',
  pg_temp.id_of('v-sent'), '2026-11-08 12:02+00');
select pg_temp.sign_in('85000000-0000-4000-a000-000000000003');
insert into versions
values ('restored', public.chat_version('85000000-0000-4000-b000-000000000001'));
reset role;
select isnt(pg_temp.version_at('restored'), pg_temp.version_at('removed'),
  'when it is put back');

-- Tal confirms Shiran's announcement in the kitchen (20261111000500_chat_files.sql):
-- only its author and the moderators learn of it, never another worker,
-- through the version or through the conversation's own stamp (C3's `cv`);
-- and Tal's own stamp moves, so his other screens show it confirmed.
create function pg_temp.keep_marks(step_name text, who uuid,
  in_conversation text default 'kitchen') returns void language sql as $$
  select pg_temp.sign_in(who);
  insert into versions
  values (step_name, public.chat_version('85000000-0000-4000-b000-000000000001'));
  insert into versions
  values (step_name || '-stamp', (
    select s.changed::text
    from public.chat_stamp('85000000-0000-4000-b000-000000000001', pg_temp.id_of(in_conversation)) s
  ));
  select set_config('role', 'postgres', true);
$$;
select pg_temp.keep_marks('author-restored', '85000000-0000-4000-a000-000000000002');
select pg_temp.keep_marks('owner-restored', '85000000-0000-4000-a000-000000000001');
select pg_temp.keep_marks('noa-restored', '85000000-0000-4000-a000-000000000003');
select pg_temp.keep_marks('tal-restored', '85000000-0000-4000-a000-000000000006');
select public.confirm_announcement('85000000-0000-4000-a000-000000000006',
  pg_temp.id_of('ka'), '2026-11-08 12:03+00');
select pg_temp.keep_marks('author-confirmed', '85000000-0000-4000-a000-000000000002');
select pg_temp.keep_marks('owner-confirmed', '85000000-0000-4000-a000-000000000001');
select pg_temp.keep_marks('noa-confirmed', '85000000-0000-4000-a000-000000000003');
select pg_temp.keep_marks('tal-confirmed', '85000000-0000-4000-a000-000000000006');
select pg_temp.sign_in('85000000-0000-4000-a000-000000000003');
insert into versions
values ('confirmed', public.chat_version('85000000-0000-4000-b000-000000000001'));
reset role;
select is(pg_temp.version_at('confirmed'), pg_temp.version_at('restored'),
  'not when another worker confirms an announcement in her group: who confirmed is not hers to learn');
select is(pg_temp.version_at('noa-confirmed-stamp'), pg_temp.version_at('noa-restored-stamp'),
  'nor does the conversation''s stamp move for her');
select isnt(pg_temp.version_at('author-confirmed'), pg_temp.version_at('author-restored'),
  'the announcement''s author''s version moves');
select isnt(pg_temp.version_at('author-confirmed-stamp'), pg_temp.version_at('author-restored-stamp'),
  'and so does her stamp, so her screen reads who confirmed again');
select isnt(pg_temp.version_at('owner-confirmed'), pg_temp.version_at('owner-restored'),
  'and a moderator''s version moves too');
select isnt(pg_temp.version_at('tal-confirmed-stamp'), pg_temp.version_at('tal-restored-stamp'),
  'and the stamp of the worker who confirmed, so his other screens show it confirmed');

select public.pin_announcement('85000000-0000-4000-a000-000000000001',
  pg_temp.id_of('ka'), false, '2026-11-08 12:04+00');
select pg_temp.sign_in('85000000-0000-4000-a000-000000000003');
insert into versions
values ('unpinned', public.chat_version('85000000-0000-4000-b000-000000000001'));
reset role;
select isnt(pg_temp.version_at('unpinned'), pg_temp.version_at('confirmed'),
  'when it is unpinned');

select public.pin_announcement('85000000-0000-4000-a000-000000000001',
  pg_temp.id_of('ka'), true, '2026-11-08 12:05+00');
select pg_temp.sign_in('85000000-0000-4000-a000-000000000003');
insert into versions values ('pinned', public.chat_version('85000000-0000-4000-b000-000000000001'));
select pg_temp.sign_in('85000000-0000-4000-a000-000000000009');
insert into versions
values ('view-end', public.chat_version('85000000-0000-4000-b000-000000000001'));
select pg_temp.sign_in('85000000-0000-4000-a000-00000000000b');
insert into versions
values ('outsider-end', public.chat_version('85000000-0000-4000-b000-000000000001'));
reset role;
select isnt(pg_temp.version_at('pinned'), pg_temp.version_at('unpinned'),
  'and when it is pinned again');
select is(pg_temp.version_at('view-end'), pg_temp.version_at('view-start'),
  'a view''s stays the same, whatever changes in N');
select is(pg_temp.version_at('outsider-end'), pg_temp.version_at('outsider-start'),
  'and so does another business''s owner''s');

-- An announcer who moderates nothing: Yoav, a worker given chat.announce of
-- his own (memberships.perms), posts in the team's group and Tal confirms.
-- Yoav learns of it through his own announcement alone; Noa, there too,
-- learns nothing.
update public.memberships set perms = '{chat.announce}'
where business_id = '85000000-0000-4000-b000-000000000001'
  and user_id = '85000000-0000-4000-a000-000000000004';
select ok(
  private.holds_perm('85000000-0000-4000-b000-000000000001',
    '85000000-0000-4000-a000-000000000004', 'chat.announce')
  and not private.chat_moderates('85000000-0000-4000-b000-000000000001',
    '85000000-0000-4000-a000-000000000004'),
  'a worker may announce without moderating'
);
select pg_temp.send('ya', '85000000-0000-4000-a000-000000000004', 'Deliveries come at seven',
  '2026-11-08 14:00+00', pg_temp.id_of('team'), announce => true);
select pg_temp.keep_marks('yoav-sent', '85000000-0000-4000-a000-000000000004', 'team');
select pg_temp.keep_marks('noa-team-sent', '85000000-0000-4000-a000-000000000003', 'team');
select public.confirm_announcement('85000000-0000-4000-a000-000000000006',
  pg_temp.id_of('ya'), '2026-11-08 14:05+00');
select pg_temp.keep_marks('yoav-confirmed', '85000000-0000-4000-a000-000000000004', 'team');
select pg_temp.keep_marks('noa-team-confirmed', '85000000-0000-4000-a000-000000000003', 'team');
select isnt(pg_temp.version_at('yoav-confirmed'), pg_temp.version_at('yoav-sent'),
  'his version moves when someone confirms his announcement');
select isnt(pg_temp.version_at('yoav-confirmed-stamp'), pg_temp.version_at('yoav-sent-stamp'),
  'and so does his stamp of the group');
select is(pg_temp.version_at('noa-team-confirmed'), pg_temp.version_at('noa-team-sent'),
  'while another worker''s version stays the same');
select is(pg_temp.version_at('noa-team-confirmed-stamp'), pg_temp.version_at('noa-team-sent-stamp'),
  'and her stamp of the group too');
-- Unpinned, it is history like the rest, and Yoav announces no more.
select public.pin_announcement('85000000-0000-4000-a000-000000000001',
  pg_temp.id_of('ya'), false, '2026-11-08 14:10+00');
update public.memberships set perms = '{}'
where business_id = '85000000-0000-4000-b000-000000000001'
  and user_id = '85000000-0000-4000-a000-000000000004';

------------------------------------------------------------------------------
-- A closed group: an announcement is unpinned there, never pinned

select pg_temp.send('bar-ann', '85000000-0000-4000-a000-000000000002', 'The bar opens late tonight',
  '2026-11-08 13:00+00', pg_temp.id_of('bar'), announce => true);
select public.set_departments('85000000-0000-4000-a000-000000000001',
  '85000000-0000-4000-b000-000000000001', '[{"key": "kitchen", "name": "Kitchen"}]');
select lives_ok(
  $$select public.pin_announcement('85000000-0000-4000-a000-000000000002',
    pg_temp.id_of('bar-ann'), false, '2026-11-08 13:05+00')$$,
  'in a closed group, a moderator still unpins an announcement'
);
select throws_ok(
  $$select public.pin_announcement('85000000-0000-4000-a000-000000000002',
    pg_temp.id_of('bar-ann'), true, '2026-11-08 13:06+00')$$,
  '55000', null, 'but pins none there, so nobody there is asked to confirm one'
);
select public.set_departments('85000000-0000-4000-a000-000000000001',
  '85000000-0000-4000-b000-000000000001',
  '[{"key": "kitchen", "name": "Kitchen"}, {"key": "bar", "name": "Bar"}]');

------------------------------------------------------------------------------
-- Leaving, and coming back: a group's history starts again from the return

-- Yoav leaves.
update public.memberships set active = false
where business_id = '85000000-0000-4000-b000-000000000001'
  and user_id = '85000000-0000-4000-a000-000000000004';
select throws_ok(
  $$select public.send_chat_message('85000000-0000-4000-a000-000000000003',
    '85000000-0000-4000-b000-000000000001', gen_random_uuid(), 'Still there?',
    pg_temp.id_of('dm'), at_time => '2026-11-10 11:00+00')$$,
  '55000', null, 'a private chat whose other person left takes no message'
);
select pg_temp.sign_in('85000000-0000-4000-a000-000000000004');
select is(pg_temp.seen('dm'), '0/0/0', 'and the one who left reads nothing of it');
reset role;

-- Yoav comes back through a new invite; Rina, who left before all this, is
-- made active again (still in the kitchen's rows); Galit, the accountant,
-- leaves and comes back as a worker. Everything said in N so far was said
-- before now, and Noa then says one thing more.
insert into public.invites (business_id, phone, role, token_hash)
values
  ('85000000-0000-4000-b000-000000000001', '+972500003704', 'worker', repeat('c', 64)),
  ('85000000-0000-4000-b000-000000000001', '+972500003705', 'worker', repeat('d', 64));
select public.claim_invite(repeat('c', 64), '85000000-0000-4000-a000-000000000004');
update public.memberships set active = true
where business_id = '85000000-0000-4000-b000-000000000001'
  and user_id = '85000000-0000-4000-a000-000000000007';
update public.memberships set active = false
where business_id = '85000000-0000-4000-b000-000000000001'
  and user_id = '85000000-0000-4000-a000-000000000005';
select public.claim_invite(repeat('d', 64), '85000000-0000-4000-a000-000000000005');
select pg_temp.send('back', '85000000-0000-4000-a000-000000000003', 'Welcome back', now(),
  pg_temp.id_of('team'));

select pg_temp.sign_in('85000000-0000-4000-a000-000000000004');
select results_eq(
  $$select m.id from public.chat_messages m
    where m.conversation_id in (pg_temp.id_of('team'), pg_temp.id_of('bar'))$$,
  $$select pg_temp.id_of('back')$$,
  'back through a new invite, Yoav reads the team''s group and the bar''s from his return: nothing said before'
);
select pg_temp.sign_in('85000000-0000-4000-a000-000000000007');
select results_eq(
  $$select m.id from public.chat_messages m
    where m.conversation_id in (pg_temp.id_of('team'), pg_temp.id_of('kitchen'))
    order by m.created_at$$,
  $$values (pg_temp.id_of('ka')), (pg_temp.id_of('back'))$$,
  'made active again, Rina reads both from her return, and the kitchen''s pinned announcement'
);
select pg_temp.sign_in('85000000-0000-4000-a000-000000000005');
select results_eq(
  'select m.id from public.chat_messages m',
  $$select pg_temp.id_of('back')$$,
  'and Galit, an accountant who left and came back as a worker, reads nothing said before'
);
reset role;

select * from finish();
rollback;
