-- At most 50 people on a shift, in the database too (ROADMAP 82's known
-- issue, found measuring a business of a few hundred people, #275). Until
-- now only the app held the cap: a shift's `needed` is 1 to 50, in the table
-- and in private.write_week_schedule, but nothing counted the people put on
-- it. The write took a new or edited shift with however many people were
-- sent on it, and the people joining a shift under way (`joins`,
-- 20261115000300_running_week.sql) were checked one by one, never against
-- the shift, so a request built by hand, or two screens each adding to a
-- shift under way, could leave a shift with more than 50, and copying that
-- week then failed. Now:
--
--   the cap     a shift holds at most 50 people (MAX_PEOPLE_ON_A_SHIFT in
--               @domain/staffing, which the builder, the shift pattern and
--               the builder's action read). Each statement that puts people
--               on a shift, an insert or an update moving someone onto
--               another shift, is checked once at its end
--               (private.refuse_crowded_shifts, behind two statement-level
--               triggers with transition tables): every shift it put more
--               people on than it took off must then hold 50 or fewer in all.
--               Past that: 22023, hint 'full', DETAIL a JSON array of those
--               shifts' ids in order, and the statement is undone, with the
--               save or publish around it (`crowdedShifts` in
--               @db/schedule-errors; the builder says so in words,
--               `shiftFull`).
--   every path  a trigger rather than a count inside
--               private.write_week_schedule: it covers the week's write (new
--               shifts, those edited and the joins, from a save, a publish
--               and the demo's renewal through the publish), the inserts
--               made straight into the table (the measuring seed, the e2e
--               helpers, the pgTAP files) and any path added later.
--   swaps       an approval (public.decide_shift_swap) replaces one person
--               by another, an update of user_id: the shift gains nobody, so
--               it is never refused, a full shift's included. Taking or
--               asking writes no assignment. A team change only deletes
--               (private.leave_staff), and a delete is never checked. Nothing
--               today updates shift_id; were something to, the update
--               trigger counts the shift it moves people onto. A trigger with
--               transition tables takes no column list, so it fires on every
--               update of the table and finds the shifts that gained people
--               by comparing the rows before and after.
--   as they are a shift already over 50 (none is expected anywhere) stays as
--               it is: only a statement that adds people to it is refused, so
--               a swap or a position changed on it goes through, and taking
--               people off it always does.
--   at once     every path that adds people today is the week's write, which
--               locks the week (private.lock_week_edges) and then every shift
--               of it for update before anything else, so two saves or
--               publishes of a week already take turns, and the second counts
--               the first's people. The trigger doesn't rest on that: before
--               it counts, it locks the shifts its statement added people to,
--               one at a time in order of id, for no key update. Every caller
--               runs in read committed (PostgREST's and the functions'
--               default), so a statement that waited for that lock counts
--               with a snapshot taken after the other committed: two paths
--               adding to one shift at once can't both count 49 and both
--               pass. For no key update and not for update: every insert
--               holds a key share on its shift through the foreign key, which
--               for update conflicts with, so two inserts into one shift
--               would each wait for the other's. The week's write already
--               holds its shifts for update, so it takes nothing new here; an
--               approval adds nobody and locks nothing here. No week row is
--               locked, so the order of the week locks
--               (20261115000600_running_week_edge.sql) stands.
--   security    definer, as private.refuse_non_staff: the count must see
--               every row of the shift whatever role the statement runs as
--               (row-level security would hide some from a role it applies
--               to), and locking a shift needs the right to update it.
--
-- No table, column, policy or grant on a table changes, and no function is
-- replaced; database.types.ts has no private function, so it is unchanged.

------------------------------------------------------------------------------
-- 1. The count

-- The shifts the statement put more people on than it took off (every shift
-- an insert added to; on an update, each whose rows after it outnumber those
-- before it), locked in order of id, then counted. Refused, with their ids,
-- when any holds more than 50.
create function private.refuse_crowded_shifts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  grown uuid[];
  crowded jsonb;
begin
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(n.shift_id order by n.shift_id), '{}'::uuid[])
    into grown
    from (
      select r.shift_id, count(*) as people
      from new_rows r
      group by r.shift_id
    ) n
    where n.people > (select count(*) from old_rows o where o.shift_id = n.shift_id);
  else
    select coalesce(array_agg(distinct r.shift_id order by r.shift_id), '{}'::uuid[])
    into grown
    from new_rows r;
  end if;

  if cardinality(grown) = 0 then
    return null;
  end if;

  -- Another statement adding to one of these shifts at once waits here for
  -- this one's transaction, or this one for its, and then counts what it put
  -- in place (at the top of this file).
  perform 1
  from public.schedule_shifts s
  where s.id = any (grown)
  order by s.id
  for no key update;

  select jsonb_agg(per.shift_id order by per.shift_id)
  into crowded
  from (
    select a.shift_id
    from public.shift_assignments a
    where a.shift_id = any (grown)
    group by a.shift_id
    having count(*) > 50
  ) per;

  if crowded is not null then
    raise exception 'More than 50 people on a shift'
      using errcode = '22023', hint = 'full', detail = crowded::text;
  end if;

  return null;
end;
$$;

comment on function private.refuse_crowded_shifts() is
  'At most 50 people on a shift (MAX_PEOPLE_ON_A_SHIFT in @domain/staffing), on every path: after each statement that inserts into public.shift_assignments, or updates it, every shift it put more people on than it took off holds 50 or fewer, or 22023 with hint full and the shifts'' ids as a JSON array in DETAIL. Those shifts are locked for no key update, in order of id, before the count, so two statements adding to one shift at once take turns. A swap (a person replaced) and a shift already over 50 that gains nobody pass.';

------------------------------------------------------------------------------
-- 2. On every statement that puts people on a shift

create trigger shift_assignments_at_most_50
  after insert on public.shift_assignments
  referencing new table as new_rows
  for each statement execute function private.refuse_crowded_shifts();

create trigger shift_assignments_moved_at_most_50
  after update on public.shift_assignments
  referencing old table as old_rows new table as new_rows
  for each statement execute function private.refuse_crowded_shifts();

comment on trigger shift_assignments_at_most_50 on public.shift_assignments is
  'At most 50 people on a shift, whoever adds them: the week''s write (its new and edited shifts and its joins to a shift under way), the seed and any later path (private.refuse_crowded_shifts).';

comment on trigger shift_assignments_moved_at_most_50 on public.shift_assignments is
  'The same for an update that moves people onto another shift. Fires on every update (a trigger with transition tables takes no column list); one that moves nobody, as a swap or a position changed, passes.';

------------------------------------------------------------------------------
-- Grants

-- A trigger's alone: nobody calls it.
revoke execute on function private.refuse_crowded_shifts()
  from public, anon, authenticated;
