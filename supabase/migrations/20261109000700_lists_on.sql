-- Lists, part 3 (L2 of the lists plan): the screens are here, so the module is
-- on.
--   templates   each template switches lists on, a version up each, so a
--               business opened from one starts with them and their tab.
--   businesses  every business gets its template's departments and lists when
--               it has neither yet (opened before 20261109000600_lists.sql),
--               the way apply_template copies them, and lists on where their
--               tab fits beside its others (MAX_MODULE_NAV in @domain/modules):
--               private.backfill_lists, once per business.
--   undo        public.cancel_unstarted_list, the undo right after sending:
--               cancel_list, only while nobody has started the list.
--   demo        private.seed_demo_lists, the stub the reset ends with, now
--               sends two of the template's lists as the demo's manager: the
--               first to a worker, with two of its checks already done by
--               them, and the next to its own department or role, untouched.
--               Visitors' lists go with the reset, as everything of the
--               business does. Both hosted demo businesses start again.

------------------------------------------------------------------------------
-- Templates

update public.templates t
set version = t.version + 1,
  definition = jsonb_set(t.definition, '{modules,lists,enabled}', 'true'::jsonb)
where t.definition #> '{modules,lists}' is not null
  and (t.definition #>> '{modules,lists,enabled}')::boolean is distinct from true;

------------------------------------------------------------------------------
-- Businesses

-- What a business opened before the lists' screens gets: its template's
-- departments and lists when it has neither (one that has either keeps what it
-- has), and lists on wherever their tab fits: at most four module tabs, and
-- the modules with a tab today are these four and lists. A function so the
-- tests run it on businesses of their own (supabase/tests/database/
-- lists_on.test.sql); the migration runs it once for each business.
create function private.backfill_lists(business uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  def jsonb;
begin
  if not exists (select 1 from public.departments d where d.business_id = business)
    and not exists (select 1 from public.list_templates l where l.business_id = business)
  then
    select t.definition into def
    from public.businesses b
    join public.templates t on t.key = b.template_key
    where b.id = business;
    if def is not null then
      perform private.copy_template_lists(business, def);
    end if;
  end if;

  update public.business_modules bm
  set enabled = true
  where bm.business_id = business
    and bm.module_key = 'lists'::public.module_key
    and not bm.enabled
    and (
      select count(*)
      from public.business_modules other
      where other.business_id = business
        and other.enabled
        and other.module_key = any (
          array['scheduling', 'time_clock', 'reservations', 'storefront']::public.module_key[]
        )
    ) < 4;
end;
$$;

revoke execute on function private.backfill_lists(uuid)
  from public, anon, authenticated;

select private.backfill_lists(b.id) from public.businesses b;

------------------------------------------------------------------------------
-- Taking a sending back

-- The undo right after sending: cancels the list as cancel_list does (its
-- people, rules and log line), only while nobody has started it: 55000 once
-- an item is done or has a comment. cancel_list takes the list's lock first,
-- the lock set_list_item waits on, so a tick and the undo never cross, and the
-- refusal takes the cancelling back with it.
create function public.cancel_unstarted_list(
  actor uuid,
  list uuid,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.cancel_list(actor, list, at_time);
  if exists (
    select 1 from public.list_items i
    where i.list_id = list and (i.done or i.comment is not null)
  ) then
    raise exception 'Someone already started the list' using errcode = '55000';
  end if;
end;
$$;

revoke execute on function public.cancel_unstarted_list(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.cancel_unstarted_list(uuid, uuid, timestamptz)
  to service_role;

------------------------------------------------------------------------------
-- Demo businesses

-- The demo's example lists, sent by its manager (its owner if it has none):
-- the template's first list that isn't an order goes to a worker it is for (in
-- its department or its role, or else the first worker), with its first two
-- checks done by them; the next one goes to its own department or role. Logged
-- as the manager's sends, so the demo people get their lines in the app (a
-- demo business never reaches a phone). Whatever goes wrong here, the reset
-- still stands: a stale definition never breaks the door.
create or replace function private.seed_demo_lists(business uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  def jsonb;
  sender uuid;
  filler uuid;
  first_list public.list_templates%rowtype;
  second_list public.list_templates%rowtype;
  sent uuid;
  done_item uuid;
begin
  if not private.module_enabled(business, 'lists'::public.module_key) then
    return;
  end if;

  begin
    select d.definition into def
    from private.demo_businesses d
    where d.business_id = business;

    select m.user_id into sender
    from jsonb_array_elements(
      case when jsonb_typeof(def -> 'people') = 'array' then def -> 'people' else '[]'::jsonb end
    ) with ordinality as person (value, ordinality)
    join public.memberships m
      on m.business_id = business
      and m.user_id::text = person.value ->> 'user_id'
      and m.active
    where m.role in ('manager', 'owner')
    order by (m.role = 'manager') desc, person.ordinality
    limit 1;
    if sender is null then
      return;
    end if;

    select t.* into first_list
    from public.list_templates t
    where t.business_id = business and t.archived_at is null and t.from_department is null
    order by t.position, t.key
    limit 1;
    if not found then
      return;
    end if;

    select m.user_id into filler
    from jsonb_array_elements(
      case when jsonb_typeof(def -> 'people') = 'array' then def -> 'people' else '[]'::jsonb end
    ) with ordinality as person (value, ordinality)
    join public.memberships m
      on m.business_id = business
      and m.user_id::text = person.value ->> 'user_id'
      and m.active
    where m.role = 'worker'
    order by coalesce(
      (first_list.recipient_kind = 'department' and exists (
        select 1 from public.department_members dm
        where dm.department_id = first_list.recipient_department and dm.user_id = m.user_id
      ))
      or (first_list.recipient_kind = 'role' and first_list.recipient_role = m.role),
      false
    ) desc, person.ordinality
    limit 1;

    if filler is not null then
      sent := public.send_list(
        sender, business,
        jsonb_build_object(
          'template', first_list.id,
          'recipient', jsonb_build_object('kind', 'person', 'user', filler)
        )
      );
      for done_item in
        select i.id from public.list_items i
        where i.list_id = sent and i.kind = 'check'
        order by i.position
        limit 2
      loop
        perform public.set_list_item(filler, done_item, '{"checked": true}'::jsonb);
      end loop;
    end if;

    select t.* into second_list
    from public.list_templates t
    where t.business_id = business
      and t.archived_at is null
      and t.from_department is null
      and t.id <> first_list.id
      and t.recipient_kind in ('department', 'role')
    order by t.position, t.key
    limit 1;
    if found then
      perform public.send_list(
        sender, business,
        jsonb_build_object(
          'template', second_list.id,
          'recipient', case second_list.recipient_kind
            when 'department' then jsonb_build_object(
              'kind', 'department', 'department', second_list.recipient_department
            )
            else jsonb_build_object('kind', 'role', 'role', second_list.recipient_role)
          end
        )
      );
    end if;
  exception when others then
    raise warning 'The demo''s example lists were not sent: %', sqlerrm;
  end;
end;
$$;

revoke execute on function private.seed_demo_lists(uuid)
  from public, anon, authenticated;

-- Both hosted demo businesses start again, with lists on and their examples.
-- Locally the seed runs after the migrations and resets its own.
select public.reset_demo_business(d.business_id)
from private.demo_businesses d
join public.businesses b on b.id = d.business_id
where d.business_id in (
  '10000000-0000-4000-b000-000000000001', '10000000-0000-4000-b000-000000000002'
);
