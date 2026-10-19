-- The new-business wizard's write: one transaction that opens a business,
-- sets it up from a template and records who did it. Called by the admin
-- console's server action with the secret key; `actor` is the signed-in
-- team member, checked here again so a bug in the app cannot open a
-- business on behalf of someone off the team.

create function public.create_business(
  actor uuid,
  name text,
  slug text,
  address text,
  accent text,
  template text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_id uuid;
begin
  -- Both platform roles may open businesses (@domain/platform).
  if not exists (
    select 1 from public.platform_staff s where s.user_id = actor
  ) then
    raise exception 'Platform staff only' using errcode = '42501';
  end if;

  -- A taken slug fails here with 23505 (businesses_slug_key); the console
  -- tells the person to pick another.
  insert into public.businesses (slug, name, address, accent)
  values (
    slug,
    btrim(name),
    nullif(btrim(coalesce(address, '')), ''),
    accent
  )
  returning id into new_id;

  perform public.apply_template(new_id, template);

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    new_id, actor, 'business.create',
    jsonb_build_object('template', template, 'slug', slug)
  );

  return new_id;
end;
$$;

revoke execute on function public.create_business(uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_business(uuid, text, text, text, text, text)
  to service_role;
