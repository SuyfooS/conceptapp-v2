-- Chat, part 3 (C3 of the chat plan; Orel's answers of 11 November 2026 on
-- issue #1): announcements and removing on screen. C1's functions do all of
-- it (send_chat_message's `announce`, confirm_announcement, pin_announcement,
-- remove_chat_message, restore_chat_message, mute_chat), so nothing of theirs
-- changes here, and nor does any policy.
--
--   demo   private.seed_demo_chat, C2's, again, with the one change C2 left
--          for this part: the manager's 08:10 line in the whole team's group
--          ("מהשבוע הבא סוגרים את הקופה ב-22:00") is an announcement now,
--          pinned, since the screens offer its "קראתי" from this part on. The
--          first two workers read the group, as before, and confirm it when
--          they read it (08:20 and 08:35 in the business's clock), so their
--          own lines about it are settled; the owner's, and any other
--          worker's, waits for "קראתי", on the Chat tab and on Today. All of
--          it through the chat functions, all of it `seeded`. Everything else
--          is as C2 wrote it. Both hosted demo businesses start again.

------------------------------------------------------------------------------
-- Demo businesses

-- The demo's conversations, replacing C2's; the reset ends with it, and its
-- chats went with the business before it. Each part is written on its own,
-- so one that can't be (a definition without a worker in a department, or
-- without a second worker) leaves the others, and whatever goes wrong the
-- reset still stands: a stale definition never breaks the door. Only what it
-- wrote is marked as the demo's own, so it may also run on a business whose
-- chats were just emptied (e2e/db.ts, clearDemoChat).
create or replace function private.seed_demo_chat(business uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  def jsonb;
  people jsonb;
  tz text;
  morning date;
  joined timestamptz;
  owner_person uuid;
  manager_person uuid;
  worker_one uuid;
  worker_one_departments jsonb;
  worker_two uuid;
  team_chat uuid;
  department_chat uuid;
  announced uuid;
  written uuid[] := '{}'::uuid[];
begin
  if not private.module_enabled(business, 'chat'::public.module_key) then
    return;
  end if;

  select d.definition into def
  from private.demo_businesses d
  where d.business_id = business;
  people := case
    when jsonb_typeof(def -> 'people') = 'array' then def -> 'people'
    else '[]'::jsonb
  end;

  select b.timezone into tz from public.businesses b where b.id = business;
  if tz is null then
    return;
  end if;
  -- This morning in the business's clock, or yesterday's before 09:00 there:
  -- the last message is at 08:50, so all of them are already in the past.
  morning := ((now() at time zone tz) - interval '9 hours')::date;
  joined := ((morning - 30) + time '09:00') at time zone tz;

  -- Who writes: by role, in the order the definition names them.
  select m.user_id into owner_person
  from jsonb_array_elements(people) with ordinality as person (value, ordinality)
  join public.memberships m
    on m.business_id = business
    and m.user_id::text = person.value ->> 'user_id'
    and m.active
  where m.role = 'owner'::public.member_role
  order by person.ordinality
  limit 1;

  select m.user_id into manager_person
  from jsonb_array_elements(people) with ordinality as person (value, ordinality)
  join public.memberships m
    on m.business_id = business
    and m.user_id::text = person.value ->> 'user_id'
    and m.active
  where m.role = 'manager'::public.member_role
  order by person.ordinality
  limit 1;
  manager_person := coalesce(manager_person, owner_person);
  if manager_person is null then
    return;
  end if;

  select m.user_id, person.value -> 'departments'
  into worker_one, worker_one_departments
  from jsonb_array_elements(people) with ordinality as person (value, ordinality)
  join public.memberships m
    on m.business_id = business
    and m.user_id::text = person.value ->> 'user_id'
    and m.active
  where m.role = 'worker'::public.member_role
  order by person.ordinality
  limit 1;

  select m.user_id into worker_two
  from jsonb_array_elements(people) with ordinality as person (value, ordinality)
  join public.memberships m
    on m.business_id = business
    and m.user_id::text = person.value ->> 'user_id'
    and m.active
  where m.role = 'worker'::public.member_role
    and m.user_id <> worker_one
  order by person.ordinality
  limit 1;

  -- The demo people have been there a month: they read the groups' history.
  update public.memberships m
  set staff_since = joined
  where m.business_id = business and m.staff_since > joined;
  update public.department_members dm
  set added_at = joined
  where dm.business_id = business and dm.added_at > joined;

  select c.id into team_chat
  from public.chat_conversations c
  where c.business_id = business and c.kind = 'team';

  -- The whole team's group.
  begin
    if owner_person is not null then
      written := written || (public.send_chat_message(
        owner_person, business, gen_random_uuid(),
        'תודה לכולם על היום'::text, team_chat, null::uuid, false,
        ((morning - 1) + time '18:30') at time zone tz
      ) ->> 'message')::uuid;
    end if;
    written := written || (public.send_chat_message(
      manager_person, business, gen_random_uuid(),
      'בוקר טוב. הספק מגיע ב-10:00'::text, team_chat, null::uuid, false,
      (morning + time '08:05') at time zone tz
    ) ->> 'message')::uuid;
    -- An announcement from management, pinned at the top of the group: it
    -- asks everyone in it but its author for "קראתי".
    announced := (public.send_chat_message(
      manager_person, business, gen_random_uuid(),
      'מהשבוע הבא סוגרים את הקופה ב-22:00'::text, team_chat, null::uuid, true,
      (morning + time '08:10') at time zone tz
    ) ->> 'message')::uuid;
    written := written || announced;
    -- The first two workers read the group up to then, and confirm the
    -- announcement as they read it.
    if worker_one is not null then
      perform public.read_chat(
        worker_one, team_chat,
        (morning + time '08:20') at time zone tz,
        (morning + time '08:20') at time zone tz
      );
      perform public.confirm_announcement(
        worker_one, announced, (morning + time '08:20') at time zone tz
      );
    end if;
    if worker_two is not null then
      perform public.read_chat(
        worker_two, team_chat,
        (morning + time '08:35') at time zone tz,
        (morning + time '08:35') at time zone tz
      );
      perform public.confirm_announcement(
        worker_two, announced, (morning + time '08:35') at time zone tz
      );
    end if;
  exception when others then
    raise warning 'The demo''s team group was not written: %', sqlerrm;
  end;

  -- The first worker's first department: their message and the manager's answer.
  begin
    select c.id into department_chat
    from jsonb_array_elements_text(
      case
        when jsonb_typeof(worker_one_departments) = 'array' then worker_one_departments
        else '[]'::jsonb
      end
    ) with ordinality as wanted (key, ordinality)
    join public.departments d
      on d.business_id = business and d.key = wanted.key and d.archived_at is null
    join public.department_members dm
      on dm.department_id = d.id and dm.user_id = worker_one
    join public.chat_conversations c
      on c.department_id = d.id and c.kind = 'department'
    order by wanted.ordinality
    limit 1;
    if department_chat is not null then
      written := written || (public.send_chat_message(
        worker_one, business, gen_random_uuid(),
        'סיימנו לסדר להיום. חסרים חומרי ניקוי'::text, department_chat, null::uuid, false,
        (morning + time '08:15') at time zone tz
      ) ->> 'message')::uuid;
      written := written || (public.send_chat_message(
        manager_person, business, gen_random_uuid(),
        'תודה, ההזמנה יוצאת היום'::text, department_chat, null::uuid, false,
        (morning + time '08:25') at time zone tz
      ) ->> 'message')::uuid;
    end if;
  exception when others then
    raise warning 'The demo''s department group was not written: %', sqlerrm;
  end;

  -- The manager and the first worker: the question read, the answer not yet.
  begin
    if worker_one is not null and worker_one <> manager_person then
      written := written || (public.send_chat_message(
        manager_person, business, gen_random_uuid(),
        'אפשר להחליף איתך משמרת ביום שלישי?'::text, null::uuid, worker_one, false,
        (morning + time '08:40') at time zone tz
      ) ->> 'message')::uuid;
      written := written || (public.send_chat_message(
        worker_one, business, gen_random_uuid(),
        'כן, אין בעיה'::text, null::uuid, manager_person, false,
        (morning + time '08:50') at time zone tz
      ) ->> 'message')::uuid;
    end if;
  exception when others then
    raise warning 'The demo''s private chat was not written: %', sqlerrm;
  end;

  -- The demo's own: kept until the next reset, never counted as a visitor's.
  -- A part that failed took its messages back with it, and their ids match
  -- nothing.
  update public.chat_messages m
  set seeded = true
  where m.id = any (written);
end;
$$;

------------------------------------------------------------------------------
-- Who may call what

-- Replaced above: the same as C1 and C2 set, nobody's but the reset's.
revoke execute on function private.seed_demo_chat(uuid)
  from public, anon, authenticated, service_role;

------------------------------------------------------------------------------
-- Last: both hosted demo businesses start again, with the announcement
-- pinned in their team's group. Locally the seed runs after the migrations
-- and resets its own.

select public.reset_demo_business(d.business_id)
from private.demo_businesses d
join public.businesses b on b.id = d.business_id
where d.business_id in (
  '10000000-0000-4000-b000-000000000001', '10000000-0000-4000-b000-000000000002'
);
