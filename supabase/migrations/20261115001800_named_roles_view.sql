-- Roles and permissions by module, R11c: viewing the app as a role a business
-- named (the roles plan; Orel's answers of 15 and 16 November 2026, issue #1:
-- answer 1, a role an owner names is built on a manager or a worker; owners
-- and the ConceptApp team change permissions). R11a
-- (20261115001500_named_roles.sql) made the roles and R11b
-- (20261115001600_named_roles_give.sql) gave them to people; from here the
-- team views a business as one, from the console, and reads exactly what
-- the role holds.
--
--   the session public.view_sessions.named_role: the role a business named
--               that a session views as, built on the session's role (its
--               base), by the same foreign key as memberships' and invites'
--               (business_id, named_role, role) to business_roles
--               (business_id, id, base), and never an archived one
--               (private.refuse_archived_named_role, R11a's, now on view
--               sessions too: 22023, hint 'archived'). A session's role
--               stays its rank, so private.is_viewing (rank),
--               private.is_viewing_staff (the staff) and
--               private.viewing_payroll (an accountant, which no named role
--               is) read a view as a named role as one as its base, unchanged.
--               A role goes only with its business, and its sessions with it
--               (on delete cascade): a view never falls back to the base.
--   starting    public.start_view_session takes one (view_named, defaulted,
--               so today's calls are unchanged): of the business (else
--               P0002), live (else 22023, hint 'archived') and built on
--               view_role (else 22023, hint 'base'). Its view_as.start log
--               names it (named_role, role_name), as R11b's logs do.
--   what it     everything a view reads by what its role holds asks the
--   reads       session's named role too: public.my_permissions' view branch
--               (what the screens hold), private.businesses_holding's (the
--               drafts, everyone's availability, the team hours, the lists,
--               the team and the rest of R3 to R8's policies) and
--               private.viewed_perms (the log's view policy), each through
--               private.role_holds(business, v.role, key, v.named_role),
--               R11a's: the named role's own rules, else its base's, never
--               pay. A view still never writes: the team member is no
--               member, so every write's own check refuses them.
--
-- Nothing changes for a view as a built-in role: its named_role is null, and
-- private.role_holds asks the built-in role as before.
--
-- Replaced, each from its latest version and only with what is said above:
-- public.start_view_session (20261025000100_view_as.sql; gains a defaulted
-- argument, so it is dropped and created again, its grants with it: no
-- policy or BEGIN ATOMIC body depends on it, and only the app calls it, with
-- the secret key, @db/view-as); public.my_permissions
-- (20261115000700_roles_catalogue.sql), private.businesses_holding
-- (20261115000900_roles_scheduling.sql) and private.viewed_perms
-- (20261115001000_roles_manage.sql), each in place (the same signature, so
-- the policies over them stay). Their callers: my_permissions by the app
-- (@db/session); businesses_holding by R3 to R8's read policies and
-- functions; viewed_perms by "a view reads the log as its role would".
-- public.end_view_session is unchanged: it ends whatever session is open.

------------------------------------------------------------------------------
-- 1. A view session as a named role

alter table public.view_sessions
  add column named_role uuid,
  -- Always a role built on the session's role, in its business. Deleted only
  -- with its business, as the session is.
  add constraint view_sessions_named_role_fkey
    foreign key (business_id, named_role, role)
    references public.business_roles (business_id, id, base)
    on delete cascade;

create index view_sessions_named_role_idx
  on public.view_sessions (named_role)
  where named_role is not null;

comment on column public.view_sessions.named_role is
  'The role the business named that the session views as (public.business_roles), built on its role and live when it started; null for the role itself. The role stays the session''s rank; what it reads by what it holds is the named role''s (private.role_holds).';

-- As memberships' and invites' (R11a, R11b): nobody views as an archived
-- role, whoever writes the session (private.refuse_archived_named_role:
-- 22023, hint 'archived'), and an archive under way is waited for.
create trigger view_sessions_named_role_live
  before insert or update of named_role on public.view_sessions
  for each row execute function private.refuse_archived_named_role();

------------------------------------------------------------------------------
-- 2. Starting one

drop function public.start_view_session(uuid, uuid, public.member_role);

-- 20261025000100_view_as.sql's, with a role the business named (view_named,
-- built on view_role): of the business (P0002), live (22023, hint
-- 'archived') and on that base (22023, hint 'base'), checked before the
-- open session ends; written on the session, and named in its log row
-- (named_role, role_name). The trigger above refuses one archived meanwhile,
-- under the role's lock.
create function public.start_view_session(
  actor uuid,
  business uuid,
  view_role public.member_role,
  view_named uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  session_id uuid;
  named_base public.member_role;
  named_label text;
  named_archived boolean;
begin
  if not exists (select 1 from public.platform_staff s where s.user_id = actor) then
    raise exception 'Platform staff only' using errcode = '42501';
  end if;

  if view_role is null then
    raise exception 'A role to view as is required' using errcode = '22023';
  end if;

  if not exists (select 1 from public.businesses b where b.id = business) then
    raise exception 'Unknown business' using errcode = 'P0002';
  end if;

  -- A role the business named: of this business, live, built on view_role.
  if view_named is not null then
    select br.base, br.name, br.archived_at is not null
    into named_base, named_label, named_archived
    from public.business_roles br
    where br.id = view_named
      and br.business_id = business;
    if not found then
      raise exception 'No such role in the business' using errcode = 'P0002';
    end if;
    if named_archived then
      raise exception 'The role is archived' using errcode = '22023', hint = 'archived';
    end if;
    if named_base <> view_role then
      raise exception 'The role is built on %', named_base using errcode = '22023', hint = 'base';
    end if;
  end if;

  update public.view_sessions v
  set ended_at = now()
  where v.staff_id = actor and v.ended_at is null;

  insert into public.view_sessions (staff_id, business_id, role, named_role)
  values (actor, business, view_role, view_named)
  returning id into session_id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (business, actor, 'view_as.start',
    jsonb_build_object('session', session_id, 'role', view_role)
      || case
        when view_named is null then '{}'::jsonb
        else jsonb_build_object('named_role', view_named, 'role_name', named_label)
      end);

  return session_id;
end;
$$;

------------------------------------------------------------------------------
-- 3. What a view as one reads

-- 20261115000700_roles_catalogue.sql's, with a view as a role the business
-- named holding what that role holds by role (private.role_holds with the
-- session's named role: its rules, else its base's, and never pay).
create or replace function public.my_permissions(business uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(k.key order by k.key), '{}'::text[])
  from public.permission_keys k
  where private.holds_perm(business, (select auth.uid()), k.key)
    or exists (
      select 1
      from public.view_sessions v
      where v.staff_id = (select auth.uid())
        and v.business_id = business
        and v.ended_at is null
        and v.expires_at > now()
        and (
          (v.role = 'accountant' and k.key = any (private.accountant_perms()))
          or (
            not k.by_owner
            and (v.role = 'owner' or private.role_holds(business, v.role, k.key, v.named_role))
          )
        )
    )
$$;

-- 20261115000900_roles_scheduling.sql's, with a view as a role the business
-- named holding what that role holds by role, as public.my_permissions
-- answers it.
create or replace function private.businesses_holding(perm_key text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.business_id
  from public.memberships m
  where m.user_id = (select auth.uid())
    and m.active
    and private.holds_perm(m.business_id, m.user_id, perm_key)
  union
  select v.business_id
  from public.view_sessions v
  join public.permission_keys k on k.key = perm_key
  where v.staff_id = (select auth.uid())
    and v.ended_at is null
    and v.expires_at > now()
    and (
      (v.role = 'accountant' and k.key = any (private.accountant_perms()))
      or (
        not k.by_owner
        and (v.role = 'owner' or private.role_holds(v.business_id, v.role, k.key, v.named_role))
      )
    )
$$;

-- 20261115001000_roles_manage.sql's, with a view as a role the business
-- named holding what that role holds by role, as public.my_permissions
-- answers it.
create or replace function private.viewed_perms()
returns table (business_id uuid, perm text)
language sql
stable
security definer
set search_path = ''
as $$
  select v.business_id, k.key
  from public.view_sessions v
  cross join public.permission_keys k
  where v.staff_id = (select auth.uid())
    and v.ended_at is null
    and v.expires_at > now()
    and (
      (v.role = 'accountant' and k.key = any (private.accountant_perms()))
      or (
        not k.by_owner
        and (v.role = 'owner' or private.role_holds(v.business_id, v.role, k.key, v.named_role))
      )
    )
$$;

------------------------------------------------------------------------------
-- Who may call what

-- With the secret key only, as before: the console, after it checked the
-- person is on the team.
revoke execute on function public.start_view_session(uuid, uuid, public.member_role, uuid)
  from public, anon, authenticated;
grant execute on function public.start_view_session(uuid, uuid, public.member_role, uuid)
  to service_role;

-- Replaced in place: the same signatures, so their grants stay; revoked and
-- granted again all the same. The policies' helpers run as the reader, and
-- answer only for them.
revoke execute on function public.my_permissions(uuid) from public, anon;
grant execute on function public.my_permissions(uuid) to authenticated;
revoke execute on function private.businesses_holding(text) from public, anon;
grant execute on function private.businesses_holding(text) to authenticated;
revoke execute on function private.viewed_perms() from public, anon;
grant execute on function private.viewed_perms() to authenticated;
