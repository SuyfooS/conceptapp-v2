-- Taking orders, P4 of waiter mode (issue #191; Orel's decisions of 20
-- November 2026): the orders on screen. P3's reads stay as they are but for
-- two keys; one read is new, and the restaurant's and café's words come with
-- the screens. The module stays off everywhere but the local seed's demo
-- restaurant, and the hosted demo's until Orel approves the screens.
--
--   the mode    public.order_mode: where the signed-in person stands in the
--               mode, for the frame that draws its items, Home's card and
--               the clock's and the profile's rows, on every screen of the
--               app while the module is on. It writes nothing and locks
--               nothing (public.order_prep marks what its reader saw, so
--               Home must never call that one), and never refuses: null
--               while the module is off and for anyone neither on the staff
--               nor viewing as a role on it (an accountant), so the frame's
--               read never throws. It says whether they take orders (clock
--               aside: private.order_taker_refusal), whether they run them,
--               the clock's refusal for a taker off a shift, the live
--               departments they prepare for that an item of the menu goes
--               to, their own tickets of today ready and still being made,
--               what waits in their departments, and how many items are sold
--               out. Counts only: no person, no item's name, no price.
--   mine        public.order_mine's tickets carry their lines, as the
--               kitchen's read gives them (no price), so "ההזמנות שלי" says
--               what to carry where. `lines`, the live count, stays.
--   the floor   public.order_floor carries every ticket ready to serve of an
--               open order, with its live lines (no price), oldest first: the
--               floor's "מוכן להגשה", one shared floor for every waiter.
--   the words   the restaurant's and the café's own sentences for the mode's
--               screens ("שולחן", "מנה", "לקחת", "מצב מלצרות"), where the
--               team hasn't written its own.
--
-- Both replaced functions are 20261120000300_order_taking_orders.sql's, the
-- same signatures, with one key added each and nothing else changed; their
-- grants are set again all the same. Errors are P3's: the new read raises
-- none of its own.

------------------------------------------------------------------------------
-- 1. Where the reader stands in the mode

