-- Taking orders: the menu on screen (P2 of waiter mode, issue #191; Orel's
-- decision of 20 November 2026 to build every phase). The screens and the
-- console's pages are in the app; the database needs four changes for them,
-- each one short, and nothing else moves:
--
--   the team       the ConceptApp team sets a business's menu up from the
--                  console (its import and its places), as it sets up its
--                  departments and lists: private.runs_orders holds for
--                  someone on the team too, as private.can_edit_settings
--                  does. "Sold out" stays the business's own: its function
--                  asks for an active membership first, so the team still
--                  gets P0002 there.
--   a category     public.set_menu_categories saves a category sent with
--   kept           its id and the department it has already, even when that
--                  department was removed since. Before, after a department
--                  its categories went to was removed, every later save of
--                  the categories (a rename, a move, a new one) was refused
--                  until all of them had a live department in one save. A
--                  new category, or one moved to another department, still
--                  goes to a live one (22023, hint 'route').
--   the demo       private.seed_demo_order_taking switches the module on
--                  when the demo business's definition says
--                  "orderTaking": true. The local seed's restaurant says so,
--                  for the browser tests; the hosted demo's doesn't, so it
--                  stays off there until Orel approves the screens. Nothing
--                  is reset here: on the hosted project the definitions are
--                  unchanged, and locally the seed resets after the
--                  migrations.
--   the words      the restaurant's and the café's own sentences for the
--                  module (template wording, 20261108000100_wording.sql):
--                  "מצב מלצרות" for its name, "מנה" for what is on the menu
--                  and "שולחן" for a place. No screen edits a template's
--                  sentences yet, so they come in here. Each keeps the
--                  app's sentence it was written against (base_sentence,
--                  messages/he.json; tooling/template-wording.test.ts keeps
--                  them the same), and a sentence the team wrote already is
--                  kept. A seed, as the demo's menu is: not logged.
--
-- It replaces, from their latest versions (all three
-- 20261117000500_order_taking_menu.sql's) and with only these changes:
-- private.runs_orders, public.set_menu_categories and
-- private.seed_demo_order_taking. Each keeps its signature, so its grants
-- stay; revoked and granted again all the same.

------------------------------------------------------------------------------
-- 1. The team runs the menu from the console

-- 20261117000500_order_taking_menu.sql's, with the team: `person` runs the
-- business's menu when they hold order_taking.edit (private.holds_perm: an
-- active owner always; on the staff, by their role's rule for it or by a
-- grant of their own), or are on the ConceptApp team, which sets a business
-- up. Its callers, unchanged, are every write to the menu and the places:
-- public.set_menu_categories (replaced below), public.save_menu_item,
-- public.archive_menu_item, public.restore_menu_item, public.import_menu,
-- public.set_order_places, and public.set_menu_item_available, which asks
-- for an active member first. The orders to come (P3) take a helper of their
-- own: the team takes no orders.
create or replace function private.runs_orders(business uuid, person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.holds_perm(business, person, 'order_taking.edit'::text)
    or exists (
      select 1 from public.platform_staff s where s.user_id = person
    )
$$;

------------------------------------------------------------------------------
-- 2. A category kept keeps its department

-- 20261117000500_order_taking_menu.sql's, with only its department check
-- changed, after the id's: a category sent with its id and the department it
-- has already passes, even when that department was removed since, so a
-- rename or a move saves while its items wait for a department.
--
-- Saves the business's categories, in order (`categories`: a list of
-- {id?, name, department}), as the departments are saved: one left out is
-- removed (archived), a removed one that comes back by its id is restored
-- (the undo), one with no id is added. 42501 for anyone who doesn't run the
-- menu, and while the module is off (hint 'off'); 54000 past 30; 22023 for a
-- department that isn't live in the business and isn't the category's own
-- (hint 'route') or any other shape; 23505 for a name twice; P0002 for an id
-- that isn't the business's. Logged as menu.categories with counts, when
-- anything changed. Returns the categories' ids, in order.
create or replace function public.set_menu_categories(
  actor uuid,
  business uuid,
  categories jsonb,
  at_time timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry jsonb;
  entry_id uuid;
  entry_name text;
  entry_department uuid;
  place integer := 0;
  ids uuid[] := '{}'::uuid[];
  before_live jsonb;
  added integer := 0;
  restored integer;
  archived integer;
  changed integer;
begin
  if not private.runs_orders(business, actor) then
    raise exception 'Those who run the menu only' using errcode = '42501';
  end if;
  perform 1 from public.businesses b where b.id = business for no key update;
  if not private.order_taking_on(business) then
    raise exception 'Taking orders is off for this business'
      using errcode = '42501', hint = 'off';
  end if;

  if jsonb_typeof(categories) is distinct from 'array' then
    raise exception 'Categories must be a list' using errcode = '22023';
  end if;
  if jsonb_array_length(categories) > 30 then
    raise exception 'A menu has at most 30 categories' using errcode = '54000';
  end if;
  for entry in select e.value from jsonb_array_elements(categories) as e (value)
  loop
    if jsonb_typeof(entry) <> 'object' then
      raise exception 'A category must be an object' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(entry) as k (field)
      where k.field not in ('id', 'name', 'department')
    ) then
      raise exception 'A category has an id, a name and a department' using errcode = '22023';
    end if;
    if private.json_text(entry -> 'name', 40, 'A category''s name') is null then
      raise exception 'A category needs a name' using errcode = '22023';
    end if;
    entry_id := private.json_uuid(entry -> 'id', 'A category');
    if entry_id is not null and not exists (
      select 1 from public.menu_categories c
      where c.id = entry_id and c.business_id = business
    ) then
      raise exception 'Unknown category' using errcode = 'P0002';
    end if;
    -- A live department, or the one the category has already, even removed
    -- since: a category saved as it was keeps going where it went.
    entry_department := private.json_uuid(entry -> 'department', 'A category''s department');
    if entry_department is null or (
      not exists (
        select 1 from public.departments d
        where d.id = entry_department and d.business_id = business and d.archived_at is null
      )
      and not exists (
        select 1 from public.menu_categories c
        where c.id = entry_id and c.business_id = business and c.department_id = entry_department
      )
    ) then
      raise exception 'A category goes to a department of the business'
        using errcode = '22023', hint = 'route';
    end if;
  end loop;
  if (
    select count(distinct e.value ->> 'id')
    from jsonb_array_elements(categories) as e (value)
    where e.value ? 'id' and jsonb_typeof(e.value -> 'id') <> 'null'
  ) <> (
    select count(*)
    from jsonb_array_elements(categories) as e (value)
    where e.value ? 'id' and jsonb_typeof(e.value -> 'id') <> 'null'
  ) then
    raise exception 'Each category once' using errcode = '22023';
  end if;
  if (
    select count(distinct lower(btrim(e.value ->> 'name')))
    from jsonb_array_elements(categories) as e (value)
  ) <> jsonb_array_length(categories) then
    raise exception 'Each category''s name once' using errcode = '23505';
  end if;

  -- What was live, each with its place among them, to count what changed.
  select coalesce(jsonb_object_agg(
      live.id::text,
      jsonb_build_object('name', live.name, 'department', live.department_id, 'position', live.ordinal)
    ), '{}'::jsonb)
  into before_live
  from (
    select c.id, c.name, c.department_id,
      (row_number() over (order by c.position, c.created_at, c.id) - 1)::integer as ordinal
    from public.menu_categories c
    where c.business_id = business and c.archived_at is null
  ) live;

  -- Everything live is archived first, so names can move between categories
  -- in one save; what stays is restored with its new name and place.
  update public.menu_categories c
  set archived_at = at_time
  where c.business_id = business and c.archived_at is null;

  for entry in select e.value from jsonb_array_elements(categories) as e (value)
  loop
    entry_id := private.json_uuid(entry -> 'id', 'A category');
    entry_name := private.json_text(entry -> 'name', 40, 'A category''s name');
    entry_department := private.json_uuid(entry -> 'department', 'A category''s department');
    if entry_id is null then
      insert into public.menu_categories (business_id, name, department_id, position, created_at)
      values (business, entry_name, entry_department, place::smallint, at_time)
      returning id into entry_id;
      added := added + 1;
    else
      update public.menu_categories c
      set name = entry_name,
        department_id = entry_department,
        position = place::smallint,
        archived_at = null
      where c.id = entry_id and c.business_id = business;
    end if;
    ids := ids || entry_id;
    place := place + 1;
  end loop;

  select count(*)::integer into restored
  from unnest(ids) as kept (id)
  where not (before_live ? kept.id::text);
  restored := restored - added;
  select count(*)::integer into archived
  from jsonb_object_keys(before_live) as was (id)
  where not (was.id::uuid = any (ids));
  select count(*)::integer into changed
  from public.menu_categories c
  where c.id = any (ids)
    and before_live ? c.id::text
    and (before_live -> c.id::text) is distinct from jsonb_build_object(
      'name', c.name, 'department', c.department_id, 'position', c.position::integer
    );

  if added + restored + archived + changed > 0 then
    perform private.bump_menu_version(business);
    insert into public.audit_log (business_id, actor_id, action, details, created_at)
    values (
      business, actor, 'menu.categories',
      jsonb_build_object(
        'added', added, 'restored', restored, 'archived', archived, 'changed', changed,
        'total', cardinality(ids)
      ),
      at_time
    );
  end if;
  return to_jsonb(ids);
