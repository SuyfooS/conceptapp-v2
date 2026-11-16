-- Roles and permissions by module, R8 (20261115001400_roles_chat.sql): chat
-- by its permissions. One matrix, driven by VALUES, over four states the
-- owner sets through public.set_role_permission: today's defaults, workers
-- raised to moderate with announcing and sending documents ('raised'),
-- workers raised to moderate without them ('moderating'), and managers
-- lowered to view ('lowered'). In each, for the owner, a manager, a worker,
-- a colleague, the accountant and views as a worker and as a manager: which
-- chats they read, how much of the whole team's group (its history, a
-- removed message and a pinned announcement among it), of the kitchen's and
-- the bar's groups and of a private chat; who confirmed the announcement;
-- the log's chat rows; and what my_permissions says they hold of chat. And
-- for the owner, the manager and the worker: removing someone else's
-- message in a group and putting it back, unpinning someone else's
-- announcement, announcing, sending a document to people, writing in a
-- department's group they aren't in, removing the other person's message
-- in a private chat, saving chat's settings, and a line and a picture's
-- place in the team's group where only announcers write (lives or the code
-- it is refused with). Then: announcing and sending documents given to a
-- role only while it moderates by role; given to a person, they hold without
-- it; the office sends documents whatever chat says; a manager gives nobody a
-- role that moderates when they don't; the console's matrix; an author
-- lowered unpins their own announcement but doesn't pin it again; those in a
-- department's group by moderating alone told as holders of chat.moderate,
-- so a lowered manager reads none of it and their push is skipped; on
-- today's defaults who holds what of chat is who did before, for every
-- membership; and no chat or documents function or policy asks a rank. Fixed
-- ids (99…), so nothing here depends on the seed; explicit times before now.
begin;
select plan(12);