-- The signed-in person's place in the mode of `business`, or null while the
-- module is off and for anyone neither active on its staff nor viewing as a
-- role on it. For someone on the staff: `takes` unless
-- private.order_taker_refusal says 'not_taker' (owners always), `runs` as
-- private.runs_orders, `clock` the refusal's 'clock' or 'stale_shift' for a
-- taker off a shift (managers too: they read and serve off a shift, and send
-- on one), `departments` the live ones they are in (every live one when they
-- run orders) that a live item of a live category goes to, as
-- private.line_route sends it, and `ready` and `making` their own tickets of
-- today's business day of open orders, with a line still live, ready or at
-- their department. For a view as a role on the staff: it takes and reads
-- everything, runs as the viewed role holds order_taking.edit, every routed
-- department, and nothing of its own. `waiting` the new tickets of open
-- orders with a live line in each of those departments, and `soldOut` the
-- live items marked sold out. Never a moment the caller picks: now.
create function public.order_mode(business uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  reader uuid := (select auth.uid());
  is_viewing boolean := false;
  reads_all boolean;
  taker_refusal text;
  own uuid[];
  current_version bigint;
  today date;
begin
  if not private.order_taking_on(business) then
    return null;
  end if;
  if exists (
    select 1 from public.memberships m
    where m.business_id = business
      and m.user_id = reader
      and m.active
      and private.is_staff_role(m.role)
  ) then
    reads_all := private.runs_orders(business, reader);
    taker_refusal := private.order_taker_refusal(business, reader, now());
  elsif private.is_viewing_staff(business) then
    is_viewing := true;
    reads_all := exists (
      select 1 from private.viewed_perms() v
      where v.business_id = business and v.perm = 'order_taking.edit'
    );
  else
    return null;
  end if;

  select coalesce(array_agg(d.id order by d.position, d.key), '{}'::uuid[]) into own
  from public.departments d
  where d.business_id = business
    and d.archived_at is null
    and (is_viewing or reads_all or private.in_department(d.id, reader))
    -- As private.line_route has it: the item's own department, else its
    -- category's; d is live.
    and exists (
      select 1
      from public.menu_items i
      join public.menu_categories c on c.id = i.category_id and c.business_id = i.business_id
      where i.business_id = business
        and i.archived_at is null
        and c.archived_at is null
        and coalesce(i.department_id, c.department_id) = d.id
    );

  select v.version into current_version
  from private.order_versions v
  where v.business_id = business;
  today := private.order_business_day(business, now());

  return jsonb_build_object(
    'version', coalesce(current_version, 0),
    'takes', is_viewing or taker_refusal is distinct from 'not_taker',
    'runs', reads_all,
    'viewing', is_viewing,
    'clock', case
      when not is_viewing and taker_refusal in ('clock', 'stale_shift') then taker_refusal
    end,
    'departments', to_jsonb(own),
    'ready', case
      when is_viewing then 0
      else (
        select count(*)
        from public.order_tickets t
        join public.order_rounds r on r.id = t.round_id and r.business_id = t.business_id
        join public.orders o on o.id = t.order_id and o.business_id = t.business_id
        where t.business_id = business
          and r.sent_by = reader
          and t.status = 'ready'
          and o.status = 'open'
          and private.order_business_day(business, r.sent_at) = today
          and exists (
            select 1 from public.order_lines l
            where l.ticket_id = t.id and l.taken_back_at is null and l.cancelled_at is null
          )
      )
    end,
    'making', case
      when is_viewing then 0
      else (
        select count(*)
        from public.order_tickets t
        join public.order_rounds r on r.id = t.round_id and r.business_id = t.business_id
        join public.orders o on o.id = t.order_id and o.business_id = t.business_id
        where t.business_id = business
          and r.sent_by = reader
          and t.status = 'new'
          and o.status = 'open'
          and private.order_business_day(business, r.sent_at) = today
          and exists (
            select 1 from public.order_lines l
            where l.ticket_id = t.id and l.taken_back_at is null and l.cancelled_at is null
          )
      )
    end,
    'waiting', (
      select coalesce(jsonb_agg(
        jsonb_build_object('department', w.department_id, 'count', w.tickets)
        order by w.place_of, w.key_of
      ), '[]'::jsonb)
      from (
        select d.id as department_id, d.position as place_of, d.key as key_of,
          count(*) as tickets
        from public.order_tickets t
        join public.orders o on o.id = t.order_id and o.business_id = t.business_id
        join public.departments d on d.id = t.department_id and d.business_id = t.business_id
        where t.business_id = business
          and t.status = 'new'
          and o.status = 'open'
          and t.department_id = any (own)
          and exists (
            select 1 from public.order_lines l
            where l.ticket_id = t.id and l.taken_back_at is null and l.cancelled_at is null
          )
        group by d.id, d.position, d.key
      ) w
    ),
    'soldOut', (
      select count(*)
      from public.menu_items i
      join public.menu_categories c on c.id = i.category_id and c.business_id = i.business_id
      where i.business_id = business
        and i.archived_at is null
        and c.archived_at is null
        and not i.available
    )
  );
end;
$$;

------------------------------------------------------------------------------
-- 2. One's own rounds, with their lines

-- 20261120000300_order_taking_orders.sql's, with `items` on each ticket:
-- its lines as public.order_prep gives them (name, choices by name,
-- quantity, note, allergy, and whether still live), never a price. Nothing
-- else changed; `lines` stays the live count. Its caller is getMyOrders in
-- @db/orders, for "ההזמנות שלי" and the mode's sync.
create or replace function public.order_mine(business uuid, known_version bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  access text := private.order_access(business);
  reader uuid := (select auth.uid());
  current_version bigint;
  today date := private.order_business_day(business, now());
begin
  select v.version into current_version
  from private.order_versions v
  where v.business_id = business;
  current_version := coalesce(current_version, 0);
  if known_version = current_version then
    return null;
  end if;

  return jsonb_build_object(
    'version', current_version,
    'now', now(),
    'day', today,
    'rounds', case
      when access in ('view', 'view_runs') then '[]'::jsonb
      else (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'order', o.id,
            'placeName', p.name,
            'takeaway', o.takeaway_no,
            'orderStatus', o.status,
            'sentAt', r.sent_at,
            'tickets', (
              select coalesce(jsonb_agg(
                jsonb_build_object(
                  'id', t.id,
                  'department', t.department_id,
                  'status', t.status,
                  'held', t.held,
                  'kitchenSeenAt', t.kitchen_seen_at,
                  'readyAt', t.ready_at,
                  'servedAt', t.served_at,
                  'lines', (
                    select count(*) from public.order_lines l
                    where l.ticket_id = t.id
                      and l.taken_back_at is null
                      and l.cancelled_at is null
                  ),
                  'items', (
                    select coalesce(jsonb_agg(
                      jsonb_build_object(
                        'id', l.id,
                        'name', l.name,
                        'choices', (
                          select coalesce(jsonb_agg(c.value -> 'optionName' order by c.n), '[]'::jsonb)
                          from jsonb_array_elements(l.choices) with ordinality as c (value, n)
                        ),
                        'quantity', l.quantity,
                        'note', l.note,
                        'allergy', l.allergy,
                        'state', case
                          when l.taken_back_at is not null then 'takenBack'
                          when l.cancelled_at is not null then 'cancelled'
                          else 'live'
                        end
                      )
                      order by l.position, l.id
                    ), '[]'::jsonb)
                    from public.order_lines l
                    where l.ticket_id = t.id and l.business_id = t.business_id
                  )
                )
                order by t.position, t.id
              ), '[]'::jsonb)
              from public.order_tickets t
              where t.round_id = r.id and t.business_id = r.business_id
            )
          )
          order by w.has_ready desc, r.sent_at desc, r.id
        ), '[]'::jsonb)
        from public.order_rounds r
        join public.orders o on o.id = r.order_id and o.business_id = r.business_id
        left join public.order_places p on p.id = o.place_id and p.business_id = o.business_id
        cross join lateral (
          select exists (
            select 1 from public.order_tickets t
            where t.round_id = r.id and t.business_id = r.business_id and t.status = 'ready'
          ) as has_ready
        ) w
        where r.business_id = business
          and r.sent_by = reader
          and private.order_business_day(business, r.sent_at) = today
      )
    end
  );
