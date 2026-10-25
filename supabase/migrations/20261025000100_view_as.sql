-- "View as" (chunk 1e): someone on the ConceptApp team opens a business's
-- app as one of its roles, to see what that person sees while setting the
-- business up or helping on the phone. Read only, and every start and end
-- goes to the business's audit log.
--
-- A view session gives read policies only. The team member is still not a
-- member, so `is_member` / `has_role` / `has_perm` stay false for them and
-- every write policy and server write function keeps refusing them. A
-- session lasts two hours at most, and starting another ends the last one:
-- a team member views one business at a time.

create table public.view_sessions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.platform_staff (user_id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  role public.member_role not null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 hours',
  ended_at timestamptz
);

-- At most one open session per team member.
create unique index view_sessions_one_open_idx
  on public.view_sessions (staff_id) where ended_at is null;
create index view_sessions_business_id_idx
  on public.view_sessions (business_id);

alter table public.view_sessions enable row level security;

revoke all on public.view_sessions from anon, authenticated;
grant select on public.view_sessions to authenticated;

-- Sessions change only through the functions below (secret key).
create policy "the team reads its own view sessions"
  on public.view_sessions for select to authenticated
  using (staff_id = (select auth.uid()));

-- The caller has an open view session in the business at `min_role` or
-- above, so read policies can treat them as that role, for reading only.
create function private.is_viewing(
  business uuid,
  min_role public.member_role default 'worker'
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.view_sessions v
    where v.staff_id = (select auth.uid())
      and v.business_id = business
      and v.ended_at is null
      and v.expires_at > now()
      and private.role_rank(v.role) >= private.role_rank(min_role)
  )
$$;

-- `other` is an active member of a business the caller is viewing.
create function private.views_member(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.user_id = other
      and m.active
      and private.is_viewing(m.business_id)
  )
$$;

revoke execute on function private.is_viewing(uuid, public.member_role) from public;
revoke execute on function private.views_member(uuid) from public;
grant execute on function private.is_viewing(uuid, public.member_role) to authenticated;
grant execute on function private.views_member(uuid) to authenticated;

-- What a member of the viewed role reads, and nothing more: the audit log
-- stays closed, invites need a viewed manager or owner.
create policy "the team reads a business it is viewing"
  on public.businesses for select to authenticated
  using (private.is_viewing(id));

create policy "the team reads the people of a business it is viewing"
  on public.profiles for select to authenticated
  using (private.views_member(id));

create policy "the team reads the team of a business it is viewing"
  on public.memberships for select to authenticated
  using (private.is_viewing(business_id));

create policy "the team reads the modules of a business it is viewing"
  on public.business_modules for select to authenticated
  using (private.is_viewing(business_id));

create policy "the team reads invites when viewing as a manager"
  on public.invites for select to authenticated
  using (private.is_viewing(business_id, 'manager'));

-- Start viewing a business as a role. Ends the actor's open session first
-- (wherever it was) and records `view_as.start` in the business's audit
-- log. Returns the session id.
create function public.start_view_session(
  actor uuid,
  business uuid,
  view_role public.member_role
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  session_id uuid;
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

  update public.view_sessions v
  set ended_at = now()
  where v.staff_id = actor and v.ended_at is null;

  insert into public.view_sessions (staff_id, business_id, role)
  values (actor, business, view_role)
  returning id into session_id;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (business, actor, 'view_as.start',
    jsonb_build_object('session', session_id, 'role', view_role));

  return session_id;
end;
$$;

-- Stop viewing: ends the actor's open session, if any, and records
-- `view_as.end`. Returns the business that was being viewed, or null when
-- there was no open session.
create function public.end_view_session(actor uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  ended public.view_sessions%rowtype;
begin
  update public.view_sessions v
  set ended_at = now()
  where v.staff_id = actor and v.ended_at is null
  returning v.* into ended;

  if ended.id is null then
    return null;
  end if;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (ended.business_id, actor, 'view_as.end',
    jsonb_build_object('session', ended.id, 'role', ended.role));

  return ended.business_id;
end;
$$;

revoke execute on function public.start_view_session(uuid, uuid, public.member_role)
  from public, anon, authenticated;
revoke execute on function public.end_view_session(uuid)
  from public, anon, authenticated;
grant execute on function public.start_view_session(uuid, uuid, public.member_role)
  to service_role;
grant execute on function public.end_view_session(uuid) to service_role;
