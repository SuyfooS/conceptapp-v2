-- What chat tells people (C1 of the chat plan, private.notify_chat): one line
-- per person per conversation, never to its author or to an accountant, with
-- ids and a count and never a word of the message; its push 15 seconds late,
-- a push waiting carrying the next message too, again only after 10 minutes
-- unread in a group or a minute in a private chat, never from a muted chat or
-- a demo business; reading settles it. An announcement is a line of its own
-- that asks for "קראתי": confirming settles one's own, removing or unpinning it
-- everyone's, and putting it back or pinning it again asks those who haven't
-- confirmed it, again; the job settles a demo visitor's when it deletes it.
-- Fixed ids of its own and explicit times, so nothing here meets the seeded
-- people.
begin;
select plan(32);
-- Times read back as text, in UTC.
set local timezone = 'UTC';

insert into auth.users (id, aud, role, phone)
values
  ('86000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500003801'),
  ('86000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500003802'),
  ('86000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', '972500003803'),
  ('86000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', '972500003804'),
  ('86000000-0000-4000-a000-000000000005', 'authenticated', 'authenticated', '972500003805'),
  ('86000000-0000-4000-a000-000000000006', 'authenticated', 'authenticated', '972500003806'),
  ('86000000-0000-4000-a000-000000000007', 'authenticated', 'authenticated', '972500003807'),
  ('86000000-0000-4000-a000-000000000008', 'authenticated', 'authenticated', '972500003808');

-- P: 1 its owner, 2 a manager, 3 Noa and 4 Yoav workers, 5 a worker, 6 its
-- accountant. D, a demo: 7 its owner and 8 a worker. Everyone but 5 and 6
-- has a phone with notifications on.
insert into public.businesses (id, slug, name)
values
  ('86000000-0000-4000-b000-000000000001', 'chat-notify-p', 'Chat notify P'),
  ('86000000-0000-4000-b000-000000000002', 'chat-notify-d', 'Chat notify D');

insert into public.memberships (business_id, user_id, role, active, created_at)
values
  ('86000000-0000-4000-b000-000000000001', '86000000-0000-4000-a000-000000000001', 'owner', true, '2026-11-01 08:00+00'),
  ('86000000-0000-4000-b000-000000000001', '86000000-0000-4000-a000-000000000002', 'manager', true, '2026-11-01 08:00+00'),
  ('86000000-0000-4000-b000-000000000001', '86000000-0000-4000-a000-000000000003', 'worker', true, '2026-11-01 08:00+00'),
  ('86000000-0000-4000-b000-000000000001', '86000000-0000-4000-a000-000000000004', 'worker', true, '2026-11-01 08:00+00'),
  ('86000000-0000-4000-b000-000000000001', '86000000-0000-4000-a000-000000000005', 'worker', true, '2026-11-01 08:00+00'),
  ('86000000-0000-4000-b000-000000000001', '86000000-0000-4000-a000-000000000006', 'accountant', true, '2026-11-01 08:00+00'),
  ('86000000-0000-4000-b000-000000000002', '86000000-0000-4000-a000-000000000007', 'owner', true, '2026-11-01 08:00+00'),
  ('86000000-0000-4000-b000-000000000002', '86000000-0000-4000-a000-000000000008', 'worker', true, '2026-11-01 08:00+00');

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('86000000-0000-4000-b000-000000000001', 'chat', true, '{}'),
  ('86000000-0000-4000-b000-000000000001', 'notifications', true, '{}'),
  ('86000000-0000-4000-b000-000000000002', 'chat', true, '{}'),
  ('86000000-0000-4000-b000-000000000002', 'notifications', true, '{}');

insert into private.demo_businesses (business_id, definition)
values ('86000000-0000-4000-b000-000000000002', '{"slug": "chat-notify-d"}');

insert into public.push_subscriptions (user_id, endpoint, endpoint_hash, p256dh, auth_secret)
select p.id, 'https://fcm.googleapis.com/fcm/send/chat-' || p.n::text,
  md5('chat-a-' || p.n::text) || md5('chat-b-' || p.n::text),
  'BOr8a4N2Qbv1dDdEh5a3X9nTq0wKcY6UoL1mZpR4sVf8gJ2kHtE7yWiAxC3uNbQ5lMzO9vP0rS6eTgIjFhDwKy0',
  'aW5zdGFudC1hdXRoLWtleQ'
