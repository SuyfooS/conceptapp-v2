-- Chat, part 2 of 2 (C1 of the chat plan; Orel, 8 November 2026, issue #1):
-- conversations, their messages and who read them, in the database, with no
-- screen yet. The module is off in every template and every business until C2
-- switches it on.
--
--   conversations  three kinds in one table: the whole team's group (one per
--                  business, made with it), a department's group (one per
--                  department, made with it, closed while the department is
--                  removed and open again on undo), and a private chat between
--                  two people on the staff (made on the first message).
--   who is in one  derived, never synced: the team's group is the business's
--                  active staff; a department's group is its live members and
--                  the holders of chat.moderate (owners and managers by
--                  default); a private chat is its two people, while each is on
--                  the staff. An accountant is in none.
--   history        someone new reads a group from when they joined it: the
--                  team's from when they came onto the staff, this time
--                  (memberships.staff_since, new here, which moves when they
--                  come back after leaving or from being an accountant), a
--                  department's from when they were added or came back,
--                  whichever is later; moderators and the two people of a
--                  private chat read all of it; a pinned announcement is read
--                  by every member now (Orel's defaults, §17 of the plan, each
--                  one function below).
--   privacy        a private chat is read by its two people and by nobody else.
--                  No policy or function here has a branch for owners,
--                  managers, the ConceptApp team or a view session, so a view
--                  session reads no chat at all, groups included; no chat.* or
--                  document.* row of the activity log reaches a view session
--                  (private.is_private_action); and the server role reads none
--                  of these tables either, so no console page can. Sending,
--                  opening a private chat, reading and muting write no log row:
--                  only a moderator's removal of someone else's message in a
--                  group does (chat.remove, chat.restore), with ids and never
--                  the text. Messages aren't end-to-end encrypted: that the team
--                  doesn't read them is a written rule (docs/AGENT.md), not a
--                  lock.
--   writes         server functions with the secret key, for `actor`, never
--                  while viewing as someone. Unknown and not yours are the same
--                  answer (P0002). Every rule a message's row has is checked
--                  before it is inserted, so a refused message never reaches the
--                  Postgres log with its text.
--   removing       an author removes their own message anywhere, a moderator
--                  someone else's in a group; the text waits in
--                  private.chat_removed, which nobody reads, for an undo of 10
--                  minutes, and the job `chat` (every 10 minutes) empties what
--                  is older, so a removed text is gone within 20.
--   notifications  one line per person per conversation (chat.direct,
--                  chat.group), with ids and a count and never a word of the
--                  message, written by the send itself (private.notify_chat):
--                  its push 15 seconds late, so an open conversation reads it
--                  first, then again only after a minute unread in a private
--                  chat or 10 minutes in a group, and never from a muted one.
--                  An announcement is a line of its own that asks for "קראתי"
--                  (chat.announcement), settled by confirming it, and for
--                  everyone by removing or unpinning it.
--   demo           a visitor's messages go after an hour (the same job), and a
--                  demo business takes at most 100 an hour; the reset ends with
--                  private.seed_demo_chat, which writes nothing yet: C2
--                  replaces it, never the reset.
--
-- Files (C4, C5) and official documents (C6) come later; the messages' file
-- columns are here so their parts add no column.

------------------------------------------------------------------------------
-- The module: off everywhere until its screens (C2)

insert into public.business_modules (business_id, module_key, enabled)
select b.id, 'chat'::public.module_key, false from public.businesses b
on conflict (business_id, module_key) do nothing;

------------------------------------------------------------------------------
-- Conversations

create table public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null check (kind in ('team', 'department', 'direct')),
  -- A department's group: its department.
  department_id uuid,
  -- A private chat's two people, the lower id first, so a pair has one chat.
  person_a uuid,
  person_b uuid,
  -- The newest message, for the order of the list.
  last_message_at timestamptz,
  -- When anything a reader sees here last changed: a message sent, removed,
  -- put back, pinned or confirmed. public.chat_version reads it.
  changed_at timestamptz not null default now(),
  -- Its department was removed (archived): moderators still read it, nobody
  -- writes in it, and it opens again when the department comes back.
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, business_id),
  foreign key (department_id, business_id)
    references public.departments (id, business_id) on delete cascade,
  -- Memberships are made inactive, never deleted: these fire only when an
  -- account is removed by hand, and its private chats go with it.
  foreign key (business_id, person_a)
    references public.memberships (business_id, user_id) on delete cascade,
  foreign key (business_id, person_b)
    references public.memberships (business_id, user_id) on delete cascade,
  check (case kind
    when 'team' then num_nulls(department_id, person_a, person_b) = 3
    when 'department' then department_id is not null and num_nulls(person_a, person_b) = 2
    when 'direct' then department_id is null and person_a is not null
      and person_b is not null and person_a < person_b
  end),
  check (kind = 'department' or closed_at is null)
);

create unique index chat_team_idx on public.chat_conversations (business_id)
  where kind = 'team';
create unique index chat_department_idx on public.chat_conversations (department_id)
  where kind = 'department';
create unique index chat_direct_idx on public.chat_conversations (business_id, person_a, person_b)
  where kind = 'direct';
create index chat_conversations_department_idx
  on public.chat_conversations (department_id, business_id);
create index chat_conversations_person_a_idx on public.chat_conversations (business_id, person_a);
create index chat_conversations_person_b_idx on public.chat_conversations (business_id, person_b);

------------------------------------------------------------------------------
-- Messages

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  conversation_id uuid not null,
  author_id uuid references public.profiles (id) on delete set null,
  -- The sender's own id for it, made in the browser: a retry never sends it twice.
  draft_id uuid not null,
  kind text not null default 'text' check (kind in ('text', 'announcement')),
  body text check (char_length(body) between 1 and 2000 and btrim(body) <> ''),
  -- From C4 (images) and C5 (PDFs).
  file_kind text check (file_kind in ('image', 'pdf')),
  file_path text unique,
  -- Images only.
  thumb_path text unique,
  file_name text check (char_length(file_name) between 1 and 120),
  -- The file and its thumbnail together.
  file_size integer check (file_size between 1 and 10485760),
  -- The days or the space took the file; the message stays.
  file_removed_at timestamptz,
  -- An announcement at the top of its group, until it is unpinned.
  pinned boolean not null default false,
  -- The demo's own (C2), kept until the next reset.
  seeded boolean not null default false,
  created_at timestamptz not null default now(),
  -- Removed: the row stays ("ההודעה נמחקה"), and what it said waits in
  -- private.chat_removed for the undo.
  removed_at timestamptz,
  removed_by uuid references public.profiles (id) on delete set null,
  unique (id, business_id),
  unique (author_id, draft_id),
  foreign key (conversation_id, business_id)
    references public.chat_conversations (id, business_id) on delete cascade,
  check (removed_at is not null or body is not null or file_path is not null),
  check (removed_at is null or (body is null and file_path is null and not pinned)),
  check (kind = 'announcement' or not pinned),
  check ((file_path is null) = (file_kind is null)),
  check (file_kind is distinct from 'image' or thumb_path is not null),
  check (file_removed_at is null or file_path is not null)
);

-- A page of a conversation, newest first, which also covers its foreign key.
create index chat_messages_page_idx
  on public.chat_messages (conversation_id, business_id, created_at desc, id desc);
