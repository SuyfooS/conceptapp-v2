-- Anonymous visitors read nothing, from any table in `public`.
begin;
select plan(1);

-- Fixture rows so an empty result means "hidden", not "absent".
insert into public.businesses (id, slug, name)
values ('10000000-0000-4000-b000-000000000001', 'anon-test', 'Anon test');
insert into public.business_modules (business_id, module_key)
values ('10000000-0000-4000-b000-000000000001', 'scheduling');
insert into public.templates (key) values ('anon-test');
insert into public.audit_log (business_id, action)
values ('10000000-0000-4000-b000-000000000001', 'test.anon');

-- Try every table as anon; record the ones that answered with rows or
-- without a permission error.
create temporary table leaks (relname text) on commit drop;
grant insert on leaks to anon;

set local role anon;
do $$
declare
  t record;
  n bigint;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    begin
      execute format('select count(*) from public.%I', t.relname) into n;
      if n > 0 then
        insert into leaks values (t.relname);
      end if;
    exception when insufficient_privilege then
      null;
    end;
  end loop;
end;
$$;
reset role;

select is_empty('select relname from leaks', 'anon reads no rows from any public table');

select * from finish();
rollback;