end;
$$;

------------------------------------------------------------------------------
-- 3. The floor, with what is ready to serve

-- 20261120000300_order_taking_orders.sql's, with `ready`: every ticket ready
-- to serve of an open order that has a line still live, oldest ready first,
-- with its order, department, place or takeaway number, when it was made
-- ready, who sent it (on an order of today's business day only) and its live
-- lines, never a price. One shared floor, as S0 drew it: every waiter's.
-- Nothing else changed. Its caller is getOrderFloor in @db/orders, for the
-- floor and the mode's sync.
create or replace function public.order_floor(business uuid, known_version bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  access text := private.order_access(business);
  current_version bigint;
  today date := private.order_business_day(business, now());
begin
  select v.version into current_version
  from private.order_versions v
  where v.business_id = business;
  current_version := coalesce(current_version, 0);
  if known_version = current_version then
    return null;
  end if;

  return jsonb_build_object(
    'version', current_version,
    'now', now(),
    'day', today,
    'runs', access in ('runs', 'view_runs'),
    'orders', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'place', o.place_id,
          'placeName', p.name,
          'takeaway', o.takeaway_no,
          'label', o.takeaway_label,
          'openedAt', o.opened_at,
          'openedBy', case when o.day = today then o.opened_by end,
          'movedAt', o.moved_at,
          'lastSentAt', (
            select max(r.sent_at) from public.order_rounds r
            where r.order_id = o.id and r.business_id = o.business_id
          ),
          'rounds', (
            select count(*) from public.order_rounds r
            where r.order_id = o.id and r.business_id = o.business_id
          ),
          'tickets', (
            select jsonb_build_object(
              'held', count(*) filter (where t.status = 'held'),
              'new', count(*) filter (where t.status = 'new'),
              'ready', count(*) filter (where t.status = 'ready'),
              'served', count(*) filter (where t.status = 'served')
            )
            from public.order_tickets t
            where t.order_id = o.id
              and t.business_id = o.business_id
              and exists (
                select 1 from public.order_lines l
                where l.ticket_id = t.id and l.taken_back_at is null and l.cancelled_at is null
              )
          ),
          'waitingSince', (
            select min(coalesce(t.fired_at, r.sent_at))
            from public.order_tickets t
            join public.order_rounds r on r.id = t.round_id and r.business_id = t.business_id
            where t.order_id = o.id
              and t.business_id = o.business_id
              and t.status = 'new'
              and exists (
                select 1 from public.order_lines l
                where l.ticket_id = t.id and l.taken_back_at is null and l.cancelled_at is null
              )
          ),
          'unseen', exists (
            select 1 from public.order_tickets t
            where t.order_id = o.id
              and t.business_id = o.business_id
              and t.status = 'new'
              and t.kitchen_seen_at is null
              and exists (
                select 1 from public.order_lines l
                where l.ticket_id = t.id and l.taken_back_at is null and l.cancelled_at is null
              )
          )
        )
        order by o.opened_at, o.id
      ), '[]'::jsonb)
      from public.orders o
      left join public.order_places p on p.id = o.place_id and p.business_id = o.business_id
      where o.business_id = business and o.status = 'open'
    ),
    'ready', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'ticket', t.id,
          'order', o.id,
          'department', t.department_id,
          'placeName', p.name,
          'takeaway', o.takeaway_no,
          'readyAt', t.ready_at,
          'sentBy', case when o.day = today then r.sent_by end,
          'lines', (
            select coalesce(jsonb_agg(
              jsonb_build_object(
                'id', l.id,
                'name', l.name,
                'choices', (
                  select coalesce(jsonb_agg(c.value -> 'optionName' order by c.n), '[]'::jsonb)
                  from jsonb_array_elements(l.choices) with ordinality as c (value, n)
                ),
                'quantity', l.quantity,
                'note', l.note,
                'allergy', l.allergy
              )
              order by l.position, l.id
            ), '[]'::jsonb)
            from public.order_lines l
            where l.ticket_id = t.id
              and l.business_id = t.business_id
              and l.taken_back_at is null
              and l.cancelled_at is null
          )
        )
        order by t.ready_at, t.id
      ), '[]'::jsonb)
      from public.order_tickets t
      join public.order_rounds r on r.id = t.round_id and r.business_id = t.business_id
      join public.orders o on o.id = t.order_id and o.business_id = t.business_id
      left join public.order_places p on p.id = o.place_id and p.business_id = o.business_id
      where t.business_id = business
        and t.status = 'ready'
        and o.status = 'open'
        and exists (
          select 1 from public.order_lines l
          where l.ticket_id = t.id and l.taken_back_at is null and l.cancelled_at is null
        )
    ),
    'closed', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'placeName', p.name,
          'takeaway', o.takeaway_no,
          'status', o.status,
          'closedAt', coalesce(o.closed_at, o.cancelled_at)
        )
        order by coalesce(o.closed_at, o.cancelled_at) desc, o.id
      ), '[]'::jsonb)
      from public.orders o
      left join public.order_places p on p.id = o.place_id and p.business_id = o.business_id
      where o.business_id = business and o.status <> 'open' and o.day = today
    ),
    'fixes', case
      when access in ('runs', 'view_runs') then (
        select jsonb_build_object(
          'takenBack', count(*) filter (where l.taken_back_at is not null),
          'cancelled', count(*) filter (where l.cancelled_at is not null),
          'comped', count(*) filter (where l.comped_at is not null)
        )
        from public.order_lines l
        join public.order_tickets t on t.id = l.ticket_id and t.business_id = l.business_id
        join public.orders o on o.id = t.order_id and o.business_id = t.business_id
        where o.business_id = business and o.day = today
      )
    end
  );
