-- Photos on lists (20261110001500_list_photos.sql): a private bucket only the
-- server writes; a photo item's file set, replaced and cleared by
-- set_list_item_photo with set_list_item's rules and its own path rule; the
-- bucket read by whoever sees the list (its holder, the department that asked,
-- managers, a view session as a manager) and by nobody else; demo businesses
-- that take none; and photos kept their business's days, then marked removed
-- by the clean-up (the days a setting for the team, which the app holds to
-- the manifest's choices). Fixed ids of its own and explicit times.
begin;
select plan(49);

insert into auth.users (id, aud, role, phone)
values
  ('84000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500003601'),
  ('84000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500003602'),
  ('84000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', '972500003603'),
  ('84000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', '972500003604'),
  ('84000000-0000-4000-a000-000000000005', 'authenticated', 'authenticated', '972500003605'),
  ('84000000-0000-4000-a000-000000000006', 'authenticated', 'authenticated', '972500003606'),
  ('84000000-0000-4000-a000-000000000007', 'authenticated', 'authenticated', '972500003607'),
  ('84000000-0000-4000-a000-000000000008', 'authenticated', 'authenticated', '972500003608');

-- P: 1 owner, 2 manager, 3 worker (kitchen), 4 worker (bar), 5 worker (no
-- department). 6 is on the ConceptApp team, viewing P as a manager. Q: 7, its
-- owner. D, a demo business: 8, its owner. Each person on one staff only.
insert into public.businesses (id, slug, name)
values
  ('84000000-0000-4000-b000-000000000001', 'list-photos-p', 'List photos P'),
  ('84000000-0000-4000-b000-000000000002', 'list-photos-q', 'List photos Q'),
  ('84000000-0000-4000-b000-000000000003', 'list-photos-d', 'List photos D');

insert into public.memberships (business_id, user_id, role, perms, active)
values
  ('84000000-0000-4000-b000-000000000001', '84000000-0000-4000-a000-000000000001', 'owner', '{}', true),
  ('84000000-0000-4000-b000-000000000001', '84000000-0000-4000-a000-000000000002', 'manager', '{}', true),
  ('84000000-0000-4000-b000-000000000001', '84000000-0000-4000-a000-000000000003', 'worker', '{}', true),
  ('84000000-0000-4000-b000-000000000001', '84000000-0000-4000-a000-000000000004', 'worker', '{}', true),
  ('84000000-0000-4000-b000-000000000001', '84000000-0000-4000-a000-000000000005', 'worker', '{}', true),
  ('84000000-0000-4000-b000-000000000002', '84000000-0000-4000-a000-000000000007', 'owner', '{}', true),
  ('84000000-0000-4000-b000-000000000003', '84000000-0000-4000-a000-000000000008', 'owner', '{}', true);

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('84000000-0000-4000-b000-000000000001', 'lists', true, '{}'),
  ('84000000-0000-4000-b000-000000000002', 'lists', true, '{}'),
  ('84000000-0000-4000-b000-000000000003', 'lists', true, '{}');

insert into public.platform_staff (user_id, role)
values ('84000000-0000-4000-a000-000000000006', 'onboarder');
insert into public.view_sessions (staff_id, business_id, role)
values ('84000000-0000-4000-a000-000000000006', '84000000-0000-4000-b000-000000000001', 'manager');

insert into private.demo_businesses (business_id, definition)
values ('84000000-0000-4000-b000-000000000003', '{}');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create temporary table ids (name text primary key, id uuid) on commit drop;
create temporary table paths (name text primary key, path text) on commit drop;
grant select on ids, paths to authenticated, anon, service_role;

create function pg_temp.id_of(saved text) returns uuid language sql as $$
  select i.id from ids i where i.name = saved
$$;
create function pg_temp.item_of(saved text, item_label text) returns uuid language sql as $$
  select i.id from public.list_items i
  where i.list_id = pg_temp.id_of(saved) and i.label = item_label
$$;
-- A file in a saved list's folder, `<business>/<list>/<file>`, worked out as
-- the database's owner (a reader's own RLS would hide other lists).
create function pg_temp.folder(saved text, file text) returns text language sql as $$
  select l.business_id::text || '/' || l.id::text || '/' || file
  from public.lists l where l.id = pg_temp.id_of(saved)
