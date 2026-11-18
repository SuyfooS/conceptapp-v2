-- Roles and permissions by module, R8: chat by its permissions (the roles
-- plan; Orel's answers of 15 November 2026, issue #1). Chat already asked
-- its permissions rather than the role (private.chat_moderates,
-- public.send_chat_message, private.sends_documents, through
-- private.holds_perm since 20261111000200_chat.sql and
-- 20261111000700_documents.sql); what changes is that owners and the
-- ConceptApp team now switch them per role (permission_keys.settable), and
-- that announcing and sending documents are switches under moderating.
-- Nothing changes for anyone until they do: managers hold all three by
-- default, workers none, owners always all.
--
--   floor       view: everyone on the staff writes in their own chats and
--               groups, as before (Q2): the whole team's group from when
--               they came onto the staff, the groups of their departments
--               from when they joined them, their private chats, their own
--               messages removed and put back, an announcement confirmed,
--               a document sent to the business.
--   edit        chat.moderate: in every department's group, with all of
--               every group's history (private.chat_reads_from,
--               private.chat_members), removing others' messages in groups
--               (public.remove_chat_message; putting one back stays with
--               whoever removed it, within its 10 minutes,
--               public.restore_chat_message), pinning and unpinning others'
--               announcements (public.pin_announcement), and seeing who
--               confirmed one (public.announcement_readers). Its log rows
--               (chat.remove, chat.restore) are read with it
--               (private.log_perm, R7), and so are the chat's settings
--               (private.settings_perm, R7).
--   switches    chat.announce (an announcement in a group, and writing in
--               the whole team's group when only announcers write there:
--               public.send_chat_message, public.reserve_chat_upload) and
--               chat.send_documents (a document to people:
--               private.sends_documents, with the office, whoever holds pay,
--               as before) now require chat.moderate (Q3): a role holds them
--               by its role only while it also holds chat.moderate by its
--               role, so lowering a role to view takes both, and raising it
--               to edit gives them as its rows say (on by default from the
--               screen, areaWrites in @domain/role-access). One given to a
--               person still holds whatever it requires, as private.holds_perm
--               has it for every key. Granting one to a role that doesn't
--               moderate by role is refused (public.set_role_permission,
--               22023, hint 'requires'). Pinning an announcement again is
--               announcing it again (its line and push to everyone who hasn't
--               confirmed it): its author pins their own again only while
--               they hold chat.announce, and unpins it whatever they hold
--               (public.pin_announcement, below).
--   fixed       a private chat is read by its two people and nobody else:
--               private.chat_reads_from has no branch for owners, moderators,
--               the ConceptApp team or a view session, and nothing here adds
--               one. A view session reads no chat, as before.
--   telling     no line of chat or documents is for a rank: a chat's lines
--               (chat.direct, chat.group, chat.announcement) go to its members
--               (private.chat_members), documents' to their recipients and to
--               the office (private.office_people, pay), all with
--               audience_role 'worker'. The members of a department's group
--               who aren't in the department are there by chat.moderate
--               alone, so their lines become lines for it
--               (notifications.audience_perm, R3's rules for such a line:
--               read only while they hold it, its push skipped once they
--               don't, critique 9), written so by private.notify_chat and
--               private.notify_announcement (below) and moved so for the
--               lines already written. Someone taken out of a department
--               keeps their lines about its group, as before.
--   giving      a manager gives nobody a role that holds a chat key by role
--               while they don't (private.role_holds_beyond, R3's, asks every
--               settable key): it bites only where an owner set workers above
--               managers.
--   the area    the three keys are settable: the console's roles page (and,
--               with R9, the owner's) switches them per role
--               (public.set_role_permission), every check in the area
--               already reading them.
--
-- The newest version of every chat and documents function and policy asks no
-- rank. Replaced, each from its latest version and only with what is said
-- above: private.notify_chat and private.notify_announcement (who is told as
-- a moderator) and public.pin_announcement (pinning one's own again). No
-- policy is replaced. The demo's own messages and documents
-- (private.seed_demo_chat, private.seed_demo_documents) still pick their
-- writers by role, as demo data: public.reset_demo_business deletes the
-- business and makes it again with no role rule but its definition's pay
-- (private.seed_demo_pay) before them, so its manager holds all three when
-- they run.

------------------------------------------------------------------------------
-- 1. Announcing and sending documents, under moderating

-- Both are switches under chat's edit: a role holds them by its role only
-- while it moderates by its role (private.holds_perm, private.role_holds).
-- No row of public.role_permissions holds a chat key yet (none was settable),
-- and managers hold chat.moderate by default as they hold both: nobody's
-- answer changes. private.refuse_requires_cycle (the table's trigger) checks
-- the chain: chat.moderate requires nothing.
update public.permission_keys k
set requires = 'chat.moderate'
where k.key in ('chat.announce', 'chat.send_documents');

------------------------------------------------------------------------------
-- 2. The area opens

-- Every check in chat reads its three permissions: owners and the team
-- switch them per role (public.set_role_permission).
update public.permission_keys k
set settable = true
where k.key in ('chat.moderate', 'chat.announce', 'chat.send_documents');

------------------------------------------------------------------------------
-- 3. A moderator told about a department's group

-- 20261111000200_chat.sql's, the same, with one thing more: the line of
-- someone who is told about a department's group but isn't in the
-- department, there by chat.moderate alone (private.chat_members), is a line
-- for chat.moderate (notifications.audience_perm), read only while they hold
-- it and its push skipped once they don't (public.claim_due_pushes,
-- critique 9). Every other line carries none, written again so when a line
-- comes back, so someone who joined the department since gets an ordinary
-- one. Its caller, public.send_chat_message (20261111000500_chat_files.sql),
-- is unchanged.
create or replace function private.notify_chat(
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
  perm text;
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

    -- In a department's group by moderating alone: a line for chat.moderate.
    perm := case
      when conv.kind = 'department'
        and not private.in_department(conv.department_id, person)
      then 'chat.moderate'
    end;

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
        business_id, user_id, kind, source_module, audience_role, audience_perm, params,
        actor_id, dedupe_key, created_at, push_state, push_after
      )
      values (
        business, person, what, 'chat'::public.module_key, 'worker'::public.member_role, perm,
        jsonb_build_object('conversation', conv.id, 'from', actor, 'count', 1),
        actor, dedupe, at_time,
        case when push_at is null then 'none' else 'queued' end, push_at
      );
    else
      update public.notifications n
      set kind = what,
        audience_perm = perm,
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

-- 20261111000200_chat.sql's, the same, in two parts: the group's members as
-- before, and in a department's group those of them who aren't in the
-- department, there by chat.moderate alone, told as holders of it
-- (private.notify's holders_of, 20261115000900_roles_scheduling.sql), so
-- their line is read and pushed only while they hold it. Who is left out
-- (its author, whoever acts, those who confirmed it) is the same for both.
-- Its callers, public.send_chat_message (20261111000500_chat_files.sql),
-- public.restore_chat_message (20261111000200_chat.sql) and
-- public.pin_announcement (below), are unchanged.
create or replace function private.notify_announcement(message uuid, actor uuid, at_time timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  msg public.chat_messages%rowtype;
  conv public.chat_conversations%rowtype;
  members uuid[];
  outside uuid[] := '{}'::uuid[];
  left_out uuid[];
  facts jsonb;
  dedupe text;
  written integer;
begin
  select m.* into msg from public.chat_messages m where m.id = message;
  if not found then
    return 0;
  end if;
  select x.* into conv from public.chat_conversations x where x.id = msg.conversation_id;
  members := private.chat_members(msg.conversation_id);
  if conv.kind = 'department' then
    outside := coalesce(
      (
        select array_agg(p.member_id order by p.member_id)
        from unnest(members) as p (member_id)
        where not private.in_department(conv.department_id, p.member_id)
      ),
      '{}'::uuid[]
    );
  end if;
  left_out := coalesce(
    (select array_agg(a.user_id) from public.chat_acks a where a.message_id = msg.id),
    '{}'::uuid[]
  ) || coalesce(array_remove(array[msg.author_id], null), '{}'::uuid[]);
  facts := jsonb_build_object(
    'conversation', msg.conversation_id, 'message', msg.id, 'from', msg.author_id
  );
  dedupe := 'chat.announcement.' || msg.id::text;

  written := private.notify(
    msg.business_id,
    array(
      select p.member_id from unnest(members) as p (member_id)
      where p.member_id <> all (outside)
    ),
    'chat.announcement'::text,
    facts,
    actor,
    'chat'::public.module_key,
    'worker'::public.member_role,
    dedupe,
    true,
    null::timestamptz,
    at_time,
    left_out
  );
  if cardinality(outside) > 0 then
    written := written + private.notify(
      msg.business_id,
      outside,
      'chat.announcement'::text,
      facts,
      actor,
      'chat'::public.module_key,
      'worker'::public.member_role,
      dedupe,
      true,
      null::timestamptz,
      at_time,
      left_out,
      'chat.moderate'::text
    );
  end if;
  return written;
end;
$$;

-- The lines already written the same way: a chat.group or chat.announcement
-- line about a department's group, for someone who isn't in the department
-- and moderates now (there by chat.moderate alone), becomes a line for it.
-- Everyone it moves holds the key, so nobody's inbox or phone changes today;
-- someone taken out of a department who doesn't moderate keeps theirs, as
-- before. No trigger reads an update of a line.
update public.notifications n
set audience_perm = 'chat.moderate'
from public.chat_conversations c
where n.kind in ('chat.group', 'chat.announcement')
  and n.source_module = 'chat'::public.module_key
  and n.audience_perm is null
  and c.id::text = n.params ->> 'conversation'
  and c.business_id = n.business_id
  and c.kind = 'department'
  and not private.in_department(c.department_id, n.user_id)
  and private.holds_perm(n.business_id, n.user_id, 'chat.moderate');

-- The columns' words, 20261115001200_roles_lists.sql's with chat's lines.
comment on column public.notifications.audience_role is
  'The lowest role that may read the line, for a line without audience_perm. For one with it, nothing decides by it: the lowest role that holds that permission by default, or ''worker'' on the lists'' lines (lists.late_team, lists.out_of_range), written so for anyone who ran the lists, and on chat''s (chat.group, chat.announcement), written so for anyone in the group.';
comment on column public.notifications.audience_perm is
  'The permission whoever reads the line holds (private.holds_perm), when it is for those who hold one rather than for a rank and up, as each kind''s perm in NOTIFICATION_KINDS (@domain/notifications) names it, and on chat''s lines about a department''s group for those in it by moderating alone (chat.moderate). Written only to them (private.notify''s holders_of, private.notify_chat), read only while they hold it, its push skipped once they don''t (public.claim_due_pushes), and settled when a change of role takes it away (public.set_member_role).';

------------------------------------------------------------------------------
-- 4. Pinning one's own announcement again

-- 20261111000200_chat.sql's, the same, with one thing more: pinning an
-- announcement again tells everyone who hasn't confirmed it again, as
-- announcing does, so its author pins their own again only while they hold
-- chat.announce (private.holds_perm), which before R8 nobody lost but by a
-- change of role. Unpinning their own stays theirs whatever they hold, and a
-- moderator still pins and unpins any. 42501 for anyone else, as before. Its
-- caller, pinAnnouncement in packages/db/chat.ts, is unchanged.
create or replace function public.pin_announcement(
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
  if not private.chat_moderates(conv.business_id, actor)
    and (
      msg.author_id is distinct from actor
      or (pin and not private.holds_perm(conv.business_id, actor, 'chat.announce'))
    )
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
-- Who may call what

-- Replaced in place: the same signatures, so their grants stay; revoked (and
-- the server's one granted) again all the same.
revoke execute on function private.notify_chat(uuid, uuid, uuid[], uuid, timestamptz)
  from public, anon, authenticated;
revoke execute on function private.notify_announcement(uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.pin_announcement(uuid, uuid, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.pin_announcement(uuid, uuid, boolean, timestamptz)
  to service_role;