from (values
  ('86000000-0000-4000-a000-000000000001'::uuid, 1),
  ('86000000-0000-4000-a000-000000000002'::uuid, 2),
  ('86000000-0000-4000-a000-000000000003'::uuid, 3),
  ('86000000-0000-4000-a000-000000000004'::uuid, 4),
  ('86000000-0000-4000-a000-000000000008'::uuid, 8)
) as p (id, n);

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated, service_role;

create function pg_temp.id_of(saved text) returns uuid language sql as $$
  select i.id from ids i where i.name = saved
$$;
-- Who in P has a line about `thing` (its dedupe key), of this kind when one is
-- given; who has it unread; and how many lines about it are settled.
create function pg_temp.who(what text, thing text) returns uuid[] language sql as $$
  select coalesce(array_agg(n.user_id order by n.user_id), '{}'::uuid[])
  from public.notifications n
  where n.business_id = '86000000-0000-4000-b000-000000000001'
    and n.dedupe_key = thing and (what is null or n.kind = what)
$$;
create function pg_temp.unread(thing text) returns uuid[] language sql as $$
  select coalesce(array_agg(n.user_id order by n.user_id), '{}'::uuid[])
  from public.notifications n
  where n.business_id = '86000000-0000-4000-b000-000000000001'
    and n.dedupe_key = thing and n.read_at is null
$$;
create function pg_temp.settled(thing text) returns text language sql as $$
  select count(*)::text || '/' || count(n.resolved_at)::text
  from public.notifications n
  where n.business_id = '86000000-0000-4000-b000-000000000001' and n.dedupe_key = thing
$$;
-- The team's lines in P, one row each: whose, how many messages it counts,
-- its push and when.
create function pg_temp.team_lines() returns table (
  person uuid, waiting integer, push text, push_at timestamptz
) language sql as $$
  select n.user_id, (n.params ->> 'count')::integer, n.push_state, n.push_after
  from public.notifications n
  where n.business_id = '86000000-0000-4000-b000-000000000001'
    and n.dedupe_key = 'chat.' || pg_temp.id_of('team')::text
  order by n.user_id
$$;
-- `actor` sends in P, to a conversation or a person; returns the message.
create function pg_temp.say(actor uuid, words text, at_time timestamptz,
  in_conversation uuid default null, to_person uuid default null,
  announce boolean default false) returns uuid language sql as $$
  select (public.send_chat_message(actor, '86000000-0000-4000-b000-000000000001',
    gen_random_uuid(), words, in_conversation, to_person, announce, at_time) ->> 'message')::uuid
$$;

insert into ids
select 'team', c.id from public.chat_conversations c
where c.business_id = '86000000-0000-4000-b000-000000000001' and c.kind = 'team';
insert into ids
select 'd-team', c.id from public.chat_conversations c
where c.business_id = '86000000-0000-4000-b000-000000000002' and c.kind = 'team';

------------------------------------------------------------------------------
-- One line per person per conversation

select pg_temp.say('86000000-0000-4000-a000-000000000003', 'Hello, team',
  '2026-11-20 08:00+00', pg_temp.id_of('team'));
