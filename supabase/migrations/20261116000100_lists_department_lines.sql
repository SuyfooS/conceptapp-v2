-- Lists: someone taken out of a department keeps no line of its lists. The
-- open item R11d left (20261115001900_named_roles_lists.sql moved someone off
-- a named role; "someone taken out of a department keeps the lines of its
-- lists in the same way", docs/agent/LOG.md), closed for every list they are
-- no longer among, as public.pass_list closes a list's former holders'.
--
--   the gap     a list to a department is held by whoever is in it, read
--               live (private.holds_list, private.list_holders), and its
--               holders get its lines: `list:<id>`, `list.due:<id>` and
--               `list.late:<id>` (private.notify_for_lists). A list a
--               department asked for (`from_department`, an order) tells its
--               sender and that department's people when it is finished
--               (`list.finished:<id>`). Someone still on the staff taken out
--               of the department no longer holds the list, or is no longer
--               among those who asked, but those lines stayed: unread in the
--               inbox, and a push still queued could reach their phone with
--               the list's name.
--   settling    private.settle_former_list_lines(business, person, at_time):
--               for someone active on the staff, the holders' lines of the
--               lists they no longer hold, and the finished lines of the
--               lists they neither sent nor are in the department that asked
--               for, are read (if not already), settled, and off the phone if
--               not sent yet, as public.pass_list settles a list's former
--               holders (`still_for => holders`). The lines of lists they
--               still hold stay: another department they are in, a list to
--               them, to their shift or to their role; and so does the
--               finished line of a list they sent or a department of theirs
--               asked for. Anyone not active on the staff is left alone.
--   by holding  not by seeing (private.sees_list), which R11d's block in
--               public.set_member_role asks: whoever runs the lists
--               (lists.manage, every manager by default) sees every list but
--               holds only their own, so a manager taken out of the bar has
--               the bar's lines settled like anyone, as public.pass_list
--               settles them. The bell then agrees with the Lists tab, which
--               counts the lists one holds (public.my_open_lists). They still
--               see the list among the business's, and if it runs late after,
--               that reaches them as a line for those who run the lists
--               (`list.late_team:`, which leaves out only its holders); a
--               list already late when they are taken out tells them no more,
--               as one passed away from them doesn't.
--   one way     being put back in the department brings none of them back.
--               The list is theirs again (the Lists tab counts it), but a
--               line settled stays settled and a push skipped is not queued
--               again; only a line written after reaches them: one the list
--               writes again (reopened or passed) or for the first time (due
--               or late after they are back). The due and late lines already
--               there are never written again (private.notify's
--               `realert => false`). So a slip on /manage/departments, a
--               person switched off and straight back on (each switch saves
--               at once), costs them those lines, as a role given back after
--               R11d does. Bringing them back on insert is not built: it
--               would have to tell a line settled by leaving from one settled
--               by the list's own course (a due line settled by a finish
--               before a reopen, or by a pass), and the lines keep no such
--               state.
--   where       one trigger on public.department_members,
--               department_members_settle_lines (after delete, or an update
--               of department_id or user_id, which nothing does today: for
--               each row, with the row's old person), calling
--               private.settle_lines_off_department, so every writer is
--               covered, now and later: public.set_department_members
--               (/manage/departments and the console) and the paths that take
--               someone off the staff (private.leave_staff, from
--               public.remove_member and public.set_member_role, and
--               public.claim_invite as an accountant).
--
-- Why a plain row trigger is right, and enough:
--   - public.set_department_members (20261109000600_lists.sql) deletes only
--     the people not kept (`dm.user_id <> all (wanted)`) and then inserts the
--     kept ones with `on conflict do nothing`: a re-save of the same people
--     deletes nobody, and nobody kept is deleted and put back. An after row
--     trigger fires at the end of the delete statement, once every row it
--     takes is gone, so someone leaving two departments in one statement
--     (private.leave_staff) is asked after both are gone, and someone in
--     another department is asked with that one still theirs.
--   - Not added at the end of set_department_members and each other writer:
--     each would be replaced for it, and a writer added later would have to
--     remember it.
--   - Not a constraint trigger deferred to the commit: nothing takes someone
--     out and puts them back in one transaction (each call from the app is
--     its own), it would wait past every check made in the same transaction
--     (the pgTAP files' among them), and no trigger here is one.
--   - Not for each statement with a transition table: a change takes out a
--     few people at most, so a row each costs the same, and no trigger here
--     uses one.
--   - Leaving the staff is as before. Every path makes the membership
--     inactive (remove_member) or not the staff's (set_member_role to an
--     accountant, claim_invite as one) before it deletes their department
--     rows, so private.settle_former_list_lines, which asks for someone
--     active on the staff, settles nothing of theirs, and their lines are as
--     the caller leaves them, as before (remove_member and set_member_role:
--     read and off the phone, not settled).
--   - A business deleted (the demo reset) takes its departments, people and
--     lines in one statement: the trigger finds it gone and does nothing.
--   - A department removed on screen is archived (public.set_departments),
--     keeping its people for the undo, so no row goes, and its lists stay
--     with them (private.holds_list), as before. A department alone is never
--     deleted; were one, its people's rows would go through the trigger like
--     any other.
--   - A line is never what stops the change, as with the log's triggers
--     (private.notify_lists_from_log): a failure is a warning, and the
--     lines stay as they were.
--   - The time is the transaction's (now()), as the lines' own.
--
-- Replaces nothing. R11d's block in public.set_member_role stays as it is,
-- settling by seeing, so a lists manager moved off a named role still keeps
-- the lines of its lists; the next change that replaces that function for
-- something else should have it call private.settle_former_list_lines
-- instead, this rule. The callers: private.settle_former_list_lines by
-- private.settle_lines_off_department, and that by the trigger alone.

------------------------------------------------------------------------------
-- 1. Settling the lines of lists someone is no longer among

-- The lines of `person` in `business` about a list they are no longer among
-- those it is for: read, settled and off the phone if not sent yet, as
-- public.pass_list settles a list's former holders. The holders' lines
-- (`list:`, `list.due:` and `list.late:`, written only to
-- private.list_holders) once they no longer hold the list
-- (private.holds_list); its finished line (`list.finished:`, written to its
-- sender and the people of the department that asked for it) once they are
-- neither. Only for someone active on the staff: anyone else's lines are put
-- away by their leaving, read and off the phone, not settled. Every other
-- line stays as it is: the ones for those who run the lists
-- (`list.late_team:` and `list.range:`, which follow lists.manage) and the
-- owners' (`list.late_owner:`).
create function private.settle_former_list_lines(
  business uuid,
  person uuid,
  at_time timestamptz default now()
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications n
  set read_at = coalesce(n.read_at, at_time),
    resolved_at = at_time,
    push_state = case when n.push_state = 'queued' then 'skipped' else n.push_state end
  where n.business_id = business
    and n.user_id = person
    and n.source_module = 'lists'::public.module_key
    and n.resolved_at is null
    and exists (
      select 1
      from public.memberships m
      where m.business_id = business
        and m.user_id = person
        and m.active
        and private.is_staff_role(m.role)
    )
    and case
      when split_part(n.dedupe_key, ':', 1) in ('list', 'list.due', 'list.late')
        then not private.holds_list(split_part(n.dedupe_key, ':', 2)::uuid, person)
      when split_part(n.dedupe_key, ':', 1) = 'list.finished'
        then not exists (
          select 1
          from public.lists l
          where l.id = split_part(n.dedupe_key, ':', 2)::uuid
            and l.business_id = business
            and (
              l.sent_by = person
              or exists (
                select 1 from public.department_members dm
                where dm.department_id = l.from_department and dm.user_id = person
              )
            )
        )
      else false
    end;
$$;

------------------------------------------------------------------------------
-- 2. Out of a department, whoever takes them out

-- A person's row in a department went (or moved to another department or
-- person): the lines of the lists they are no longer among are settled, once
-- the statement's rows are all gone. A business being deleted takes its
-- lines with it, so nothing is asked then. A failure is a warning, never
-- what stops the change.
create function private.settle_lines_off_department()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.businesses b where b.id = old.business_id) then
    return null;
  end if;

  begin
    perform private.settle_former_list_lines(old.business_id, old.user_id, now());
  exception when others then
    raise warning 'settling list lines out of department % failed: %', old.department_id, sqlerrm;
  end;
  return null;
end;
$$;

create trigger department_members_settle_lines
  after delete or update of department_id, user_id on public.department_members
  for each row execute function private.settle_lines_off_department();

------------------------------------------------------------------------------
-- Who may call what

-- Both run inside the trigger, as their owner.
revoke execute on function private.settle_former_list_lines(uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke execute on function private.settle_lines_off_department()
  from public, anon, authenticated;