$$;
create function pg_temp.path_of(saved text) returns text language sql as $$
  select p.path from paths p where p.name = saved
$$;
-- The list-photos files the signed-in person reads, of this test's businesses.
create function pg_temp.read_files() returns setof text language sql as $$
  select o.name from storage.objects o
  where o.bucket_id = 'list-photos' and o.name like '84000000-%'
  order by o.name
$$;

-- P's departments: the kitchen (3) and the bar (4).
select public.set_departments('84000000-0000-4000-a000-000000000001',
  '84000000-0000-4000-b000-000000000001',
  '[{"key": "kitchen", "name": "Kitchen"}, {"key": "bar", "name": "Bar"}]');
insert into ids
select d.key, d.id from public.departments d
where d.business_id = '84000000-0000-4000-b000-000000000001';
select public.set_department_members('84000000-0000-4000-a000-000000000001',
  '84000000-0000-4000-b000-000000000001', pg_temp.id_of('kitchen'),
  array['84000000-0000-4000-a000-000000000003']::uuid[]);
select public.set_department_members('84000000-0000-4000-a000-000000000001',
  '84000000-0000-4000-b000-000000000001', pg_temp.id_of('bar'),
  array['84000000-0000-4000-a000-000000000004']::uuid[]);

-- The bar asks the kitchen for a photo of its shelf: a template with a photo
-- item, sent by the bar's worker to the kitchen.
insert into ids
select 't', (public.save_list_template('84000000-0000-4000-a000-000000000002',
  '84000000-0000-4000-b000-000000000001',
  jsonb_build_object('name', 'Shelf check',
    'recipient', jsonb_build_object('kind', 'department', 'department', pg_temp.id_of('kitchen')),
    'fromDepartment', pg_temp.id_of('bar'),
    'items', '[{"kind": "photo", "label": "Shelf"}, {"kind": "check", "label": "Count"}]'::jsonb)) ->> 'id')::uuid;
insert into ids
select 'p', public.send_list('84000000-0000-4000-a000-000000000004',
  '84000000-0000-4000-b000-000000000001',
  jsonb_build_object('template', pg_temp.id_of('t'),
    'recipient', jsonb_build_object('kind', 'department', 'department', pg_temp.id_of('kitchen'))),
  '2026-11-10T07:00:00+02');
-- A list typed now, sent to the kitchen's worker and cancelled.
insert into ids
select 'p2', public.send_list('84000000-0000-4000-a000-000000000002',
  '84000000-0000-4000-b000-000000000001',
  '{"name": "Door", "items": [{"kind": "photo", "label": "Door"}],
    "recipient": {"kind": "person", "user": "84000000-0000-4000-a000-000000000003"}}'::jsonb,
  '2026-11-10T07:00:00+02');
select public.cancel_list('84000000-0000-4000-a000-000000000002', pg_temp.id_of('p2'),
  '2026-11-10T07:05:00+02');
-- Q's and D's owners each send themselves one.
insert into ids
select 'q', public.send_list('84000000-0000-4000-a000-000000000007',
  '84000000-0000-4000-b000-000000000002',
  '{"name": "Front", "items": [{"kind": "photo", "label": "Front"}],
    "recipient": {"kind": "person", "user": "84000000-0000-4000-a000-000000000007"}}'::jsonb,
  '2026-11-10T07:00:00+02');
