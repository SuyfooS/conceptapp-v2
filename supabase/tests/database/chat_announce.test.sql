-- Announcements on screen (C3 of the chat plan, 20261111000400_chat_announce.sql):
-- the demo reset's seed pins the manager's announcement in the whole team's
-- group, written through the chat functions, and the first two workers
-- confirm it; what the C3 screens read of it is then as each person should
-- see it: the waiting mark and the Chat tab's count for those who haven't
-- confirmed (public.chat_inbox's pinned_waiting), who confirmed for its author
-- and management only (public.announcement_readers), each person's own line
-- settled by their own "קראתי", the card gone once it is unpinned, and the
-- whole of it back with the next reset. Fixed ids of its own; the seed's
-- times are relative to now.
begin;
select plan(16);

insert into auth.users (id, aud, role, phone)
values
  ('88000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500004001'),
  ('88000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500004002'),
  ('88000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', '972500004003'),
  ('88000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', '972500004004'),
  ('88000000-0000-4000-a000-000000000005', 'authenticated', 'authenticated', '972500004005'),
  ('88000000-0000-4000-a000-000000000006', 'authenticated', 'authenticated', '972500004006');

-- 1 the owner, 2 the manager, 3 the first worker (kitchen), 4 the second
-- worker, 5 a third worker, who confirms nothing; 6 on the ConceptApp team.
insert into private.demo_businesses (business_id, definition)
values ('88000000-0000-4000-b000-000000000001', $json$
  {
    "slug": "chat-announce-demo", "name": "Chat announce demo", "accent": "#0f766e",
    "address": "Demo street 4", "shabbat_city": "jerusalem",
    "template": "restaurant", "renews": false,
    "people": [
      { "user_id": "88000000-0000-4000-a000-000000000001", "role": "owner", "name": "Owner O" },
      { "user_id": "88000000-0000-4000-a000-000000000002", "role": "manager", "name": "Manager M", "departments": ["floor"] },
      { "user_id": "88000000-0000-4000-a000-000000000003", "role": "worker", "name": "Worker W", "departments": ["kitchen"] },
      { "user_id": "88000000-0000-4000-a000-000000000004", "role": "worker", "name": "Worker V", "departments": ["bar"] },
      { "user_id": "88000000-0000-4000-a000-000000000005", "role": "worker", "name": "Worker U", "departments": ["bar"] }
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
-- The team's group and its announcement, saved again after each reset.
create function pg_temp.save_ids() returns void language sql as $$
  delete from ids;
  insert into ids
  select 'team', c.id from public.chat_conversations c
  where c.business_id = '88000000-0000-4000-b000-000000000001' and c.kind = 'team';
  insert into ids
  select 'announcement', m.id from public.chat_messages m
  where m.business_id = '88000000-0000-4000-b000-000000000001' and m.kind = 'announcement';
$$;
-- What one person's list says of the team's group: its unread count and the
-- announcements waiting for their "קראתי".
-- (`shown`, not `found`: that name is plpgsql's own, and a variable called
-- so would hide it.)
create function pg_temp.team_row(who uuid) returns text language plpgsql as $$
declare
  shown text;
begin
  perform pg_temp.sign_in(who);
  select i.unread || '|' || i.pinned_waiting into shown
  from public.chat_inbox('88000000-0000-4000-b000-000000000001') i
  where i.kind = 'team';
  perform set_config('role', 'postgres', true);
  return shown;
end;
$$;

set local role service_role;
select lives_ok(
  $$select public.reset_demo_business('88000000-0000-4000-b000-000000000001')$$,
  'the reset makes the demo business'
);
reset role;
select pg_temp.save_ids();

------------------------------------------------------------------------------
-- The seed's announcement

select results_eq(
  $$select m.author_id, m.pinned, m.seeded, m.body, m.removed_at is null
    from public.chat_messages m where m.id = pg_temp.id_of('announcement')$$,
  $$values ('88000000-0000-4000-a000-000000000002'::uuid, true, true,
    'מהשבוע הבא סוגרים את הקופה ב-22:00'::text, true)$$,
  'the manager''s announcement is pinned in the team''s group, and the demo''s own'
);
select results_eq(
  $$select a.user_id, a.acked_at > m.created_at and a.acked_at < now()
    from public.chat_acks a join public.chat_messages m on m.id = a.message_id
    where a.message_id = pg_temp.id_of('announcement') order by a.acked_at$$,
  $$values ('88000000-0000-4000-a000-000000000003'::uuid, true),
    ('88000000-0000-4000-a000-000000000004'::uuid, true)$$,
  'the first two workers confirmed it, after it was posted and in the past'
);
select results_eq(
  $$select n.user_id, n.read_at is not null, n.resolved_at is not null
    from public.notifications n
    where n.business_id = '88000000-0000-4000-b000-000000000001'
      and n.dedupe_key = 'chat.announcement.' || pg_temp.id_of('announcement')::text
    order by n.user_id$$,
  $$values ('88000000-0000-4000-a000-000000000001'::uuid, false, false),
    ('88000000-0000-4000-a000-000000000003'::uuid, true, true),
    ('88000000-0000-4000-a000-000000000004'::uuid, true, true),
    ('88000000-0000-4000-a000-000000000005'::uuid, false, false)$$,
  'its line waits for the owner and the third worker, and is settled for those who confirmed; its author has none'
);
select is(
  (select count(*)::integer from public.audit_log a
   where a.business_id = '88000000-0000-4000-b000-000000000001' and a.action ~ '^chat\.'),
  0,
  'posting and confirming it write no row of the log'
);

------------------------------------------------------------------------------
-- What the screens read of it

select is(
  pg_temp.team_row('88000000-0000-4000-a000-000000000001') || ','
  || pg_temp.team_row('88000000-0000-4000-a000-000000000002') || ','
  || pg_temp.team_row('88000000-0000-4000-a000-000000000003') || ','
  || pg_temp.team_row('88000000-0000-4000-a000-000000000005'),
  '2|1,0|0,0|0,3|1',
  'the team''s group waits for the owner and the third worker, not for its author or those who confirmed'
);

select pg_temp.sign_in('88000000-0000-4000-a000-000000000002');
select is(
  (select count(*)::integer || '/' || (count(*) filter (where r.acked_at is not null))::integer
   from public.announcement_readers(pg_temp.id_of('announcement')) r),
  '4/2',
  'its author reads who of the group confirmed: 2 of the 4 others'
);
select pg_temp.sign_in('88000000-0000-4000-a000-000000000001');
select is(
  (select count(*)::integer from public.announcement_readers(pg_temp.id_of('announcement'))),
  4,
  'and so does the owner, who moderates the groups'
);
select pg_temp.sign_in('88000000-0000-4000-a000-000000000003');
select is_empty(
  $$select 1 from public.announcement_readers(pg_temp.id_of('announcement'))$$,
  'a worker who confirmed it reads nobody else''s confirmation'
);
select results_eq(
  $$select a.user_id from public.chat_acks a$$,
  $$values ('88000000-0000-4000-a000-000000000003'::uuid)$$,
  'only their own'
);
-- Back to the test's own role: the browser's writes nothing of these.
reset role;

insert into public.platform_staff (user_id, role)
values ('88000000-0000-4000-a000-000000000006', 'onboarder');
insert into public.view_sessions (staff_id, business_id, role)
values ('88000000-0000-4000-a000-000000000006', '88000000-0000-4000-b000-000000000001', 'manager');
select pg_temp.sign_in('88000000-0000-4000-a000-000000000006');
select is(
  (select count(*)::integer from public.chat_messages)
  + (select count(*)::integer from public.chat_acks)
  + (select count(*)::integer from public.announcement_readers(pg_temp.id_of('announcement')))
  + (select count(*)::integer from public.chat_inbox('88000000-0000-4000-b000-000000000001')),
  0,
  'the ConceptApp team viewing the business as a manager reads none of it'
);
reset role;

------------------------------------------------------------------------------
-- "קראתי", and unpinning

select public.confirm_announcement('88000000-0000-4000-a000-000000000001',
  pg_temp.id_of('announcement'));
select is(
  pg_temp.team_row('88000000-0000-4000-a000-000000000001') || ','
  || pg_temp.team_row('88000000-0000-4000-a000-000000000005'),
  '2|0,3|1',
  'the owner''s "קראתי" takes the group off what waits for them, and only for them'
);
select is(
  (select (n.read_at is not null and n.resolved_at is not null)::text
   from public.notifications n
   where n.user_id = '88000000-0000-4000-a000-000000000001'
     and n.dedupe_key = 'chat.announcement.' || pg_temp.id_of('announcement')::text),
  'true',
  'and settles their line about it'
);

select public.pin_announcement('88000000-0000-4000-a000-000000000002',
  pg_temp.id_of('announcement'), false);
select is(
  pg_temp.team_row('88000000-0000-4000-a000-000000000005')
  || ',' || (select count(*)::integer from public.notifications n
     where n.dedupe_key = 'chat.announcement.' || pg_temp.id_of('announcement')::text
       and n.resolved_at is null),
  '3|0,0',
  'unpinned by its author, it waits for nobody, and every line about it is settled'
);

------------------------------------------------------------------------------
-- The next reset

set local role service_role;
select lives_ok(
  $$select public.reset_demo_business('88000000-0000-4000-b000-000000000001')$$,
  'the reset goes through'
);
reset role;
select pg_temp.save_ids();
select is(
  (select m.pinned::text from public.chat_messages m where m.id = pg_temp.id_of('announcement'))
  || '|' || (select count(*)::integer from public.chat_acks a
     where a.message_id = pg_temp.id_of('announcement'))
  || '|' || pg_temp.team_row('88000000-0000-4000-a000-000000000001'),
  'true|2|2|1',
  'and the announcement is back, pinned, confirmed by the same two, waiting for the owner again'
);

select * from finish();
rollback;
