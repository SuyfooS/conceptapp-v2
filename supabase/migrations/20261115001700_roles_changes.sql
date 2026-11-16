-- Roles and permissions by module, R10: telling the people in a role that
-- what it does changed (Orel's answers of 16 November 2026, issue #1, to
-- R9's two questions: "כשהבעלים משנים מה תפקיד עושה, האנשים בתפקיד מקבלים
-- התראה באפליקציה בלבד"; the mark "שונה" and "חזרה להתחלה" on the roles
-- screen are the app's, from the rules the matrix already gives, and need
-- nothing here).
--
--   when        a role's rule changes: a `role.permission` row of the log,
--               which public.set_role_permission writes only when the role's
--               rule for a key changed (a built-in role's or a named role's,
--               never pay, whose `permission.grant` and `permission.revoke`
--               rows are payroll's to tell), from the owner's screen or the
--               console. A trigger of its own on the log
--               (audit_log_notifies_roles, the lists' and payroll's pattern),
--               so private.notify_for stays as it is.
--   whom        the active members whose rule the change changed:
--               for a named role (the row's named_role), those holding it
--               (memberships.named_role); for a built-in role, those in it
--               with no named role, and those in a live named role on it
--               that has no rule of its own for the key, since a named role
--               follows its base wherever it has none (private.role_gives):
--               its people's rule changed with the base's. A named role with
--               its own rule for the key keeps it, so its people are told
--               nothing. Never an owner (they hold everything, and made it),
--               an accountant (in no role the screen changes), or whoever
--               changed it (private.notify leaves the actor out); someone
--               who left is in no role. A demo business's people get theirs
--               in the app, as every demo line is.
--   the line    `role.changed`, one a person, a role and an area
--               (dedupe `role.changed:<manager|worker|named role id>:<area>`),
--               saying what the area gives and takes now against where the
--               line began: its facts hold the role, the named role's name,
--               the area, and what the role held of the area's keys then
--               (`from`) and now (`to`), each a key and whether it holds it
--               with what it requires (private.area_holds), never a person.
--               The app reads its words from those (@domain/notifications,
--               `areaChangeOf`), as the roles screen's toast says them
--               ("מעכשיו עורכים בסידור", "מעכשיו בלי פרסום הסידור"). About
--               the area's module (source_module), so switching it off hides
--               the line; for the team and the management page, none.
--   the undo    a change of the same role and area while its line is unread
--               goes on from where the line began: so "ביטול" right after,
--               or "חזרה להתחלה" and its undo, which put the area back where
--               it began, take the line away, and a different change updates
--               it. A line already read (or settled) stays in the inbox as it
--               was, out of the way of the next (its dedupe key cleared),
--               and the next change starts a line of its own from where the
--               area was. One that changes nothing of what the area holds
--               (a named role's base switching a key it doesn't hold for
--               want of what it requires) tells nobody.
--   the phone   never: written in the app alone, as the reminders' lines in
--               the app alone are (push_state 'none', nothing to send), so
--               public.claim_due_pushes never takes it. In no group
--               (private.notification_kind_groups): nobody keeps it off a
--               phone it never reaches, and the settings never say it always
--               comes there (@domain/notifications' `appOnly`).
--
-- It replaces one function, from its latest version and with only the new
-- kind: private.notification_kind_groups
-- (20261115000500_lists_owners_late.sql's), the same signature, so its grants
-- stay; revoked again all the same. Its callers, private.notification_group
-- and packages/db/notification-preferences.db.test.ts, are unchanged. No
-- team writer, invite or public.claim_invite is touched (R11b's).

------------------------------------------------------------------------------
-- 1. What a role holds of an area

-- A role's rule for each key owners switch in an area, as
-- private.role_gives answers it: a named role's own rule, else its base's
-- (`r`), else the key's default roles. A key and whether it is given.
create function private.area_rules(
  business uuid,
  r public.member_role,
  area_key text,
  named uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(k.key, private.role_gives(business, r, k.key, named)),
    '{}'::jsonb
  )
  from public.permission_keys k
  where k.area = area_key
    and k.settable
$$;

-- What a role holds of an area's keys, from its rule for each (`rules`, as
-- private.area_rules gives it): a key while its rule gives it and nothing it
-- requires, among them, is denied, as private.role_holds counts it. Every
-- key owners switch requires only a key owners switch in its own area
-- (roles_changes.test.sql checks the catalogue), so whatever a key requires
-- is among the area's rules, and they decide what it holds there.
create function private.area_holds(rules jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  -- Each key with everything it requires, however far down.
  with recursive chain (perm_key, need) as (
    select k.key, k.requires
    from public.permission_keys k
    where k.requires is not null
    union
    select c.perm_key, k.requires
    from chain c
    join public.permission_keys k on k.key = c.need
    where k.requires is not null
  )
  select coalesce(
    jsonb_object_agg(
      given.key,
      given.value = 'true'::jsonb
        and not exists (
          select 1
          from chain c
          where c.perm_key = given.key
            and rules ? c.need
            and rules -> c.need is distinct from 'true'::jsonb
        )
    ),
    '{}'::jsonb
  )
  from jsonb_each(rules) as given (key, value)
$$;

------------------------------------------------------------------------------
-- 2. Telling the role's people

-- One `role.permission` row of the log: the people whose rule it changed
-- (the header's "whom") each get, or keep, their line about the role and the
-- area, from where it began to what the role holds now, in the app alone; a
-- line that would say nothing changed goes, unread, or is never written.
create function private.notify_role_change(entry public.audit_log)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d jsonb := entry.details;
  b uuid := entry.business_id;
  changed_key text := d ->> 'perm';
  key_area text := d ->> 'area';
  was_given boolean := (d ->> 'from')::boolean;
  base_role public.member_role;
  about_module public.module_key;
  target_role uuid;
  role_label text;
  rules_now jsonb;
  held_before jsonb;
  held_now jsonb;
  start_held jsonb;
  dedupe text;
  person uuid;
  line public.notifications%rowtype;
  had_line boolean;
  unread boolean;
begin
  if b is null or changed_key is null or key_area is null or was_given is null
    or coalesce(d ->> 'role', ''::text) not in ('manager'::text, 'worker'::text)
    or not private.module_enabled(b, 'notifications'::public.module_key)
  then
    return;
  end if;
  base_role := (d ->> 'role')::public.member_role;

  select k.module_key into about_module
  from public.permission_keys k
  where k.key = changed_key;

  -- The roles whose rule for the key this changed: the named role itself;
  -- or the built-in role, and each live named role on it with no rule of
  -- its own for the key, which follows it there.
  for target_role in
    select null::uuid
    where not (d ? 'named_role')
    union all
    select br.id
    from public.business_roles br
    where br.business_id = b
      and br.base = base_role
      and br.archived_at is null
      and (
        br.id = (d ->> 'named_role')::uuid
        or (
          not (d ? 'named_role')
          and not exists (
            select 1
            from public.role_permissions rp
            where rp.business_id = b
              and rp.role = base_role
              and rp.named_role = br.id
              and rp.perm = changed_key
          )
        )
      )
  loop
    -- What the role holds of the area now, and before this change: the key
    -- as it was (for a named role that follows its base there, the base's
    -- rule before is its own).
    rules_now := private.area_rules(b, base_role, key_area, target_role);
    held_now := private.area_holds(rules_now);
    held_before := private.area_holds(
      rules_now || jsonb_build_object(changed_key, was_given)
    );
    dedupe := 'role.changed:' || coalesce(target_role::text, base_role::text)
      || ':' || key_area;
    role_label := null;
    if target_role is not null then
      select br.name into role_label
      from public.business_roles br
      where br.id = target_role;
    end if;

    for person in
      select m.user_id
      from public.memberships m
      where m.business_id = b
        and m.active
        and m.role = base_role
        and m.named_role is not distinct from target_role
        and m.user_id is distinct from entry.actor_id
      order by m.user_id
    loop
      select n.* into line
      from public.notifications n
      where n.user_id = person
        and n.business_id = b
        and n.dedupe_key = dedupe
      for update;
      had_line := found;
      unread := had_line and line.read_at is null and line.resolved_at is null;

      -- Unread, it goes on from where it began (a key it didn't know, from
      -- before this change); otherwise this change begins one.
      start_held := held_before || (
        case
          when unread and jsonb_typeof(line.params -> 'from') = 'object'
            then line.params -> 'from'
          else '{}'::jsonb
        end
      );

      if start_held = held_now then
        -- Back where it began, or nothing it holds changed: nothing to tell,
        -- and an unread line about it goes.
        if unread then
          delete from public.notifications n where n.id = line.id;
        end if;
        continue;
      end if;

      -- A line already read stays as it was, out of the next one's way.
      if had_line and not unread then
        update public.notifications n
        set dedupe_key = null
        where n.id = line.id;
      end if;

      perform private.notify(
        b, array[person], 'role.changed'::text,
        jsonb_build_object(
          'role', coalesce(target_role::text, base_role::text),
          'area', key_area,
          'from', start_held,
          'to', held_now
        ) || (
          case
            when role_label is null then '{}'::jsonb
            else jsonb_build_object('name', role_label)
          end
        ),
        entry.actor_id, about_module, 'worker'::public.member_role, dedupe,
        at_time => entry.created_at
      );

      -- In the app alone: nothing for the phone, as the reminders' lines in
      -- the app alone.
      update public.notifications n
      set push_state = 'none', push_after = null, push_before = null
      where n.user_id = person
        and n.business_id = b
        and n.dedupe_key = dedupe
        and n.push_state = 'queued';
    end loop;
  end loop;
end;
$$;

-- The trigger: the change stands, whatever telling people about it does.
create function private.notify_roles_from_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform private.notify_role_change(new);
  exception when others then
    raise warning 'role change notifications for % (%) failed: %', new.action, new.id, sqlerrm;
  end;
  return null;
end;
$$;

create trigger audit_log_notifies_roles
  after insert on public.audit_log
  for each row
  when (new.action = 'role.permission')
  execute function private.notify_roles_from_log();

------------------------------------------------------------------------------
-- 3. Its group

-- 20261115000500_lists_owners_late.sql's, with the new kind in no group: it
-- never reaches a phone, so there is nothing to keep off one
-- (@domain/notifications has it too).
create or replace function private.notification_kind_groups()
returns table (kind_key text, group_key text)
language sql
immutable
set search_path = ''
as $$
  values
    ('schedule.published'::text, 'schedule'::text),
    ('schedule.changed', 'schedule'),
    ('schedule.unfilled', 'approvals'),
    ('swap.offered', 'swaps'),
    ('swap.taken', 'swaps'),
    ('swap.waiting', 'approvals'),
    ('swap.cancelled', 'swaps'),
    ('swap.approved', 'swaps'),
    ('swap.declined', 'swaps'),
    ('swap.removed', 'swaps'),
    ('swap.reopened', 'swaps'),
    ('clock.confirm', 'approvals'),
    ('team.joined', 'team'),
    ('availability.due', 'schedule'),
    ('availability.missing', 'approvals'),
    ('clock.open', 'clock'),
    ('clock.overdue', 'approvals'),
    ('lists.sent', 'lists'),
    ('lists.finished', 'lists'),
    ('lists.passed', 'lists'),
    ('lists.due', 'lists'),
    ('lists.late', 'lists'),
    ('lists.late_team', 'lists'),
    ('lists.late_owner', 'lists'),
    ('lists.out_of_range', 'lists'),
    ('access.pay_granted', null::text),
    ('pay.wage_set', null::text),
    ('pay.after_close', null::text),
    ('pay.month_due', null::text),
    ('chat.direct', 'chat'),
    ('chat.group', 'chat'),
    ('chat.announcement', 'chat'),
    ('documents.received', 'documents'),
    ('documents.sent', 'documents'),
    ('documents.to_confirm', 'documents'),
    ('role.changed', null::text),
    ('push.test', null::text)
$$;

comment on column public.notifications.dedupe_key is
  'One line a person, a business and a thing: a second line about the same thing replaces the first. Null for a line nothing replaces, among them a role''s line already read when its role changes again (role.changed, 20261115001700_roles_changes.sql), which stays as it was.';

------------------------------------------------------------------------------
-- Who may call what

-- The helpers and the trigger run inside the database, as their owner.
revoke execute on function private.area_rules(uuid, public.member_role, text, uuid)
  from public, anon, authenticated;
revoke execute on function private.area_holds(jsonb)
  from public, anon, authenticated;
revoke execute on function private.notify_role_change(public.audit_log)
  from public, anon, authenticated;
revoke execute on function private.notify_roles_from_log()
  from public, anon, authenticated;
-- Replaced in place, the same signature: revoked again all the same.
revoke execute on function private.notification_kind_groups()
  from public, anon, authenticated;