-- 1 owner, 2 manager (from the 8th, in no department), 3 the worker the
-- matrix follows (from the 10th, in the kitchen from then), 4 a colleague
-- (in the bar), 5 the accountant; 6 and 7 on the ConceptApp team, viewing as
-- a worker and as a manager.
insert into auth.users (id, aud, role, phone)
select
  ('99000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250099' || lpad(n::text, 4, '0')
from generate_series(1, 7) as n;

create temporary table people (label text primary key, id uuid not null) on commit drop;
insert into people values
  ('owner', '99000000-0000-4000-a000-000000000001'),
  ('manager', '99000000-0000-4000-a000-000000000002'),
  ('worker', '99000000-0000-4000-a000-000000000003'),
  ('colleague', '99000000-0000-4000-a000-000000000004'),
  ('accountant', '99000000-0000-4000-a000-000000000005'),
  ('view as worker', '99000000-0000-4000-a000-000000000006'),
  ('view as manager', '99000000-0000-4000-a000-000000000007');
grant select on people to authenticated, service_role;

insert into public.businesses (id, slug, name)
values ('99000000-0000-4000-b000-000000000001', 'rch-one', 'Roles Chat');

insert into public.memberships (business_id, user_id, role, created_at)
values
  ('99000000-0000-4000-b000-000000000001', '99000000-0000-4000-a000-000000000001', 'owner', '2026-11-01 08:00+00'),
  ('99000000-0000-4000-b000-000000000001', '99000000-0000-4000-a000-000000000002', 'manager', '2026-11-08 08:00+00'),
  ('99000000-0000-4000-b000-000000000001', '99000000-0000-4000-a000-000000000003', 'worker', '2026-11-10 08:00+00'),
  ('99000000-0000-4000-b000-000000000001', '99000000-0000-4000-a000-000000000004', 'worker', '2026-11-01 08:00+00'),
  ('99000000-0000-4000-b000-000000000001', '99000000-0000-4000-a000-000000000005', 'accountant', '2026-11-01 08:00+00');

insert into public.business_modules (business_id, module_key, enabled, settings)
values ('99000000-0000-4000-b000-000000000001', 'chat', true, '{}');

insert into public.departments (id, business_id, key, name, position)
values
  ('99000000-0000-4000-d000-000000000001', '99000000-0000-4000-b000-000000000001', 'kitchen', 'Kitchen', 0),
  ('99000000-0000-4000-d000-000000000002', '99000000-0000-4000-b000-000000000001', 'bar', 'Bar', 1);
insert into public.department_members (department_id, business_id, user_id, added_at)
values
  ('99000000-0000-4000-d000-000000000001', '99000000-0000-4000-b000-000000000001',
   '99000000-0000-4000-a000-000000000003', '2026-11-10 08:00+00'),
  ('99000000-0000-4000-d000-000000000002', '99000000-0000-4000-b000-000000000001',
   '99000000-0000-4000-a000-000000000004', '2026-11-01 08:00+00');

insert into public.platform_staff (user_id, role)
values
  ('99000000-0000-4000-a000-000000000006', 'onboarder'),
  ('99000000-0000-4000-a000-000000000007', 'onboarder');
insert into public.view_sessions (staff_id, business_id, role)
values
  ('99000000-0000-4000-a000-000000000006', '99000000-0000-4000-b000-000000000001', 'worker'),
  ('99000000-0000-4000-a000-000000000007', '99000000-0000-4000-b000-000000000001', 'manager');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create function pg_temp.p(name text) returns uuid language sql as $$
  select p.id from people p where p.label = name
$$;

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated, service_role;

create function pg_temp.id(key text) returns uuid language sql as $$
  select i.id from ids i where i.name = key
$$;

insert into ids
select 'team', c.id from public.chat_conversations c
where c.business_id = '99000000-0000-4000-b000-000000000001' and c.kind = 'team';
insert into ids
select 'kitchen', c.id from public.chat_conversations c
where c.department_id = '99000000-0000-4000-d000-000000000001';
insert into ids
select 'bar', c.id from public.chat_conversations c
where c.department_id = '99000000-0000-4000-d000-000000000002';

-- `actor` writes `words` in the chat named `place`, or to `to_person`,
-- kept under `saved` (and a private chat under `saved`-chat).
create function pg_temp.send(saved text, actor text, words text, at_time timestamptz,
  place text default null, to_person text default null, announce boolean default false)
returns void language plpgsql as $$
declare
  sent jsonb;
begin
  sent := public.send_chat_message(pg_temp.p(actor), '99000000-0000-4000-b000-000000000001',
    gen_random_uuid(), words, pg_temp.id(place), pg_temp.p(to_person), announce, at_time);
  insert into ids values (saved, (sent ->> 'message')::uuid);
  if to_person is not null then
    insert into ids values (saved || '-chat', (sent ->> 'conversation')::uuid);
  end if;
end;
$$;

-- What a call does: 'lives', or the code it is refused with. Undone either
-- way, so each state starts from the same chats.
create function pg_temp.attempt(call text) returns text language plpgsql as $$
declare
  outcome text;
begin
  begin
    execute call;
    outcome := 'lives';
    raise exception 'tried' using errcode = 'P0001', hint = 'rch-tried';
  exception when others then
    if outcome is null then
      outcome := sqlstate;
    end if;
  end;
  return outcome;
end;
$$;

-- What a call is refused with: its code, hint and detail; 'lives' when it
-- isn't (and then it stays done).
create function pg_temp.refusal(call text) returns text language plpgsql as $$
declare
  got_code text;
  got_hint text;
  got_detail text;
begin
  execute call;
  return 'lives';
exception when others then
  get stacked diagnostics got_code = returned_sqlstate, got_hint = pg_exception_hint,
    got_detail = pg_exception_detail;
  return concat_ws(' ', got_code, nullif(got_hint, ''), nullif(got_detail, ''));
end;
$$;

------------------------------------------------------------------------------
-- The chats: the colleague's early line in the whole team's group (before
-- the manager and the worker came), the owner's in the kitchen's (before the
-- worker joined it), the colleague's in the bar's; on the 12th the
-- colleague's later line, the worker's in the kitchen, the colleague's
-- private message to the worker, a line of the colleague's the owner
-- removed, and the owner's announcement, pinned

select pg_temp.send('team-early', 'colleague', 'Early in the team', '2026-11-05 08:00+00', 'team');
select pg_temp.send('kitchen-early', 'owner', 'Early in the kitchen', '2026-11-05 09:00+00', 'kitchen');
select pg_temp.send('bar-note', 'colleague', 'In the bar', '2026-11-06 08:00+00', 'bar');
select pg_temp.send('team-late', 'colleague', 'Later in the team', '2026-11-12 08:00+00', 'team');
select pg_temp.send('kitchen-late', 'worker', 'Later in the kitchen', '2026-11-12 08:30+00', 'kitchen');
select pg_temp.send('direct', 'colleague', 'Just us', '2026-11-12 09:00+00', null, 'worker');
select pg_temp.send('team-removed', 'colleague', 'Soon removed', '2026-11-12 09:30+00', 'team');
select public.remove_chat_message(pg_temp.p('owner'), pg_temp.id('team-removed'),
  '2026-11-12 09:45+00');
select pg_temp.send('announcement', 'owner', 'Closing at ten', '2026-11-12 10:00+00', 'team',
  null, true);

------------------------------------------------------------------------------
-- Today's defaults, as before

-- Today's rule for chat's keys, frozen as it was before this migration
-- (20261111000200_chat.sql's keys over 20261110000300_payroll_access.sql's
-- private.holds_perm): an active owner, a manager by role, or someone on the
-- staff given the key; an accountant never.
create function pg_temp.old_holds(business uuid, person uuid, perm_key text) returns boolean
language sql stable as $$
  select exists (
    select 1 from public.memberships m
    where m.business_id = business
      and m.user_id = person
      and m.active
      and (
        m.role = 'owner'
        or (private.is_staff_role(m.role) and (m.role = 'manager' or perm_key = any (m.perms)))
      )
  )
$$;

-- With the colleague given announcing and sending documents of their own,
-- every membership in the database, the seed's included: each of chat's
-- keys, and who sends documents (those keys' holders and the office).
update public.memberships set perms = '{chat.announce,chat.send_documents}'
where business_id = '99000000-0000-4000-b000-000000000001' and user_id = pg_temp.p('colleague');
select is_empty(
  $$select m.business_id, m.user_id, k.key
    from public.memberships m
    cross join unnest('{chat.moderate,chat.announce,chat.send_documents}'::text[]) as k (key)
    where pg_temp.old_holds(m.business_id, m.user_id, k.key)
      is distinct from private.holds_perm(m.business_id, m.user_id, k.key)
    union all
    select m.business_id, m.user_id, 'sends documents'
    from public.memberships m
    where (pg_temp.old_holds(m.business_id, m.user_id, 'chat.send_documents')
        or private.in_office(m.business_id, m.user_id))
      is distinct from private.sends_documents(m.business_id, m.user_id)$$,
  'on today''s defaults, who moderates, announces and sends documents is who did before, for every membership, a personal grant included'
);
update public.memberships set perms = '{}'
where business_id = '99000000-0000-4000-b000-000000000001' and user_id = pg_temp.p('colleague');

select is(
  (select string_agg(k.key || ':' || k.settable::text || ':' || coalesce(k.requires, 'none')
       || ':' || k.default_roles::text, ',' order by k.key)
   from public.permission_keys k where k.area = 'chat'),
  'chat.announce:true:chat.moderate:{manager},chat.moderate:true:none:{manager},chat.send_documents:true:chat.moderate:{manager}',
  'chat is open for changes per role, and announcing and sending documents need moderating, managers'' by default as before'
);

select ok(
  (select count(*) = 0
   from pg_proc p
   join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname in ('public', 'private')
     and p.proname ~ '(chat|announcement|document)'
     and p.prosrc ~ '(has_role|is_viewing|members_in|role_rank)\s*\(')
  and (select count(*) = 0
   from pg_policies p
   where p.schemaname = 'public'
     and p.tablename in ('chat_conversations', 'chat_messages', 'chat_reads', 'chat_acks',
       'chat_notices', 'documents', 'document_recipients', 'document_notices')
     and coalesce(p.qual, '') || coalesce(p.with_check, '') ~ '(has_role|is_viewing|members_in)'),
  'no chat or documents function or policy asks a rank'
);

------------------------------------------------------------------------------
-- The matrix

-- The state the owner sets: back to the defaults (managers moderate, then
-- their two switches; workers' switches off, then their moderating), then
-- the state's own switches, moderating before what requires it.
create function pg_temp.apply(wanted text) returns void language plpgsql as $$
declare
  boss uuid := pg_temp.p('owner');
begin
  perform public.set_role_permission(boss, '99000000-0000-4000-b000-000000000001',
    'manager', 'chat.moderate', true);
  perform public.set_role_permission(boss, '99000000-0000-4000-b000-000000000001',
    'manager', 'chat.announce', true);
  perform public.set_role_permission(boss, '99000000-0000-4000-b000-000000000001',
    'manager', 'chat.send_documents', true);
  perform public.set_role_permission(boss, '99000000-0000-4000-b000-000000000001',
    'worker', 'chat.announce', false);
  perform public.set_role_permission(boss, '99000000-0000-4000-b000-000000000001',
    'worker', 'chat.send_documents', false);
  perform public.set_role_permission(boss, '99000000-0000-4000-b000-000000000001',
    'worker', 'chat.moderate', false);
  if wanted in ('raised', 'moderating') then
    perform public.set_role_permission(boss, '99000000-0000-4000-b000-000000000001',
      'worker', 'chat.moderate', true);
  end if;
  if wanted = 'raised' then
    perform public.set_role_permission(boss, '99000000-0000-4000-b000-000000000001',
      'worker', 'chat.announce', true);
    perform public.set_role_permission(boss, '99000000-0000-4000-b000-000000000001',
      'worker', 'chat.send_documents', true);
  elsif wanted = 'lowered' then
    perform public.set_role_permission(boss, '99000000-0000-4000-b000-000000000001',
      'manager', 'chat.moderate', false);
  end if;
end;
$$;

-- What the signed-in person reads of the business's chats: the chats, the
-- messages of the team's, the kitchen's and the bar's groups and of the
-- private chat (removed ones as their rows), who confirmed the announcement,
-- the log's chat rows, and what they hold of chat: m(oderate), a(nnounce),
-- d(ocuments).
create function pg_temp.reads()
returns table (chats integer, team integer, kitchen integer, bar integer, pair integer,
  readers integer, logged integer, holds text)
language sql as $$
  select
    (select count(c.id)::integer from public.chat_conversations c
     where c.business_id = '99000000-0000-4000-b000-000000000001'),
    (select count(m.id)::integer from public.chat_messages m
     where m.conversation_id = pg_temp.id('team')),
    (select count(m.id)::integer from public.chat_messages m
     where m.conversation_id = pg_temp.id('kitchen')),
    (select count(m.id)::integer from public.chat_messages m
     where m.conversation_id = pg_temp.id('bar')),
    (select count(m.id)::integer from public.chat_messages m
     where m.conversation_id = pg_temp.id('direct-chat')),
    (select count(*)::integer from public.announcement_readers(pg_temp.id('announcement'))),
    (select count(a.id)::integer from public.audit_log a
     where a.business_id = '99000000-0000-4000-b000-000000000001' and a.action ~ '^chat\.'),
    (select concat(
        case when 'chat.moderate' = any (h.held) then 'm' else '-' end,
        case when 'chat.announce' = any (h.held) then 'a' else '-' end,
        case when 'chat.send_documents' = any (h.held) then 'd' else '-' end)
     from (select public.my_permissions('99000000-0000-4000-b000-000000000001') as held) h)
$$;

create temporary table seen (
  phase text, who text, chats integer, team integer, kitchen integer, bar integer,
  pair integer, readers integer, logged integer, holds text
) on commit drop;
grant all on seen to authenticated, service_role;

-- Each reader signed in in turn, what they read in `phase` kept.
create function pg_temp.look(at_phase text) returns void language plpgsql as $$
declare
  reader record;
begin
  for reader in
    select p.label, p.id from people p order by p.label
  loop
    perform pg_temp.sign_in(reader.id);
    insert into seen select at_phase, reader.label, r.* from pg_temp.reads() r;
    perform set_config('role', 'none', true);
  end loop;
end;
$$;

-- The writes, each undone by pg_temp.attempt.
create function pg_temp.remove_late(actor uuid) returns void language sql as $$
  select public.remove_chat_message(actor, pg_temp.id('team-late'), '2026-11-12 12:00+00')
$$;
create function pg_temp.remove_and_restore(actor uuid) returns void language plpgsql as $$
begin
  perform public.remove_chat_message(actor, pg_temp.id('team-late'), '2026-11-12 12:00+00');
  perform public.restore_chat_message(actor, pg_temp.id('team-late'), '2026-11-12 12:05+00');
end;
$$;
create function pg_temp.announce(actor uuid) returns void language sql as $$
  select public.send_chat_message(actor, '99000000-0000-4000-b000-000000000001',
    gen_random_uuid(), 'A notice', pg_temp.id('team'), null::uuid, true, '2026-11-12 12:00+00')
$$;
-- A PDF to the colleague, its place reserved, put in the bucket as the
-- Storage API would, and sent.
create function pg_temp.send_document(actor uuid) returns void language plpgsql as $$
declare
  place jsonb;
begin
  place := public.reserve_document_upload(actor, '99000000-0000-4000-b000-000000000001',
    'to_people', 'pdf', 'application/pdf', 5000, 'procedure.pdf', '2026-11-12 12:00+00');
  insert into storage.objects (bucket_id, name, metadata, created_at)
  values ('documents', place ->> 'path',
    jsonb_build_object('size', 5000, 'mimetype', 'application/pdf'), '2026-11-12 12:00+00');
  perform public.send_document(actor, '99000000-0000-4000-b000-000000000001', 'to_people',
    'procedure', 'A procedure', null, array[pg_temp.p('colleague')], false,
    (place ->> 'upload')::uuid, null, '2026-11-12 12:00+00');
end;
$$;

-- Only announcers writing in the whole team's group (chat's settings, set
-- here as they are stored), then a line there, and then a picture's place
-- reserved there: each asks chat.announce of whoever isn't announcing.
create function pg_temp.closed_team_line(actor uuid) returns void language plpgsql as $$
begin
  update public.business_modules set settings = '{"teamGroupWho": "announcers"}'
  where business_id = '99000000-0000-4000-b000-000000000001' and module_key = 'chat';
  perform public.send_chat_message(actor, '99000000-0000-4000-b000-000000000001',
    gen_random_uuid(), 'Hi', pg_temp.id('team'), null::uuid, false, '2026-11-12 12:00+00');
end;
$$;
create function pg_temp.closed_team_upload(actor uuid) returns void language plpgsql as $$
begin
  update public.business_modules set settings = '{"teamGroupWho": "announcers"}'
  where business_id = '99000000-0000-4000-b000-000000000001' and module_key = 'chat';
  perform public.reserve_chat_upload(actor, '99000000-0000-4000-b000-000000000001',
    'image', 'image/webp', 1000, pg_temp.id('team'), null::uuid, null::text,
    '2026-11-12 12:00+00');
end;
$$;

-- Removing the colleague's later line in the team's group and putting it
-- back, unpinning the owner's announcement, announcing in the team's group,
-- a document to people, a line in the bar's group, removing the colleague's
-- message in their private chat with the worker, only management writing in
-- the team's group (chat's settings), and a line and a picture's place in
-- the team's group where only announcers write, by the owner, the manager
-- and the worker.
create function pg_temp.writes()
returns table (who text, removes text, restores text, unpins text, announces text,
  documents text, in_bar text, in_private text, settings text, team_closed text)
language sql as $$
  select p.label,
    pg_temp.attempt(format('select pg_temp.remove_late(%L::uuid)', p.id)),
    pg_temp.attempt(format('select pg_temp.remove_and_restore(%L::uuid)', p.id)),
    pg_temp.attempt(format(
      'select public.pin_announcement(%L::uuid, %L::uuid, false, %L::timestamptz)',
      p.id, pg_temp.id('announcement'), '2026-11-12 12:00+00')),
    pg_temp.attempt(format('select pg_temp.announce(%L::uuid)', p.id)),
    pg_temp.attempt(format('select pg_temp.send_document(%L::uuid)', p.id)),
    pg_temp.attempt(format(
      'select public.send_chat_message(%L::uuid, %L::uuid, gen_random_uuid(), %L, %L::uuid, null::uuid, false, %L::timestamptz)',
      p.id, '99000000-0000-4000-b000-000000000001', 'Hello bar', pg_temp.id('bar'),
      '2026-11-12 12:00+00')),
    pg_temp.attempt(format(
      'select public.remove_chat_message(%L::uuid, %L::uuid, %L::timestamptz)',
      p.id, pg_temp.id('direct'), '2026-11-12 12:00+00')),
    pg_temp.attempt(format(
      'select public.set_module_settings(%L::uuid, %L::uuid, %L::public.module_key, %L::jsonb)',
      p.id, '99000000-0000-4000-b000-000000000001', 'chat', '{"teamGroupWho": "announcers"}')),
    pg_temp.attempt(format('select pg_temp.closed_team_line(%L::uuid)', p.id))
      || ' ' || pg_temp.attempt(format('select pg_temp.closed_team_upload(%L::uuid)', p.id))
  from people p
  where p.label in ('owner', 'manager', 'worker')
$$;

create temporary table acts (
  phase text, who text, removes text, restores text, unpins text, announces text,
  documents text, in_bar text, in_private text, settings text, team_closed text
) on commit drop;

select pg_temp.apply('today');
insert into acts select 'today', w.* from pg_temp.writes() w;
select pg_temp.look('today');

select pg_temp.apply('raised');
insert into acts select 'raised', w.* from pg_temp.writes() w;
select pg_temp.look('raised');

select pg_temp.apply('moderating');
insert into acts select 'moderating', w.* from pg_temp.writes() w;
select pg_temp.look('moderating');

select pg_temp.apply('lowered');
insert into acts select 'lowered', w.* from pg_temp.writes() w;
select pg_temp.look('lowered');

-- Reads: the team's group, its own chats and groups always (view is the
-- floor), from when each came onto the staff or joined the department; every
-- department's group and all of every group's history, who confirmed an
-- announcement, and the log's chat rows (with manage.view) for those who
-- moderate; a private chat for its two people alone, whoever moderates;
-- nothing for the accountant and for a view as any role, whatever the role
-- holds; and what each holds of chat, announcing and sending documents only
-- while moderating.
select set_eq(
  'select * from seen',
  $$values
    ('today', 'owner', 3, 4, 2, 1, 0, 3, 1, 'mad'),
    ('today', 'manager', 3, 4, 2, 1, 0, 3, 1, 'mad'),
    ('today', 'worker', 3, 3, 1, 0, 1, 0, 0, '---'),
    ('today', 'colleague', 3, 4, 0, 1, 1, 0, 0, '---'),
    ('today', 'accountant', 0, 0, 0, 0, 0, 0, 0, '---'),
    ('today', 'view as worker', 0, 0, 0, 0, 0, 0, 0, '---'),
    ('today', 'view as manager', 0, 0, 0, 0, 0, 0, 0, 'mad'),
    ('raised', 'owner', 3, 4, 2, 1, 0, 3, 1, 'mad'),
    ('raised', 'manager', 3, 4, 2, 1, 0, 3, 1, 'mad'),
    ('raised', 'worker', 4, 4, 2, 1, 1, 3, 0, 'mad'),
    ('raised', 'colleague', 4, 4, 2, 1, 1, 3, 0, 'mad'),
    ('raised', 'accountant', 0, 0, 0, 0, 0, 0, 0, '---'),
    ('raised', 'view as worker', 0, 0, 0, 0, 0, 0, 0, 'mad'),
    ('raised', 'view as manager', 0, 0, 0, 0, 0, 0, 0, 'mad'),
    ('moderating', 'owner', 3, 4, 2, 1, 0, 3, 1, 'mad'),
    ('moderating', 'manager', 3, 4, 2, 1, 0, 3, 1, 'mad'),
    ('moderating', 'worker', 4, 4, 2, 1, 1, 3, 0, 'm--'),
    ('moderating', 'colleague', 4, 4, 2, 1, 1, 3, 0, 'm--'),
    ('moderating', 'accountant', 0, 0, 0, 0, 0, 0, 0, '---'),
    ('moderating', 'view as worker', 0, 0, 0, 0, 0, 0, 0, 'm--'),
    ('moderating', 'view as manager', 0, 0, 0, 0, 0, 0, 0, 'mad'),
    ('lowered', 'owner', 3, 4, 2, 1, 0, 3, 1, 'mad'),
    ('lowered', 'manager', 1, 3, 0, 0, 0, 0, 0, '---'),
    ('lowered', 'worker', 3, 3, 1, 0, 1, 0, 0, '---'),
    ('lowered', 'colleague', 3, 4, 0, 1, 1, 0, 0, '---'),
    ('lowered', 'accountant', 0, 0, 0, 0, 0, 0, 0, '---'),
    ('lowered', 'view as worker', 0, 0, 0, 0, 0, 0, 0, '---'),
    ('lowered', 'view as manager', 0, 0, 0, 0, 0, 0, 0, '---')$$,
  'every department''s group and all of the history, who confirmed and the log''s chat rows follow chat.moderate; one''s own chats always; a private chat its two people''s alone; views read nothing, as before'
);

