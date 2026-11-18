-- Invites hidden where nobody may send one (the security check of 8 November
-- 2026, #80): a demo business takes no invites unless its definition opens
-- it (20261108000300_sealed.sql), and the Team screen now asks first, so it
-- offers no invite and no new link there and /team/invite is not found. The
-- database still refuses any that get through (55000).
--
--   public.closed_to_invites  private.closed_to_invites, for the server
--                             (secret key)

create function public.closed_to_invites(business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.closed_to_invites(business)
$$;

revoke execute on function public.closed_to_invites(uuid) from public, anon, authenticated;
grant execute on function public.closed_to_invites(uuid) to service_role;
