-- The general template's lists don't go to everyone (closing the pilot, PR 9,
-- 20261128000700_general_lists.sql): its "פתיחה" and "סגירה" have no fixed
-- recipient, so whoever sends one chooses each time, and their note reads
-- "משהו שחשוב לדעת למשמרת הבאה"; the other templates are as they were; a
-- business opened from it gets both lists that way, a send with nobody
-- chosen is refused and one to a person reaches only them; a template's
-- later version reaches only the businesses opened after it; and no demo
-- business starts from it, while one that did would still get its example
-- list. Fixed ids of its own.
begin;
select plan(16);

insert into auth.users (id, aud, role, phone)
values
  ('9b000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500009141'),
  ('9b000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500009142'),
  ('9b000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', '972500009143'),
  ('9b000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', '972500009144'),
  ('9b000000-0000-4000-a000-000000000005', 'authenticated', 'authenticated', '972500009145');

-- G, a business opened from the general template now: 1 owner, 2 manager,
-- workers 3, 4 and 5. D, a demo business on the same template: 1 owner,
-- 2 manager, workers 3 and 4. H is opened after a later version of it.
insert into public.businesses (id, slug, name)
values
  ('9b000000-0000-4000-b000-000000000001', 'general-lists-g', 'General lists G'),
  ('9b000000-0000-4000-b000-000000000002', 'general-lists-d', 'General lists D'),
  ('9b000000-0000-4000-b000-000000000003', 'general-lists-h', 'General lists H');

-- The template in the table.
select is(
  (select version from public.templates where key = 'general'),
  6,
  'the general template is a version up'
);
select is(
  (select definition -> 'listTemplates' from public.templates where key = 'general'),
  $json$
  [
    {
      "key": "opening", "name": "פתיחה",
      "recipient": null,
      "items": [
        { "kind": "check", "label": "פתיחת המקום" },
        { "kind": "check", "label": "אורות ומיזוג" },
        { "kind": "check", "label": "המקום נקי ומוכן" },
        { "kind": "note", "label": "מה נשאר מהמשמרת הקודמת", "required": false },
        { "kind": "note", "label": "משהו שחשוב לדעת למשמרת הבאה", "required": false }
      ]
    },
    {
      "key": "closing", "name": "סגירה",
      "recipient": null,
      "items": [
        { "kind": "check", "label": "כיבוי מכשירים ואורות" },
        { "kind": "check", "label": "פינוי פחים" },
        { "kind": "check", "label": "נעילה" },
        { "kind": "note", "label": "משהו שחשוב לדעת למשמרת הבאה", "required": false }
      ]
    }
  ]
  $json$::jsonb,
  'its opening and closing go to nobody fixed, with the note for the next shift, and the rest as it was'
);
select is(
  (select count(*)::integer
   from public.templates t,
     jsonb_array_elements(t.definition -> 'listTemplates') as lt (value),
     jsonb_array_elements(lt.value -> 'items') as item (value)
   where item.value ->> 'label' = 'משהו שהמנהל צריך לדעת'),
  0,
  'no template''s list says "משהו שהמנהל צריך לדעת" any more'
);
select is(
  (select string_agg(
     t.key || '@' || t.version || ':' || (
       select count(*) from jsonb_array_elements(t.definition -> 'listTemplates') as lt (value)
       where coalesce(jsonb_typeof(lt.value -> 'recipient'), 'null') = 'null'
     ),
     ',' order by t.key)
   from public.templates t
   where t.key in ('retail', 'restaurant', 'cafe-bar')),
  'cafe-bar@7:0,restaurant@8:0,retail@5:0',
  'the other templates keep their version, and every one of their lists its recipient'
);

-- A business opened from it.
set local role service_role;
select lives_ok(
  $$select public.apply_template('9b000000-0000-4000-b000-000000000001', 'general')$$,
  'the server opens a business from the general template'
);
select lives_ok(
  $$select public.apply_template('9b000000-0000-4000-b000-000000000002', 'general')$$,
  'and a second one'
);
reset role;

insert into public.memberships (business_id, user_id, role, active)
values
  ('9b000000-0000-4000-b000-000000000001', '9b000000-0000-4000-a000-000000000001', 'owner', true),
  ('9b000000-0000-4000-b000-000000000001', '9b000000-0000-4000-a000-000000000002', 'manager', true),
  ('9b000000-0000-4000-b000-000000000001', '9b000000-0000-4000-a000-000000000003', 'worker', true),
  ('9b000000-0000-4000-b000-000000000001', '9b000000-0000-4000-a000-000000000004', 'worker', true),
  ('9b000000-0000-4000-b000-000000000001', '9b000000-0000-4000-a000-000000000005', 'worker', true),
  ('9b000000-0000-4000-b000-000000000002', '9b000000-0000-4000-a000-000000000001', 'owner', true),
  ('9b000000-0000-4000-b000-000000000002', '9b000000-0000-4000-a000-000000000002', 'manager', true),
  ('9b000000-0000-4000-b000-000000000002', '9b000000-0000-4000-a000-000000000003', 'worker', true),
  ('9b000000-0000-4000-b000-000000000002', '9b000000-0000-4000-a000-000000000004', 'worker', true);

