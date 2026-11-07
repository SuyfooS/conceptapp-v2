-- The business's activity log (/manage/activity): owners and managers read what
-- changed in their business, who changed it and when.
--
-- Two things the log was missing:
--
--   schedule.publish  publishing a week's schedule, the first time or again with
--                     changes, is written to the log. Its row carries what it
--                     needs to read later, since publishing again replaces the
--                     week's shifts: the week's first day, how many shifts were
--                     published, whether it was the first time, and how many
--                     swap requests still waiting were removed with the old
--                     shifts.
--   view as manager   someone on the ConceptApp team viewing a business as a
--                     manager or owner reads its log, as a manager does. A view as
--                     a worker still reads none of it. Nothing else opens: the
--                     log is written only by the server, as before.

-- Same rules and same result as before (20261103000100_publish_schedule.sql),
-- now written to the log.
create or replace function public.publish_week_schedule(
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
  w public.schedule_weeks%rowtype;
  swaps_removed int;
begin
  -- Read before the shifts are replaced: their waiting swap requests go with
  -- them (on delete cascade). Nothing read here is returned, and the rules
  -- below refuse anyone who may not publish, so it tells a stranger nothing.
  select * into w from public.schedule_weeks where id = week;
  select count(*) into swaps_removed
  from public.shift_swaps sw
  join public.schedule_shifts s on s.id = sw.shift_id
  where s.week_id = week and sw.status in ('open', 'taken');

  shift_count := private.replace_week_schedule(actor, week, shifts);

  update public.schedule_weeks
  set schedule_published_at = now()
  where id = week;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    w.business_id, actor, 'schedule.publish',
    jsonb_build_object(
      'week', week,
      'starts_on', w.starts_on,
      'shifts', shift_count,
      'first', w.schedule_published_at is null,
      'swaps_removed', swaps_removed
    )
  );

  return shift_count;
end;
$$;

revoke execute on function public.publish_week_schedule(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_week_schedule(uuid, uuid, jsonb)
  to service_role;

-- A view reads what a member of the viewed role reads (20261025000100_view_as.sql),
-- and managers read their business's log.
create policy "the team reads the log when viewing as a manager"
  on public.audit_log for select to authenticated
  using (private.is_viewing(business_id, 'manager'));

comment on table public.audit_log is
  'Append-only record of what changed in a business: written only by server functions, read by its owners and managers (and by a view as one of them).';