select is(
  pg_temp.who('chat.group', 'chat.' || pg_temp.id_of('team')::text),
  array['86000000-0000-4000-a000-000000000001', '86000000-0000-4000-a000-000000000002',
        '86000000-0000-4000-a000-000000000004', '86000000-0000-4000-a000-000000000005']::uuid[],
  'a message in the team''s group tells its members: not its author, not the accountant'
);
select is(
  (select n.params from public.notifications n
   where n.user_id = '86000000-0000-4000-a000-000000000005'
     and n.dedupe_key = 'chat.' || pg_temp.id_of('team')::text),
  jsonb_build_object('conversation', pg_temp.id_of('team'),
    'from', '86000000-0000-4000-a000-000000000003'::uuid, 'count', 1),
  'with ids and a count, and never a word of the message'
);
select is(
  (select count(*)::integer from public.notifications n
   where n.dedupe_key = 'chat.' || pg_temp.id_of('team')::text
     and (n.source_module is distinct from 'chat' or n.audience_role <> 'worker'
       or n.actor_id is distinct from '86000000-0000-4000-a000-000000000003'
       or n.read_at is not null)),
  0,
  'about chat, from its author, unread'
);
select results_eq(
  'select * from pg_temp.team_lines()',
  $$values
    ('86000000-0000-4000-a000-000000000001'::uuid, 1, 'queued'::text, '2026-11-20 08:00:15+00'::timestamptz),
    ('86000000-0000-4000-a000-000000000002'::uuid, 1, 'queued'::text, '2026-11-20 08:00:15+00'::timestamptz),
    ('86000000-0000-4000-a000-000000000004'::uuid, 1, 'queued'::text, '2026-11-20 08:00:15+00'::timestamptz),
    ('86000000-0000-4000-a000-000000000005'::uuid, 1, 'none'::text, null::timestamptz)$$,
  'its push waits 15 seconds, for those with a phone'
);

select pg_temp.say('86000000-0000-4000-a000-000000000003', 'Are you there?',
  '2026-11-20 08:01+00', pg_temp.id_of('team'));
select results_eq(
  'select * from pg_temp.team_lines()',
  $$values
    ('86000000-0000-4000-a000-000000000001'::uuid, 2, 'queued'::text, '2026-11-20 08:00:15+00'::timestamptz),
    ('86000000-0000-4000-a000-000000000002'::uuid, 2, 'queued'::text, '2026-11-20 08:00:15+00'::timestamptz),
    ('86000000-0000-4000-a000-000000000004'::uuid, 2, 'queued'::text, '2026-11-20 08:00:15+00'::timestamptz),
    ('86000000-0000-4000-a000-000000000005'::uuid, 2, 'none'::text, null::timestamptz)$$,
  'a second message is the same line, counting two, and the push waiting carries it'
);

-- The push goes out; Yoav reads the group.
select count(*) from public.claim_due_pushes(200, '2026-11-20 08:00:20+00');
update public.notifications n set push_state = 'sent'
where n.business_id = '86000000-0000-4000-b000-000000000001' and n.push_state = 'sending';
select public.read_chat('86000000-0000-4000-a000-000000000004', pg_temp.id_of('team'),
  null, '2026-11-20 08:02+00');

select pg_temp.say('86000000-0000-4000-a000-000000000003', 'Lunch at one',
  '2026-11-20 08:05+00', pg_temp.id_of('team'));
select results_eq(
  'select * from pg_temp.team_lines()',
  $$values
    ('86000000-0000-4000-a000-000000000001'::uuid, 3, 'sent'::text, '2026-11-20 08:00:15+00'::timestamptz),
    ('86000000-0000-4000-a000-000000000002'::uuid, 3, 'sent'::text, '2026-11-20 08:00:15+00'::timestamptz),
    ('86000000-0000-4000-a000-000000000004'::uuid, 1, 'queued'::text, '2026-11-20 08:05:15+00'::timestamptz),
    ('86000000-0000-4000-a000-000000000005'::uuid, 3, 'none'::text, null::timestamptz)$$,
  'told 5 minutes ago and unread, a group waits; read since, it starts again at one'
);

select pg_temp.say('86000000-0000-4000-a000-000000000003', 'Anyone?',
  '2026-11-20 08:11+00', pg_temp.id_of('team'));
select results_eq(
  'select * from pg_temp.team_lines()',
  $$values
    ('86000000-0000-4000-a000-000000000001'::uuid, 4, 'queued'::text, '2026-11-20 08:11:15+00'::timestamptz),
    ('86000000-0000-4000-a000-000000000002'::uuid, 4, 'queued'::text, '2026-11-20 08:11:15+00'::timestamptz),
    ('86000000-0000-4000-a000-000000000004'::uuid, 2, 'queued'::text, '2026-11-20 08:05:15+00'::timestamptz),
    ('86000000-0000-4000-a000-000000000005'::uuid, 4, 'none'::text, null::timestamptz)$$,
  'after 10 minutes unread, a group pushes again'
);

