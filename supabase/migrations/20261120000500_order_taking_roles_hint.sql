-- Taking orders P3 (#191): the roles screen's hint for the area says what the
-- orders add (taking orders in a department that takes them, cancelling a line
-- not yet ready, "ready" for one's own department; with the key, any
-- department, a ready line, on the house). P2 (20261120000100) stored the
-- restaurant's and café's own sentence for that hint with the earlier base, so
-- the pair is written again here in the templates' words ("מנה", "שולחן").
-- Only where the team hasn't written its own sentence since: a row whose
-- sentence is still P2's takes the new pair; one the team changed keeps its
-- sentence and its base, so the console shows the app's sentence moved on.

insert into public.template_wording (template_key, key, sentence, base_sentence)
select t.template_key, w.key, w.sentence, w.base_sentence
from (values ('restaurant'), ('cafe-bar')) as t (template_key)
cross join (
  values
    ('app.manage.roles.editHint.order_taking',
      'בלי עריכה רואים את התפריט, מקבלים הזמנות אם הם במחלקה שמקבלת הזמנות, מבטלים מנה שעוד לא מוכנה ומסמנים "מוכן" ו"נגמר" למה שהמחלקה שלהם מכינה. עם עריכה גם מקבלים הזמנות מכל מחלקה, מבטלים מנה מוכנה, נותנים על חשבון הבית ועורכים את התפריט, המחירים והשולחנות.',
      'בלי עריכה רואים את התפריט, מקבלים הזמנות אם הם במחלקה שמקבלת הזמנות, מבטלים פריט שעוד לא מוכן ומסמנים "מוכן" ו"נגמר" למה שהמחלקה שלהם מכינה. עם עריכה גם מקבלים הזמנות מכל מחלקה, מבטלים פריט מוכן, נותנים על חשבון הבית ועורכים את התפריט, המחירים והמקומות.')
) as w (key, sentence, base_sentence)
where exists (select 1 from public.templates tt where tt.key = t.template_key)
on conflict (template_key, key) do update
  set sentence = excluded.sentence,
      base_sentence = excluded.base_sentence,
      updated_at = now()
  where public.template_wording.sentence = 'בלי עריכה רואים את התפריט, ומסמנים "נגמר" למנות שהמחלקה שלהם מכינה. עם עריכה גם עורכים את התפריט, את המחירים ואת השולחנות, ומסמנים "נגמר" לכל מנה.';
