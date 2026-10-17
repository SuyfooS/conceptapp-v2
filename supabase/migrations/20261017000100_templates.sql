-- Templates (phase 1, chunk 1b): `restaurant` and `cafe-bar` as data, and
-- `apply_template`, which turns an empty business into a complete one in a
-- single transaction. The definition's shape is `templateDefinition` in
-- packages/domain/templates.ts; module settings follow each module's
-- manifest. Changing a template later is a new migration that updates its
-- row and bumps `version`.

alter table public.businesses
  add column template_version integer check (template_version > 0),
  -- Weekly opening hours: [{ day: 0-6, open: "HH:MM", close: "HH:MM" }].
  add column opening_hours jsonb not null default '[]'::jsonb
    check (jsonb_typeof(opening_hours) = 'array');

insert into public.templates (key, version, definition)
values
  ('restaurant', 1, $json$
  {
    "modules": {
      "scheduling": {
        "enabled": true,
        "settings": {
          "positions": [
            { "key": "waiter", "name": "מלצר/ית" },
            { "key": "bartender", "name": "ברמן/ית" },
            { "key": "cook", "name": "טבח/ית" },
            { "key": "host", "name": "מארח/ת" }
          ],
          "shifts": [
            { "key": "morning", "name": "בוקר", "days": [0, 1, 2, 3, 4], "start": "09:00", "end": "16:00", "needed": 3 },
            { "key": "evening", "name": "ערב", "days": [0, 1, 2, 3, 4], "start": "16:00", "end": "23:30", "needed": 4 },
            { "key": "friday", "name": "בוקר", "days": [5], "start": "08:00", "end": "14:30", "needed": 5 },
            { "key": "saturday-night", "name": "מוצ״ש", "days": [6], "start": "19:30", "end": "00:00", "needed": 4 }
          ]
        }
      },
      "time_clock": { "enabled": true, "settings": {} },
      "reservations": {
        "enabled": true,
        "settings": { "slotMinutes": 30, "durationMinutes": 120, "maxPartySize": 10 }
      },
      "storefront": {
        "enabled": true,
        "settings": { "published": false, "tagline": "מסעדה שכונתית. מזמינים שולחן כאן." }
      },
      "notifications": { "enabled": true, "settings": { "shiftReminderHours": 2 } }
    },
    "openingHours": [
      { "day": 0, "open": "11:00", "close": "23:00" },
      { "day": 1, "open": "11:00", "close": "23:00" },
      { "day": 2, "open": "11:00", "close": "23:00" },
      { "day": 3, "open": "11:00", "close": "23:00" },
      { "day": 4, "open": "11:00", "close": "23:00" },
      { "day": 5, "open": "09:00", "close": "14:00" },
      { "day": 6, "open": "20:00", "close": "23:30" }
    ]
  }
  $json$::jsonb),
  ('cafe-bar', 1, $json$
  {
    "modules": {
      "scheduling": {
        "enabled": true,
        "settings": {
          "positions": [
            { "key": "barista", "name": "בריסטה" },
            { "key": "waiter", "name": "מלצר/ית" },
            { "key": "bartender", "name": "ברמן/ית" },
            { "key": "cook", "name": "טבח/ית" }
          ],
          "shifts": [
            { "key": "morning", "name": "בוקר", "days": [0, 1, 2, 3, 4], "start": "07:00", "end": "15:00", "needed": 3 },
            { "key": "evening", "name": "ערב", "days": [0, 1, 2, 3, 4], "start": "15:00", "end": "00:00", "needed": 3 },
            { "key": "friday", "name": "שישי", "days": [5], "start": "07:00", "end": "16:00", "needed": 4 },
            { "key": "saturday-night", "name": "מוצ״ש", "days": [6], "start": "19:00", "end": "01:00", "needed": 3 }
          ]
        }
      },
      "time_clock": { "enabled": true, "settings": {} },
      "reservations": {
        "enabled": false,
        "settings": { "slotMinutes": 30, "durationMinutes": 120, "maxPartySize": 8 }
      },
      "storefront": {
        "enabled": true,
        "settings": { "published": false, "tagline": "קפה בבוקר, בר בערב." }
      },
      "notifications": { "enabled": true, "settings": { "shiftReminderHours": 2 } }
    },
    "openingHours": [
      { "day": 0, "open": "07:30", "close": "23:30" },
      { "day": 1, "open": "07:30", "close": "23:30" },
      { "day": 2, "open": "07:30", "close": "23:30" },
      { "day": 3, "open": "07:30", "close": "23:30" },
      { "day": 4, "open": "07:30", "close": "23:30" },
      { "day": 5, "open": "07:30", "close": "15:30" },
      { "day": 6, "open": "19:30", "close": "00:30" }
    ]
  }
  $json$::jsonb);

-- Copies a template into a business that has none yet: one
-- `business_modules` row per module, the opening hours, and the template's
-- key and version. Runs as one statement, so it either completes or
-- changes nothing. Server only (the secret key's `service_role`).
create function public.apply_template(business uuid, template text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  def jsonb;
  ver integer;
  module_count integer;
begin
  select t.definition, t.version into def, ver
  from public.templates t
  where t.key = template;
  if not found then
    raise exception 'Unknown template: %', template using errcode = 'P0002';
  end if;

  perform 1 from public.businesses b where b.id = business for update;
  if not found then
    raise exception 'Unknown business: %', business using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.businesses b
    where b.id = business and b.template_key is not null
  ) or exists (
    select 1 from public.business_modules bm where bm.business_id = business
  ) then
    raise exception 'Business % is already set up', business
      using errcode = 'P0001';
  end if;

  insert into public.business_modules (business_id, module_key, enabled, settings)
  select business, entry.key::public.module_key,
    (entry.value ->> 'enabled')::boolean,
    coalesce(entry.value -> 'settings', '{}'::jsonb)
  from jsonb_each(def -> 'modules') as entry;

  select count(*) into module_count
  from public.business_modules bm
  where bm.business_id = business;
  if module_count <> cardinality(enum_range(null::public.module_key)) then
    raise exception 'Template % does not cover every module', template
      using errcode = 'P0001';
  end if;

  update public.businesses b
  set template_key = template,
    template_version = ver,
    opening_hours = coalesce(def -> 'openingHours', '[]'::jsonb)
  where b.id = business;
end;
$$;

revoke execute on function public.apply_template(uuid, text)
  from public, anon, authenticated;
grant execute on function public.apply_template(uuid, text) to service_role;
