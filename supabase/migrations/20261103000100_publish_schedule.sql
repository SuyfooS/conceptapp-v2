-- Publishing the week's schedule (chunk 2c-3a). Until a week is published
-- its schedule is the managers' draft; once published, the whole team reads
-- it, as a schedule posted on the kitchen wall.
--
-- After publishing there is no separate draft: what is saved is what the
-- team sees. So a published week is changed only through
-- `publish_week_schedule` ("publish the changes"), and `save_week_schedule`
-- refuses it. Both replace the whole week through the same rules, which
-- move unchanged into `private.replace_week_schedule`.

alter table public.schedule_weeks
  add column schedule_published_at timestamptz;

-- The rules of 2c-1 (managers and owners only, days inside the week,
-- active members, known positions, nobody on two shifts at once), now
-- reached only through the two functions below.
alter function public.save_week_schedule(uuid, uuid, jsonb)
  rename to replace_week_schedule;
alter function public.replace_week_schedule(uuid, uuid, jsonb)
  set schema private;
revoke execute on function private.replace_week_schedule(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;

-- Save the week's draft. Refused once the week is published.
create function public.save_week_schedule(
  actor uuid,
  week uuid,
  shifts jsonb
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  shift_count int;
begin
  -- The rules first, so a worker or a stranger learns nothing about the
  -- week; an error below undoes the replacement.
  shift_count := private.replace_week_schedule(actor, week, shifts);

  if exists (
    select 1 from public.schedule_weeks w
    where w.id = week and w.schedule_published_at is not null
  ) then
    raise exception 'This week is published; publish the changes instead'
      using errcode = '55000';
  end if;

  return shift_count;
end;
$$;

-- Save the week and publish it in one transaction: the first time, or
-- again with changes. Returns the number of shifts published.
create function public.publish_week_schedule(
  actor uuid,
  week uuid,
  shifts jsonb
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  shift_count int;
begin
  shift_count := private.replace_week_schedule(actor, week, shifts);

  update public.schedule_weeks
  set schedule_published_at = now()
  where id = week;

  return shift_count;
end;
$$;

revoke execute on function public.save_week_schedule(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_week_schedule(uuid, uuid, jsonb)
  to service_role;
revoke execute on function public.publish_week_schedule(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_week_schedule(uuid, uuid, jsonb)
  to service_role;

-- Whether a week's schedule is published. Security definer so the policies
-- below do not depend on the reader's access to the week.
create function private.week_published(week uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.schedule_weeks w
    where w.id = week and w.schedule_published_at is not null
  )
$$;

create function private.shift_published(shift uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.schedule_shifts s
    join public.schedule_weeks w on w.id = s.week_id
    where s.id = shift and w.schedule_published_at is not null
  )
$$;

revoke execute on function private.week_published(uuid) from public;
revoke execute on function private.shift_published(uuid) from public;
grant execute on function private.week_published(uuid) to authenticated;
grant execute on function private.shift_published(uuid) to authenticated;

-- Everyone in the business (and "view as" any role) reads a published
-- week: all its shifts and who works each.
create policy "members read published shifts"
  on public.schedule_shifts for select to authenticated
  using (
    private.module_enabled(business_id, 'scheduling')
    and (private.is_member(business_id) or private.is_viewing(business_id))
    and private.week_published(week_id)
  );

create policy "members read published assignments"
  on public.shift_assignments for select to authenticated
  using (
    private.module_enabled(business_id, 'scheduling')
    and (private.is_member(business_id) or private.is_viewing(business_id))
    and private.shift_published(shift_id)
  );
