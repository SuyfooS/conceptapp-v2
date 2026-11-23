-- Sign-in codes, after the security sweep of 22 November 2026 (before a first
-- real business):
--
--   a code waiting   a check ('verify') is counted for its number only while
--                    a code sent to it may still be waiting: a send counted
--                    for the number in the last ten minutes, a code's
--                    lifetime in Twilio Verify. Otherwise there is nothing to
--                    check: it is counted for its caller alone and answers
--                    -1, and the server asks the auth server nothing. Filling
--                    the window of a number with an account now takes sending
--                    it codes, which the person sees.
--   windows          a kind and scope may have more than one window: the
--                    quarter of an hour as before, and a day for each number
--                    (15 codes sent, 30 checked), so guessing a number's code
--                    gets 30 tries a day, not some 960.
--   a new number     a number with no account yet can still be filled with
--                    nobody seeing it: sign-in counts its sends but sends it
--                    nothing. Joining from an open invite clears its counts
--                    first (public.forget_number_attempts), so a stranger's
--                    sign-in tries can't hold the invited person out for a
--                    day. A number with an account keeps its counts, and
--                    joining makes the account before its code goes, so a
--                    number is cleared only until it has one.
--
-- public.note_auth_attempt is its version in 20261108000300_sealed.sql with
-- only these changes. The local seed lifts every window (seed.sql). Before
-- this reaches a project the app sees no -1 and one window per scope, as
-- before, and joining clears nothing.

alter table private.auth_limits
  drop constraint auth_limits_pkey,
  add primary key (kind, scope, per);

insert into private.auth_limits (kind, scope, max_count, per)
values
  ('send', 'phone', 15, interval '1 day'),
  ('verify', 'phone', 30, interval '1 day')
on conflict (kind, scope, per) do nothing;

-- Count a code sent ('send') or checked ('verify') for `phone` and for
-- `caller` (either may be null), unless one of them is at a limit, in any of
-- its windows. Returns 0 when it was counted, else the seconds until it may
-- be; and -1 for a check when no code was sent to the number in a code's
-- lifetime, counted for the caller only, with nothing to check. A refused
-- try is not counted, so a limit lifts on its own.
create or replace function public.note_auth_attempt(
  kind text,
  phone text,
  caller text,
  at_time timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  scopes text[] := '{}'::text[];
  keys text[] := '{}'::text[];
  lim private.auth_limits%rowtype;
  freed timestamptz;
  wait integer := 0;
  phone_key text;
  no_code boolean := false;
begin
  if kind is null or kind not in ('send', 'verify') then
    raise exception 'Unknown kind of attempt: %', kind using errcode = '22023';
  end if;

  if nullif(btrim(phone), '') is not null then
    phone_key := encode(sha256(convert_to('phone:' || btrim(phone), 'UTF8')), 'hex');
    -- A check is counted for its number only while a code sent to it may
    -- still be waiting (ten minutes, a code's lifetime in Twilio Verify).
    if note_auth_attempt.kind = 'verify'::text and not exists (
      select 1 from private.auth_attempts a
      where a.kind = 'send'::text and a.key_hash = phone_key
        and a.at > at_time - interval '10 minutes' and a.at <= at_time
    ) then
      no_code := true;
    else
      scopes := scopes || 'phone'::text;
      keys := keys || phone_key;
    end if;
  end if;
  if nullif(btrim(caller), '') is not null then
    scopes := scopes || 'caller'::text;
    keys := keys || encode(sha256(convert_to('caller:' || btrim(caller), 'UTF8')), 'hex');
  end if;

  delete from private.auth_attempts a where a.at < at_time - interval '1 day';

  for i in 1 .. coalesce(array_length(keys, 1), 0) loop
    -- One count at a time per number or caller, so tries sent at once all
    -- meet the limit.
    perform pg_advisory_xact_lock(
      hashtextextended('auth_attempt:' || note_auth_attempt.kind || ':' || keys[i], 0));

    -- Every window of the kind and scope: a quarter of an hour, a day.
    for lim in
      select * from private.auth_limits l
      where l.kind = note_auth_attempt.kind and l.scope = scopes[i]
    loop
      -- The try whose expiry frees a place, when the window is full.
      select a.at into freed
      from private.auth_attempts a
      where a.kind = note_auth_attempt.kind and a.key_hash = keys[i]
        and a.at > at_time - lim.per and a.at <= at_time
      order by a.at desc
      offset lim.max_count - 1
      limit 1;
      if freed is not null then
        wait := greatest(wait, ceil(extract(epoch from (freed + lim.per - at_time)))::integer);
      end if;
    end loop;
  end loop;

  if wait > 0 then
    return wait;
  end if;

  insert into private.auth_attempts (kind, key_hash, at)
  select note_auth_attempt.kind, k.key_hash, at_time
  from unnest(keys) as k (key_hash);

  -- Nothing to check: no code went to the number lately.
  if no_code then
    return -1;
  end if;
  return 0;
end;
$$;

revoke execute on function public.note_auth_attempt(text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.note_auth_attempt(text, text, text, timestamptz) to service_role;

-- Clear the codes counted for `phone`, sent and checked, while it has no
-- account: none of them reached anyone, since sign-in sends no code to a
-- number without one, and joining makes the account before its code goes.
-- Joining from an open invite calls it before its code is counted, so a
-- stranger's sign-in tries at an invited number can't hold the new person
-- out. A number with an account keeps its counts, so no limit that guards a
-- code someone got is lifted here. The callers' counts stay.
create function public.forget_number_attempts(phone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  given text := btrim(coalesce(forget_number_attempts.phone, ''));
begin
  if given = '' then
    return;
  end if;
  -- The auth server keeps a number without its leading +.
  if exists (
    select 1 from auth.users u
    where u.phone in (ltrim(given, '+'), '+' || ltrim(given, '+'))
  ) then
    return;
  end if;

  delete from private.auth_attempts a
  where a.kind in ('send'::text, 'verify'::text)
    and a.key_hash = encode(sha256(convert_to('phone:' || given, 'UTF8')), 'hex');
end;
$$;

revoke execute on function public.forget_number_attempts(text)
  from public, anon, authenticated;
grant execute on function public.forget_number_attempts(text) to service_role;