insert into ids
select 'd', public.send_list('84000000-0000-4000-a000-000000000008',
  '84000000-0000-4000-b000-000000000003',
  '{"name": "Front", "items": [{"kind": "photo", "label": "Front"}],
    "recipient": {"kind": "person", "user": "84000000-0000-4000-a000-000000000008"}}'::jsonb,
  '2026-11-10T07:00:00+02');

insert into paths
values
  ('p-a', pg_temp.folder('p', 'aaaa1111.webp')),
  ('p-b', pg_temp.folder('p', 'bbbb2222.jpg')),
  ('p-c', pg_temp.folder('p', 'cccc3333.webp')),
  ('p-orphan', pg_temp.folder('p', 'zzzz9999.webp')),
  ('p-bad', pg_temp.folder('p', 'Shelf.png')),
  ('p2', pg_temp.folder('p2', 'eeee1111.webp')),
  ('q', pg_temp.folder('q', 'qqqq1111.jpg')),
  ('d', pg_temp.folder('d', 'dddd1111.webp'));

------------------------------------------------------------------------------
-- The bucket, and who may call what

select is(
  (select public::text || ' ' || file_size_limit || ' ' || array_to_string(allowed_mime_types, ',')
   from storage.buckets where id = 'list-photos'),
  'false 409600 image/jpeg,image/webp',
  'the list-photos bucket is private, 400 KB, JPEG or WebP'
);
select ok(
  not has_function_privilege('authenticated', 'public.set_list_item_photo(uuid, uuid, text, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.set_list_item_photo(uuid, uuid, text, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.list_photos_closed(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.expired_list_photos(timestamptz, integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.forget_list_photos(text[], timestamptz)', 'execute'),
  'browser roles run none of the photo functions'
);
select ok(
  has_function_privilege('service_role', 'public.set_list_item_photo(uuid, uuid, text, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.list_photos_closed(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.expired_list_photos(timestamptz, integer)', 'execute')
  and has_function_privilege('service_role', 'public.forget_list_photos(text[], timestamptz)', 'execute'),
  'the server runs them'
);
select ok(
  has_function_privilege('authenticated', 'private.can_read_list_photo(text)', 'execute')
  and not has_function_privilege('anon', 'private.can_read_list_photo(text)', 'execute'),
  'a signed-in reader runs the storage policy''s helper; an anonymous visitor doesn''t'
);

select is(
  (select string_agg(i.kind, ',' order by i.position) from public.list_items i
   where i.list_id = pg_temp.id_of('p')),
  'photo,check',
  'a template takes a photo item, and the list sent from it has one'
);

------------------------------------------------------------------------------
-- Setting a photo

select throws_ok(
  $$select public.set_list_item_photo('84000000-0000-4000-a000-000000000005',
    pg_temp.item_of('p', 'Shelf'), pg_temp.path_of('p-a'))$$,
  '42501', null, 'a worker the list isn''t for sets no photo'
);
select throws_ok(
  $$select public.set_list_item_photo('84000000-0000-4000-a000-000000000007',
    pg_temp.item_of('p', 'Shelf'), pg_temp.path_of('p-a'))$$,
  'P0002', null, 'someone of another business is told the item doesn''t exist'
);
select throws_ok(
  $$select public.set_list_item_photo('84000000-0000-4000-a000-000000000003',
    gen_random_uuid(), pg_temp.path_of('p-a'))$$,
  'P0002', null, 'and so is anyone, of an item that doesn''t'
);
select throws_ok(
  $$select public.set_list_item_photo('84000000-0000-4000-a000-000000000003',
    pg_temp.item_of('p', 'Count'), pg_temp.path_of('p-a'))$$,
  '22023', null, 'only a photo item takes a photo'
);
select throws_ok(
  $$select public.set_list_item_photo('84000000-0000-4000-a000-000000000003',
    pg_temp.item_of('p', 'Shelf'), pg_temp.path_of('q'))$$,
  '22023', null, 'a photo goes in its own list''s folder, not another business''s'
);
select throws_ok(
  $$select public.set_list_item_photo('84000000-0000-4000-a000-000000000003',
    pg_temp.item_of('p', 'Shelf'), pg_temp.path_of('p2'))$$,
  '22023', null, 'nor another list''s of the same business'
);
select throws_ok(
  $$select public.set_list_item_photo('84000000-0000-4000-a000-000000000003',
    pg_temp.item_of('p', 'Shelf'), pg_temp.path_of('p-bad'))$$,
  '22023', null, 'and is a file the app makes: a lower-case key, WebP or JPEG'
);

