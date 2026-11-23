-- A document to everyone on a bigger team (20261127000100_bigger_teams.sql):
-- public.send_document takes 1 to 1000 others on the staff (200 before), in
-- one write. An owner of a business of 1,002 sends a procedure to 1,000 of
-- them asking for "קראתי": 1,000 recipients, 1,000 lines under the one
-- document's key, and one log row that counts them; 1,001 and none are
-- refused with the same words. A demo business with a sample, so no upload
-- is needed. Fixed ids (5ca1e000…) and numbers (050-072-xxxx) of its own,
-- explicit times.
begin;
select plan(6);

-- 0 the owner, 1 to 1001 workers.
insert into auth.users (id, aud, role, phone)
select ('5ca1e000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', '97250072' || lpad(n::text, 4, '0')
from generate_series(0, 1001) as n;

create function pg_temp.p(n integer) returns uuid language sql as $$
  select ('5ca1e000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.biz() returns uuid language sql as $$
  select '5ca1e000-0000-4000-b000-000000000001'::uuid
$$;
-- Workers `first` to `last`.
create function pg_temp.workers(first integer, last integer) returns uuid[] language sql as $$
  select array_agg(pg_temp.p(n) order by n) from generate_series(first, last) as n
$$;

insert into public.businesses (id, slug, name)
values (pg_temp.biz(), 'documents-everyone', 'Documents everyone');
insert into public.memberships (business_id, user_id, role, active, created_at)
select pg_temp.biz(), pg_temp.p(n),
  (case when n = 0 then 'owner' else 'worker' end)::public.member_role,
  true, '2026-11-01 08:00+00'
from generate_series(0, 1001) as n;
insert into public.business_modules (business_id, module_key, enabled, settings)
values
  (pg_temp.biz(), 'chat', true, '{}'),
  (pg_temp.biz(), 'notifications', true, '{}');
insert into private.demo_businesses (business_id, definition)
values (pg_temp.biz(), '{"slug": "documents-everyone"}');

create temporary table ids (name text primary key, id uuid) on commit drop;

select lives_ok(
  $$insert into ids values ('everyone', public.send_document(pg_temp.p(0), pg_temp.biz(),
    'to_people', 'procedure', 'A procedure', null, pg_temp.workers(1, 1000), true, null,
    'procedure', '2026-11-20 09:00+00'))$$,
  'the owner sends a procedure to 1,000 of the staff, asking for "קראתי"'
);
select is(
  (select count(*)::integer from public.document_recipients r
   where r.document_id = (select i.id from ids i where i.name = 'everyone')),
  1000,
  'each of the 1,000 is its recipient'
);
select is(
  (select count(*)::integer from public.notifications n
   where n.business_id = pg_temp.biz()
     and n.kind = 'documents.to_confirm'
     and n.dedupe_key = 'documents.' || (select i.id from ids i where i.name = 'everyone')::text),
  1000,
  'and has a line asking them, under the one document''s key'
);
select is(
  (select (a.details ->> 'recipients')::integer from public.audit_log a
   where a.business_id = pg_temp.biz()
     and a.action = 'document.send'
     and a.details ->> 'document' = (select i.id from ids i where i.name = 'everyone')::text),
  1000,
  'its one log row counts them'
);
select throws_ok(
  $$select public.send_document(pg_temp.p(0), pg_temp.biz(), 'to_people', 'procedure',
    'A procedure', null, pg_temp.workers(1, 1001), false, null, 'procedure',
    '2026-11-20 09:01+00')$$,
  '22023', 'One to 1000 people', '1,001 people are more than one document takes'
);
select throws_ok(
  $$select public.send_document(pg_temp.p(0), pg_temp.biz(), 'to_people', 'procedure',
    'A procedure', null, '{}'::uuid[], false, null, 'procedure', '2026-11-20 09:01+00')$$,
  '22023', 'One to 1000 people', 'and nobody is too few'
);

select * from finish();
rollback;