------------------------------------------------------------------------------
-- Muting and reading

select public.mute_chat('86000000-0000-4000-a000-000000000002', pg_temp.id_of('team'), true);
select is(
  (select n.push_state from public.notifications n
   where n.user_id = '86000000-0000-4000-a000-000000000002'
     and n.dedupe_key = 'chat.' || pg_temp.id_of('team')::text),
  'skipped',
  'muting a chat leaves the push that waited unsent'
);
select pg_temp.say('86000000-0000-4000-a000-000000000003', 'Still here',
  '2026-11-20 08:30+00', pg_temp.id_of('team'));
select is(
  (select n.push_state || '/' || (n.params ->> 'count') || '/' || (n.read_at is null)::text
   from public.notifications n
   where n.user_id = '86000000-0000-4000-a000-000000000002'
     and n.dedupe_key = 'chat.' || pg_temp.id_of('team')::text),
  'skipped/5/true',
  'and a muted chat queues nothing, while its line still counts what is unread'
);

select public.read_chat('86000000-0000-4000-a000-000000000004', pg_temp.id_of('team'),
  null, '2026-11-20 08:31+00');
select is(
  (select n.push_state || '/' || (n.read_at is not null)::text from public.notifications n
   where n.user_id = '86000000-0000-4000-a000-000000000004'
     and n.dedupe_key = 'chat.' || pg_temp.id_of('team')::text),
  'skipped/true',
  'reading the chat reads its line, and a push that waited goes unsent'
);
select public.read_chat('86000000-0000-4000-a000-000000000005', pg_temp.id_of('team'),
  '2026-11-20 08:01+00', '2026-11-20 08:32+00');
select is(
  pg_temp.unread('chat.' || pg_temp.id_of('team')::text),
  array['86000000-0000-4000-a000-000000000001', '86000000-0000-4000-a000-000000000002',
        '86000000-0000-4000-a000-000000000005']::uuid[],
  'reading only the older messages leaves the line unread'
);

------------------------------------------------------------------------------
-- A private chat

insert into ids values ('dm1', pg_temp.say('86000000-0000-4000-a000-000000000004', 'Swap Friday?',
  '2026-11-20 09:00+00', to_person => '86000000-0000-4000-a000-000000000003'));
insert into ids
select 'dm', m.conversation_id from public.chat_messages m where m.id = pg_temp.id_of('dm1');
select is(
  (select n.kind || '/' || n.push_state || '/' || n.push_after::text || '/'
     || (n.params ->> 'count')
   from public.notifications n
   where n.user_id = '86000000-0000-4000-a000-000000000003'
     and n.dedupe_key = 'chat.' || pg_temp.id_of('dm')::text),
  'chat.direct/queued/2026-11-20 09:00:15+00/1',
  'a private chat tells the other person, 15 seconds late'
);
select is(
  pg_temp.who(null, 'chat.' || pg_temp.id_of('dm')::text),
  array['86000000-0000-4000-a000-000000000003']::uuid[],
  'and nobody else'
);
update public.notifications n set push_state = 'sent', pushed_at = '2026-11-20 09:00:20+00'
where n.user_id = '86000000-0000-4000-a000-000000000003'
  and n.dedupe_key = 'chat.' || pg_temp.id_of('dm')::text;

select pg_temp.say('86000000-0000-4000-a000-000000000004', 'Or Saturday',
  '2026-11-20 09:00:30+00', pg_temp.id_of('dm'));
select is(
  (select n.push_state || '/' || (n.params ->> 'count') from public.notifications n
   where n.user_id = '86000000-0000-4000-a000-000000000003'
     and n.dedupe_key = 'chat.' || pg_temp.id_of('dm')::text),
  'sent/2',
  'told 10 seconds ago and unread, it waits'
);
select pg_temp.say('86000000-0000-4000-a000-000000000004', 'Let me know',
  '2026-11-20 09:02+00', pg_temp.id_of('dm'));
