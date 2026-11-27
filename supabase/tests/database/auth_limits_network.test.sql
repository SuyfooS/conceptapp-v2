-- Limits on sign-in codes, after 20261128000600_network_limit.sql: a try
-- its caller's own windows hold answers 100000 more than the caller's
-- seconds to wait, whatever the number's count, so the server can say that
-- this network sent too many; a try only the number's windows hold answers
-- its seconds, as before, and stays unsaid. Held by both, the caller's is
-- said, with the caller's seconds: the number's would tell, on joining, a
-- number whose counts were kept (one with an account) from one cleared. So
-- once the caller's minutes pass, the number's own count may still hold a
-- send from that network, unsaid, and the words say "או מאוחר יותר" and
-- promise no time. The two exceptions, written down here. A send given back (the SMS provider or
-- the project's SMS cap refused it, met on sign-in only by a number with an
-- account) is given back for the caller too, so the caller's count then
-- differs by account. That very send already answered "משהו השתבש" for a
-- number with an account and the code step for one without (ROADMAP, known
-- issue 98), so the caller's answer after it tells nothing more. And a send
-- on joining that the number's own windows hold is counted for nobody, its
-- caller included, while joining clears the counts of a number with no
-- account first: so after codes fill the number's quarter of an hour, the
-- caller's count differs by account too. Those codes already make a new
-- code on joining answer "too many" only for a number with an account
-- (ROADMAP, known issue 94), so it tells nothing more either. The limits
-- and the wait are set here, since the local seed lifts the limits and
-- shortens the wait for the browser tests.
begin;
select plan(30);

select function_returns(
  'public', 'note_auth_attempt',
  array['text', 'text', 'text', 'timestamp with time zone'],
  'integer',
  'it takes what it took and answers an integer, as before'
);

update private.auth_limits set max_count = 2
where kind = 'send' and scope = 'phone' and per = interval '15 minutes';
update private.auth_limits set max_count = 100
where kind = 'send' and scope = 'phone' and per = interval '1 day';
update private.auth_limits set max_count = 3
where kind = 'send' and scope = 'caller';
update private.auth_limits set max_count = 100
where kind = 'verify' and scope = 'phone';
update private.auth_limits set max_count = 2
where kind = 'verify' and scope = 'caller';
-- As on a hosted project.
update private.auth_send_wait set per = interval '65 seconds';

-- 5801 and 5891 have an account, as the auth server keeps it, with no +.
-- The others have none.
insert into auth.users (id, aud, role, phone)
values
  ('58000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', '972500005801'),
  ('58000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', '972500005891');

set local role service_role;

-- The number's own count: its seconds, as before.
select is(
  (select max(w) from (values
    (public.note_auth_attempt('send', '+972500005811', '8.8.8.1', '2026-11-21 08:00+00')),
    (public.note_auth_attempt('send', '+972500005811', '8.8.8.2', '2026-11-21 08:01:30+00'))
  ) tries (w)),
  0, 'two codes go to a number, from two networks'
);
select is(
  public.note_auth_attempt('send', '+972500005811', '8.8.8.3', '2026-11-21 08:03+00'),
  720, 'a third from a third network waits for the number''s own count, its seconds as before'
);

-- The caller's own count: offset, so the server can say it.
select is(
  (select max(w) from (values
    (public.note_auth_attempt('send', '+972500005821', '8.8.8.4', '2026-11-21 09:00+00')),
    (public.note_auth_attempt('send', '+972500005822', '8.8.8.4', '2026-11-21 09:00:10+00')),
    (public.note_auth_attempt('send', '+972500005823', '8.8.8.4', '2026-11-21 09:00:20+00'))
  ) tries (w)),
  0, 'one network sends codes to three numbers'
);
select is(
  public.note_auth_attempt('send', '+972500005824', '8.8.8.4', '2026-11-21 09:00:30+00'),
  100870, 'a fourth number from that network is held by the network''s count, said as the caller''s, with its seconds'
);
select is(
  public.note_auth_attempt('send', '+972500005801', '8.8.8.4', '2026-11-21 09:00:30+00'),
  100870, 'the same answer for a number with an account'
);
select public.forget_number_attempts('+972500005821');
select is(
  public.note_auth_attempt('send', '+972500005821', '8.8.8.4', '2026-11-21 09:00:30+00'),
  100870, 'and for a number joining has just cleared: joining clears the number''s counts, never the network''s'
);
select is(
  public.note_auth_attempt('send', '+972500005824', null, '2026-11-21 09:00:40+00'),
  0, 'the number itself was not held, nor counted'
);

