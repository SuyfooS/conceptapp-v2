-- Inviting from a list, part 6 ("הזמנה מרשימה"; the plan of 25 November
-- 2026, its PR 6): the console's new-business wizard reads its staff list as
-- the import reads a list of people (@domain/people-import), and asks which
-- of its numbers are on a business's staff already with the numbers in the
-- request's body. Before this, @db/invites asked PostgREST for the list's
-- numbers in a GET's query string (memberships joined to profiles, the
-- numbers in an `in (…)`), which a request log keeps with the address; now
-- they go in the body of one call, and nothing here writes them down.
--
--   the call    public.admin_staff_elsewhere(actor, phones): of `phones`,
--               those that are an active member's on a business's staff, in
--               any role but an accountant's (private.is_staff_role), since a
--               login holds one place on a staff (memberships_one_staff_idx,
--               20261110000900_several_businesses.sql) and claiming a second
--               would fail; each once, in the order given. An empty array for
--               none, for an empty list and for no list at all. A demo
--               business's staff count as any other's: their memberships hold
--               the same index, so a demo person can't join a real business's
--               staff either. The business the wizard opens doesn't exist yet,
--               so there is none to leave out.
--   who         only the ConceptApp team (public.platform_staff; 42501), as
--               every admin_ function asks; the wizard's own check
--               (businesses.create) is the app's. The secret key's alone
--               (service_role).
--   the cap     at most 300 numbers a call (54000, hint 'limit'), the most a
--               list of people holds (PEOPLE_IMPORT_MAX); the wizard sends at
--               most 60 (STAFF_LIST_MAX).
--   nothing     it only reads: no invite, no audit row, no notification, no
--               change to any business, a demo's included, and no message of
--               a refusal holds a number. Nothing is sent to anyone.
--
-- No table, no policy and no grant on a table changes. @db/invites calls it
-- (onAnotherStaff); before it reaches a project that call finds no number
-- elsewhere and asks no other way: public.claim_invite still refuses a second
-- place on a staff, in words (23505).

create function public.admin_staff_elsewhere(actor uuid, phones text[])
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Both platform roles may open a business (@domain/platform); the app
  -- asks which first.
  if not exists (
    select 1 from public.platform_staff s where s.user_id = actor
  ) then
    raise exception 'Platform staff only' using errcode = '42501';
  end if;

  if coalesce(cardinality(phones), 0) > 300 then
    raise exception 'At most 300 numbers' using errcode = '54000', hint = 'limit';
  end if;

  return coalesce(
    (
      select array_agg(asked.phone order by asked.place)
      from (
        select given.phone, min(given.place) as place
        from unnest(phones) with ordinality as given (phone, place)
        where given.phone is not null
        group by given.phone
      ) as asked
      where exists (
        select 1
        from public.memberships m
        join public.profiles p on p.id = m.user_id
        where m.active
          and private.is_staff_role(m.role)
          and p.phone = asked.phone
      )
    ),
    '{}'::text[]
  );
end;
$$;

comment on function public.admin_staff_elsewhere(uuid, text[]) is
  'Of the numbers given (E.164), those an active member holds on a business''s staff, an accountant''s place aside: one place on a staff a login (memberships_one_staff_idx). Each once, in the order given; empty for none. The console''s new-business wizard asks it before the business is opened, the numbers in the request''s body (onAnotherStaff in @db/invites). Platform staff only (42501), at most 300 numbers (54000, hint limit). Reads only.';

-- With the secret key only.
revoke execute on function public.admin_staff_elsewhere(uuid, text[])
  from public, anon, authenticated;
grant execute on function public.admin_staff_elsewhere(uuid, text[]) to service_role;
