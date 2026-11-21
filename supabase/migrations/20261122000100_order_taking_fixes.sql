-- Taking orders: the fixes and the till, on screen (waiter mode P5, #191).
--
-- Only the restaurant's and the café's own sentences for P5's screens: the
-- line's sheet ("ביטול המנה"), closing ("סגירת השולחן"), moving ("העברה
-- לשולחן אחר"), cancelling an order, the till ("לפי מנה") and "נסגרו היום".
-- The screens read what P3 and P4 wrote already: every write and its undo
-- is in 20261120000300_order_taking_orders.sql, and today's closed orders
-- and fixes in `public.order_floor` (20261121000100_order_taking_mode.sql).
-- No function, table, grant or type changes here, so
-- packages/db/database.types.ts stays as it is.

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