-- A demo business's visitors in the last hour, and the job's clean-up.
create index chat_messages_business_idx on public.chat_messages (business_id, created_at);
-- How many one person sent in the last minute.
create index chat_messages_author_idx on public.chat_messages (author_id, created_at);
create index chat_messages_removed_by_idx on public.chat_messages (removed_by);
-- The files still kept, newest first (C4's clean-up).
create index chat_messages_files_idx on public.chat_messages (business_id, created_at desc)
  where file_path is not null and file_removed_at is null;
create index chat_messages_pinned_idx on public.chat_messages (conversation_id) where pinned;

-- What a removed message said, for its undo: nobody but the functions reads it,
-- and the job deletes it 10 minutes on.
create table private.chat_removed (
  message_id uuid primary key references public.chat_messages (id) on delete cascade,
  business_id uuid not null,
  body text,
  file_kind text,
  file_path text,
  thumb_path text,
  file_name text,
  file_size integer,
  file_removed_at timestamptz,
  pinned boolean not null,
  removed_by uuid not null,
  removed_at timestamptz not null
);

create index chat_removed_removed_at_idx on private.chat_removed (removed_at);

alter table private.chat_removed enable row level security;
revoke all on private.chat_removed from public, anon, authenticated, service_role;

------------------------------------------------------------------------------
-- Who read what

create table public.chat_reads (
  conversation_id uuid not null,
  business_id uuid not null,
  user_id uuid not null,
  -- Everything up to here is read; null while nothing is (muted before reading).
  read_at timestamptz,
  -- No push from it; still unread in the app.
  muted boolean not null default false,
  primary key (conversation_id, user_id),
  foreign key (conversation_id, business_id)
    references public.chat_conversations (id, business_id) on delete cascade,
  foreign key (business_id, user_id)
    references public.memberships (business_id, user_id) on delete cascade
);

create index chat_reads_conversation_idx on public.chat_reads (conversation_id, business_id);
create index chat_reads_user_idx on public.chat_reads (business_id, user_id);

create trigger chat_reads_staff_only before insert on public.chat_reads
  for each row execute function private.refuse_non_staff();

-- "קראתי" on an announcement.
create table public.chat_acks (
  message_id uuid not null,
  business_id uuid not null,
  user_id uuid not null,
  acked_at timestamptz not null default now(),
  primary key (message_id, user_id),
  foreign key (message_id, business_id)
    references public.chat_messages (id, business_id) on delete cascade,
  foreign key (business_id, user_id)
    references public.memberships (business_id, user_id) on delete cascade
);

create index chat_acks_message_idx on public.chat_acks (message_id, business_id);
create index chat_acks_user_idx on public.chat_acks (business_id, user_id);

create trigger chat_acks_staff_only before insert on public.chat_acks
  for each row execute function private.refuse_non_staff();

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_reads enable row level security;
alter table public.chat_acks enable row level security;

-- Every write goes through the functions below. The browser reads under the
-- policies; the server role reads nothing at all, so no console page or
-- script with the secret key can read a chat.
revoke all on
  public.chat_conversations, public.chat_messages, public.chat_reads, public.chat_acks
from anon, authenticated, service_role;
grant select on
  public.chat_conversations, public.chat_messages, public.chat_reads, public.chat_acks
to authenticated;

comment on table public.chat_conversations is
  'A business''s chats: the whole team''s group, one group per department and private chats between two people on the staff. Who is in each is derived (private.chat_reads_from); written only by the chat functions and triggers.';
comment on table public.chat_messages is
  'Messages of the chats, read from when the reader joined (pinned announcements by every member). A private chat''s are read by its two people only: no owner, manager, ConceptApp team or view session reads them. Written only by the chat functions.';
comment on table public.chat_reads is
  'How far each person read each chat, and whether they muted it: read by that person alone.';
comment on table public.chat_acks is
  'Who confirmed reading an announcement: read by that person; its author and moderators read them all through public.announcement_readers.';

------------------------------------------------------------------------------
-- Orel's defaults (§17 of the chat plan), each in one place, so changing one
-- is one function (CHAT_RULES in @domain/chat says the same;
-- modules/chat/settings.db.test.ts keeps the two in step)

-- Question 3: someone new reads a group from when they joined it, not before.
create function private.chat_history_from_joining()
returns boolean
language sql
immutable
set search_path = ''
as $$
  select true
$$;

-- Question 4: the two people of a private chat see that the other read it.
create function private.chat_read_marks()
returns boolean
language sql
immutable
set search_path = ''
as $$
  select true
$$;

-- Question 11: how long a demo visitor's messages are kept.
create function private.chat_demo_keeps()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '1 hour'
$$;

-- Question 11: how many messages a demo business takes from its visitors in an hour.
create function private.chat_demo_per_hour()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 100
$$;

------------------------------------------------------------------------------
-- When someone came onto the staff, this time

-- created_at is when the row was made, and claim_invite (like anything that
-- makes a row active again) brings someone who left, or an accountant, back
-- onto the staff on the same row: so a group's history would reach back to
-- their first time. staff_since is when the row last came onto the staff
-- (active, and not an accountant), as private.track_employment counts coming
-- in. Those there already came on when they joined: chat has no message from
-- before.
alter table public.memberships add column staff_since timestamptz;

-- Filling it changes nothing of the rows, so their updated_at stays.
alter table public.memberships disable trigger memberships_touch;
update public.memberships m set staff_since = m.created_at;
alter table public.memberships enable trigger memberships_touch;

alter table public.memberships
  alter column staff_since set default now(),
  alter column staff_since set not null;

comment on column public.memberships.staff_since is
  'When the row last came onto the staff (active, and not an accountant): its created_at at first, and the moment it comes back after leaving or from being an accountant. A group''s history starts here (private.chat_reads_from). Kept by private.mark_staff_since.';

-- On insert, created_at (so seeds and tests that give one keep it); on an
-- update that brings the row onto the staff (made active again, or from an
-- accountant to a staff role), now. A change of permissions, or from one
-- staff role to another, keeps it, so it never cuts anyone's history.
create function private.mark_staff_since()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.staff_since := new.created_at;
  elsif new.active and private.is_staff_role(new.role)
    and not (old.active and private.is_staff_role(old.role))
  then
    new.staff_since := now();
  end if;
  return new;
end;
$$;

create trigger memberships_staff_since
  before insert or update of active, role on public.memberships
  for each row execute function private.mark_staff_since();

------------------------------------------------------------------------------
-- Who is in a chat

-- Chat is on for the business, or raise 55000.
create function private.chat_on(business uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.module_enabled(business, 'chat'::public.module_key) then
    raise exception 'Chat is off for this business' using errcode = '55000';
  end if;
end;
$$;

-- The business's chat settings over the manifest's defaults
-- (modules/chat/manifest.ts; modules/chat/settings.db.test.ts keeps the two
-- the same).
create function private.chat_settings(business uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
      'teamGroupWho', 'everyone',
      'fileDays', 90,
      'fileSpaceMb', 100,
      'documentSpaceMb', 50
    )
    || coalesce(
      (
        select bm.settings
        from public.business_modules bm
        where bm.business_id = business and bm.module_key = 'chat'
      ),
      '{}'::jsonb
    )
$$;

-- `person` is an active member on the business's staff.
create function private.chat_staff(business uuid, person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.business_id = business
      and m.user_id = person
      and m.active
      and private.is_staff_role(m.role)
  )
$$;

-- `person` moderates the business's groups: on its staff and holding
-- chat.moderate (owners, and managers by default). They are in every
-- department's group, read all of it, and remove others' messages in groups.
create function private.chat_moderates(business uuid, person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.chat_staff(business, person)
    and private.holds_perm(business, person, 'chat.moderate')
$$;

-- From when `person` reads the conversation (-infinity for all of it), or null
-- for not at all. The one gate of every chat read, with no branch for owners,
-- the ConceptApp team or view sessions: a private chat for its two people while
-- they are on the staff; the team's group for the active staff, from when each
-- came onto it this time (staff_since); a department's group for its live
-- department's members on the staff, from when each was added or came back,
-- whichever is later, and for the moderators, all of it. Nothing while chat is
-- off.
create function private.chat_reads_from(conversation uuid, person uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case c.kind
    when 'direct' then
      case
        when person in (c.person_a, c.person_b) and private.chat_staff(c.business_id, person)
        then '-infinity'::timestamptz
      end
    when 'team' then (
      select case
        when private.chat_moderates(c.business_id, person)
          or not private.chat_history_from_joining()
        then '-infinity'::timestamptz
        else m.staff_since
      end
      from public.memberships m
      where m.business_id = c.business_id
        and m.user_id = person
        and m.active
        and private.is_staff_role(m.role)
    )
    when 'department' then
      case
        when private.chat_moderates(c.business_id, person) then '-infinity'::timestamptz
        else (
          select case
            when private.chat_history_from_joining()
            then greatest(dm.added_at, m.staff_since)
            else '-infinity'::timestamptz
          end
          from public.department_members dm
          join public.departments d on d.id = dm.department_id and d.archived_at is null
          join public.memberships m
            on m.business_id = dm.business_id and m.user_id = dm.user_id
            and m.active and private.is_staff_role(m.role)
          where dm.department_id = c.department_id and dm.user_id = person
        )
      end
  end
  from public.chat_conversations c
  where c.id = conversation
    and private.module_enabled(c.business_id, 'chat'::public.module_key)
$$;

-- `person` reads the message: from when they read its conversation, or a
-- pinned one while they read the conversation at all.
create function private.reads_chat_message(message uuid, person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.chat_messages m
    cross join lateral (
      select private.chat_reads_from(m.conversation_id, person) as since
    ) r
    where m.id = message
      and r.since is not null
      and (m.created_at >= r.since or m.pinned)
  )
$$;

-- Who is in the conversation now: those a new message tells.
create function private.chat_members(conversation uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.user_id order by m.user_id), '{}'::uuid[])
  from public.chat_conversations c
  join public.memberships m
    on m.business_id = c.business_id and m.active and private.is_staff_role(m.role)
  where c.id = conversation
    and case c.kind
      when 'direct' then m.user_id in (c.person_a, c.person_b)
      when 'team' then true
      when 'department' then private.in_department(c.department_id, m.user_id)
        or private.chat_moderates(c.business_id, m.user_id)
      else false
    end
$$;

-- The private chat of `actor` and `partner` in the business, opened if it isn't
-- there yet, and locked for the message about to go in. 42501 unless `partner`
-- is someone else on the business's staff. Opening one writes no log row:
-- who talks to whom is the two people's alone.
create function private.direct_chat(business uuid, actor uuid, partner uuid)
returns public.chat_conversations
language plpgsql
security definer
set search_path = ''
as $$
declare
  conv public.chat_conversations%rowtype;
begin
  if partner is null or partner = actor or not private.chat_staff(business, partner) then
    raise exception 'Someone else on the staff' using errcode = '42501';
  end if;

  insert into public.chat_conversations (business_id, kind, person_a, person_b)
  values (business, 'direct', least(actor, partner), greatest(actor, partner))
  on conflict (business_id, person_a, person_b) where kind = 'direct' do nothing;

  select x.* into conv
  from public.chat_conversations x
  where x.business_id = business
    and x.kind = 'direct'
    and x.person_a = least(actor, partner)
    and x.person_b = greatest(actor, partner)
  for update;
  return conv;
end;
$$;

-- A log row of chats or documents (C6): never for a view session.
create function private.is_private_action(what text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(what ~ '^(chat|document)\.', false)
$$;

------------------------------------------------------------------------------
-- Made with their business and department

-- Every business has the whole team's group from the start.
create function private.open_team_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.chat_conversations (business_id, kind)
  values (new.id, 'team')
  on conflict (business_id) where kind = 'team' do nothing;
  return null;
end;
$$;

create trigger businesses_open_team_chat
  after insert on public.businesses
  for each row execute function private.open_team_chat();

-- Every department has its group from the start.
create function private.open_department_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.chat_conversations (business_id, kind, department_id, closed_at)
  values (new.business_id, 'department', new.id, new.archived_at)
  on conflict (department_id) where kind = 'department' do nothing;
  return null;
end;
$$;

create trigger departments_open_chat
  after insert on public.departments
  for each row execute function private.open_department_chat();

-- A department removed closes its group; brought back, it opens again.
create function private.close_department_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.chat_conversations c
  set closed_at = new.archived_at, changed_at = clock_timestamp()
  where c.department_id = new.id
    and c.kind = 'department'
    and c.closed_at is distinct from new.archived_at;
  return null;
end;
$$;

create trigger departments_close_chat
  after update of archived_at on public.departments
  for each row
  when (old.archived_at is distinct from new.archived_at)
  execute function private.close_department_chat();

-- The departments there already (every business's team group comes last).
insert into public.chat_conversations (business_id, kind, department_id, closed_at)
select d.business_id, 'department', d.id, d.archived_at
from public.departments d
on conflict (department_id) where kind = 'department' do nothing;

------------------------------------------------------------------------------
-- Reading

create policy "people read the chats they are in"
  on public.chat_conversations for select to authenticated
  using (private.chat_reads_from(id, (select auth.uid())) is not null);

-- Row by row: a page of messages comes from public.chat_page below, which asks
-- the gate once and bounds its scan with it.
create policy "people read the messages of their chats from when they joined"
  on public.chat_messages for select to authenticated
  using (
    created_at >= private.chat_reads_from(conversation_id, (select auth.uid()))
    or (pinned and private.chat_reads_from(conversation_id, (select auth.uid())) is not null)
  );

-- One's own marks, and only while one reads their conversation: someone who
-- left, or a business with chat off, reads none of them either.
create policy "people read their own reads"
  on public.chat_reads for select to authenticated
  using (
    user_id = (select auth.uid())
    and private.chat_reads_from(conversation_id, (select auth.uid())) is not null
  );

-- The message's own policy decides whether one still reads it.
create policy "people read their own confirmations"
  on public.chat_acks for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.chat_messages m where m.id = message_id)
  );

-- The signed-in person's chats in the business, one row each, for the list:
-- its last message (the first 120 characters of its text, none when removed
-- or only a file), what waits unread (messages by others since they last
-- read, at most 99), whether they muted it, whether it is closed, and the
-- pinned announcements they haven't confirmed. Each chat's gate is asked
-- once per chat, not once per message (`offset 0` keeps the planner from
-- pulling the subquery up and asking it again wherever `since` is read), and
-- never for a private chat of two other people.
create function public.chat_inbox(business uuid)
returns table (
  conversation uuid,
  kind text,
  department uuid,
  other_person uuid,
  last_at timestamptz,
  last_author uuid,
  last_kind text,
  last_preview text,
  last_file_kind text,
  unread integer,
  muted boolean,
  closed boolean,
  pinned_waiting integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.kind,
    c.department_id,
    case when c.kind = 'direct' then
      case when c.person_a = c.reader then c.person_b else c.person_a end
    end,
    lm.created_at,
    lm.author_id,
    lm.kind,
    left(lm.body, 120),
    lm.file_kind,
    (
      select count(*)::integer
      from (
        select 1
        from public.chat_messages m
        where m.conversation_id = c.id
          and m.business_id = c.business_id
          and m.created_at >= c.since
          and m.created_at > coalesce(r.read_at, '-infinity'::timestamptz)
          and m.author_id is distinct from c.reader
          and m.removed_at is null
        limit 99
      ) waiting
    ),
    coalesce(r.muted, false),
    c.closed_at is not null,
    (
      select count(*)::integer
      from public.chat_messages p
      where p.conversation_id = c.id
        and p.pinned
        and p.author_id is distinct from c.reader
        and not exists (
          select 1 from public.chat_acks a
          where a.message_id = p.id and a.user_id = c.reader
        )
    )
  from (
    select x.*, me.reader, private.chat_reads_from(x.id, me.reader) as since
    from (select (select auth.uid()) as reader) me
    cross join public.chat_conversations x
    where x.business_id = business
      and (x.kind <> 'direct' or me.reader in (x.person_a, x.person_b))
    offset 0
  ) c
  left join public.chat_reads r on r.conversation_id = c.id and r.user_id = c.reader
  left join lateral (
    select m.created_at, m.author_id, m.kind, m.body, m.file_kind
    from public.chat_messages m
    where m.conversation_id = c.id
      and m.business_id = c.business_id
      and m.created_at >= c.since
    order by m.created_at desc, m.id desc
    limit 1
  ) lm on true
  where c.since is not null
  order by lm.created_at desc nulls last, c.id
$$;

-- A page of one of the signed-in person's chats in the business, newest first:
-- its messages from when they read it, before a cursor (older ones), after one
-- (what came since), or the newest, at most `page_limit` (1 to 50); nothing
-- for a chat they don't read. The messages' policy says the same row by row,
-- but asks the gate for each row and can't stop the index scan at the
-- reader's start, so paging past it would walk the whole older history: here
-- the gate is asked once, and it and the cursor bound the scan. A cursor is a
-- message's time and id (a time alone means strictly before or after it).
-- Pinned announcements from before the reader's start aren't on any page: the
-- screen reads them under the policy (pinned).
create function public.chat_page(
  business uuid,
  conversation uuid,
  before_at timestamptz default null,
  before_id uuid default null,
  after_at timestamptz default null,
  after_id uuid default null,
  page_limit integer default 50
)
returns table (
  id uuid,
  author_id uuid,
  kind text,
  body text,
  file_kind text,
  file_name text,
  file_size integer,
  file_removed_at timestamptz,
  pinned boolean,
  created_at timestamptz,
  removed_at timestamptz,
  removed_by uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  with gate as materialized (
    select c.id, c.business_id, private.chat_reads_from(c.id, (select auth.uid())) as since
    from public.chat_conversations c
    where c.id = conversation and c.business_id = business
  )
  select m.id, m.author_id, m.kind, m.body, m.file_kind, m.file_name, m.file_size,
    m.file_removed_at, m.pinned, m.created_at, m.removed_at, m.removed_by
  from gate g
  join public.chat_messages m
    on m.conversation_id = g.id
    and m.business_id = g.business_id
    and m.created_at >= g.since
  -- Row comparisons with no "is null or" around them, so the cursor bounds
  -- the index too; one left out is no bound.
  where (m.created_at, m.id) < (
      coalesce(before_at, 'infinity'::timestamptz),
      coalesce(before_id, '00000000-0000-0000-0000-000000000000'::uuid)
    )
    and (m.created_at, m.id) > (
      coalesce(after_at, '-infinity'::timestamptz),
      coalesce(after_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)
    )
  order by m.created_at desc, m.id desc
  limit least(greatest(coalesce(page_limit, 50), 1), 50)
$$;

-- Whether anything changed for the signed-in person's chats in the business
-- since they last asked: a cheap "anything new?" for the screens' sync, as an
-- opaque value. It moves when one of their chats changes, appears or goes,
-- when they read, mute or confirm, and when the other person of one of their
-- private chats reads it.
create function public.chat_version(business uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select (select auth.uid()) as reader
  ),
  mine as (
    select c.id, c.kind, c.changed_at
    from public.chat_conversations c
    cross join me
    where c.business_id = business
      and (c.kind <> 'direct' or me.reader in (c.person_a, c.person_b))
      and private.chat_reads_from(c.id, me.reader) is not null
  )
  select md5(concat_ws('|',
    (select count(*) from mine)::text,
    coalesce((select max(m.changed_at) from mine m)::text, ''),
    coalesce((
      select max(r.read_at) from public.chat_reads r cross join me
      where r.business_id = business and r.user_id = me.reader
    )::text, ''),
    (
      select count(*) from public.chat_reads r cross join me
      where r.business_id = business and r.user_id = me.reader and r.muted
    )::text,
    (
      select count(*) from public.chat_acks a cross join me
      where a.business_id = business and a.user_id = me.reader
    )::text,
    coalesce((
      select max(o.read_at)
      from mine m
      join public.chat_reads o on o.conversation_id = m.id
      cross join me
      where m.kind = 'direct' and o.user_id <> me.reader and private.chat_read_marks()
    )::text, '')
  ))
$$;

-- How far the other person of a private chat read it ("נקראה"), for one of its
-- two people; null for anyone else, for a group, and while it isn't shown.
create function public.chat_seen(conversation uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select r.read_at
  from public.chat_conversations c
  join public.chat_reads r
    on r.conversation_id = c.id
    and r.user_id = case when c.person_a = (select auth.uid()) then c.person_b else c.person_a end
  where c.id = conversation
    and c.kind = 'direct'
    and (select auth.uid()) in (c.person_a, c.person_b)
    and private.chat_reads_from(c.id, (select auth.uid())) is not null
    and private.chat_read_marks()
$$;

-- Who of the group's members now confirmed an announcement, and when (null:
-- not yet), for its author and the moderators only; nothing for anyone else.
create function public.announcement_readers(message uuid)
returns table (person uuid, acked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.member_id, a.acked_at
  from public.chat_messages m
  cross join lateral unnest(private.chat_members(m.conversation_id)) as p (member_id)
  left join public.chat_acks a on a.message_id = m.id and a.user_id = p.member_id
  where m.id = message
    and m.kind = 'announcement'
    and m.removed_at is null
    and p.member_id is distinct from m.author_id
    and private.reads_chat_message(m.id, (select auth.uid()))
    and (
      m.author_id = (select auth.uid())
      or private.chat_moderates(m.business_id, (select auth.uid()))
    )
  order by p.member_id
$$;

------------------------------------------------------------------------------
-- What a message tells people

-- One line per person per conversation (dedupe `chat.<conversation>`), for its
-- members now but the author: kind chat.direct or chat.group, params ids and
-- a count of what waits, never a word of the message. A line about the same
-- chat comes back unread with the count up (1 again once it was read). Its
-- push goes 15 seconds late, so a conversation open on screen reads it first
-- and claim_due_pushes skips it; a push already waiting carries the new
-- message too; one told in the last minute (a private chat) or 10 minutes (a
-- group) and still unread waits; a muted chat pushes nothing. Whether the
-- phone gets anything at all is private.push_plan's (no device, a demo
-- business). It has a body of its own, not private.notify's, since it decides
-- each push from the line there already; its people are private.notify's
-- loop's: active, on the staff, not the actor. Returns the lines written.
create function private.notify_chat(
  business uuid,
  conversation uuid,
  recipients uuid[],
  actor uuid,
  at_time timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  conv public.chat_conversations%rowtype;
  what text;
  gap interval;
  dedupe text := 'chat.' || conversation::text;
  person uuid;
  line public.notifications%rowtype;
  push_at timestamptz;
  written integer := 0;
begin
  if not private.module_enabled(business, 'notifications'::public.module_key) then
    return 0;
  end if;
  select x.* into conv
  from public.chat_conversations x
  where x.id = conversation and x.business_id = business;
  if not found then
    return 0;
  end if;
  what := case conv.kind when 'direct' then 'chat.direct' else 'chat.group' end;
  gap := case conv.kind when 'direct' then interval '1 minute' else interval '10 minutes' end;

  for person in
    select m.user_id
    from public.memberships m
    where m.business_id = business
      and m.active
      and private.is_staff_role(m.role)
      and m.user_id = any (coalesce(recipients, '{}'::uuid[]))
      and m.user_id is distinct from actor
    order by m.user_id
  loop
    select n.* into line
    from public.notifications n
    where n.user_id = person and n.business_id = business and n.dedupe_key = dedupe
    for update;

    push_at := case
      when exists (
        select 1 from public.chat_reads r
        where r.conversation_id = conv.id and r.user_id = person and r.muted
      ) then null
      -- A push already waiting for the line carries this message too.
      when line.id is not null and line.read_at is null
        and line.push_state in ('queued', 'sending') then null
      -- Told a moment ago and not read since: it waits for the gap.
      when line.id is not null and line.read_at is null
        and line.pushed_at > at_time - gap then null
      else private.push_plan(business, person, what, at_time) + interval '15 seconds'
    end;

    if line.id is null then
      insert into public.notifications (
        business_id, user_id, kind, source_module, audience_role, params,
        actor_id, dedupe_key, created_at, push_state, push_after
      )
      values (
        business, person, what, 'chat'::public.module_key, 'worker'::public.member_role,
        jsonb_build_object('conversation', conv.id, 'from', actor, 'count', 1),
        actor, dedupe, at_time,
        case when push_at is null then 'none' else 'queued' end, push_at
      );
    else
      update public.notifications n
      set kind = what,
        params = jsonb_build_object(
          'conversation', conv.id,
          'from', actor,
          'count', case
            when n.read_at is null
              then least(coalesce((n.params ->> 'count')::integer, 1) + 1, 99)
            else 1
          end
        ),
        actor_id = actor,
        created_at = at_time,
        read_at = null,
        resolved_at = null,
        push_state = case
          when push_at is not null then 'queued'
          when n.read_at is null then n.push_state
          else 'none'
        end,
        push_after = case
          when push_at is not null then push_at
          when n.read_at is null then n.push_after
        end,
        push_before = null,
        push_attempts = case when push_at is not null then 0 else n.push_attempts end
      where n.id = line.id;
    end if;
    written := written + 1;
  end loop;

  return written;
end;
$$;

-- An announcement's line (`chat.announcement.<message>`), which asks for
-- "קראתי", to the group's members now, but its author, whoever acts and those
-- who confirmed it already: on posting, and again when it is put back or
-- pinned again. Params are ids. Returns the lines written.
create function private.notify_announcement(message uuid, actor uuid, at_time timestamptz)
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.notify(
    m.business_id,
    private.chat_members(m.conversation_id),
    'chat.announcement'::text,
    jsonb_build_object('conversation', m.conversation_id, 'message', m.id, 'from', m.author_id),
    actor,
    'chat'::public.module_key,
    'worker'::public.member_role,
    'chat.announcement.' || m.id::text,
    true,
    null::timestamptz,
    at_time,
    coalesce(
      (select array_agg(a.user_id) from public.chat_acks a where a.message_id = m.id),
      '{}'::uuid[]
    ) || coalesce(array_remove(array[m.author_id], null), '{}'::uuid[])
  )
  from public.chat_messages m
  where m.id = message
$$;

-- One person's own line about a thing is settled (an announcement they
-- confirmed): read and resolved, and a push not sent yet stays unsent.
-- Documents (C6) use it too.
create function private.settle_own_line(
  business uuid,
  person uuid,
  dedupe text,
  at_time timestamptz
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications n
  set read_at = coalesce(n.read_at, at_time),
    resolved_at = coalesce(n.resolved_at, at_time),
    push_state = case when n.push_state = 'queued' then 'skipped' else n.push_state end
  where n.business_id = business
    and n.user_id = person
    and n.dedupe_key = dedupe;
$$;

------------------------------------------------------------------------------
-- Writing

-- `actor` sends a message: in a conversation they read (`conversation`), or to
-- someone else on the staff (`to_person`), whose private chat is opened on the
-- first one. `draft` is the browser's own id for it: sending it again gives
-- back the same message. As an announcement (`announce`), in a group, for
-- holders of chat.announce: pinned, with its own line asking for "קראתי".
-- Refused: off the staff or an accountant (42501), a conversation they don't
-- read (P0002), a closed group or a private chat whose other person left
-- (55000), an announcement from someone else or in a private chat (42501), a
-- message in the team's group when only management writes there (42501), no
-- text or more than 2000 characters (22023), a 31st in a minute (54000), and in
-- a demo business more than 100 from its visitors in an hour (54000). All of
-- it before the row is written. Writes no log row. Returns {conversation,
-- message}.
create function public.send_chat_message(
  actor uuid,
  business uuid,
  draft uuid,
  words text default null,
  conversation uuid default null,
  to_person uuid default null,
  announce boolean default false,
  at_time timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  conv public.chat_conversations%rowtype;
  sent uuid;
  sent_in uuid;
  sent_business uuid;
  clean text := nullif(regexp_replace(coalesce(words, ''), '^\s+|\s+$', '', 'g'), '');
  as_announcement boolean := coalesce(announce, false);
begin
  perform private.chat_on(business);
  if not private.chat_staff(business, actor) then
    raise exception 'Not on the staff' using errcode = '42501';
  end if;
  if draft is null then
    raise exception 'A message needs its draft id' using errcode = '22023';
  end if;

  -- A retry of what was sent already gives back the same message.
  select m.id, m.conversation_id, m.business_id into sent, sent_in, sent_business
  from public.chat_messages m
  where m.author_id = actor and m.draft_id = draft;
  if sent is not null then
    if sent_business <> business then
      raise exception 'A draft id goes with one message' using errcode = '22023';
    end if;
    return jsonb_build_object('conversation', sent_in, 'message', sent);
  end if;

  if (conversation is null) = (to_person is null) then
    raise exception 'A conversation or a person' using errcode = '22023';
  end if;
  if to_person is not null then
    conv := private.direct_chat(business, actor, to_person);
  else
    select x.* into conv
    from public.chat_conversations x
    where x.id = conversation and x.business_id = business
    for update;
    if not found or private.chat_reads_from(conv.id, actor) is null then
      raise exception 'Unknown conversation' using errcode = 'P0002';
    end if;
  end if;

  if conv.closed_at is not null then
    raise exception 'The group is closed' using errcode = '55000';
  end if;
  if conv.kind = 'direct' and not private.chat_staff(
    business, case when conv.person_a = actor then conv.person_b else conv.person_a end
  ) then
    raise exception 'No longer on the staff' using errcode = '55000';
  end if;
  if as_announcement
    and (conv.kind = 'direct' or not private.holds_perm(business, actor, 'chat.announce'))
  then
    raise exception 'Announcements are for management, in groups' using errcode = '42501';
  end if;
  if conv.kind = 'team'
    and not as_announcement
    and private.chat_settings(business) ->> 'teamGroupWho' = 'announcers'
    and not private.holds_perm(business, actor, 'chat.announce')
  then
    raise exception 'Only management writes here' using errcode = '42501';
  end if;
  if clean is null then
    raise exception 'An empty message' using errcode = '22023';
  end if;
  if char_length(clean) > 2000 then
    raise exception 'At most 2000 characters' using errcode = '22023';
  end if;
  if (
    select count(*)
    from public.chat_messages m
    where m.author_id = actor and m.created_at > at_time - interval '1 minute'
  ) >= 30 then
    raise exception 'Too many in a minute' using errcode = '54000';
  end if;
  if exists (select 1 from private.demo_businesses d where d.business_id = business)
    and (
      select count(*)
      from public.chat_messages m
      where m.business_id = business
        and not m.seeded
        and m.created_at > at_time - interval '1 hour'
    ) >= private.chat_demo_per_hour()
  then
    raise exception 'Too many in this demo for now' using errcode = '54000';
  end if;

  insert into public.chat_messages (
    business_id, conversation_id, author_id, draft_id, kind, body, pinned, created_at
  )
  values (
    business, conv.id, actor, draft,
    case when as_announcement then 'announcement' else 'text' end,
    clean, as_announcement, at_time
  )
  on conflict (author_id, draft_id) do nothing
  returning id into sent;
  if sent is null then
    -- The same draft arrived twice at once: the first one stands.
    select m.id, m.conversation_id into sent, sent_in
    from public.chat_messages m
    where m.author_id = actor and m.draft_id = draft;
    return jsonb_build_object('conversation', sent_in, 'message', sent);
  end if;

  update public.chat_conversations x
  set last_message_at = greatest(x.last_message_at, at_time),
    changed_at = clock_timestamp()
  where x.id = conv.id;

  -- What one sends, one has read.
  insert into public.chat_reads as r (conversation_id, business_id, user_id, read_at)
  values (conv.id, business, actor, at_time)
  on conflict (conversation_id, user_id)
  do update set read_at = greatest(r.read_at, excluded.read_at);

  if as_announcement then
    perform private.notify_announcement(sent, actor, at_time);
  else
    perform private.notify_chat(business, conv.id, private.chat_members(conv.id), actor, at_time);
  end if;

  return jsonb_build_object('conversation', conv.id, 'message', sent);
end;
$$;

-- `actor` read the conversation up to `up_to` (the newest message on their
-- screen; when left out, everything until now), never past `at_time`. Once
-- that covers its last message, their line about it is read and a push not
-- sent yet stays unsent. P0002 for a conversation they don't read. The app
-- calls it when the conversation is on screen, never while a page renders, so
-- a prefetch marks nothing. Writes no log row.
create function public.read_chat(
  actor uuid,
  conversation uuid,
  up_to timestamptz default null,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conv public.chat_conversations%rowtype;
  mark timestamptz;
begin
  select x.* into conv from public.chat_conversations x where x.id = conversation;
  if not found or private.chat_reads_from(conv.id, actor) is null then
    raise exception 'Unknown conversation' using errcode = 'P0002';
  end if;

  insert into public.chat_reads as r (conversation_id, business_id, user_id, read_at)
  values (conv.id, conv.business_id, actor, least(coalesce(up_to, at_time), at_time))
  on conflict (conversation_id, user_id)
  do update set read_at = greatest(r.read_at, excluded.read_at)
  returning r.read_at into mark;

  if conv.last_message_at is null or mark >= conv.last_message_at then
    update public.notifications n
    set read_at = at_time,
      push_state = case when n.push_state = 'queued' then 'skipped' else n.push_state end
    where n.user_id = actor
      and n.business_id = conv.business_id
      and n.dedupe_key = 'chat.' || conv.id::text
      and n.read_at is null;
  end if;
end;
$$;

-- `actor` mutes a conversation they read, or unmutes it: no push from it,
-- and a push waiting for it stays unsent; it still counts as unread in the
-- app. P0002 for a conversation they don't read. Nobody else learns of it,
-- and it writes no log row.
create function public.mute_chat(actor uuid, conversation uuid, mute boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conv public.chat_conversations%rowtype;
begin
  select x.* into conv from public.chat_conversations x where x.id = conversation;
  if not found or private.chat_reads_from(conv.id, actor) is null then
    raise exception 'Unknown conversation' using errcode = 'P0002';
  end if;
  if mute is null then
    raise exception 'Say whether it is muted' using errcode = '22023';
  end if;

  insert into public.chat_reads as r (conversation_id, business_id, user_id, muted)
  values (conv.id, conv.business_id, actor, mute)
  on conflict (conversation_id, user_id) do update set muted = excluded.muted;

  if mute then
    update public.notifications n
    set push_state = 'skipped'
    where n.user_id = actor
      and n.business_id = conv.business_id
      and n.dedupe_key = 'chat.' || conv.id::text
      and n.push_state = 'queued';
  end if;
end;
$$;

-- `actor` removes a message: their own anywhere, or, holding chat.moderate,
-- someone else's in a group (42501 in a private chat, and for anyone else).
-- The row stays; what it said, its file and its pin wait in
-- private.chat_removed for restore_chat_message, 10 minutes, and the job
-- `chat` empties it after. A removed announcement's lines are settled for
-- everyone. A moderator removing someone else's message writes chat.remove,
-- with ids only. P0002 for a message they don't read; removing it again
-- changes nothing.
create function public.remove_chat_message(
  actor uuid,
  message uuid,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  msg public.chat_messages%rowtype;
  conv public.chat_conversations%rowtype;
begin
  select m.* into msg from public.chat_messages m where m.id = message for update;
  if not found or not private.reads_chat_message(msg.id, actor) then
    raise exception 'Unknown message' using errcode = 'P0002';
  end if;
  if msg.removed_at is not null then
    return;
  end if;
  select x.* into conv from public.chat_conversations x where x.id = msg.conversation_id;
  if msg.author_id is distinct from actor
    and (conv.kind = 'direct' or not private.chat_moderates(conv.business_id, actor))
  then
    raise exception 'Not yours to remove' using errcode = '42501';
  end if;

  insert into private.chat_removed (
    message_id, business_id, body, file_kind, file_path, thumb_path, file_name,
    file_size, file_removed_at, pinned, removed_by, removed_at
  )
  values (
    msg.id, msg.business_id, msg.body, msg.file_kind, msg.file_path, msg.thumb_path,
    msg.file_name, msg.file_size, msg.file_removed_at, msg.pinned, actor, at_time
  )
  on conflict (message_id) do update
  set body = excluded.body,
    file_kind = excluded.file_kind,
    file_path = excluded.file_path,
    thumb_path = excluded.thumb_path,
    file_name = excluded.file_name,
    file_size = excluded.file_size,
    file_removed_at = excluded.file_removed_at,
    pinned = excluded.pinned,
    removed_by = excluded.removed_by,
    removed_at = excluded.removed_at;

  update public.chat_messages m
  set body = null,
    file_kind = null,
    file_path = null,
    thumb_path = null,
    file_name = null,
    file_size = null,
    file_removed_at = null,
    pinned = false,
    removed_at = at_time,
    removed_by = actor
  where m.id = msg.id;

  update public.chat_conversations x
  set changed_at = clock_timestamp()
  where x.id = conv.id;

  if msg.kind = 'announcement' then
    perform private.resolve_notifications(
      conv.business_id, 'chat.announcement.' || msg.id::text, at_time
    );
  end if;
  if msg.author_id is distinct from actor then
    insert into public.audit_log (business_id, actor_id, action, details)
    values (
      conv.business_id, actor, 'chat.remove',
      jsonb_build_object(
        'conversation', conv.id, 'message', msg.id, 'author', msg.author_id,
        'department', conv.department_id
      )
    );
  end if;
end;
$$;

-- Whoever removed a message puts it back, within 10 minutes of removing it
-- (55000 after, 42501 for anyone else): its text, file and pin again. An
-- announcement pinned again tells those who haven't confirmed it, again. A
-- moderator putting back someone else's message writes chat.restore. P0002
-- for a message they don't read; one not removed changes nothing.
create function public.restore_chat_message(
  actor uuid,
  message uuid,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  msg public.chat_messages%rowtype;
  conv public.chat_conversations%rowtype;
  held private.chat_removed%rowtype;
begin
  select m.* into msg from public.chat_messages m where m.id = message for update;
  if not found or not private.reads_chat_message(msg.id, actor) then
    raise exception 'Unknown message' using errcode = 'P0002';
  end if;
  if msg.removed_at is null then
    return;
  end if;
  if msg.removed_by is distinct from actor then
    raise exception 'Only who removed it puts it back' using errcode = '42501';
  end if;
  select h.* into held from private.chat_removed h where h.message_id = msg.id for update;
  if not found or msg.removed_at < at_time - interval '10 minutes' then
    raise exception 'Too late to put it back' using errcode = '55000';
  end if;
  select x.* into conv from public.chat_conversations x where x.id = msg.conversation_id;

  update public.chat_messages m
  set body = held.body,
    file_kind = held.file_kind,
    file_path = held.file_path,
    thumb_path = held.thumb_path,
    file_name = held.file_name,
    file_size = held.file_size,
    file_removed_at = held.file_removed_at,
    pinned = held.pinned,
    removed_at = null,
    removed_by = null
  where m.id = msg.id;
  delete from private.chat_removed h where h.message_id = msg.id;

  update public.chat_conversations x
  set changed_at = clock_timestamp()
  where x.id = conv.id;

  if msg.kind = 'announcement' and held.pinned then
    perform private.notify_announcement(msg.id, actor, at_time);
  end if;
  if msg.author_id is distinct from actor then
    insert into public.audit_log (business_id, actor_id, action, details)
    values (
      conv.business_id, actor, 'chat.restore',
      jsonb_build_object(
        'conversation', conv.id, 'message', msg.id, 'author', msg.author_id,
        'department', conv.department_id
      )
    );
  end if;
end;
$$;

-- `actor` presses "קראתי" on an announcement they read: once, and their own
-- line about it is settled. 22023 for a message that isn't an announcement,
-- 55000 for a removed one, P0002 for one they don't read; its author's own
-- changes nothing.
create function public.confirm_announcement(
  actor uuid,
  message uuid,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  msg public.chat_messages%rowtype;
begin
  select m.* into msg from public.chat_messages m where m.id = message;
  if not found or not private.reads_chat_message(msg.id, actor) then
    raise exception 'Unknown message' using errcode = 'P0002';
  end if;
  if msg.kind <> 'announcement' then
    raise exception 'Not an announcement' using errcode = '22023';
  end if;
  if msg.removed_at is not null then
    raise exception 'The announcement was removed' using errcode = '55000';
  end if;
  if msg.author_id is not distinct from actor then
    return;
  end if;

  insert into public.chat_acks (message_id, business_id, user_id, acked_at)
  values (msg.id, msg.business_id, actor, at_time)
  on conflict (message_id, user_id) do nothing;
  if found then
    update public.chat_conversations x
    set changed_at = clock_timestamp()
    where x.id = msg.conversation_id;
  end if;

  perform private.settle_own_line(
    msg.business_id, actor, 'chat.announcement.' || msg.id::text, at_time
  );
end;
$$;

-- Its author or a moderator pins an announcement, or unpins it. Unpinning
-- settles its lines for everyone; pinning it again tells those who haven't
-- confirmed it, again. 42501 for anyone else, 22023 for a message that isn't
-- an announcement, 55000 for a removed one and for pinning one in a closed
-- group, where nobody writes (unpinning there still works), P0002 for one
-- they don't read.
create function public.pin_announcement(
  actor uuid,
  message uuid,
  pin boolean,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  msg public.chat_messages%rowtype;
  conv public.chat_conversations%rowtype;
begin
  select m.* into msg from public.chat_messages m where m.id = message for update;
  if not found or not private.reads_chat_message(msg.id, actor) then
    raise exception 'Unknown message' using errcode = 'P0002';
  end if;
  if pin is null then
    raise exception 'Say whether it is pinned' using errcode = '22023';
  end if;
  if msg.kind <> 'announcement' then
    raise exception 'Only an announcement is pinned' using errcode = '22023';
  end if;
  if msg.removed_at is not null then
    raise exception 'The announcement was removed' using errcode = '55000';
  end if;
  select x.* into conv from public.chat_conversations x where x.id = msg.conversation_id;
  if msg.author_id is distinct from actor
    and not private.chat_moderates(conv.business_id, actor)
  then
    raise exception 'Its author or management pins it' using errcode = '42501';
  end if;
  if pin and conv.closed_at is not null then
    raise exception 'The group is closed' using errcode = '55000';
  end if;
  if msg.pinned = pin then
    return;
  end if;

  update public.chat_messages m set pinned = pin where m.id = msg.id;
  update public.chat_conversations x
  set changed_at = clock_timestamp()
  where x.id = conv.id;

  if pin then
    perform private.notify_announcement(msg.id, actor, at_time);
  else
    perform private.resolve_notifications(
      conv.business_id, 'chat.announcement.' || msg.id::text, at_time
    );
  end if;
end;
$$;

------------------------------------------------------------------------------
-- Permissions (modules/chat/manifest.ts; modules/permissions.db.test.ts keeps
-- them the same)

insert into public.permission_keys (key, module_key, default_roles, by_owner)
values
  ('chat.announce', 'chat', '{manager}'::public.member_role[], false),
  ('chat.moderate', 'chat', '{manager}'::public.member_role[], false),
  ('chat.send_documents', 'chat', '{manager}'::public.member_role[], false);

------------------------------------------------------------------------------
-- The activity log: no row about chats or documents reaches a view session

-- 20261110000300_payroll_access.sql's, with one more condition first: as an
-- owner or a manager a view read every row but the pay ones, chat.remove
-- included, and as an accountant it reads the pay rows, where documents' rows
-- would have come (C6). The team doesn't read chats, so it reads nothing about
-- them either. Managers still read chat.remove and chat.restore.
alter policy "a view reads the log as its role would" on public.audit_log
  using (
    not private.is_private_action(action)
    and (
      (private.is_viewing(business_id, 'manager') and not private.is_pay_action(action))
      or (
        private.viewing_payroll(business_id)
        and (private.is_pay_action(action) or action ~ '^(clock|permission)\.')
      )
    )
  );

comment on table public.audit_log is
  'Append-only record of what changed in a business: written only by server functions, never changed but for its actor going when their account does, deleted only by a demo reset (private.purge_business_records). Pay rows (wage.*, payroll.*) are read by pay holders only (clock.payroll); rows about chats and documents (chat.*, document.*) never by a view session.';

------------------------------------------------------------------------------
-- The job: removed texts and demo visitors' messages go

-- Deletes what waits too long: a demo business's messages older than an hour
-- that its seed didn't write (and settles the lines of the announcements among
-- them), and removed messages' texts held for more than the 10 minutes of
-- their undo, which hold no file (C4 has those removed from Storage first).
-- Demo businesses take no files, so nothing of theirs waits in Storage.
-- Returns how many rows went.
create function private.clean_chat(at_time timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  visitors integer;
  held integer;
begin
  with gone as (
    delete from public.chat_messages m
    using private.demo_businesses d
    where d.business_id = m.business_id
      and not m.seeded
      and m.created_at < at_time - private.chat_demo_keeps()
    returning m.id, m.business_id, m.kind
  ),
  settled as (
    update public.notifications n
    set read_at = coalesce(n.read_at, at_time),
      resolved_at = at_time,
      push_state = case when n.push_state = 'queued' then 'skipped' else n.push_state end
    from gone g
    where g.kind = 'announcement'
      and n.business_id = g.business_id
      and n.dedupe_key = 'chat.announcement.' || g.id::text
      and n.resolved_at is null
    returning n.id
  )
  select count(*)::integer into visitors from gone;

  delete from private.chat_removed h
  where h.removed_at < at_time - interval '10 minutes'
    and h.file_path is null
    and h.thumb_path is null;
  get diagnostics held = row_count;

  return visitors + held;
end;
$$;

-- Every 10 minutes: pure SQL, with no app and no secret. C4 adds the files.
create function private.chat_tick(at_time timestamptz default now())
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.clean_chat(at_time);
end;
$$;

select cron.schedule('chat', '*/10 * * * *', $$select private.chat_tick()$$);

------------------------------------------------------------------------------
-- The demo reset

-- What a demo business starts with in its chats. Nothing yet: C2 replaces
-- this, never the reset. Its chats go with the business, by cascade.
create function private.seed_demo_chat(business uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select business where false
$$;

-- The reset: 20261110000100_hours_kept.sql's, with the chat seed last. The
-- business's chats, messages, reads and confirmations go with it by cascade;
-- the trigger opens its team's group, and each department's, again.
create or replace function public.reset_demo_business(business uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  def jsonb;
begin
  select d.definition into def
  from private.demo_businesses d
  where d.business_id = business
  for update;
  if not found then
    raise exception 'Not a demo business: %', business using errcode = 'P0002';
  end if;

  -- Lock the business before the purge: a write already under way for it (a
  -- visitor's clock-in, anything that logs) finishes first, so the purge sees
  -- its rows, and a new one waits for the reset. The restrict keys then never
  -- meet a row the purge missed.
  perform 1 from public.businesses b where b.id = business for update;

  perform private.purge_business_records(business);
  delete from public.businesses b where b.id = business;

  insert into public.businesses (id, slug, name, accent, address, shabbat_city)
  values (
    business, def ->> 'slug', def ->> 'name', def ->> 'accent',
    def ->> 'address', def ->> 'shabbat_city'
  );
  perform public.apply_template(business, def ->> 'template');

  insert into public.memberships (business_id, user_id, role)
  select business, person.user_id, person.role
  from jsonb_to_recordset(def -> 'people')
    as person (user_id uuid, role public.member_role, name text)
  join public.profiles p on p.id = person.user_id;

  insert into public.department_members (department_id, business_id, user_id)
  select distinct dep.id, business, person.user_id
  from jsonb_to_recordset(def -> 'people')
    as person (user_id uuid, role public.member_role, name text, departments text[])
  join public.memberships m on m.business_id = business and m.user_id = person.user_id
  cross join lateral unnest(coalesce(person.departments, '{}'::text[])) as wanted (key)
  join public.departments dep
    on dep.business_id = business and dep.key = wanted.key and dep.archived_at is null;

  update public.profiles p
  set full_name = person.name, locale = 'he', avatar_path = null,
    bio = null, cover = null, address_form = null
  from jsonb_to_recordset(def -> 'people')
    as person (user_id uuid, role public.member_role, name text)
  where p.id = person.user_id;

  update private.demo_businesses d
  set reset_at = now()
  where d.business_id = business;

  if coalesce((def ->> 'renews')::boolean, false) then
    perform private.renew_demo_schedule(business);
  end if;

  perform private.seed_demo_lists(business);
  perform private.seed_demo_pay(business);
  perform private.seed_demo_chat(business);
end;
$$;

------------------------------------------------------------------------------
-- Who may call what

-- The policies' helpers run as the reader, so the signed-in role runs them.
revoke execute on function private.chat_reads_from(uuid, uuid) from public, anon;
grant execute on function private.chat_reads_from(uuid, uuid) to authenticated;
revoke execute on function private.is_private_action(text) from public, anon;
grant execute on function private.is_private_action(text) to authenticated;

-- The rest of the private ones run inside the functions, as their owner.
revoke execute on function private.mark_staff_since() from public, anon, authenticated;
revoke execute on function private.chat_history_from_joining() from public, anon, authenticated;
revoke execute on function private.chat_read_marks() from public, anon, authenticated;
revoke execute on function private.chat_demo_keeps() from public, anon, authenticated;
revoke execute on function private.chat_demo_per_hour() from public, anon, authenticated;
revoke execute on function private.chat_on(uuid) from public, anon, authenticated;
revoke execute on function private.chat_settings(uuid) from public, anon, authenticated;
revoke execute on function private.chat_staff(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.chat_moderates(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.reads_chat_message(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.chat_members(uuid) from public, anon, authenticated;
revoke execute on function private.direct_chat(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.open_team_chat() from public, anon, authenticated;
revoke execute on function private.open_department_chat() from public, anon, authenticated;
revoke execute on function private.close_department_chat() from public, anon, authenticated;
revoke execute on function private.notify_chat(uuid, uuid, uuid[], uuid, timestamptz)
  from public, anon, authenticated;
revoke execute on function private.notify_announcement(uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke execute on function private.settle_own_line(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function private.clean_chat(timestamptz) from public, anon, authenticated;
revoke execute on function private.chat_tick(timestamptz) from public, anon, authenticated;
revoke execute on function private.seed_demo_chat(uuid)
  from public, anon, authenticated, service_role;

-- The screens ask with the person's own session.
revoke execute on function public.chat_inbox(uuid) from public, anon;
grant execute on function public.chat_inbox(uuid) to authenticated;
revoke execute on function public.chat_page(
  uuid, uuid, timestamptz, uuid, timestamptz, uuid, integer
) from public, anon;
grant execute on function public.chat_page(
  uuid, uuid, timestamptz, uuid, timestamptz, uuid, integer
) to authenticated;
revoke execute on function public.chat_version(uuid) from public, anon;
grant execute on function public.chat_version(uuid) to authenticated;
revoke execute on function public.chat_seen(uuid) from public, anon;
grant execute on function public.chat_seen(uuid) to authenticated;
revoke execute on function public.announcement_readers(uuid) from public, anon;
grant execute on function public.announcement_readers(uuid) to authenticated;

-- The server's alone, for `actor`.
revoke execute on function public.send_chat_message(
  uuid, uuid, uuid, text, uuid, uuid, boolean, timestamptz
) from public, anon, authenticated;
grant execute on function public.send_chat_message(
  uuid, uuid, uuid, text, uuid, uuid, boolean, timestamptz
) to service_role;
revoke execute on function public.read_chat(uuid, uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.read_chat(uuid, uuid, timestamptz, timestamptz)
  to service_role;
revoke execute on function public.mute_chat(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.mute_chat(uuid, uuid, boolean) to service_role;
revoke execute on function public.remove_chat_message(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.remove_chat_message(uuid, uuid, timestamptz)
  to service_role;
revoke execute on function public.restore_chat_message(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.restore_chat_message(uuid, uuid, timestamptz)
  to service_role;
revoke execute on function public.confirm_announcement(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.confirm_announcement(uuid, uuid, timestamptz)
  to service_role;
revoke execute on function public.pin_announcement(uuid, uuid, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.pin_announcement(uuid, uuid, boolean, timestamptz)
  to service_role;

-- Replaced above: the same grants as before.
revoke execute on function public.reset_demo_business(uuid)
  from public, anon, authenticated;
grant execute on function public.reset_demo_business(uuid) to service_role;

------------------------------------------------------------------------------
-- Last: every business has its team's group, those made before the trigger
-- above included.

insert into public.chat_conversations (business_id, kind)
select b.id, 'team' from public.businesses b
on conflict (business_id) where kind = 'team' do nothing;