-- Writes: removing, putting back and unpinning others' in groups, writing in
-- a group of another department and chat's settings follow chat.moderate;
-- announcing, writing where only announcers write and sending documents
-- follow their switches, under it, so lowered managers and workers who
-- moderate without announcing don't write in the team's group then; nobody
-- removes the other person's message in a private chat, and nobody else
-- reads one; settings need manage.edit too (R7), which workers don't hold.
select set_eq(
  'select * from acts',
  $$values
    ('today', 'owner', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives', 'P0002', 'lives', 'lives lives'),
    ('today', 'manager', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives', 'P0002', 'lives', 'lives lives'),
    ('today', 'worker', '42501', '42501', '42501', '42501', '42501', 'P0002', '42501', '42501', '42501 42501'),
    ('raised', 'owner', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives', 'P0002', 'lives', 'lives lives'),
    ('raised', 'manager', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives', 'P0002', 'lives', 'lives lives'),
    ('raised', 'worker', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives', '42501', '42501', 'lives lives'),
    ('moderating', 'owner', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives', 'P0002', 'lives', 'lives lives'),
    ('moderating', 'manager', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives', 'P0002', 'lives', 'lives lives'),
    ('moderating', 'worker', 'lives', 'lives', 'lives', '42501', '42501', 'lives', '42501', '42501', '42501 42501'),
    ('lowered', 'owner', 'lives', 'lives', 'lives', 'lives', 'lives', 'lives', 'P0002', 'lives', 'lives lives'),
    ('lowered', 'manager', '42501', '42501', '42501', '42501', '42501', 'P0002', 'P0002', '42501', '42501 42501'),
    ('lowered', 'worker', '42501', '42501', '42501', '42501', '42501', 'P0002', '42501', '42501', '42501 42501')$$,
  'chat''s writes follow chat.moderate, announcing, writing where only announcers write and sending documents their switches under it, and today''s rules are unchanged'
);

------------------------------------------------------------------------------
-- Managers lowered: the console's matrix, and the office

select is(
  (select string_agg(m.role::text || '/' || m.perm || ':' || m.settable::text || ':'
       || m.given::text || ':' || m.held::text, ',' order by m.role, m.perm)
   from public.role_permission_matrix('99000000-0000-4000-b000-000000000001') m
   where m.area = 'chat'),
  'manager/chat.announce:true:true:false,manager/chat.moderate:true:false:false,manager/chat.send_documents:true:true:false,'
    || 'worker/chat.announce:true:false:false,worker/chat.moderate:true:false:false,worker/chat.send_documents:true:false:false',
  'the console''s matrix has chat open for managers and workers, and lowered managers hold neither switch by role, their rule for each unchanged'
);

-- Managers given pay: in the office, they send documents again, and still
-- neither announce nor remove others' messages.
select public.set_role_permission(pg_temp.p('owner'), '99000000-0000-4000-b000-000000000001',
  'manager', 'clock.payroll', true);
select is(
  pg_temp.attempt(format('select pg_temp.send_document(%L::uuid)', pg_temp.p('manager')))
  || ' ' || pg_temp.attempt(format('select pg_temp.announce(%L::uuid)', pg_temp.p('manager')))
  || ' ' || pg_temp.attempt(format('select pg_temp.remove_late(%L::uuid)', pg_temp.p('manager'))),
  'lives 42501 42501',
  'the office sends documents whatever chat says: a lowered manager who sees pay sends them, and still neither announces nor removes'
);
select public.set_role_permission(pg_temp.p('owner'), '99000000-0000-4000-b000-000000000001',
  'manager', 'clock.payroll', false);

------------------------------------------------------------------------------
-- What announcing and sending documents require

-- Managers lowered, announcing granted to them again; then, on today's
-- defaults, announcing and sending documents granted to workers.
create function pg_temp.requires_refusals() returns text language plpgsql as $$
declare
  lowered text;
  announcing text;
  sending text;
begin
  perform pg_temp.apply('lowered');
  lowered := pg_temp.refusal(format(
    'select public.set_role_permission(%L::uuid, %L::uuid, %L, %L, true)',
    pg_temp.p('owner'), '99000000-0000-4000-b000-000000000001', 'manager', 'chat.announce'));
  perform pg_temp.apply('today');
  announcing := pg_temp.refusal(format(
    'select public.set_role_permission(%L::uuid, %L::uuid, %L, %L, true)',
    pg_temp.p('owner'), '99000000-0000-4000-b000-000000000001', 'worker', 'chat.announce'));
  sending := pg_temp.refusal(format(
    'select public.set_role_permission(%L::uuid, %L::uuid, %L, %L, true)',
    pg_temp.p('owner'), '99000000-0000-4000-b000-000000000001', 'worker', 'chat.send_documents'));
  return lowered || ' | ' || announcing || ' | ' || sending;
end;
$$;

select is(
  pg_temp.requires_refusals(),
  '22023 requires chat.moderate | 22023 requires chat.moderate | 22023 requires chat.moderate',
  'announcing and sending documents are given to a role only while it moderates by role, lowered managers and workers on the defaults alike'
);

-- On today's defaults, the worker given announcing and sending documents of
-- their own: both hold, without moderating, as every personal grant does.
update public.memberships set perms = '{chat.announce,chat.send_documents}'
where business_id = '99000000-0000-4000-b000-000000000001' and user_id = pg_temp.p('worker');
select is(
  pg_temp.attempt(format('select pg_temp.announce(%L::uuid)', pg_temp.p('worker')))
  || ' ' || pg_temp.attempt(format('select pg_temp.send_document(%L::uuid)', pg_temp.p('worker')))
  || ' ' || pg_temp.attempt(format('select pg_temp.remove_late(%L::uuid)', pg_temp.p('worker'))),
  'lives lives 42501',
  'given to a person, announcing and sending documents hold without moderating'
);
update public.memberships set perms = '{}'
where business_id = '99000000-0000-4000-b000-000000000001' and user_id = pg_temp.p('worker');

------------------------------------------------------------------------------
-- Giving a role, with workers set above managers

-- On today's defaults the worker's role holds nothing of chat the manager
-- doesn't; with workers moderating and managers not, it does, so a manager
-- gives nobody that role (private.role_holds_beyond, R3's, which
-- public.set_member_role and the invites ask).
create function pg_temp.beyond() returns text language plpgsql as $$
declare
  before_raise boolean;
begin
  perform pg_temp.apply('today');
  before_raise := private.role_holds_beyond('99000000-0000-4000-b000-000000000001', 'worker',
    pg_temp.p('manager'));
  perform pg_temp.apply('moderating');
  perform public.set_role_permission(pg_temp.p('owner'), '99000000-0000-4000-b000-000000000001',
    'manager', 'chat.moderate', false);
  return before_raise::text || ' | ' || private.role_holds_beyond(
    '99000000-0000-4000-b000-000000000001', 'worker', pg_temp.p('manager'))::text;
end;
$$;

select is(
  pg_temp.beyond(),
  'false | true',
  'with workers moderating chat and managers not, the worker''s role holds what a manager doesn''t'
);

------------------------------------------------------------------------------
-- Pinning one's own announcement again

-- The manager's own announcement in the team's group, posted while they
-- announce; managers lowered, they unpin it and pin it again; then the
-- owner pins it again.
create function pg_temp.own_pin() returns text language plpgsql as $$
declare
  unpinned text;
  again text;
  by_owner text;
begin
  perform pg_temp.apply('today');
  perform pg_temp.send('manager-announcement', 'manager', 'Stocktaking tonight',
    '2026-11-12 11:00+00', 'team', null, true);
  perform pg_temp.apply('lowered');
  unpinned := pg_temp.refusal(format(
    'select public.pin_announcement(%L::uuid, %L::uuid, false, %L::timestamptz)',
    pg_temp.p('manager'), pg_temp.id('manager-announcement'), '2026-11-12 12:00+00'));
  again := pg_temp.refusal(format(
    'select public.pin_announcement(%L::uuid, %L::uuid, true, %L::timestamptz)',
    pg_temp.p('manager'), pg_temp.id('manager-announcement'), '2026-11-12 12:05+00'));
  by_owner := pg_temp.refusal(format(
    'select public.pin_announcement(%L::uuid, %L::uuid, true, %L::timestamptz)',
    pg_temp.p('owner'), pg_temp.id('manager-announcement'), '2026-11-12 12:10+00'));
  return unpinned || ' ' || again || ' ' || by_owner;
end;
$$;

select is(
  pg_temp.own_pin(),
  'lives 42501 lives',
  'an announcement''s author unpins their own whatever they hold, and pins it again, telling the group again, only while they announce; a moderator pins it'
);

------------------------------------------------------------------------------
-- Telling those in a department's group by moderating alone

-- Today's defaults, with notifications on and the owner's and the manager's
-- phones (the manager is in no department, the worker in the kitchen): the
-- colleague writes in the bar's group, and the owner in the kitchen's, a
-- line and an announcement. Each line as `kind@group/person:permission:push`;
-- how many the manager reads; then managers lowered: how many they read, and
-- the next send.
create function pg_temp.moderator_lines() returns text language plpgsql as $$
declare
  written text;
  before_lowering integer;
  after_lowering integer;
  sent text;
begin
  perform pg_temp.apply('today');
  insert into public.business_modules (business_id, module_key, enabled, settings)
  values ('99000000-0000-4000-b000-000000000001', 'notifications', true, '{}');
  insert into public.push_subscriptions (user_id, endpoint, endpoint_hash, p256dh, auth_secret)
  select p.id, 'https://fcm.googleapis.com/rch-' || replace(p.label, ' ', '-'),
    repeat('9', 63) || phones.n::text,
    'BOr8a4N2Qbv1dDdEh5a3X9nTq0wKcY6UoL1mZpR4sVf8gJ2kHtE7yWiAxC3uNbQ5lMzO9vP0rS6eTgIjFhDwKy0',
    'aW5zdGFudC1hdXRoLWtleQ'
  from people p
  join (values ('owner', 1), ('manager', 2)) as phones (label, n) on phones.label = p.label;

  perform public.send_chat_message(pg_temp.p('colleague'), '99000000-0000-4000-b000-000000000001',
    gen_random_uuid(), 'Bar tonight', pg_temp.id('bar'), null::uuid, false, '2026-11-12 12:00+00');
  perform public.send_chat_message(pg_temp.p('owner'), '99000000-0000-4000-b000-000000000001',
    gen_random_uuid(), 'Kitchen tonight', pg_temp.id('kitchen'), null::uuid, false,
    '2026-11-12 12:00+00');
  perform public.send_chat_message(pg_temp.p('owner'), '99000000-0000-4000-b000-000000000001',
    gen_random_uuid(), 'Kitchen closes early', pg_temp.id('kitchen'), null::uuid, true,
    '2026-11-12 12:01+00');

  select string_agg(x.line, ',' order by x.line collate "C") into written
  from (
    select split_part(n.kind, '.', 2) || '@' || i.name || '/' || p.label || ':'
      || coalesce(n.audience_perm, 'none') || ':' || n.push_state as line
    from public.notifications n
    join people p on p.id = n.user_id
    join ids i on i.id::text = n.params ->> 'conversation'
    where n.business_id = '99000000-0000-4000-b000-000000000001'
      and n.kind in ('chat.group', 'chat.announcement')
  ) x;

  perform pg_temp.sign_in(pg_temp.p('manager'));
  select count(*)::integer into before_lowering from public.notifications n
  where n.business_id = '99000000-0000-4000-b000-000000000001';
  perform set_config('role', 'none', true);

  perform pg_temp.apply('lowered');

  perform pg_temp.sign_in(pg_temp.p('manager'));
  select count(*)::integer into after_lowering from public.notifications n
  where n.business_id = '99000000-0000-4000-b000-000000000001';
  perform set_config('role', 'none', true);

  perform * from public.claim_due_pushes(200, '2026-11-12 13:00+00');
  select string_agg(x.line, ',' order by x.line collate "C") into sent
  from (
    select split_part(n.kind, '.', 2) || '@' || i.name || '/' || p.label || ':'
      || n.push_state as line
    from public.notifications n
    join people p on p.id = n.user_id
    join ids i on i.id::text = n.params ->> 'conversation'
    where n.business_id = '99000000-0000-4000-b000-000000000001'
      and n.kind in ('chat.group', 'chat.announcement')
  ) x;

  return written || ' | ' || before_lowering || ' ' || after_lowering || ' | ' || sent;
end;
$$;

select is(
  pg_temp.moderator_lines(),
  'announcement@kitchen/manager:chat.moderate:queued,announcement@kitchen/worker:none:none,'
    || 'group@bar/manager:chat.moderate:queued,group@bar/owner:chat.moderate:queued,'
    || 'group@kitchen/manager:chat.moderate:queued,group@kitchen/worker:none:none'
    || ' | 3 0 | '
    || 'announcement@kitchen/manager:skipped,announcement@kitchen/worker:none,'
    || 'group@bar/manager:skipped,group@bar/owner:sending,'
    || 'group@kitchen/manager:skipped,group@kitchen/worker:none',
  'a department''s group tells those in it by moderating alone as holders of chat.moderate, so a lowered manager reads none of it and their queued push is skipped; the department''s own get ordinary lines'
);

select * from finish();
rollback;