-- Held by both: the caller's, with the caller's seconds, never the
-- number's.
select is(
  (select max(w) from (values
    (public.note_auth_attempt('send', '+972500005832', '8.8.8.7', '2026-11-21 10:00+00')),
    (public.note_auth_attempt('send', '+972500005833', '8.8.8.7', '2026-11-21 10:00:10+00')),
    (public.note_auth_attempt('send', '+972500005834', '8.8.8.7', '2026-11-21 10:00:20+00')),
    (public.note_auth_attempt('send', '+972500005831', '8.8.8.5', '2026-11-21 10:04+00')),
    (public.note_auth_attempt('send', '+972500005831', '8.8.8.6', '2026-11-21 10:05:10+00'))
  ) tries (w)),
  0, 'a network sends its quarter of an hour''s codes, and a number gets its own from two others'
);
select is(
  public.note_auth_attempt('send', '+972500005831', '8.8.8.7', '2026-11-21 10:06:30+00'),
  100510, 'held by both, the network''s is said, with its own seconds, though the number''s wait is longer'
);
select is(
  public.note_auth_attempt('send', '+972500005831', '8.8.8.8', '2026-11-21 10:06:30+00'),
  750, 'from another network the number''s own count holds it, its seconds as before'
);
select is(
  public.note_auth_attempt('send', '+972500005831', '8.8.8.7', '2026-11-21 10:15:30+00'),
  210, 'once the network''s minutes pass, the number''s own count may still hold it, its seconds as before, unsaid: the words promise no time'
);

-- A send within the app's wait is counted for its caller only, and its
-- caller's count holds it all the same.
select is(
  public.note_auth_attempt('send', '+972500005834', '8.8.8.7', '2026-11-21 10:00:40+00'),
  100860, 'a send within the wait, from a network at its count, is held by the network''s'
);

-- Checks: the caller's count of checks says so too.
select is(
  (select max(w) from (values
    (public.note_auth_attempt('send', '+972500005852', null, '2026-11-21 12:00+00')),
    (public.note_auth_attempt('verify', '+972500005852', '8.8.9.1', '2026-11-21 12:01+00')),
    (public.note_auth_attempt('verify', '+972500005852', '8.8.9.1', '2026-11-21 12:01:10+00'))
  ) tries (w)),
  0, 'a code goes, and is checked twice from one network'
);
select is(
  public.note_auth_attempt('verify', '+972500005852', '8.8.9.1', '2026-11-21 12:01:20+00'),
  100880, 'a third check from that network is held by the network''s count of checks'
);
select is(
  public.note_auth_attempt('verify', '+972500005852', '8.8.9.2', '2026-11-21 12:01:20+00'),
  0, 'from another network it is checked'
);

-- The exception. Two networks with the same codes, but for the last: one
-- went to a number with no account, which sign-in counts and sends nothing
-- to; the other to a number with an account, whose SMS the provider failed,
-- so the server gave it back, for the number and the caller.
select is(
  (select max(w) from (values
    (public.note_auth_attempt('send', '+972500005871', '8.8.9.3', '2026-11-21 14:00+00')),
    (public.note_auth_attempt('send', '+972500005872', '8.8.9.3', '2026-11-21 14:00:10+00')),
    (public.note_auth_attempt('send', '+972500005873', '8.8.9.3', '2026-11-21 14:00:20+00')),
    (public.note_auth_attempt('send', '+972500005874', '8.8.9.4', '2026-11-21 14:00+00')),
    (public.note_auth_attempt('send', '+972500005875', '8.8.9.4', '2026-11-21 14:00:10+00')),
    (public.note_auth_attempt('send', '+972500005801', '8.8.9.4', '2026-11-21 14:00:20+00'))
  ) tries (w)),
  0, 'two networks send three codes each, the last of one to a number with an account'
);
select public.forget_auth_attempt('send', '+972500005801', '8.8.9.4', '2026-11-21 14:00:20+00');
select is(
  public.note_auth_attempt('send', '+972500005876', '8.8.9.3', '2026-11-21 14:00:30+00'),
  100870, 'the network whose last send stayed counted, a number with no account, is held'
);
select is(
  public.note_auth_attempt('send', '+972500005877', '8.8.9.4', '2026-11-21 14:00:30+00'),
  0, 'the one whose last send was given back, a number with an account, is not: its count differs by account, which that send''s own answer already told (issue 98)'
);

