-- Chat, part 2 (C2 of the chat plan; Orel's answers of 11 November 2026 on
-- issue #1): the screens are here, so the module is on.
--
--   templates   each template switches chat on, a version up each, so a
--               business opened from one starts with it and its tab: the
--               fourth module tab, beside the schedule, the clock and lists
--               (MAX_MODULE_NAV in @domain/modules; modules/templates.db.test.ts
--               keeps every template inside the tab bar).
--   businesses  chat on wherever its tab fits beside the others, as lists did
--               (20261109000700_lists_on.sql): no business has reservations or
--               the public page on, so that is every business today.
--   the notice  public.chat_notices: when each person first read who sees
--               what in chat (the notice at collection, §11.1 of the plan),
--               one row per person and business, read by that person alone and
--               written once by public.see_chat_notice(actor, business), the
--               server's, for someone on the staff with chat on. Nothing else
--               reads it and it writes no log row.
--   demo        private.seed_demo_chat, the stub C1's reset ends with, now
--               writes the demo's conversations as its people would have, all
--               `seeded`, at times relative to now (this morning in the
--               business's clock, or yesterday's before 09:00 there, so every
--               one is in the past): in the team's group the owner's thanks
--               from the evening before and the manager's two morning
--               messages, which the first two workers read (as plain
--               messages: a pinned announcement asks each person for "קראתי",
--               which no screen offers before C3, so the seed has one from C3
--               on, with the button that settles it); in the first worker's
--               first department
--               (the restaurant's kitchen, the shop's checkout) the worker's
--               message and the manager's answer; and the private chat of the
--               manager and the first worker, the manager's question read and
--               the worker's answer not yet. People are picked by role in the
--               order their definition names them (owner, manager, workers),
--               from both demo definitions alike (tooling/demo-chat.test.ts),
--               so neither definition changes. The demo people came onto the
--               staff and into their departments a month before (staff_since,
--               added_at), so they read that history as people who were there.
--               Writing goes through the chat functions themselves, so every
--               rule holds and their lines are the app's own (a demo business
--               never reaches a phone). A visitor's messages go after an hour
--               (C1's job) and with every reset, by cascade. Both hosted demo
--               businesses start again.

------------------------------------------------------------------------------
-- Templates

update public.templates t
set version = t.version + 1,
  definition = jsonb_set(
    t.definition, '{modules,chat}',
    jsonb_build_object(
      'enabled', true,
      'settings', coalesce(t.definition #> '{modules,chat,settings}', '{}'::jsonb)
    )
  )
where (t.definition #>> '{modules,chat,enabled}')::boolean is distinct from true;

------------------------------------------------------------------------------
-- Businesses

-- Every business has its chat row since 20261111000200_chat.sql, or from
-- apply_template since; one made some other way gets it here.
insert into public.business_modules (business_id, module_key, enabled)
select b.id, 'chat'::public.module_key, false from public.businesses b
on conflict (business_id, module_key) do nothing;

-- On wherever its tab fits: at most four module tabs, and the modules with a
-- tab beside chat are these five.
update public.business_modules bm
set enabled = true
where bm.module_key = 'chat'::public.module_key
  and not bm.enabled
  and (
    select count(*)
    from public.business_modules other
    where other.business_id = bm.business_id
      and other.enabled
      and other.module_key = any (
        array['scheduling', 'time_clock', 'reservations', 'storefront', 'lists']::public.module_key[]
      )
  ) < 4;

------------------------------------------------------------------------------
-- Who read who sees what in chat

create table public.chat_notices (
  business_id uuid not null,
  user_id uuid not null,
  seen_at timestamptz not null default now(),
  primary key (business_id, user_id),
  -- Memberships are made inactive, never deleted: this fires when a demo
  -- business is reset, or an account is removed by hand.
  foreign key (business_id, user_id)
    references public.memberships (business_id, user_id) on delete cascade
);

create trigger chat_notices_staff_only before insert on public.chat_notices
  for each row execute function private.refuse_non_staff();

alter table public.chat_notices enable row level security;

-- Written only by public.see_chat_notice; read by its own person alone.
revoke all on public.chat_notices from anon, authenticated, service_role;
grant select on public.chat_notices to authenticated;

create policy "people read their own chat notices"
  on public.chat_notices for select to authenticated
  using (user_id = (select auth.uid()));

comment on table public.chat_notices is
  'When each person first read who sees what in chat, per business (the notice at collection on /chat): read by that person alone, written once by public.see_chat_notice.';

-- `actor` read the chat's notice in the business: kept once, from the first
-- time. 42501 off the staff or an accountant, 55000 while chat is off. Writes
-- no log row.
create function public.see_chat_notice(actor uuid, business uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.chat_on(business);
  if actor is null or not private.chat_staff(business, actor) then
    raise exception 'Not on the staff' using errcode = '42501';
  end if;

  insert into public.chat_notices (business_id, user_id)
  values (business, actor)
  on conflict (business_id, user_id) do nothing;
end;
$$;

------------------------------------------------------------------------------
-- Demo businesses

-- The demo's conversations (above), replacing C1's stub; the reset ends with
-- it, and its chats went with the business before it. Each part is written on
-- its own, so one that can't be (a definition without a worker in a
-- department, or without a second worker) leaves the others, and whatever goes
-- wrong the reset still stands: a stale definition never breaks the door. Only
-- what it wrote is marked as the demo's own, so it may also run on a business
-- whose chats were just emptied (e2e/db.ts, clearDemoChat).
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
    -- Not an announcement until C3 brings its "קראתי": one now would wait
    -- for a press nothing offers, in the bell and on the Chat tab.
    written := written || (public.send_chat_message(
      manager_person, business, gen_random_uuid(),
      'מהשבוע הבא סוגרים את הקופה ב-22:00'::text, team_chat, null::uuid, false,
      (morning + time '08:10') at time zone tz
    ) ->> 'message')::uuid;
    -- The first two workers read the group up to then.
    if worker_one is not null then
      perform public.read_chat(
        worker_one, team_chat,
        (morning + time '08:20') at time zone tz,
        (morning + time '08:20') at time zone tz
      );
    end if;
    if worker_two is not null then
      perform public.read_chat(
        worker_two, team_chat,
        (morning + time '08:35') at time zone tz,
        (morning + time '08:35') at time zone tz
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

revoke execute on function public.see_chat_notice(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.see_chat_notice(uuid, uuid) to service_role;

-- Replaced above: the same as C1 set, nobody's but the reset's.
revoke execute on function private.seed_demo_chat(uuid)
  from public, anon, authenticated, service_role;

------------------------------------------------------------------------------
-- Last: both hosted demo businesses start again, with chat on and their
-- conversations. Locally the seed runs after the migrations and resets its own.

select public.reset_demo_business(d.business_id)
from private.demo_businesses d
join public.businesses b on b.id = d.business_id
where d.business_id in (
  '10000000-0000-4000-b000-000000000001', '10000000-0000-4000-b000-000000000002'
);
