-- Sign-in codes, after the security sweep of 22 November 2026 (before a first
-- real business):
--
--   a wait           the app's own wait between two codes to one number, the
--                    same for every number, registered or not
--                    (private.auth_send_wait, 65 seconds): a send ('send')
--                    within it of the number's last counted send is counted
--                    for its caller alone and answers -2, and the server asks
--                    the auth server nothing. It runs from the last counted
--                    send, so a send inside it doesn't lengthen it, and the
--                    sends of one number are taken in turn, so two at once
--                    meet it too. It holds on both sides of a counted send:
--                    the app stamps a send before it reaches the database,
--                    so of two sent at once the one stamped earlier may be
--                    taken second, and a send counted a moment later holds
--                    it as well. It is longer than the auth server's own
--                    wait per number (60 seconds unless changed), so that
--                    wait refuses no code the app lets go, unless a code was
--                    asked of the auth server directly, past the app. What
--                    it still refuses is one of its limits on everyone: the
--                    project's SMS in an hour, or its requests from one
--                    address. That send, like one the SMS provider failed,
--                    sent nothing: the server gives it back, for the number
--                    and the caller (public.forget_auth_attempt), and answers
--                    a failure. The SMS cap and the provider are met only by
--                    a number with an account, since nothing is sent to one
--                    without, which gets the code step meanwhile.
--   a code waiting   a check ('verify') is counted for its number only while
--                    a code sent to it may still be waiting: a send counted
--                    for the number in the last ten minutes, a code's
--                    lifetime in Twilio Verify. Otherwise there is nothing to
--                    check: it is counted for its caller alone and answers
--                    -1, and the server asks the auth server nothing. A send
--                    that stays counted for a number with an account is a
--                    code the auth server sent it (unless giving one back
--                    failed, which is logged), so filling its windows takes
--                    sending it codes, which the person sees.
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
-- only these changes. The local seed lifts every window and sets the wait
-- just past the local auth server's (seed.sql). Before this reaches a
-- project the app sees no -1 or -2 and one window per scope, as before, and
-- joining clears nothing; and with no wait of the app's own, a code asked
-- for inside the auth server's wait is a failure on sign-in for a number
-- with an account, and the code step for one without. So the Migrate
-- workflow runs when this merges.

-- The app's own wait between two codes sent to one number, one row. Longer
-- than the auth server's own wait per number (`sms_max_frequency`, 60
-- seconds unless changed), with a few seconds to spare, since the auth
-- server marks a code sent a moment after the app counts it. The
-- ConceptApp team changes the two together.
create table private.auth_send_wait (
  only_row boolean primary key default true check (only_row),
  per interval not null check (per > interval '0 seconds' and per <= interval '15 minutes')
);

insert into private.auth_send_wait (per) values (interval '65 seconds');

alter table private.auth_send_wait enable row level security;
revoke all on private.auth_send_wait from public, anon, authenticated;

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
-- be; -1 for a check when no code was sent to the number in a code's
-- lifetime, with nothing to check; and -2 for a send within the app's wait
-- of the number's last counted send, with nothing to send. Either is counted
-- for the caller only. A refused try is not counted, so a limit lifts on its
-- own.
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
  send_wait interval;
  -- 0, or what a try counted for its caller only answers: -1, no code
  -- waiting to check; -2, a code sent within the wait.
  caller_only integer := 0;
begin
  if kind is null or kind not in ('send', 'verify') then
    raise exception 'Unknown kind of attempt: %', kind using errcode = '22023';
  end if;

  if nullif(btrim(phone), '') is not null then
    phone_key := encode(sha256(convert_to('phone:' || btrim(phone), 'UTF8')), 'hex');
    if note_auth_attempt.kind = 'verify'::text then
      -- A check is counted for its number only while a code sent to it may
      -- still be waiting (ten minutes, a code's lifetime in Twilio Verify).
      if not exists (
        select 1 from private.auth_attempts a
        where a.kind = 'send'::text and a.key_hash = phone_key
          and a.at > at_time - interval '10 minutes' and a.at <= at_time
      ) then
        caller_only := -1;
      end if;
    else
      -- The app's own wait between two codes to one number, the same for
      -- every number, from its last counted send. The number's sends are
      -- taken in turn (the lock its count below takes too), so codes asked
      -- for at once meet the wait as well. Both sides of a counted send: the
      -- order of the lock is not that of the app's stamps, so a send stamped
      -- a moment after this one may already be counted.
      perform pg_advisory_xact_lock(
        hashtextextended('auth_attempt:send:' || phone_key, 0));
      select w.per into send_wait from private.auth_send_wait w;
      if send_wait is not null and exists (
        select 1 from private.auth_attempts a
        where a.kind = 'send'::text and a.key_hash = phone_key
          and a.at > at_time - send_wait and a.at <= at_time + send_wait
      ) then
        caller_only := -2;
      end if;
    end if;
    if caller_only = 0 then
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

  -- 0, or counted for the caller only: nothing to check, or nothing to send.
  return caller_only;
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
