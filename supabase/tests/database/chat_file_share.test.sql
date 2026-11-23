-- One person's share of a business's space for chat files
-- (20261127000300_files_server_only.sql, public.expired_files): half of it.
-- Past the space, what one person holds beyond their half goes first, their
-- oldest first, and only then the oldest of all; under the space nothing goes
-- for space, however much one person holds; a deleted account's files count
-- as one sender's; and days still take any file. (A business with one sender
-- keeps its files as before: chat_files.test.sql's G.) Fixed ids of its own,
-- explicit times, and the messages written as the database's owner, as the
-- server would.
begin;
select plan(6);

insert into auth.users (id, aud, role, phone)
values
  ('c2000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500007501'),
  ('c2000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500007502'),
  ('c2000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', '972500007503'),
  ('c2000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', '972500007504'),
  ('c2000000-0000-4000-a000-000000000005', 'authenticated', 'authenticated', '972500007505'),
  ('c2000000-0000-4000-a000-000000000006', 'authenticated', 'authenticated', '972500007506');

-- S keeps 50 MB, so one person's share is 25 MiB: 1 Noa and 2 Yoav. S2 keeps
-- 100 MB: 3 Noa and 4 Yoav. S3 keeps 50 MB: 5 Shiran, and the files of an
-- account deleted since (no author).
insert into public.businesses (id, slug, name)
values
  ('c2000000-0000-4000-b000-000000000001', 'file-share-s', 'File share S'),
  ('c2000000-0000-4000-b000-000000000002', 'file-share-s2', 'File share S2'),
  ('c2000000-0000-4000-b000-000000000003', 'file-share-s3', 'File share S3');

insert into public.memberships (business_id, user_id, role, active, created_at)
values
  ('c2000000-0000-4000-b000-000000000001', 'c2000000-0000-4000-a000-000000000001', 'worker', true, '2026-11-01 08:00+00'),
  ('c2000000-0000-4000-b000-000000000001', 'c2000000-0000-4000-a000-000000000002', 'worker', true, '2026-11-01 08:00+00'),
  ('c2000000-0000-4000-b000-000000000001', 'c2000000-0000-4000-a000-000000000006', 'owner', true, '2026-11-01 08:00+00'),
  ('c2000000-0000-4000-b000-000000000002', 'c2000000-0000-4000-a000-000000000003', 'owner', true, '2026-11-01 08:00+00'),
  ('c2000000-0000-4000-b000-000000000002', 'c2000000-0000-4000-a000-000000000004', 'worker', true, '2026-11-01 08:00+00'),
  ('c2000000-0000-4000-b000-000000000003', 'c2000000-0000-4000-a000-000000000005', 'owner', true, '2026-11-01 08:00+00');

insert into public.business_modules (business_id, module_key, enabled, settings)
values
  ('c2000000-0000-4000-b000-000000000001', 'chat', true, '{"fileSpaceMb": 50}'),
  ('c2000000-0000-4000-b000-000000000002', 'chat', true, '{}'),
  ('c2000000-0000-4000-b000-000000000003', 'chat', true, '{"fileSpaceMb": 50}');

-- `how_many` pictures of 10 MiB by `author` in `business`'s team group, a
-- minute apart from `from_time`, each under the key md5(`tag` || n).
create function pg_temp.pictures(business uuid, author uuid, tag text, how_many integer,
  from_time timestamptz) returns void language sql as $$
  insert into public.chat_messages (business_id, conversation_id, author_id, draft_id,
    file_kind, file_path, thumb_path, file_size, created_at)
  select c.business_id, c.id, author, gen_random_uuid(), 'image',
    c.business_id::text || '/' || c.id::text || '/' || md5(tag || n) || '.webp',
    c.business_id::text || '/' || c.id::text || '/' || md5(tag || n) || '-s.webp',
    10485760, from_time + (n - 1) * interval '1 minute'
  from public.chat_conversations c
  cross join generate_series(1, how_many) as n
  where c.business_id = business and c.kind = 'team';
$$;
-- A picture's file and thumbnail, by its tag and number, thumbnail first.
create function pg_temp.paths(business uuid, tag text, n integer) returns setof text
language sql as $$
  select c.business_id::text || '/' || c.id::text || '/' || md5(tag || n) || x.ending
  from public.chat_conversations c
  cross join (values (1, '-s.webp'), (2, '.webp')) as x (o, ending)
  where c.business_id = business and c.kind = 'team'
  order by x.o