-- The second exception. Two invited numbers get their quarter of an hour's
-- codes from other networks, 5891 with an account and 5892 without, and
-- two networks one short of their count each press send on joining, which
-- clears 5892's counts and keeps 5891's.
select is(
  (select max(w) from (values
    (public.note_auth_attempt('send', '+972500005891', '8.8.9.7', '2026-11-21 15:00+00')),
    (public.note_auth_attempt('send', '+972500005891', '8.8.9.8', '2026-11-21 15:01:30+00')),
    (public.note_auth_attempt('send', '+972500005892', '8.8.9.9', '2026-11-21 15:00+00')),
    (public.note_auth_attempt('send', '+972500005892', '8.8.9.10', '2026-11-21 15:01:30+00')),
    (public.note_auth_attempt('send', '+972500005893', '8.8.9.5', '2026-11-21 15:00+00')),
    (public.note_auth_attempt('send', '+972500005894', '8.8.9.5', '2026-11-21 15:00:10+00')),
    (public.note_auth_attempt('send', '+972500005895', '8.8.9.6', '2026-11-21 15:00+00')),
    (public.note_auth_attempt('send', '+972500005896', '8.8.9.6', '2026-11-21 15:00:10+00'))
  ) tries (w)),
  0, 'two invited numbers get two codes each, and two networks send two codes each'
);
select public.forget_number_attempts('+972500005891');
select public.forget_number_attempts('+972500005892');
select is(
  public.note_auth_attempt('send', '+972500005891', '8.8.9.5', '2026-11-21 15:03+00'),
  720, 'joining a number with an account: its kept count holds the send, its seconds, and nobody counts it, its network included'
);
select is(
  public.note_auth_attempt('send', '+972500005892', '8.8.9.6', '2026-11-21 15:03+00'),
  0, 'joining a number with none: its count was cleared, so the send is counted, for its network too'
);
select is(
  public.note_auth_attempt('send', '+972500005897', '8.8.9.5', '2026-11-21 15:03:10+00'),
  0, 'so the next send from the first network goes'
);
select is(
  public.note_auth_attempt('send', '+972500005898', '8.8.9.6', '2026-11-21 15:03:10+00'),
  100710, 'and from the second it is held by the network''s count: it differs by account, which those codes already told on joining (issue 94)'
);

reset role;

select is(
  (select count(*)::int from private.auth_attempts
   where kind = 'send'
     and key_hash = encode(sha256(convert_to('caller:8.8.8.4', 'UTF8')), 'hex')),
  3, 'a try the network''s count held is counted for the network nowhere'
);
select is(
  (select count(*)::int from private.auth_attempts
   where kind = 'send'
     and key_hash = encode(sha256(convert_to('phone:+972500005824', 'UTF8')), 'hex')),
  1, 'nor for its number: only the later send with no caller is'
);
select ok(
  (select count(*) from private.auth_attempts
   where kind = 'send'
     and key_hash = encode(sha256(convert_to('phone:+972500005831', 'UTF8')), 'hex')) = 2
  and (select count(*) from private.auth_attempts
   where kind = 'send'
     and key_hash = encode(sha256(convert_to('caller:8.8.8.7', 'UTF8')), 'hex')) = 3,
  'a try both counts held is counted for neither'
);
select is(
  (select count(*)::int from private.auth_attempts
   where key_hash = encode(sha256(convert_to('phone:+972500005801', 'UTF8')), 'hex')),
  0, 'the send given back is counted for its number nowhere'
);
select ok(
  (select count(*) from private.auth_attempts
   where key_hash = encode(sha256(convert_to('caller:8.8.9.3', 'UTF8')), 'hex')) = 3
  and (select count(*) from private.auth_attempts
   where key_hash = encode(sha256(convert_to('caller:8.8.9.4', 'UTF8')), 'hex')) = 3,
  'each network has three codes counted: the one held, and the one given back, counted nowhere'
);
select ok(
  not has_function_privilege('authenticated', 'public.note_auth_attempt(text, text, text, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.note_auth_attempt(text, text, text, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.note_auth_attempt(text, text, text, timestamptz)', 'execute'),
  'only the server counts, as before'
);

select * from finish();
rollback;
