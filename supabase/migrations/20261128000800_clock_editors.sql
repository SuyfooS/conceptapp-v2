-- Closing the pilot, PR 8 (the plan of 27 November 2026, section 1, B): a
-- worker who forgot to clock out, or whose press the clock refused for what
-- only whoever approves hours can fix, writes from the clock to someone who
-- may correct their hours (/chat/with/<them>), or, with chat off, is told
-- their name. Whom to offer the app works out (@domain/ask-fix: never the
-- worker, the owners only when nobody else may, the worker's departments
-- first). This says who may edit the clock in the business, which nothing a
-- member reads under their own session gave: public.my_permissions answers
-- for oneself, and the role rules (public.role_permissions) are the owners'
-- to read (20261115000800_roles_setter.sql).
--
--   the call    public.clock_editors(business): the active members of the
--               business who hold clock.edit (private.holds_perm, as
--               private.can_edit_clock asks it since
--               20261115001100_roles_clock.sql: an active owner always,
--               anyone else by their role's rule, a named role's included,
--               or by a grant of their own), each once, by id, with their
--               role and the name the business shows for them: its own
--               (public.member_names) else their profile's, as
--               @db/member-names reads it, null when neither is written.
--               Every permission covers the whole business: there is no
--               department manager, so nothing here is by department.
--   who         only the business's own active members, under their own
--               session (private.is_member), who already read its team, its
--               names and its departments under RLS. Nothing for anyone
--               else: another business's member, someone who left, a view
--               session (whose clock is view only and whose chat shows
--               nothing), a call with the secret key, or a business whose
--               clock is off. anon may not call it.
--   nothing     it only reads: no row written, no log line, no
--               notification, and no number or other detail of anyone.
--
-- No table, no policy and no grant on a table changes. @db/time-clock calls
-- it (getClockEditors), page by page; before it reaches a project the clock
-- offers nobody to write to, and says what it said before.

create function public.clock_editors(business uuid)
returns table (user_id uuid, role public.member_role, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.user_id,
    m.role,
    coalesce(nullif(btrim(n.name), ''), nullif(btrim(p.full_name), ''))
  from public.memberships m
  left join public.profiles p on p.id = m.user_id
  left join public.member_names n
    on n.business_id = m.business_id and n.user_id = m.user_id
  where m.business_id = clock_editors.business
    and m.active
    and private.is_member(clock_editors.business)
    and private.module_enabled(clock_editors.business, 'time_clock'::public.module_key)
    and private.holds_perm(clock_editors.business, m.user_id, 'clock.edit'::text)
  order by m.user_id
$$;

comment on function public.clock_editors(uuid) is
  'The active members of the business who may edit its clock (clock.edit, private.holds_perm: an active owner always, anyone else by their role''s rule or a grant of their own), by id, with their role and the name the business shows for them (public.member_names, else their profile''s; null when neither). For the business''s own active members only (private.is_member); nothing for anyone else, a view session included, or while its clock is off. Whom a worker whose shift needs fixing writes to (closing the pilot, PR 8; @domain/ask-fix). Reads only.';

-- Under the member's own session.
revoke execute on function public.clock_editors(uuid) from public, anon;
grant execute on function public.clock_editors(uuid) to authenticated;
