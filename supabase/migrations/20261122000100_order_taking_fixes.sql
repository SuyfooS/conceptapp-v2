-- Taking orders: the fixes and the till, on screen (waiter mode P5, #191).
--
-- The restaurant's and the café's own sentences for P5's screens: the
-- line's sheet ("ביטול המנה"), closing ("סגירת השולחן"), moving ("העברה
-- לשולחן אחר"), cancelling an order, the till ("לפי מנה") and "נסגרו היום".
-- And one write, the close's own "ביטול" (public.undo_close_order): the
-- close serves every ticket not yet served, and P3's reopen_order leaves
-- them served, so the toast's undo gives the kitchen back what the close
-- took from it, in the same transaction. Every other write and its undo is
-- in 20261120000300_order_taking_orders.sql, and today's closed orders and
-- fixes in `public.order_floor` (20261121000100_order_taking_mode.sql). No
-- table changes; packages/db/database.types.ts gains the function.

------------------------------------------------------------------------------
-- The restaurant's and the café's words

-- Both templates the same sentences, as P4's: "שולחן" for a place, "מנה"
-- for an item, "לקחת" for an order with no place. Only where the app's
-- sentence says "מקום", "פריט" or "בלי מקום", and only where nothing is
-- stored yet.
insert into public.template_wording (template_key, key, sentence, base_sentence)
select t.template_key, w.key, w.sentence, w.base_sentence
from (values ('restaurant'), ('cafe-bar')) as t (template_key)
cross join (
  values
    ('app.orders.fix.cancel',
      'ביטול המנה',
      'ביטול הפריט'),
    ('app.orders.fix.restore',
      'החזרת המנה להזמנה',
      'החזרת הפריט להזמנה'),
    ('app.orders.failed.managersOnly',
      'המנה כבר מוכנה, אז מבטל אותה רק מי שמנהל את ההזמנות.',
      'הפריט כבר מוכן, אז מבטל אותו רק מי שמנהל את ההזמנות.'),
    ('app.orders.failed.managersOnlyRestore',
      'המנה כבר מוכנה, אז מחזיר אותה רק מי שמנהל את ההזמנות.',
      'הפריט כבר מוכן, אז מחזיר אותו רק מי שמנהל את ההזמנות.'),
    ('app.orders.failed.takeaway',
      'הזמנה לקחת לא עוברת לשולחן.',
      'הזמנה בלי מקום לא עוברת למקום.'),
    ('app.orders.failed.moveTaken',
      '{place}: כבר יש שם הזמנה פתוחה. בוחרים שולחן אחר.',
      '{place}: כבר יש שם הזמנה פתוחה. בוחרים מקום אחר.'),
    ('app.orders.failed.reopenTaken',
      'השולחן תפוס עכשיו. פותחים מחדש כשהוא פנוי.',
      'המקום תפוס עכשיו. פותחים מחדש כשהוא פנוי.'),
    ('app.orders.close.place',
      'סגירת השולחן',
      'סגירת ההזמנה'),
    ('app.orders.close.held',
      'יש מנות שמחכות לקריאה. מוציאים אותן או מבטלים, ואז סוגרים.',
      'יש פריטים שמחכים לקריאה. מוציאים אותם או מבטלים, ואז סוגרים.'),
    ('app.orders.order.actions.move',
      'העברה לשולחן אחר',
      'העברה למקום אחר'),
    ('app.orders.order.actions.moveHint',
      'רק לשולחן פנוי',
      'רק למקום פנוי'),
    ('app.orders.order.actions.noFree',
      'אין עכשיו שולחן פנוי.',
      'אין עכשיו מקום פנוי.'),
    ('app.orders.move.subtitle',
      'בוחרים שולחן פנוי, וההזמנה עוברת אליו עם כל מה שנשלח.',
      'בוחרים מקום פנוי, וההזמנה עוברת אליו עם כל מה שנשלח.'),
    ('app.orders.cancelOrder.subtitle',
      '{count, plural, one {מנה אחת שעוד לא בוטלה מתבטלת ויורדת ממסך ההכנה} other {# מנות שעוד לא בוטלו מתבטלות ויורדות ממסך ההכנה}}. הזמנה שבוטלה לא נפתחת מחדש.',
      '{count, plural, one {פריט אחד שעוד לא בוטל מתבטל ויורד ממסך ההכנה} other {# פריטים שעוד לא בוטלו מתבטלים ויורדים ממסך ההכנה}}. הזמנה שבוטלה לא נפתחת מחדש.'),
    ('app.orders.till.byItem',
      'לפי מנה',
      'לפי פריט'),
    ('app.orders.till.noOrder.body',
      'חוזרים לשולחנות ובוחרים אותה משם.',
      'חוזרים למקומות ובוחרים אותה משם.'),
    ('app.orders.floor.closed.table.place',
      'שולחן',
      'מקום')
) as w (key, sentence, base_sentence)
where exists (select 1 from public.templates tt where tt.key = t.template_key)
on conflict (template_key, key) do nothing;

------------------------------------------------------------------------------
-- The close's "ביטול"

-- Takes a close back, as its toast's "ביטול" does: by whoever closed it and
-- within 2 minutes of the close (55000 hint 'window' for someone else's
-- close, or after that), the order opens again as reopen_order opens it,
-- and every ticket the close served goes back to where it was, in the same
-- transaction. The close served them all at one moment, by one person: the
-- tickets served at the order's closed_at by its closed_by are those, and
-- each goes back as serve_order_ticket's undo puts it, new when it was
-- served before it was ready, else ready. A ticket served before the close
-- stays served. The 2 minutes keep it the close's own undo (the toast
-- offers it for 8 seconds, stopping while it is reached), so nothing served
-- long ago goes back to the kitchen's screen: an older close opens again
-- with reopen_order, its tickets served. As reopen_order, by whoever takes
-- orders now or runs orders, the same business day only (55000 hint 'day'),
-- while the place is free (23505 hint 'taken', the open order's id as the
-- detail); 55000 hint 'not_closed' for a cancelled order, and one open
-- already is left as it is. It keeps who opened it again and when, as
-- reopen_order does.
create function public.undo_close_order(
  actor uuid,
  order_ref uuid,
  at_time timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_business uuid;
  the_order public.orders%rowtype;
  other_order uuid;
begin
  select o.business_id into row_business from public.orders o where o.id = order_ref;
  perform private.order_writer(row_business, actor);
  perform private.require_taker_or_runs(row_business, actor, at_time);

  perform 1 from public.businesses b where b.id = row_business for no key update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  select o.* into the_order from public.orders o where o.id = order_ref for update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  if the_order.status = 'open' then
    return;
  end if;
  if the_order.status <> 'closed' then
    raise exception 'A cancelled order stays cancelled' using errcode = '55000', hint = 'not_closed';
  end if;
  if the_order.closed_by is distinct from actor
    or at_time > the_order.closed_at + interval '2 minutes'
  then
    raise exception 'Only whoever closed it takes the close back, within 2 minutes'
      using errcode = '55000', hint = 'window';
  end if;
  if private.order_business_day(row_business, at_time) is distinct from the_order.day then
    raise exception 'Its business day is over' using errcode = '55000', hint = 'day';
  end if;
  if the_order.place_id is not null then
    select o.id into other_order
    from public.orders o
    where o.business_id = row_business
      and o.place_id = the_order.place_id
      and o.status = 'open';
    if other_order is not null then
      raise exception 'That place has an open order'
        using errcode = '23505', hint = 'taken', detail = other_order::text;
    end if;
  end if;

  update public.order_tickets t
  set status = case when t.served_new then 'new' else 'ready' end,
    ready_at = case when t.served_new then null else t.ready_at end,
    served_new = false,
    served_at = null,
    served_by = null
  where t.order_id = the_order.id
    and t.status = 'served'
    and t.served_at = the_order.closed_at
    and t.served_by = the_order.closed_by;
  update public.orders o
  set status = 'open', closed_at = null, closed_by = null, reopened_at = at_time, reopened_by = actor
  where o.id = the_order.id;
  perform private.bump_order_version(row_business);
end;
$$;

-- The server's alone, for `actor`, as reopen_order.
revoke execute on function public.undo_close_order(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.undo_close_order(uuid, uuid, timestamptz) to service_role;