$$;
-- What is due of `business` at `at_time`, in the clean-up's order.
create function pg_temp.due_in(business uuid, at_time timestamptz) returns setof text
language sql as $$
  select e.path from public.expired_files(at_time, 1000) e
  where e.path like business::text || '/%'
$$;

-- S: Noa's two (the oldest), then Yoav's six.
select pg_temp.pictures('c2000000-0000-4000-b000-000000000001',
  'c2000000-0000-4000-a000-000000000001', 'noa', 2, '2026-11-10 08:01+00');
select pg_temp.pictures('c2000000-0000-4000-b000-000000000001',
  'c2000000-0000-4000-a000-000000000002', 'yoav', 6, '2026-11-10 09:01+00');
-- S2: Yoav's eight, then Noa's one.
select pg_temp.pictures('c2000000-0000-4000-b000-000000000002',
  'c2000000-0000-4000-a000-000000000004', 'yoav2', 8, '2026-11-10 08:01+00');
select pg_temp.pictures('c2000000-0000-4000-b000-000000000002',
  'c2000000-0000-4000-a000-000000000003', 'noa2', 1, '2026-11-10 09:01+00');
-- S3: Shiran's two (the oldest), then four of an account deleted since.
select pg_temp.pictures('c2000000-0000-4000-b000-000000000003',
  'c2000000-0000-4000-a000-000000000005', 'shiran', 2, '2026-11-10 08:01+00');
select pg_temp.pictures('c2000000-0000-4000-b000-000000000003', null, 'gone', 4,
  '2026-11-10 09:01+00');

select results_eq(
  $$select pg_temp.due_in('c2000000-0000-4000-b000-000000000001', '2026-11-11 12:00+00')$$,
  $$select pg_temp.paths('c2000000-0000-4000-b000-000000000001', 'yoav', 1)
    union all select pg_temp.paths('c2000000-0000-4000-b000-000000000001', 'yoav', 2)
    union all select pg_temp.paths('c2000000-0000-4000-b000-000000000001', 'yoav', 3)$$,
  'past its space, what Yoav holds beyond his half goes first, his oldest first, each thumbnail before its picture (by age alone, Noa''s two would go with his oldest)'
);
select ok(
  not exists (
    select 1 from pg_temp.due_in('c2000000-0000-4000-b000-000000000001', '2026-11-11 12:00+00') d (path)
    where d.path in (
      select pg_temp.paths('c2000000-0000-4000-b000-000000000001', 'noa', 1)
      union all select pg_temp.paths('c2000000-0000-4000-b000-000000000001', 'noa', 2)
    )
  ),
  'and Noa''s, older but within her share, stay'
);
select is(
  (select count(*)::integer
   from pg_temp.due_in('c2000000-0000-4000-b000-000000000002', '2026-11-11 12:00+00')),
  0,
  'under its space nothing goes for space, however much one person holds'
);
select results_eq(
  $$select pg_temp.due_in('c2000000-0000-4000-b000-000000000003', '2026-11-11 12:00+00')$$,
  $$select pg_temp.paths('c2000000-0000-4000-b000-000000000003', 'gone', 1)$$,
  'a deleted account''s files count as one sender''s: past the space, theirs beyond half go first, not Shiran''s oldest'
);
select ok(
  exists (
    select 1 from pg_temp.due_in('c2000000-0000-4000-b000-000000000002', '2027-02-09 12:00+00') d (path)
    where d.path in (select pg_temp.paths('c2000000-0000-4000-b000-000000000002', 'noa2', 1))
  ),
  'past its days, a file is due whoever sent it'
);

-- The clean-up removed Yoav's three oldest: what S keeps is within its space.
select public.forget_files(array(
  select pg_temp.paths('c2000000-0000-4000-b000-000000000001', 'yoav', 1)
  union all select pg_temp.paths('c2000000-0000-4000-b000-000000000001', 'yoav', 2)
  union all select pg_temp.paths('c2000000-0000-4000-b000-000000000001', 'yoav', 3)
), '2026-11-11 12:10+00');
select is(
  (select count(*)::integer
   from pg_temp.due_in('c2000000-0000-4000-b000-000000000001', '2026-11-11 12:20+00')),
  0,
  'and once they went, nothing more is due there'
);

select * from finish();
rollback;
