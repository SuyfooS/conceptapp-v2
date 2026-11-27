-- Sign-in codes: the screen says when one network sent too many (closing the
-- pilot, PR 2). public.note_auth_attempt answered the seconds to wait
-- whichever count held a try, the number's or the caller's, so the screens
-- said both alike: "too many" on sign-in, and on joining's first send the
-- code step, as for a code that went. The 21st person joining on the
-- shop's Wi-Fi within a quarter of an hour waited for an SMS that never
-- came. It now also says which count held it:
--
--   the caller's    a try its caller's own windows hold (private.auth_limits:
--                   20 codes sent and 40 checked from one address in a
--                   quarter of an hour) answers 100000 more than the
--                   caller's own seconds to wait, whatever the number's
--                   count. Held by both, it is the caller's that is said,
--                   with the caller's seconds, never the number's; once
--                   they pass, the number's may still hold a send, unsaid,
--                   so the words promise no time ("או מאוחר יותר"). A wait
--                   is shorter than its window and no window is longer than
--                   a day (86400 seconds), so the two never meet. A try
--                   counted for its caller only (-1, nothing to check; -2,
--                   within the app's wait) that the caller's windows hold
--                   answers the caller's too, as it was held by them alone.
--   the number's    a try only the number's windows hold answers its
--                   seconds, as before, and is said as before: as unsaid
--                   as it was.
--
-- Why the caller's may be said: a caller's count is the same for every
-- number it asked for, with an account or without, but for the two
-- exceptions below. Sign-in counts a send to a number with no account as it
-- counts one that went, joining from an invite clears the number's counts
-- only (public.forget_number_attempts), and -1 and -2 are counted for the
-- caller alike. Held by both, saying the number's would tell, on joining, a
-- number whose counts were kept (one with an account) from one whose counts
-- were cleared; so the caller's is said, and its seconds, which say nothing
-- of the number.
--
-- The first exception: a send the auth server sent nothing for (the project's
-- SMS in an hour, its requests from one address) or the SMS provider failed
-- is given back for the number and the caller (public.forget_auth_attempt,
-- 20261108000300_sealed.sql; said in 20261127000200_sign_in_windows.sql),
-- and on sign-in the SMS cap and the provider are met only by a number with
-- an account, since nothing is sent to one without. So after such a send the
-- caller's count is one lower for a number with an account than for one
-- without, and the next try from that network may go where it would
-- otherwise have been held. It tells nothing that wasn't told: that very
-- send already answered "משהו השתבש" for a number with an account and the
-- code step for one without (docs/ROADMAP.md, known issue 98), and a hold
-- by the caller's count was already said on sign-in, as "too many", before
-- this; only which count held it is new, and the caller's is the same for
-- every number. On joining every number has its account before its code
-- goes, so a send given back there is given back alike. So the screen is
-- not kept silent after a send given back.
--
-- The second: a try only the number's windows hold is counted for nobody,
-- its caller included (a refused try counted nowhere), and joining clears
-- the counts of a number with no account first, so there only a number with
-- an account can be held by its own windows. After codes to the number fill
-- its quarter of an hour, a send on joining from a network one short of its
-- count leaves that count where it was for a number with an account and
-- brings it to the limit for one without, so the next send from that
-- network goes for the first and is held by the network's count for the
-- second. It tells nothing that wasn't told: it needs those codes to the
-- number, which its person sees, and after them a new code asked for on
-- joining already answers "too many" only for a number with an account
-- (docs/ROADMAP.md, known issue 94). Counting such a try for its caller
-- would make the count the same, but would change what a refused try is,
-- so it stays counted nowhere. auth_limits_network.test.sql shows both
-- exceptions.
--
-- The rest is its version in 20261127000200_sign_in_windows.sql, unchanged:
-- 0 when counted, -1 and -2, every window, the app's wait, the locks, a
-- refused try counted nowhere, the hashes and the day's clearing. Its
-- arguments, the integer it returns and its grants (the server only) stay,
-- so either side may come first. A server from before this reads any
-- positive answer as too many, the caller's included, as it did; and before
-- this reaches a project the server reads every wait as the number's, and
-- says it as before. The server says the caller's on a send only, sign-in's
-- and joining's (app/(auth)/otp.ts); a check, and the hiring file's codes,
-- still say "too many". The Migrate workflow runs when this merges.

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
  -- What a try held by its caller's own windows answers, over the caller's
  -- seconds to wait: past any wait, since no window is longer than a day.
  held_by_caller constant integer := 100000;
  scopes text[] := '{}'::text[];
  keys text[] := '{}'::text[];
  lim private.auth_limits%rowtype;
  freed timestamptz;
  -- The longest wait of every window that holds the try, and of the
  -- caller's alone.
  wait integer := 0;
  caller_wait integer := 0;
  held integer;
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
        held := ceil(extract(epoch from (freed + lim.per - at_time)))::integer;
        wait := greatest(wait, held);
        if scopes[i] = 'caller'::text then
          caller_wait := greatest(caller_wait, held);
        end if;
      end if;
    end loop;
  end loop;

  -- Held by the caller's own windows, whatever the number's: the caller's
  -- seconds, which the server may say (the same for every number).
  if caller_wait > 0 then
    return held_by_caller + caller_wait;
  end if;
  -- Held by the number's alone: its seconds, as before.
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