select is(
  public.set_list_item_photo('84000000-0000-4000-a000-000000000003',
    pg_temp.item_of('p', 'Shelf'), pg_temp.path_of('p-a'), '2026-11-10T08:00:00+02'),
  null,
  'the kitchen sets the photo, replacing none'
);
select results_eq(
  $$select i.done, i.done_by, i.done_at, i.photo_path from public.list_items i
    where i.id = pg_temp.item_of('p', 'Shelf')$$,
  $$select true, '84000000-0000-4000-a000-000000000003'::uuid,
    '2026-11-10T08:00:00+02'::timestamptz, pg_temp.path_of('p-a')$$,
  'the item is done, by whoever took it, when'
);
select is(
  public.set_list_item_photo('84000000-0000-4000-a000-000000000002',
    pg_temp.item_of('p', 'Shelf'), pg_temp.path_of('p-b'), '2026-11-10T08:05:00+02'),
  pg_temp.path_of('p-a'),
  'a list manager replaces it, and the server gets the file it replaced, to remove'
);
select is(
  public.set_list_item_photo('84000000-0000-4000-a000-000000000003',
    pg_temp.item_of('p', 'Shelf'), null, '2026-11-10T08:10:00+02'),
  pg_temp.path_of('p-b'),
  'clearing it gives the file back too'
);
select is(
  (select i.done or i.done_by is not null or i.done_at is not null or i.photo_path is not null
   from public.list_items i where i.id = pg_temp.item_of('p', 'Shelf')),
  false,
  'and the item is no longer done'
);

select public.set_list_item_photo('84000000-0000-4000-a000-000000000003',
  pg_temp.item_of('p', 'Shelf'), pg_temp.path_of('p-c'), '2026-11-10T08:15:00+02');
select public.set_list_item_photo('84000000-0000-4000-a000-000000000007',
  pg_temp.item_of('q', 'Front'), pg_temp.path_of('q'), '2026-11-10T08:00:00+02');

select is(
  public.set_list_item_photo('84000000-0000-4000-a000-000000000003',
    pg_temp.item_of('p', 'Shelf'), pg_temp.path_of('p-c'), '2026-11-10T08:20:00+02'),
  null,
  'setting the photo it has replaces nothing'
);
select throws_ok(
  $$select public.set_list_item_photo('84000000-0000-4000-a000-000000000003',
    pg_temp.item_of('p2', 'Door'), pg_temp.path_of('p2'))$$,
  '55000', null, 'a closed list takes no photo'
);

------------------------------------------------------------------------------
-- Storage: the server writes, the browser only reads

set local role service_role;
insert into storage.objects (bucket_id, name)
select 'list-photos', p.path from paths p where p.name in ('p-c', 'p-orphan', 'q');
reset role;

select pg_temp.sign_in('84000000-0000-4000-a000-000000000003');
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('list-photos', pg_temp.path_of('p-a'))$$,
  '42501', null, 'the browser uploads no photo, not even to a list it fills'
);
update storage.objects set metadata = '{"x": 1}'
where bucket_id = 'list-photos' and name = pg_temp.path_of('p-c');
reset role;
select is(
  (select metadata from storage.objects where bucket_id = 'list-photos' and name = pg_temp.path_of('p-c')),
  null,
  'nor replaces one'
);
set local storage.allow_delete_query = 'true';
select pg_temp.sign_in('84000000-0000-4000-a000-000000000003');
delete from storage.objects where bucket_id = 'list-photos' and name = pg_temp.path_of('p-c');
reset role;
select is(
  (select count(*)::integer from storage.objects where bucket_id = 'list-photos' and name = pg_temp.path_of('p-c')),
  1,
  'nor removes one'
);

