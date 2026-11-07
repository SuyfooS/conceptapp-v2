-- A business's own details, edited from a screen: its name, its colour, its
-- address, and the city its Shabbat times follow. Owners, managers and the
-- ConceptApp team edit them (Orel, 7 November 2026), the same people who edit
-- module settings.
--
-- Writes go through set_business_details with the secret key, for `actor`, and
-- each change is written to `audit_log`. The direct path, where an owner could
-- update the row from the browser, closes: it skipped the log and left managers
-- out.
--
-- The city is a key in the code's list of cities (`ISRAELI_CITIES` in
-- @domain/shabbat), which knows each city's place and candle-lighting custom.
-- Only its form is checked here, the way module settings are checked against
-- their manifests in the server, so a new city needs no migration. Null means
-- not chosen yet, and the app then uses Tel Aviv's times.
--
-- latitude and longitude stay, but nothing reads them once the app reads the
-- city: they disagreed with the city's custom (Jerusalem lights candles 40
-- minutes before sunset, not 20).

alter table public.businesses
  add column shabbat_city text check (shabbat_city ~ '^[a-z][A-Za-z]{1,39}$');

comment on column public.businesses.shabbat_city is
  'Key in ISRAELI_CITIES (@domain/shabbat). Null: not chosen, read as Tel Aviv.';
comment on column public.businesses.latitude is
  'Not read since shabbat_city (November 2026).';
comment on column public.businesses.longitude is
  'Not read since shabbat_city (November 2026).';

-- The limit the server already applies, now also in the database. An empty
-- address is no address.
update public.businesses set address = null where btrim(address) = '';
alter table public.businesses
  add constraint businesses_address_check
  check (address is null or char_length(btrim(address)) between 1 and 200);

-- One spelling for colours, so the same colour never reads as a change.
update public.businesses set accent = lower(accent) where accent <> lower(accent);
alter table public.businesses alter column accent set default '#2563eb';

drop policy "owners update their business" on public.businesses;
revoke update (name, address, accent) on public.businesses from authenticated;

-- Saves some of the details; what the patch leaves out stays. Keys are the
-- column names. A patch that changes nothing writes nothing.
create function public.set_business_details(
  actor uuid,
  business uuid,
  patch jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row public.businesses;
  old_values jsonb;
  new_values jsonb;
  changed text[];
begin
  if not private.can_edit_settings(business, actor) then
    raise exception 'Managers, owners and the team only' using errcode = '42501';
  end if;

  if jsonb_typeof(patch) is distinct from 'object' or patch = '{}'::jsonb then
    raise exception 'Details must be an object with something in it'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_each(patch) as field (key, value)
    where case field.key
      when 'name' then jsonb_typeof(field.value) <> 'string'
      when 'accent' then jsonb_typeof(field.value) <> 'string'
      when 'address' then jsonb_typeof(field.value) not in ('string', 'null')
      when 'shabbat_city' then jsonb_typeof(field.value) not in ('string', 'null')
      else true
    end
  ) then
    raise exception 'Unknown or malformed business detail' using errcode = '22023';
  end if;

  select * into old_row from public.businesses b where b.id = business for update;
  if not found then
    raise exception 'Unknown business: %', business using errcode = 'P0002';
  end if;

  old_values := jsonb_build_object(
    'name', old_row.name,
    'accent', lower(old_row.accent),
    'address', old_row.address,
    'shabbat_city', old_row.shabbat_city
  );
  new_values := old_values || jsonb_strip_nulls(jsonb_build_object(
    'name', btrim(patch ->> 'name'),
    'accent', lower(patch ->> 'accent')
  ));
  if patch ? 'address' then
    new_values := new_values || jsonb_build_object(
      'address', nullif(btrim(coalesce(patch ->> 'address', '')), '')
    );
  end if;
  if patch ? 'shabbat_city' then
    new_values := new_values || jsonb_build_object('shabbat_city', patch ->> 'shabbat_city');
  end if;

  select coalesce(array_agg(field order by field), '{}') into changed
  from jsonb_object_keys(patch) as field
  where old_values -> field is distinct from new_values -> field;

  if cardinality(changed) = 0 then
    return;
  end if;

  -- The table's checks refuse what doesn't fit (23514), and the log with it.
  update public.businesses b
  set name = new_values ->> 'name',
    accent = new_values ->> 'accent',
    address = new_values ->> 'address',
    shabbat_city = new_values ->> 'shabbat_city'
  where b.id = business;

  insert into public.audit_log (business_id, actor_id, action, details)
  values (
    business, actor, 'business.details',
    jsonb_build_object(
      'from', (select jsonb_object_agg(field, old_values -> field) from unnest(changed) as field),
      'to', (select jsonb_object_agg(field, new_values -> field) from unnest(changed) as field)
    )
  );
end;
$$;

revoke execute on function public.set_business_details(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.set_business_details(uuid, uuid, jsonb)
  to service_role;
