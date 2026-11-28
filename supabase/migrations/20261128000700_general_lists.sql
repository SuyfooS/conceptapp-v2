-- The general template's lists don't go to everyone (closing the pilot, PR 9).
-- Its "פתיחה" and "סגירה" went to role `worker` (20261109000600_lists.sql), so
-- in a business of 30, sending either with what the screen starts from told
-- all 30. Now:
--
--   recipient   both have no fixed recipient: `"recipient": null`, which the
--               editor calls "בכל פעם" (`app.lists.templates.editor.
--               recipientKinds.none`). The send screen then starts with
--               nobody chosen, its button says "בוחרים למי לשלוח" until the
--               sender picks a person, a shift, a role or a department
--               (`sendDefaults` in @domain/lists), and `public.send_list`
--               takes the recipient from what was sent, as it always did.
--               A list with no recipient is a state the lists already have:
--               `list_templates.recipient_kind` null ("chosen each time"),
--               `listTemplateSeed.recipient` nullable in @domain/lists, and
--               `private.seed_recipient` all null for a JSON null. Neither
--               list has times, which would need a recipient
--               (`private.copy_template_lists`: "goes to nobody").
--   wording     the note "משהו שהמנהל צריך לדעת", in both, becomes
--               "משהו שחשוב לדעת למשמרת הבאה": no manager in the masculine,
--               and it says what the note is for.
--   version     the template a version up (5 to 6), as each change of a
--               template's content is, and only when something changes.
--               Everything else in it, the other items and their order
--               included, stays as it was.
--
-- Who it reaches: only businesses opened from the general template from now
-- on. `public.apply_template` copies a template's lists into a business when
-- it is set up, and nothing copies them again, so a business opened earlier
-- keeps its two lists to `worker` and its `template_version`; its owner or
-- manager changes them in the list's editor ("למי היא נשלחת", "בכל פעם").
-- There are no real businesses yet. The demo businesses are the restaurant's
-- and the shop's (`supabase/seed.sql`, `supabase/hosted-demo.sql`), and the
-- demo reset applies their own template, so neither they nor the reset
-- change, and nothing here resets them. Tests: pgTAP
-- `general_lists.test.sql` and `templates.test.sql`, and
-- `modules/templates.db.test.ts` (`pnpm test:db`).

update public.templates t
set version = t.version + 1,
  definition = jsonb_set(
    t.definition,
    '{listTemplates}',
    (
      select jsonb_agg(
        case
          when lt.value ->> 'key' in ('opening', 'closing') then
            jsonb_set(lt.value, '{recipient}', 'null'::jsonb)
              || jsonb_build_object('items', (
                select jsonb_agg(
                  case
                    when item.value ->> 'label' = 'משהו שהמנהל צריך לדעת' then
                      jsonb_set(
                        item.value, '{label}', to_jsonb('משהו שחשוב לדעת למשמרת הבאה'::text)
                      )
                    else item.value
                  end
                  order by item.ordinality
                )
                from jsonb_array_elements(lt.value -> 'items')
                  with ordinality as item (value, ordinality)
              ))
          else lt.value
        end
        order by lt.ordinality
      )
      from jsonb_array_elements(t.definition -> 'listTemplates')
        with ordinality as lt (value, ordinality)
    )
  )
where t.key = 'general'
  and jsonb_typeof(t.definition -> 'listTemplates') = 'array'
  and exists (
    select 1
    from jsonb_array_elements(t.definition -> 'listTemplates') as lt (value)
    where lt.value ->> 'key' in ('opening', 'closing')
      and (
        coalesce(jsonb_typeof(lt.value -> 'recipient'), 'null') <> 'null'
        or exists (
          select 1 from jsonb_array_elements(lt.value -> 'items') as item (value)
          where item.value ->> 'label' = 'משהו שהמנהל צריך לדעת'
        )
      )
  );