select pg_temp.sign_in('84000000-0000-4000-a000-000000000003');
select results_eq(
  'select pg_temp.read_files()',
  $$select pg_temp.path_of('p-c')$$,
  'the kitchen reads the photo of the list it holds, and no file nothing points at'
);
reset role;
select pg_temp.sign_in('84000000-0000-4000-a000-000000000004');
select results_eq(
  'select pg_temp.read_files()',
  $$select pg_temp.path_of('p-c')$$,
  'the bar, which asked for the list, reads it'
);
reset role;
select pg_temp.sign_in('84000000-0000-4000-a000-000000000002');
select results_eq(
  'select pg_temp.read_files()',
  $$select pg_temp.path_of('p-c')$$,
  'a manager reads it'
);
reset role;
select pg_temp.sign_in('84000000-0000-4000-a000-000000000006');
select results_eq(
  'select pg_temp.read_files()',
  $$select pg_temp.path_of('p-c')$$,
  'the team viewing the business as a manager reads it'
);
reset role;
select pg_temp.sign_in('84000000-0000-4000-a000-000000000005');
select is(
  (select count(*)::integer from pg_temp.read_files()),
  0,
  'a worker the list isn''t for reads none'
);
reset role;
select pg_temp.sign_in('84000000-0000-4000-a000-000000000007');
select results_eq(
  'select pg_temp.read_files()',
  $$select pg_temp.path_of('q')$$,
  'another business reads only its own'
);
reset role;
set local role anon;
select is(
  (select count(*)::integer from storage.objects where bucket_id = 'list-photos'),
  0,
  'an anonymous visitor reads none'
);
reset role;
update public.business_modules set enabled = false
where business_id = '84000000-0000-4000-b000-000000000001' and module_key = 'lists';
select pg_temp.sign_in('84000000-0000-4000-a000-000000000003');
select is(
  (select count(*)::integer from pg_temp.read_files()),
  0,
  'with lists off, the business''s photos are closed too'
);
reset role;
update public.business_modules set enabled = true
where business_id = '84000000-0000-4000-b000-000000000001' and module_key = 'lists';

------------------------------------------------------------------------------
-- Demo businesses

select is(
  public.list_photos_closed('84000000-0000-4000-b000-000000000003')::text || '/'
    || public.list_photos_closed('84000000-0000-4000-b000-000000000001')::text,
  'true/false',
  'a demo business takes no photos; any other does'
);
select throws_ok(
  $$select public.set_list_item_photo('84000000-0000-4000-a000-000000000008',
    pg_temp.item_of('d', 'Front'), pg_temp.path_of('d'))$$,
  '55000', null, 'the database refuses a photo in a demo business'
);
update private.demo_businesses set definition = '{"photos": true}'
where business_id = '84000000-0000-4000-b000-000000000003';
select lives_ok(
  $$select public.set_list_item_photo('84000000-0000-4000-a000-000000000008',
    pg_temp.item_of('d', 'Front'), pg_temp.path_of('d'))$$,
  'one whose definition says "photos": true takes them'
);
update private.demo_businesses set definition = '{}'
where business_id = '84000000-0000-4000-b000-000000000003';
select lives_ok(
  $$select public.set_list_item_photo('84000000-0000-4000-a000-000000000008',
    pg_temp.item_of('d', 'Front'), null)$$,
  'and a closed one still clears one'
);
select throws_ok(
  $$update public.list_items set photo_path = 'not/a/photo.webp'
    where id = pg_temp.item_of('p', 'Shelf')$$,
  '23514', null, 'an item keeps the path rule, whoever writes it'
);