select is(
  (select n.push_state || '/' || (n.params ->> 'count') || '/' || n.push_after::text
   from public.notifications n
   where n.user_id = '86000000-0000-4000-a000-000000000003'
     and n.dedupe_key = 'chat.' || pg_temp.id_of('dm')::text),
  'queued/3/2026-11-20 09:02:15+00',
  'after a minute unread, a private chat pushes again'
);

------------------------------------------------------------------------------
-- Announcements

insert into ids values ('ann', pg_temp.say('86000000-0000-4000-a000-000000000002',
  'The till closes at 22:00 from next week', '2026-11-20 10:00+00', pg_temp.id_of('team'),
  announce => true));
select is(
  pg_temp.who('chat.announcement', 'chat.announcement.' || pg_temp.id_of('ann')::text),
  array['86000000-0000-4000-a000-000000000001', '86000000-0000-4000-a000-000000000003',
        '86000000-0000-4000-a000-000000000004', '86000000-0000-4000-a000-000000000005']::uuid[],
  'an announcement is a line of its own for the group: not its author, not the accountant'
);
select is(
  (select n.params from public.notifications n
   where n.user_id = '86000000-0000-4000-a000-000000000005'
     and n.dedupe_key = 'chat.announcement.' || pg_temp.id_of('ann')::text),
  jsonb_build_object('conversation', pg_temp.id_of('team'), 'message', pg_temp.id_of('ann'),
    'from', '86000000-0000-4000-a000-000000000002'::uuid),
  'with ids, and never its text'
);
select is(
  (select n.push_state || '/' || n.push_after::text from public.notifications n
   where n.user_id = '86000000-0000-4000-a000-000000000004'
     and n.dedupe_key = 'chat.announcement.' || pg_temp.id_of('ann')::text),
  'queued/2026-11-20 10:00:00+00',
  'and it reaches the phone at once'
);
select public.confirm_announcement('86000000-0000-4000-a000-000000000003',
  pg_temp.id_of('ann'), '2026-11-20 10:05+00');
select is(
  pg_temp.settled('chat.announcement.' || pg_temp.id_of('ann')::text),
  '4/1',
  'confirming it settles one''s own line'
);
select is(
  pg_temp.unread('chat.announcement.' || pg_temp.id_of('ann')::text),
  array['86000000-0000-4000-a000-000000000001', '86000000-0000-4000-a000-000000000004',
        '86000000-0000-4000-a000-000000000005']::uuid[],
  'and nobody else''s'
);
select public.remove_chat_message('86000000-0000-4000-a000-000000000002',
  pg_temp.id_of('ann'), '2026-11-20 10:10+00');
select is(
  pg_temp.settled('chat.announcement.' || pg_temp.id_of('ann')::text),
  '4/4',
  'removing it settles everyone''s'
);

-- Put back, unpinned, pinned again.
select public.restore_chat_message('86000000-0000-4000-a000-000000000002',
  pg_temp.id_of('ann'), '2026-11-20 10:15+00');
select is(
  pg_temp.unread('chat.announcement.' || pg_temp.id_of('ann')::text),
  array['86000000-0000-4000-a000-000000000001', '86000000-0000-4000-a000-000000000004',
        '86000000-0000-4000-a000-000000000005']::uuid[],
  'putting it back asks again those who haven''t confirmed it'
);
select is(
  pg_temp.settled('chat.announcement.' || pg_temp.id_of('ann')::text),
  '4/1',
  'while Noa, who did, stays settled'
);
select results_eq(
  $$select n.user_id, n.push_state, n.push_after from public.notifications n
    where n.business_id = '86000000-0000-4000-b000-000000000001'
      and n.dedupe_key = 'chat.announcement.' || pg_temp.id_of('ann')::text
      and n.user_id in ('86000000-0000-4000-a000-000000000004',
        '86000000-0000-4000-a000-000000000005')
    order by n.user_id$$,
  $$values
    ('86000000-0000-4000-a000-000000000004'::uuid, 'queued'::text, '2026-11-20 10:15+00'::timestamptz),
    ('86000000-0000-4000-a000-000000000005'::uuid, 'none'::text, null::timestamptz)$$,
  'and its push goes again, to those with a phone'
);
select public.pin_announcement('86000000-0000-4000-a000-000000000002',
  pg_temp.id_of('ann'), false, '2026-11-20 10:20+00');
