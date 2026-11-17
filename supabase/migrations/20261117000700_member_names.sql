-- Team: fixing a name on /team/[person] (ROADMAP "תיקון שם"). Someone who may
-- change a person's role fixes the name the business shows for them: a name of
-- the business's own for them, shown everywhere in that business (to them
-- too) and nowhere else. Their own name (profiles.full_name) is never
-- touched: one login is in several businesses (an accountant in two, the
-- seed's Galit in both demos, 20261110000900_several_businesses.sql), and a
-- fix from one would show in the other.
--
--   the table   public.member_names (business_id, user_id, name): one line of
--               1 to 80 characters, trimmed. It goes with the membership (a
--               display name, not a record): a demo's reset deletes the
--               business, and every name it kept goes with it. Taking someone
--               off the team keeps theirs, for the pay holders who still read
--               them, and for when they come back.
--   who reads   whoever reads the person's profile, in that business
--               (private.reads_member_name): its members and the team viewing
--               it while the person is active in it, and its pay holders (and
--               a view as an accountant) also once they left. Nobody learns a
--               name they couldn't read before.
--   who writes  only public.set_member_name, with the secret key, for `actor`:
--               the rule of changing a role (team.edit and private.gives_role),
--               never oneself, never in a demo closed to invites. Their own
--               name, or none, keeps no row: the business then shows theirs.
--   the log     member.name with the person only, never a name, as the
--               other team rows. It tells nobody: neither notify trigger takes
--               the action.
--   console     public.admin_business lists each member by the business's
--               name for them, as the business sees them.

------------------------------------------------------------------------------
-- 1. The names

create table public.member_names (
  business_id uuid not null,
  user_id uuid not null,
  name text not null
    check (
      name = btrim(name)
      and char_length(name) between 1 and 80
      and name !~ '[[:cntrl:]]'
    ),
  updated_at timestamptz not null default now(),
  primary key (business_id, user_id),
  -- A display name, not a record: it goes with the membership.
  foreign key (business_id, user_id)
    references public.memberships (business_id, user_id) on delete cascade
);

comment on table public.member_names is
  'The name a business shows for someone on its team, over their own (profiles.full_name), in that business only. Written only by public.set_member_name; read as the person''s profile is read, per business (private.reads_member_name).';

alter table public.member_names enable row level security;
revoke all on public.member_names from anon, authenticated;
-- Only public.set_member_name writes it, even with the secret key (as
-- member_payroll_details, 20261110000600_payroll_details.sql).
revoke insert, update, delete, truncate on public.member_names from service_role;
grant select on public.member_names to authenticated;

-- Who reads a business's name for someone: who reads their profile, in that
-- business (private.shares_business, private.views_member,
-- private.reads_pay_of): its members and the team viewing it while the
-- person is active in it, and its pay holders (and a view as an accountant)
-- also once they left.
create function private.reads_member_name(business uuid, person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (
      (private.is_member(business) or private.is_viewing(business))
      and exists (
        select 1
        from public.memberships m
        where m.business_id = business and m.user_id = person and m.active
      )
    )
    or private.has_perm(business, 'clock.payroll'::text)
    or private.viewing_payroll(business)
$$;

create policy "a business's name for someone is read as their profile is"
  on public.member_names for select to authenticated
  using (private.reads_member_name(business_id, user_id));

------------------------------------------------------------------------------
-- 2. Fixing one

-- Someone who may change a person's role fixes the name the business shows
-- for them (ROADMAP "תיקון שם"): the rule of public.set_member_role
-- (20261115001900_named_roles_lists.sql), team.edit and private.gives_role,
-- never oneself, never in a demo closed to invites. The name is one line,
-- its spaces collapsed, of 1 to 80 characters (22023, hint 'name'). Their own
-- name, or `new_name` null, keeps none of the business's own. `seen_name` is
-- the name the screen showed (null: none): 40001 when it moved meanwhile, and
-- nothing is written. The same name writes and logs nothing (`changed`
-- false). Logged as member.name with the person only, never a name, as the
-- other team rows. Locks as a role change does: the business, then the
-- membership, then the name. No caller in the database; the app calls it
-- with the secret key (setMemberName in @db/team).
create function public.set_member_name(
  actor uuid,
  business uuid,
  person uuid,
  new_name text default null,
  seen_name text default null,
  at_time timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.member_role;
  target public.memberships%rowtype;
  own_name text;
  kept text;
  was_kept text;
  seen text;
  shown_before text;
  shown_after text;
begin
  -- One team change at a time in the business.
  perform 1 from public.businesses b where b.id = business for no key update;

  select m.role into actor_role
  from public.memberships m
  where m.business_id = business and m.user_id = actor and m.active;

  if actor_role is null or not private.holds_perm(business, actor, 'team.edit'::text) then
    raise exception 'Not allowed to change this name' using errcode = '42501';
  end if;

  if person is not distinct from actor then
    raise exception 'Not yourself' using errcode = '22023';
  end if;

  select * into target
  from public.memberships m
  where m.business_id = business and m.user_id = person and m.active
  for update;
  if not found then
    raise exception 'Not in the team' using errcode = 'P0002';
  end if;

  if not private.gives_role(actor_role, target.role) then
    raise exception 'Only an owner changes the name of an owner, an accountant or a higher role'
      using errcode = '42501';
  end if;

  if private.closed_to_invites(business) then
    raise exception 'A demo business keeps its people' using errcode = '55000', hint = 'demo';
  end if;

  -- Every name as the screens write it: one line, its spaces collapsed.
  kept := nullif(btrim(regexp_replace(coalesce(new_name, ''::text), '\s+', ' ', 'g')), ''::text);
  if kept is not null and (char_length(kept) > 80 or kept ~ '[[:cntrl:]]') then
    raise exception 'A name is one line of 1 to 80 characters'
      using errcode = '22023', hint = 'name';
  end if;
  seen := nullif(btrim(regexp_replace(coalesce(seen_name, ''::text), '\s+', ' ', 'g')), ''::text);

  select nullif(btrim(regexp_replace(coalesce(p.full_name, ''::text), '\s+', ' ', 'g')), ''::text)
  into own_name
  from public.profiles p
  where p.id = person;

  select n.name into was_kept
  from public.member_names n
  where n.business_id = business and n.user_id = person
  for update;

  shown_before := coalesce(was_kept, own_name);
  if seen is distinct from shown_before then
    raise exception 'The name changed meanwhile' using errcode = '40001';
  end if;

  -- Their own name: the business keeps none of its own.
  if kept is not distinct from own_name then
    kept := null;
  end if;
  shown_after := coalesce(kept, own_name);

  if kept is distinct from was_kept then
    if kept is null then
      delete from public.member_names n
      where n.business_id = business and n.user_id = person;
    else
      insert into public.member_names (business_id, user_id, name, updated_at)
      values (business, person, kept, at_time)
      on conflict (business_id, user_id)
        do update set name = excluded.name, updated_at = excluded.updated_at;
    end if;
  end if;

  if shown_after is not distinct from shown_before then
    return jsonb_build_object('changed', false, 'name', shown_after);
  end if;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (business, actor, 'member.name', jsonb_build_object('person', person));

  return jsonb_build_object('changed', true, 'name', shown_after);
end;
$$;

------------------------------------------------------------------------------
-- 3. The console

-- 20261107000900_console_people.sql's, with only this: a member is listed by
-- the business's name for them, else their own, as the business sees them.
-- The same signature, so its grants stay; they are given again all the same.
create or replace function public.admin_business(business_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not private.is_platform_staff() then
    raise exception 'Platform staff only' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', b.id,
    'slug', b.slug,
    'name', b.name,
    'accent', b.accent,
    'address', b.address,
    'template_key', b.template_key,
    'created_at', b.created_at,
    'people', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'name', p.name, 'phone', p.phone, 'role', p.role,
          'status', p.status, 'invite_id', p.invite_id,
          'expires_at', p.expires_at
        )
        order by p.place, p.role, p.name, p.phone
      )
      from (
        select coalesce(n.name, pr.full_name, '') as name, pr.phone, m.role,
          'member' as status, null::uuid as invite_id,
          null::timestamptz as expires_at, 0 as place
        from public.memberships m
        join public.profiles pr on pr.id = m.user_id
        left join public.member_names n
          on n.business_id = m.business_id and n.user_id = m.user_id
        where m.business_id = b.id and m.active
        union all
        select coalesce(i.full_name, ''), i.phone, i.role,
          case when i.expires_at > now() then 'invited' else 'expired' end,
          i.id, i.expires_at,
          case when i.expires_at > now() then 1 else 2 end
        from public.invites i
        where i.business_id = b.id and i.claimed_at is null
      ) p
    ), '[]'::jsonb)
  )
  into result
  from public.businesses b
  where b.slug = business_slug;

  return result;
end;
$$;

------------------------------------------------------------------------------
-- Who may call what

-- A read policy's helper: signed-in people run it through the policy.
revoke execute on function private.reads_member_name(uuid, uuid) from public, anon;
grant execute on function private.reads_member_name(uuid, uuid) to authenticated;

revoke execute on function public.set_member_name(uuid, uuid, uuid, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.set_member_name(uuid, uuid, uuid, text, text, timestamptz)
  to service_role;

revoke execute on function public.admin_business(text) from public, anon;
grant execute on function public.admin_business(text) to authenticated;