------------------------------------------------------------------------------
-- How long photos are kept

select is(
  private.list_settings('84000000-0000-4000-b000-000000000001') ->> 'photoDays',
  '90',
  'photos are kept 90 days unless the team chose otherwise'
);
select is(
  (select count(*)::integer from public.expired_list_photos('2027-02-07T08:00:00+02')
   where path like '84000000-%'),
  0,
  'none is due before its days are up'
);
select results_eq(
  $$select e.path from public.expired_list_photos('2027-02-09T08:00:00+02') e
    where e.path like '84000000-%' order by e.path$$,
  $$values (pg_temp.path_of('p-c')), (pg_temp.path_of('q'))$$,
  'after 90 days the clean-up finds them, with their files'
);
select public.set_module_settings('84000000-0000-4000-a000-000000000006',
  '84000000-0000-4000-b000-000000000002', 'lists', '{"photoDays": 30}');
select results_eq(
  $$select e.path from public.expired_list_photos('2026-12-11T08:00:00+02') e
    where e.path like '84000000-%' order by e.path$$,
  $$values (pg_temp.path_of('q'))$$,
  'the team keeps a business''s photos 30 days, and the others keep theirs'
);
update public.business_modules set settings = settings || '{"photoDays": 7}'
where business_id = '84000000-0000-4000-b000-000000000002' and module_key = 'lists';
select is(
  (select count(*)::integer from public.expired_list_photos('2026-12-11T08:00:00+02')
   where path like '84000000-%'),
  0,
  'a stored value the manifest doesn''t offer keeps the default 90 days'
);
select is(
  (select count(*)::integer from public.expired_list_photos('2027-02-09T08:00:00+02', 1)),
  1,
  'the clean-up takes them a batch at a time'
);
select is(
  public.forget_list_photos(array[pg_temp.path_of('p-c')], '2027-02-09T08:00:00+02'),
  1,
  'the clean-up marks the file it removed'
);
select results_eq(
  $$select i.done, i.photo_path, i.photo_removed_at from public.list_items i
    where i.id = pg_temp.item_of('p', 'Shelf')$$,
  $$select true, pg_temp.path_of('p-c'), '2027-02-09T08:00:00+02'::timestamptz$$,
  'the item stays done, and says its photo is no longer kept'
);
select results_eq(
  $$select e.path from public.expired_list_photos('2027-02-09T08:00:00+02') e
    where e.path like '84000000-%' order by e.path$$,
  $$values (pg_temp.path_of('q'))$$,
  'and is not found again'
);
select is(
  public.set_list_item_photo('84000000-0000-4000-a000-000000000003',
    pg_temp.item_of('p', 'Shelf'), pg_temp.path_of('p-a'), '2027-02-09T09:00:00+02'),
  null,
  'a photo taken again after the clean-up leaves no file to remove'
);
select is(
  (select i.photo_removed_at is null and i.photo_path = pg_temp.path_of('p-a')
   from public.list_items i where i.id = pg_temp.item_of('p', 'Shelf')),
  true,
  'and is kept again'
);
select is(
  (select j.schedule from cron.job j where j.jobname = 'list-photos'),
  '43 3 * * *',
  'the clean-up is asked for once a day'
);
-- At a time a photo is due (Q's, taken 2026-11-10 and kept 90 days), so the
-- job gets past "nothing is due" to the app's address, which Vault doesn't
-- have here: it asks pg_net for nothing.
select set_config('list_photos.queued',
  (select count(*) from net.http_request_queue)::text, true);
select lives_ok(
  $$select private.list_photos_tick('2027-02-09T08:00:00+02')$$,
  'the daily job runs while a photo is due'
);
select is(
  (select count(*)::integer from net.http_request_queue),
  current_setting('list_photos.queued')::integer,
  'and calls nothing without the app''s address'
);

select * from finish();
rollback;
