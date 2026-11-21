-- Taking orders: the fixes and the till, on screen
-- (20261122000100_order_taking_fixes.sql; waiter mode P5). The migration
-- writes only the restaurant's and the café's own sentences for P5's
-- screens: both templates hold all seventeen, each written against the app's
-- sentence it replaces, and the shop and the general template keep the
-- app's words. The writes the screens make and their refusals are P3's,
-- tested in order_taking.test.sql and order_taking_access.test.sql.
-- No fixture of its own: it reads the templates as the migrations leave
-- them.
begin;
select plan(3);

create temp table p5_keys (key text primary key) on commit drop;
insert into p5_keys (key) values
  ('app.orders.fix.cancel'),
  ('app.orders.fix.restore'),
  ('app.orders.failed.managersOnly'),
  ('app.orders.failed.managersOnlyRestore'),
  ('app.orders.failed.takeaway'),
  ('app.orders.failed.moveTaken'),
  ('app.orders.failed.reopenTaken'),
  ('app.orders.close.place'),
  ('app.orders.close.held'),
  ('app.orders.order.actions.move'),
  ('app.orders.order.actions.moveHint'),
  ('app.orders.order.actions.noFree'),
  ('app.orders.move.subtitle'),
  ('app.orders.cancelOrder.subtitle'),
  ('app.orders.till.byItem'),
  ('app.orders.till.noOrder.body'),
  ('app.orders.floor.closed.table.place');

select is(
  (select string_agg(w.template_key || ':' || w.sentence || ':' || w.base_sentence, ',' order by w.template_key)
   from public.template_wording w where w.key = 'app.orders.close.place'),
  'cafe-bar:סגירת השולחן:סגירת ההזמנה,restaurant:סגירת השולחן:סגירת ההזמנה',
  'the restaurant and the café close a table, written against the app''s "סגירת ההזמנה"'
);

select is(
  (select string_agg(x.template_key || ':' || x.n::text, ',' order by x.template_key)
   from (
     select w.template_key, count(*) as n
     from public.template_wording w
     join p5_keys k on k.key = w.key
     group by w.template_key
   ) x),
  'cafe-bar:17,restaurant:17',
  'both hold every one of P5''s seventeen sentences'
);

select is(
  (select count(*)::integer from public.template_wording w
   join p5_keys k on k.key = w.key
   where w.template_key in ('general', 'retail')),
  0,
  'the shop and the general template keep the app''s words'
);

select * from finish();
rollback;