select is(
  pg_temp.settled('chat.announcement.' || pg_temp.id_of('ann')::text),
  '4/4',
  'unpinning it settles everyone''s'
);
select public.pin_announcement('86000000-0000-4000-a000-000000000002',
  pg_temp.id_of('ann'), true, '2026-11-20 10:25+00');
select is(
  pg_temp.unread('chat.announcement.' || pg_temp.id_of('ann')::text),
  array['86000000-0000-4000-a000-000000000001', '86000000-0000-4000-a000-000000000004',
        '86000000-0000-4000-a000-000000000005']::uuid[],
  'and pinning it again asks again those who haven''t confirmed it'
);

-- A demo visitor's announcement goes after an hour, and its lines are settled.
insert into ids values ('d-ann', (public.send_chat_message('86000000-0000-4000-a000-000000000007',
  '86000000-0000-4000-b000-000000000002', gen_random_uuid(), 'Demo notice',
  pg_temp.id_of('d-team'), announce => true, at_time => '2026-11-20 08:00+00') ->> 'message')::uuid);
select private.clean_chat('2026-11-20 09:30+00');
select is(
  (select (n.read_at is not null)::text || '/' || n.resolved_at::text || '/' || n.push_state
   from public.notifications n
   where n.business_id = '86000000-0000-4000-b000-000000000002'
     and n.user_id = '86000000-0000-4000-a000-000000000008'
     and n.dedupe_key = 'chat.announcement.' || pg_temp.id_of('d-ann')::text),
  'true/2026-11-20 09:30:00+00/none',
  'the job deletes a demo visitor''s announcement after an hour, and settles its lines'
);

------------------------------------------------------------------------------
-- Never a phone from a demo, never a line to an accountant

select public.send_chat_message('86000000-0000-4000-a000-000000000007',
  '86000000-0000-4000-b000-000000000002', gen_random_uuid(), 'Hello, demo',
  pg_temp.id_of('d-team'), at_time => '2026-11-20 08:00+00');
select is(
  (select n.kind || '/' || n.push_state from public.notifications n
   where n.user_id = '86000000-0000-4000-a000-000000000008'
     and n.dedupe_key = 'chat.' || pg_temp.id_of('d-team')::text),
  'chat.group/none',
  'a demo business''s people get the line in the app, and never on a phone'
);
select is(
  (select count(*)::integer from public.notifications n
   where n.user_id = '86000000-0000-4000-a000-000000000006'),
  0,
  'the accountant gets no line about chats at all'
);

select pg_temp.sign_in('86000000-0000-4000-a000-000000000005');
select is(
  (select count(*)::integer from public.notifications n where n.kind ~ '^chat\.'),
  2,
  'a person reads their own chat lines'
);
reset role;
update public.business_modules set enabled = false
where business_id = '86000000-0000-4000-b000-000000000001' and module_key = 'chat';
select pg_temp.sign_in('86000000-0000-4000-a000-000000000005');
select is(
  (select count(*)::integer from public.notifications n where n.kind ~ '^chat\.'),
  0,
  'which hide while chat is off'
);
reset role;
update public.business_modules set enabled = true
where business_id = '86000000-0000-4000-b000-000000000001' and module_key = 'chat';

update public.business_modules set enabled = false
where business_id = '86000000-0000-4000-b000-000000000001' and module_key = 'notifications';
select pg_temp.say('86000000-0000-4000-a000-000000000003', 'Quiet now',
  '2026-11-20 11:00+00', to_person => '86000000-0000-4000-a000-000000000005');
select is(
  (select count(*)::integer from public.notifications n
   where n.user_id = '86000000-0000-4000-a000-000000000005' and n.kind = 'chat.direct'),
  0,
  'and with notifications off, a message writes no line'
);

select * from finish();
rollback;