select is(
  (select string_agg(
     t.key || ':' || t.name || ':' || coalesce(t.recipient_kind, 'each time') || ':'
       || num_nonnulls(t.recipient_department, t.recipient_shift, t.recipient_role),
     ',' order by t.position)
   from public.list_templates t
   where t.business_id = '9b000000-0000-4000-b000-000000000001'),
  'opening:פתיחה:each time:0,closing:סגירה:each time:0',
  'its opening and closing lists have no fixed recipient: the sender chooses each time'
);
select is(
  (select string_agg(t.key || ': ' || (
       select string_agg(i.label || ' (' || i.kind || case when i.required then '' else ', optional' end || ')',
         ' | ' order by i.position)
       from public.list_template_items i where i.template_id = t.id
     ), ' / ' order by t.position)
   from public.list_templates t
   where t.business_id = '9b000000-0000-4000-b000-000000000001'),
  'opening: פתיחת המקום (check) | אורות ומיזוג (check) | המקום נקי ומוכן (check) | '
    || 'מה נשאר מהמשמרת הקודמת (note, optional) | משהו שחשוב לדעת למשמרת הבאה (note, optional)'
    || ' / closing: כיבוי מכשירים ואורות (check) | פינוי פחים (check) | נעילה (check) | '
    || 'משהו שחשוב לדעת למשמרת הבאה (note, optional)',
  'with their items in order, the note for the next shift last'
);
select is(
  (select b.template_key || '@' || b.template_version from public.businesses b
   where b.id = '9b000000-0000-4000-b000-000000000001')
  || '/' || (select count(*)::integer from public.list_schedules s
     where s.business_id = '9b000000-0000-4000-b000-000000000001')
  || '/' || (select count(*)::integer from public.lists l
     where l.business_id = '9b000000-0000-4000-b000-000000000001'),
  'general@6/0/0',
  'it records the version, and neither list has times, so nothing goes out by itself'
);

-- Sending: nobody chosen is refused, and one person chosen gets it alone.
select throws_ok(
  $$select public.send_list(
    '9b000000-0000-4000-a000-000000000001', '9b000000-0000-4000-b000-000000000001',
    jsonb_build_object('template', (
      select t.id from public.list_templates t
      where t.business_id = '9b000000-0000-4000-b000-000000000001' and t.key = 'opening'
    ))
  )$$,
  '22023', null,
  'sending "פתיחה" with nobody chosen is refused: the database never picks for the sender'
);
select lives_ok(
  $$select public.send_list(
    '9b000000-0000-4000-a000-000000000001', '9b000000-0000-4000-b000-000000000001',
    jsonb_build_object(
      'template', (
        select t.id from public.list_templates t
        where t.business_id = '9b000000-0000-4000-b000-000000000001' and t.key = 'opening'
      ),
      'recipient', jsonb_build_object('kind', 'person', 'user', '9b000000-0000-4000-a000-000000000003')
    )
  )$$,
  'the owner sends "פתיחה" to one worker'
);
select is(
  (select private.list_holders(l.id) from public.lists l
   where l.business_id = '9b000000-0000-4000-b000-000000000001'),
  array['9b000000-0000-4000-a000-000000000003'::uuid],
  'and it is for that worker alone, not for every worker'
);

-- The demo businesses.
select is(
  (select count(*)::integer from private.demo_businesses d
   where d.definition ->> 'template' = 'general'),
  0,
  'no demo business starts from the general template, so neither they nor their reset change'
);

-- Were one to, the reset's example lists (private.seed_demo_lists) would
-- still come: the first list to one worker, by name, and the second only
-- when it has a department or a role, which "סגירה" now doesn't.
insert into private.demo_businesses (business_id, definition)
values ('9b000000-0000-4000-b000-000000000002', $json$
  {
    "slug": "general-lists-d", "name": "General lists D", "template": "general",
    "people": [
      { "user_id": "9b000000-0000-4000-a000-000000000001", "role": "owner", "name": "Owner" },
      { "user_id": "9b000000-0000-4000-a000-000000000002", "role": "manager", "name": "Manager" },
      { "user_id": "9b000000-0000-4000-a000-000000000003", "role": "worker", "name": "Worker C" },
      { "user_id": "9b000000-0000-4000-a000-000000000004", "role": "worker", "name": "Worker D" }
    ]
  }
  $json$);
select private.seed_demo_lists('9b000000-0000-4000-b000-000000000002');
select is(
  (select string_agg(t.key || ':' || l.recipient_kind || ':' || l.status
       || ':' || array_to_string(private.list_holders(l.id), ' '), ',')
   from public.lists l
   join public.list_templates t on t.id = l.template_id
   where l.business_id = '9b000000-0000-4000-b000-000000000002'),
  'opening:person:open:9b000000-0000-4000-a000-000000000003',
  'a demo on the general template still gets "פתיחה" sent to one worker, and "סגירה" is left for someone to send'
);

-- A later version of a template reaches only the businesses opened after
-- it: here the opening goes to the workers again.
update public.templates t
set version = t.version + 1,
  definition = jsonb_set(
    t.definition, '{listTemplates,0,recipient}', '{"kind": "role", "role": "worker"}'::jsonb
  )
where t.key = 'general';
set local role service_role;
select lives_ok(
  $$select public.apply_template('9b000000-0000-4000-b000-000000000003', 'general')$$,
  'a business opens from the later version'
);
reset role;
select is(
  (select b.template_version || ':' || coalesce(t.recipient_kind || ':' || t.recipient_role::text, 'each time')
   from public.list_templates t
   join public.businesses b on b.id = t.business_id
   where t.business_id = '9b000000-0000-4000-b000-000000000001' and t.key = 'opening')
  || ' / ' || (select b.template_version || ':' || coalesce(t.recipient_kind || ':' || t.recipient_role::text, 'each time')
   from public.list_templates t
   join public.businesses b on b.id = t.business_id
   where t.business_id = '9b000000-0000-4000-b000-000000000003' and t.key = 'opening'),
  '6:each time / 7:role:worker',
  'it gets the later lists, and the business opened before keeps its own and its version'
);

select * from finish();
rollback;