end;
$$;

------------------------------------------------------------------------------
-- 3. The demo restaurant opens with taking orders on, where it says so

-- 20261117000500_order_taking_menu.sql's, with the module switched on first
-- when the business's definition says "orderTaking": true (supabase/seed.sql's
-- restaurant; tooling/demo-order-taking.test.ts keeps supabase/hosted-demo.sql
-- without it). public.reset_demo_business calls it last, after the template
-- put the module off, so every reset leaves it as the definition asks. Then,
-- as before:
--
-- What the demo restaurant starts with on its menu: four categories, the
-- kitchen's three and the bar's drinks, thirteen items with no choices (the
-- phase that has them seeds them), the fish of the day sold out, and twelve
-- tables. Only a demo business opened from the restaurant template, and only
-- once: a business that has categories already is left as it is. Straight
-- into the tables, as a seed, so the log starts empty of it.
create or replace function private.seed_demo_order_taking(business uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  kitchen uuid;
  bar uuid;
  starters uuid;
  mains uuid;
  desserts uuid;
  drinks uuid;
begin
  -- On first, when the business's definition says so: whatever comes next,
  -- the reset leaves the module as the definition asks.
  update public.business_modules bm
  set enabled = true
  from private.demo_businesses d
  where d.business_id = business
    and bm.business_id = business
    and bm.module_key = 'order_taking'::public.module_key
    and d.definition -> 'orderTaking' = 'true'::jsonb;

  if not exists (
      select 1
      from public.businesses b
      join private.demo_businesses d on d.business_id = b.id
      where b.id = business and b.template_key = 'restaurant'
    )
    or exists (select 1 from public.menu_categories c where c.business_id = business)
  then
    return;
  end if;
  select d.id into kitchen
  from public.departments d
  where d.business_id = business and d.key = 'kitchen' and d.archived_at is null;
  select d.id into bar
  from public.departments d
  where d.business_id = business and d.key = 'bar' and d.archived_at is null;
  if kitchen is null or bar is null then
    return;
  end if;

  insert into public.menu_categories (business_id, name, department_id, position)
  values (business, 'ראשונות', kitchen, 0)
  returning id into starters;
  insert into public.menu_categories (business_id, name, department_id, position)
  values (business, 'עיקריות', kitchen, 1)
  returning id into mains;
  insert into public.menu_categories (business_id, name, department_id, position)
  values (business, 'קינוחים', kitchen, 2)
  returning id into desserts;
  insert into public.menu_categories (business_id, name, department_id, position)
  values (business, 'שתייה', bar, 3)
  returning id into drinks;

  insert into public.menu_items (business_id, category_id, name, price_agorot, position)
  values
    (business, starters, 'פוקאצ''ה', 2800, 0),
    (business, starters, 'סלט ירוק', 3600, 1),
    (business, starters, 'חומוס', 3200, 2),
    (business, mains, 'שניצל', 6200, 0),
    (business, mains, 'המבורגר', 6800, 1),
    (business, mains, 'פסטה', 5800, 2),
    (business, desserts, 'מלבי', 2600, 0),
    (business, desserts, 'עוגת שוקולד', 3200, 1),
    (business, drinks, 'לימונדה', 1600, 0),
    (business, drinks, 'מים', 1000, 1),
    (business, drinks, 'קפה', 1200, 2),
    (business, drinks, 'בירה מהחבית', 2800, 3);
  -- Sold out, so the demo shows it.
  insert into public.menu_items (
    business_id, category_id, name, price_agorot, position, available, available_changed_at
  )
  values (business, mains, 'דג היום', 8400, 3, false, now());

  insert into public.order_places (business_id, name, position)
  select business, n::text, (n - 1)::smallint
  from generate_series(1, 12) as n;

  perform private.bump_menu_version(business);
end;
$$;

------------------------------------------------------------------------------
-- 4. The restaurant's and the café's words

-- Both templates the same sentences: "מנה" for anything on the menu, drinks
-- too, and "שולחן" for a place (Orel, 20 November 2026, the design's §16).
-- Only where the app's sentence says "פריט" or "מקום", or names the module.
insert into public.template_wording (template_key, key, sentence, base_sentence)
select t.template_key, w.key, w.sentence, w.base_sentence
from (values ('restaurant'), ('cafe-bar')) as t (template_key)
cross join (
  values
    ('modules.order_taking.name',
      'מצב מלצרות',
      'קבלת הזמנות'),
    ('modules.order_taking.description',
      'קבלת הזמנות ושליחה למטבח ולבר',
      'קבלת הזמנות ושליחה להכנה'),
    ('app.orders.menu.status.items',
      '{count, plural, one {מנה אחת} other {# מנות}}',
      '{count, plural, one {פריט אחד} other {# פריטים}}'),
    ('app.orders.menu.status.soldOut',
      '{count, plural, one {אחת נגמרה} other {# נגמרו}}',
      '{count, plural, one {אחד נגמר} other {# נגמרו}}'),
    ('app.orders.menu.status.noRoute',
      '{count, plural, one {מנה אחת בלי מחלקה} other {# מנות בלי מחלקה}}',
      '{count, plural, one {פריט אחד בלי מחלקה} other {# פריטים בלי מחלקה}}'),
    ('app.orders.menu.add',
      'הוספת מנה',
      'הוספת פריט'),
    ('app.orders.menu.readOnly.department',
      'את התפריט משנה מי שמנהל אותו. מסמנים "נגמר" למנות שמכינים במחלקה שלך.',
      'את התפריט משנה מי שמנהל אותו. מסמנים "נגמר" לפריטים שמכינים במחלקה שלך.'),
    ('app.orders.menu.empty.body',
      'מוסיפים מנות אחת אחת, או מעתיקים תפריט קיים מהאתר, מקובץ PDF או מהקופה.',
      'מוסיפים פריטים אחד אחד, או מעתיקים תפריט קיים מהאתר, מקובץ PDF או מהקופה.'),
    ('app.orders.menu.emptyCategory',
      'עוד אין כאן מנות.',
      'עוד אין כאן פריטים.'),
    ('app.orders.menu.categoryLine',
      '{department} · {count, plural, =0 {אין מנות} one {מנה אחת} other {# מנות}}',
      '{department} · {count, plural, =0 {אין פריטים} one {פריט אחד} other {# פריטים}}'),
    ('app.orders.menu.placesRow',
      'השולחנות',
      'המקומות'),
    ('app.orders.menu.placesCount',
      '{count, plural, =0 {עוד אין שולחנות} one {שולחן אחד} other {# שולחנות}}',
      '{count, plural, =0 {עוד אין מקומות} one {מקום אחד} other {# מקומות}}'),
    ('app.orders.menu.columns.name',
      'מנה',
      'פריט'),
    ('app.orders.menu.sheet.newTitle',
      'מנה חדשה',
      'פריט חדש'),
    ('app.orders.menu.sheet.name',
      'שם המנה',
      'שם הפריט'),
    ('app.orders.menu.sheet.nameMissing',
      'כותבים את שם המנה, עד 60 תווים.',
      'כותבים את שם הפריט, עד 60 תווים.'),
    ('app.orders.menu.toast.soldOut',
      'סומנה שנגמרה: {name}',
      'סומן שנגמר: {name}'),
    ('app.orders.menu.toast.available',
      'חזרה לתפריט: {name}',
      'חזר לתפריט: {name}'),
    ('app.orders.menu.toast.added',
      'נוספה לתפריט: {name}',
      'נוסף לתפריט: {name}'),
    ('app.orders.menu.toast.saved',
      'נשמרה: {name}',
      'נשמר: {name}'),
    ('app.orders.menu.toast.removed',
      'הוסרה מהתפריט: {name}',
      'הוסר מהתפריט: {name}'),
    ('app.orders.menu.failed.off',
      'מצב מלצרות כבוי בעסק הזה.',
      'קבלת הזמנות כבויה בעסק הזה.'),
    ('app.orders.menu.failed.gone',
      'המנה כבר לא בתפריט.',
      'הפריט כבר לא בתפריט.'),
    ('app.orders.menu.failed.choices',
      'הבחירות של המנה לא נשמרו כמו שהן.',
      'הבחירות של הפריט לא נשמרו כמו שהן.'),
    ('app.orders.menu.failed.changed',
      'מישהו שינה את המנה בינתיים. זה מה שיש בה עכשיו.',
      'מישהו שינה את הפריט בינתיים. זה מה שיש בו עכשיו.'),
    ('app.orders.menu.failed.tooMany',
      'בתפריט כבר יש כמה שאפשר: עד 300 מנות ו-30 קטגוריות.',
      'בתפריט כבר יש כמה שאפשר: עד 300 פריטים ו-30 קטגוריות.'),
    ('app.orders.menu.failed.archived',
      'המנה הוסרה מהתפריט. מחזירים אותה קודם.',
      'הפריט הוסר מהתפריט. מחזירים אותו קודם.'),
    ('app.orders.menu.failed.categoryRemoved',
      'הקטגוריה של המנה הוסרה. מחזירים אותה קודם.',
      'הקטגוריה של הפריט הוסרה. מחזירים אותה קודם.'),
    ('app.orders.categories.count',
      '{count, plural, =0 {אין מנות} one {מנה אחת} other {# מנות}}',
      '{count, plural, =0 {אין פריטים} one {פריט אחד} other {# פריטים}}'),
    ('app.orders.categories.removed',
      '{count, plural, =0 {הקטגוריה {name} הוסרה} one {הקטגוריה {name} הוסרה, עם מנה אחת} other {הקטגוריה {name} הוסרה, עם # מנות}}',
      '{count, plural, =0 {הקטגוריה {name} הוסרה} one {הקטגוריה {name} הוסרה, עם פריט אחד} other {הקטגוריה {name} הוסרה, עם # פריטים}}'),
    ('app.orders.categories.itemsEmpty',
      'עוד אין כאן מנות. מוסיפים אותן במסך התפריט.',
      'עוד אין כאן פריטים. מוסיפים אותם במסך התפריט.'),
    ('app.orders.places.title',
      'השולחנות',
      'המקומות'),
    ('app.orders.places.subtitle',
      'השולחנות שמקבלים אליהם הזמנות. אפשר לקרוא להם בשם, כמו "בר 3" או "מרפסת 2". הסדר כאן הוא הסדר במסך.',
      'המקומות שמקבלים אליהם הזמנות: שולחנות, מקומות ליד הבר או חדרים. הסדר כאן הוא הסדר במסך.'),
    ('app.orders.places.quick.title',
      'כמה שולחנות יש',
      'כמה מקומות יש'),
    ('app.orders.places.quick.action',
      '{count, plural, one {יצירת שולחן אחד} other {יצירת # שולחנות}}',
      '{count, plural, one {יצירת מקום אחד} other {יצירת # מקומות}}'),
    ('app.orders.places.nameOf',
      'שם השולחן {name}',
      'שם המקום {name}'),
    ('app.orders.places.newName',
      'שולחן חדש',
      'מקום חדש'),
    ('app.orders.places.add',
      'הוספת שולחן',
      'הוספת מקום'),
    ('app.orders.places.removed',
      'השולחן {name} הוסר',
      'המקום {name} הוסר'),
    ('app.orders.places.taken',
      'כבר יש שולחן בשם {name}.',
      'כבר יש מקום בשם {name}.'),
    ('app.orders.places.max',
      'אפשר עד 60 שולחנות.',
      'אפשר עד 60 מקומות.'),
    ('app.orders.places.empty',
      'עוד אין שולחנות.',
      'עוד אין מקומות.'),
    ('app.orders.import.existing',
      'בתפריט כבר יש {items, plural, one {מנה אחת} other {# מנות}} ב{categories, plural, one {קטגוריה אחת} other {-# קטגוריות}}. מה שמדביקים נוסף אליהן.',
      'בתפריט כבר יש {items, plural, one {פריט אחד} other {# פריטים}} ב{categories, plural, one {קטגוריה אחת} other {-# קטגוריות}}. מה שמדביקים נוסף אליהם.'),
    ('app.orders.import.hint',
      'שורה עם מחיר בסוף היא מנה. שורה בלי מחיר היא קטגוריה לשורות שאחריה. שני מחירים עם / הם שני גדלים, ושורה שמתחילה ב-+ היא תוספת למנה שמעליה.',
      'שורה עם מחיר בסוף היא פריט. שורה בלי מחיר היא קטגוריה לשורות שאחריה. שני מחירים עם / הם שני גדלים, ושורה שמתחילה ב-+ היא תוספת לפריט שמעליה.'),
    ('app.orders.import.counts',
      '{items, plural, one {מנה אחת} other {# מנות}} · {categories, plural, one {קטגוריה אחת} other {# קטגוריות}} · {problems, plural, =0 {אין שורות לתיקון} one {שורה אחת לתיקון} other {# שורות לתיקון}}',
      '{items, plural, one {פריט אחד} other {# פריטים}} · {categories, plural, one {קטגוריה אחת} other {# קטגוריות}} · {problems, plural, =0 {אין שורות לתיקון} one {שורה אחת לתיקון} other {# שורות לתיקון}}'),
    ('app.orders.import.line.item',
      'מנה · <ltr>{price}</ltr>',
      'פריט · <ltr>{price}</ltr>'),
    ('app.orders.import.line.extra',
      'תוספת למנה שמעליה · <ltr>+{price}</ltr>',
      'תוספת לפריט שמעליה · <ltr>+{price}</ltr>'),
    ('app.orders.import.line.known',
      'כבר בתפריט, לא נכנסת שוב',
      'כבר בתפריט, לא נכנס שוב'),
    ('app.orders.import.problem.noItem',
      'תוספת בלי מנה מעליה',
      'תוספת בלי פריט מעליה'),
    ('app.orders.import.problem.tooManyExtras',
      'יותר מדי תוספות למנה אחת',
      'יותר מדי תוספות לפריט אחד'),
    ('app.orders.import.tooMany',
      'עם ההדבקה הזאת יהיו בתפריט יותר מ-300 מנות או 30 קטגוריות. מקצרים אותה.',
      'עם ההדבקה הזאת יהיו בתפריט יותר מ-300 פריטים או 30 קטגוריות. מקצרים אותה.'),
    ('app.orders.import.action',
      '{count, plural, one {הוספת מנה אחת לתפריט} other {הוספת # מנות לתפריט}}',
      '{count, plural, one {הוספת פריט אחד לתפריט} other {הוספת # פריטים לתפריט}}'),
    ('app.orders.import.done',
      '{items, plural, one {נוספה לתפריט מנה אחת} other {נוספו לתפריט # מנות}}{categories, plural, =0 {} one { וקטגוריה חדשה אחת} other { ו-# קטגוריות חדשות}}',
      '{items, plural, one {נוסף לתפריט פריט אחד} other {נוספו לתפריט # פריטים}}{categories, plural, =0 {} one { וקטגוריה חדשה אחת} other { ו-# קטגוריות חדשות}}'),
    ('app.manage.roles.editHint.order_taking',
      'בלי עריכה רואים את התפריט, ומסמנים "נגמר" למנות שהמחלקה שלהם מכינה. עם עריכה גם עורכים את התפריט, את המחירים ואת השולחנות, ומסמנים "נגמר" לכל מנה.',
      'בלי עריכה רואים את התפריט, ומסמנים "נגמר" לפריטים שהמחלקה שלהם מכינה. עם עריכה גם עורכים את התפריט, את המחירים ואת המקומות, ומסמנים "נגמר" לכל פריט.'),
    ('app.manage.activity.actions.menu.itemCreate',
      'הוספת המנה {name} לתפריט',
      'הוספת הפריט {name} לתפריט'),
    ('app.manage.activity.actions.menu.itemSave',
      'שינוי במנה {name}',
      'שינוי בפריט {name}'),
    ('app.manage.activity.actions.menu.itemArchive',
      'הסרת המנה {name} מהתפריט',
      'הסרת הפריט {name} מהתפריט'),
    ('app.manage.activity.actions.menu.itemRestore',
      'החזרת המנה {name} לתפריט',
      'החזרת הפריט {name} לתפריט'),
    ('app.manage.activity.actions.menu.import',
      '{count, plural, one {יבוא מנה אחת לתפריט} other {יבוא # מנות לתפריט}}',
      '{count, plural, one {יבוא פריט אחד לתפריט} other {יבוא # פריטים לתפריט}}'),
    ('app.manage.activity.actions.menu.places.title',
      'שינוי בשולחנות',
      'שינוי במקומות'),
    ('app.manage.activity.actions.menu.places.added',
      '{count, plural, one {שולחן אחד נוסף} other {# שולחנות נוספו}}',
      '{count, plural, one {מקום אחד נוסף} other {# מקומות נוספו}}'),
    ('app.manage.activity.actions.menu.places.archived',
      '{count, plural, one {שולחן אחד הוסר} other {# שולחנות הוסרו}}',
      '{count, plural, one {מקום אחד הוסר} other {# מקומות הוסרו}}'),
    ('app.manage.activity.actions.menu.places.restored',
      '{count, plural, one {שולחן אחד חזר} other {# שולחנות חזרו}}',
      '{count, plural, one {מקום אחד חזר} other {# מקומות חזרו}}'),
    ('app.manage.activity.actions.menu.places.changed',
      '{count, plural, one {שולחן אחד שונה} other {# שולחנות שונו}}',
      '{count, plural, one {מקום אחד שונה} other {# מקומות שונו}}'),
    ('app.manage.departments.menuItems',
      '{count, plural, one {מכינים כאן מנה אחת מהתפריט} other {מכינים כאן # מנות מהתפריט}}',
      '{count, plural, one {מכינים כאן פריט אחד מהתפריט} other {מכינים כאן # פריטים מהתפריט}}'),
    ('app.manage.departments.removedMenu',
      '{count, plural, one {המחלקה {name} הוסרה. מנה אחת מהתפריט לא מגיעה עכשיו להכנה, עד שבוחרים לה מחלקה.} other {המחלקה {name} הוסרה. # מנות מהתפריט לא מגיעות עכשיו להכנה, עד שבוחרים להן מחלקה.}}',
      '{count, plural, one {המחלקה {name} הוסרה. פריט אחד מהתפריט לא מגיע עכשיו להכנה, עד שבוחרים לו מחלקה.} other {המחלקה {name} הוסרה. # פריטים מהתפריט לא מגיעים עכשיו להכנה, עד שבוחרים להם מחלקה.}}')
) as w (key, sentence, base_sentence)
on conflict (template_key, key) do nothing;

------------------------------------------------------------------------------
-- Who may call what

-- Replaced in place, the same signatures: their grants stay as their first
-- migration set them; revoked and granted again all the same.
revoke execute on function private.runs_orders(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.seed_demo_order_taking(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.set_menu_categories(uuid, uuid, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.set_menu_categories(uuid, uuid, jsonb, timestamptz)
  to service_role;