end;
$$;

------------------------------------------------------------------------------
-- 4. The restaurant's and the café's words

-- Both templates the same sentences, as P2's (20261120000100): "שולחן" for a
-- place, "מנה" for an item, "לקחת" for an order with no place, and the
-- module's own name. Only where the app's sentence says "מקום", "פריט" or
-- "בלי מקום", or names the module; and only where nothing is stored yet.
insert into public.template_wording (template_key, key, sentence, base_sentence)
select t.template_key, w.key, w.sentence, w.base_sentence
from (values ('restaurant'), ('cafe-bar')) as t (template_key)
cross join (
  values
    ('modules.order_taking.mode.places',
      'שולחנות',
      'מקומות'),
    ('app.orders.place.numbered',
      'שולחן {name}',
      'מקום {name}'),
    ('app.orders.place.kind',
      'שולחן',
      'מקום'),
    ('app.orders.place.takeaway',
      'לקחת {number}',
      'הזמנה {number}'),
    ('app.orders.place.takeawayKind',
      'לקחת',
      'בלי מקום'),
    ('app.orders.place.newTakeaway',
      'לקחת · הזמנה חדשה',
      'הזמנה חדשה · בלי מקום'),
    ('app.orders.floor.title',
      'שולחנות',
      'מקומות'),
    ('app.orders.floor.takeaway',
      'פתיחת הזמנה לקחת',
      'פתיחת הזמנה בלי מקום'),
    ('app.orders.floor.places',
      'השולחנות',
      'המקומות'),
    ('app.orders.floor.takeaways',
      'לקחת',
      'בלי מקום'),
    ('app.orders.floor.status.ready',
      '{count, plural, one {שולחן אחד מוכן להגשה} other {# מוכנים להגשה}}',
      '{count, plural, one {מקום אחד מוכן להגשה} other {# מוכנים להגשה}}'),
    ('app.orders.floor.status.free',
      'כל השולחנות פנויים',
      'כל המקומות פנויים'),
    ('app.orders.floor.state.draft',
      '{count, plural, one {מנה אחת בטיוטה} other {# מנות בטיוטה}}',
      '{count, plural, one {פריט אחד בטיוטה} other {# פריטים בטיוטה}}'),
    ('app.orders.floor.table.place',
      'שולחן',
      'מקום'),
    ('app.orders.floor.empty.title',
      'עוד אין שולחנות',
      'עוד אין מקומות'),
    ('app.orders.floor.empty.body',
      'מוסיפים את השולחנות: מספרים או שמות, כמו בר 3.',
      'מוסיפים את המקומות: מספרים או שמות, כמו בר 3.'),
    ('app.orders.floor.empty.action',
      'הוספת שולחנות',
      'הוספת מקומות'),
    ('app.orders.floor.empty.waiter',
      'מי שמנהל את התפריט עוד לא הוסיף שולחנות. בינתיים פותחים הזמנה לקחת.',
      'מי שמנהל את התפריט עוד לא הוסיף מקומות. בינתיים פותחים הזמנה בלי מקום.'),
    ('app.orders.order.free',
      'פנוי · בוחרים מנות ושולחים',
      'פנוי · בוחרים פריטים ושולחים'),
    ('app.orders.order.floorList',
      'השולחנות',
      'המקומות'),
    ('app.orders.order.view.add',
      'הוספת מנות',
      'הוספת פריטים'),
    ('app.orders.order.view.unsent',
      '{count, plural, one {מנה אחת עוד לא נשלחה} other {# מנות עוד לא נשלחו}}',
      '{count, plural, one {פריט אחד עוד לא נשלח} other {# פריטים עוד לא נשלחו}}'),
    ('app.orders.order.noPlace.title',
      'השולחן הזה לא נמצא',
      'המקום הזה לא נמצא'),
    ('app.orders.order.noPlace.back',
      'חזרה לשולחנות',
      'חזרה למקומות'),
    ('app.orders.picker.title',
      'הוספת מנות',
      'הוספת פריטים'),
    ('app.orders.picker.searchPlaceholder',
      'חיפוש מנה',
      'חיפוש פריט'),
    ('app.orders.picker.nothingFound',
      'אין מנה שמתחילה ב-{query}',
      'אין פריט שמתחיל ב-{query}'),
    ('app.orders.picker.needsChoice',
      'יש לה בחירות. בינתיים מוסרים אותה בעל פה.',
      'יש לו בחירות. בינתיים מוסרים אותו בעל פה.'),
    ('app.orders.picker.noRoute',
      'אין מחלקה שמכינה אותה',
      'אין מחלקה שמכינה אותו'),
    ('app.orders.picker.noMenu.body',
      'מוסיפים מנות, או מעתיקים תפריט קיים בהדבקה.',
      'מוסיפים פריטים, או מעתיקים תפריט קיים בהדבקה.'),
    ('app.orders.draft.empty',
      'עוד לא נבחרו מנות. מה שנבחר מהתפריט מופיע כאן, ונשלח בלחיצה אחת.',
      'עוד לא נבחרו פריטים. מה שנבחר מהתפריט מופיע כאן, ונשלח בלחיצה אחת.'),
    ('app.orders.send.count',
      '{count, plural, one {מנה אחת} two {שתי מנות} other {# מנות}}',
      '{count, plural, one {פריט אחד} two {שני פריטים} other {# פריטים}}'),
    ('app.orders.mine.empty.body',
      'מה ששולחים מהשולחנות מופיע כאן, והמוכן קודם.',
      'מה ששולחים מהמקומות מופיע כאן, והמוכן קודם.'),
    ('app.orders.mine.empty.action',
      'מעבר לשולחנות',
      'מעבר למקומות'),
    ('app.orders.mine.columns.place',
      'שולחן',
      'מקום'),
    ('app.orders.offClock.title',
      'מצב מלצרות נפתח בזמן משמרת',
      'קבלת הזמנות נפתחת בזמן משמרת'),
    ('app.orders.failed.moved',
      'ההזמנה עברה לשולחן אחר בינתיים. בוחרים שוב מהרשימה.',
      'ההזמנה עברה למקום אחר בינתיים. בוחרים שוב מהרשימה.'),
    ('app.orders.failed.place',
      'השולחן הוסר בינתיים. בוחרים שוב מהרשימה.',
      'המקום הוסר בינתיים. בוחרים שוב מהרשימה.'),
    ('app.orders.failed.off',
      'מצב מלצרות כבוי בעסק הזה.',
      'קבלת הזמנות כבויה בעסק הזה.'),
    ('app.orders.home.open',
      'פתיחת מצב מלצרות',
      'פתיחת ההזמנות'),
    ('app.orders.home.idle',
      'בוחרים שולחן ושולחים להכנה',
      'בוחרים מקום ושולחים להכנה')
) as w (key, sentence, base_sentence)
where exists (select 1 from public.templates tt where tt.key = t.template_key)
on conflict (template_key, key) do nothing;

------------------------------------------------------------------------------
-- Who may call what

-- The screens read with the person's own session.
revoke execute on function public.order_mode(uuid) from public, anon;
grant execute on function public.order_mode(uuid) to authenticated;

-- Replaced in place, the same signatures: their grants stay as P3 set them;
-- revoked and granted again all the same.
revoke execute on function public.order_mine(uuid, bigint) from public, anon;
grant execute on function public.order_mine(uuid, bigint) to authenticated;
revoke execute on function public.order_floor(uuid, bigint) from public, anon;
grant execute on function public.order_floor(uuid, bigint) to authenticated;
