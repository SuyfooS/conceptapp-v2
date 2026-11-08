-- Wording for each template and each business (Orel, 7 November 2026): the
-- ConceptApp team replaces a whole sentence of the app's copy, without code.
-- Whole sentences, because swapping one word breaks Hebrew gender.
--
--   template_wording  a template's sentences. Read live by every business
--                     opened from that template, so a change reaches all of
--                     them at once.
--   business_wording  one business's own sentences, on top of its template's.
--
-- A sentence is keyed by its message key in messages/he.json (only app.* and
-- modules.*, the copy a business sees), and keeps the app's sentence it was
-- written against (base_sentence), so the console can tell when the app's own
-- sentence has changed since. Deleting a row brings back the layer below: the
-- template's, then the app's. Hebrew only, while the app is.
--
-- Members read their business's sentences and its template's; the team reads
-- them while viewing a business. Only the team writes, through the server:
-- anyone who sets up businesses for a business, platform admins for a
-- template. Each change is logged.

create table public.template_wording (
  template_key text not null
    references public.templates (key) on update cascade on delete cascade,
  key text not null check (key ~ '^(app|modules)(\.[A-Za-z0-9_]+)+$'),
  sentence text not null check (char_length(btrim(sentence)) between 1 and 400),
  base_sentence text not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (template_key, key)
);

create table public.business_wording (
  business_id uuid not null
    references public.businesses (id) on delete cascade,
  key text not null check (key ~ '^(app|modules)(\.[A-Za-z0-9_]+)+$'),
  sentence text not null check (char_length(btrim(sentence)) between 1 and 400),
  base_sentence text not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (business_id, key)
);

alter table public.template_wording enable row level security;
alter table public.business_wording enable row level security;
revoke all on public.template_wording from anon, authenticated;
revoke all on public.business_wording from anon, authenticated;
grant select on public.template_wording to authenticated;
grant select on public.business_wording to authenticated;

-- The template of a business the reader can read: the subquery runs under the
-- businesses policies, so a member, or the team while viewing, reaches only
-- their own business's template. public.templates itself stays closed.
create policy "people read their business's template wording"
  on public.template_wording for select to authenticated
  using (exists (
    select 1 from public.businesses b
    where b.template_key = template_wording.template_key
  ));

create policy "members read their business's wording"
  on public.business_wording for select to authenticated
  using (private.is_member(business_id));

create policy "the team reads the wording of a business it is viewing"
  on public.business_wording for select to authenticated
  using (private.is_viewing(business_id));

-- Sets one business's sentence, or clears it with a null sentence. Someone on
-- the ConceptApp team only. Returns the sentence it replaced (null if there
-- was none), which is what an undo writes back.
create function public.set_business_wording(
  actor uuid,
  business uuid,
  word_key text,
  new_sentence text,
  base text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous text;
begin
  if not exists (
    select 1 from public.platform_staff s where s.user_id = actor
  ) then
    raise exception 'Platform staff only' using errcode = '42501';
  end if;

  perform 1 from public.businesses b where b.id = business;
  if not found then
    raise exception 'Unknown business: %', business using errcode = 'P0002';
  end if;

  select w.sentence into previous
  from public.business_wording w
  where w.business_id = business and w.key = word_key
  for update;

  if new_sentence is null then
    delete from public.business_wording w
    where w.business_id = business and w.key = word_key;
  else
    if base is null then
      raise exception 'The app''s sentence is needed' using errcode = '22023';
    end if;
    insert into public.business_wording as w (
      business_id, key, sentence, base_sentence, updated_by
    )
    values (business, word_key, btrim(new_sentence), base, actor)
    on conflict (business_id, key) do update
    set sentence = excluded.sentence,
      base_sentence = excluded.base_sentence,
      updated_by = excluded.updated_by,
      updated_at = now();
  end if;

  if previous is distinct from btrim(new_sentence) then
    insert into public.audit_log (business_id, actor_id, action, details)
    values (
      business, actor, 'wording.change',
      jsonb_build_object(
        'key', word_key, 'from', previous, 'to', btrim(new_sentence)
      )
    );
  end if;

  return previous;
end;
$$;

revoke execute on function public.set_business_wording(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.set_business_wording(uuid, uuid, text, text, text)
  to service_role;

-- Sets one template's sentence, or clears it with a null sentence, for every
-- business opened from it. Platform admins only (templates.edit in
-- @domain/platform). Logged with no business, since it belongs to none.
-- Returns the sentence it replaced.
create function public.set_template_wording(
  actor uuid,
  template text,
  word_key text,
  new_sentence text,
  base text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous text;
begin
  if not exists (
    select 1 from public.platform_staff s
    where s.user_id = actor and s.role = 'platform_admin'
  ) then
    raise exception 'Platform admins only' using errcode = '42501';
  end if;

  perform 1 from public.templates t where t.key = template;
  if not found then
    raise exception 'Unknown template: %', template using errcode = 'P0002';
  end if;

  select w.sentence into previous
  from public.template_wording w
  where w.template_key = template and w.key = word_key
  for update;

  if new_sentence is null then
    delete from public.template_wording w
    where w.template_key = template and w.key = word_key;
  else
    if base is null then
      raise exception 'The app''s sentence is needed' using errcode = '22023';
    end if;
    insert into public.template_wording as w (
      template_key, key, sentence, base_sentence, updated_by
    )
    values (template, word_key, btrim(new_sentence), base, actor)
    on conflict (template_key, key) do update
    set sentence = excluded.sentence,
      base_sentence = excluded.base_sentence,
      updated_by = excluded.updated_by,
      updated_at = now();
  end if;

  if previous is distinct from btrim(new_sentence) then
    insert into public.audit_log (business_id, actor_id, action, details)
    values (
      null, actor, 'wording.change',
      jsonb_build_object(
        'template', template, 'key', word_key,
        'from', previous, 'to', btrim(new_sentence)
      )
    );
  end if;

  return previous;
end;
$$;

revoke execute on function public.set_template_wording(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.set_template_wording(uuid, text, text, text, text)
  to service_role;
