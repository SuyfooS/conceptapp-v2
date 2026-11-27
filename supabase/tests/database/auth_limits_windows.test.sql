-- Limits on sign-in codes, after 20261127000200_sign_in_windows.sql: a
-- number has a quarter-hour window and a day's for each kind, and a check is
-- counted for its number only while a code sent to it may still be waiting
-- (ten minutes). Without one there is nothing to check: the check answers -1
-- and is counted for its caller alone. A number with no account yet has had
-- no code reach it, so joining from its invite clears its counts
-- (forget_number_attempts); one with an account keeps them. A send within
-- the app's own wait of the number's last counted one, the same for every
-- number, answers -2 and is counted for its caller alone, and so does one
-- stamped a moment before a send already counted. A try its caller's count
-- holds answers 100000 over its seconds (auth_limits_network.test.sql).
-- The limits and the wait are set here, since the local seed lifts the
-- limits and shortens the wait for the browser tests.
begin;
select plan(51);

select set_eq(
  $$select kind, scope, per from private.auth_limits$$,
  $$values
    ('send'::text, 'phone'::text, interval '15 minutes'),
    ('send'::text, 'phone'::text, interval '1 day'),
    ('send'::text, 'caller'::text, interval '15 minutes'),
    ('verify'::text, 'phone'::text, interval '15 minutes'),
    ('verify'::text, 'phone'::text, interval '1 day'),
    ('verify'::text, 'caller'::text, interval '15 minutes')$$,
  'each number has a quarter of an hour and a day; each caller a quarter of an hour'
);
select throws_ok(
  $$insert into private.auth_limits (kind, scope, max_count, per)
    values ('send', 'phone', 1, interval '1 day')$$,
  '23505', null, 'one window of each length for a kind and scope'
);
select throws_ok(
  $$insert into private.auth_send_wait (per) values (interval '1 minute')$$,
  '23505', null, 'one wait between codes, for every number'
);

update private.auth_limits set max_count = 2
where kind = 'send' and scope = 'phone' and per = interval '15 minutes';
update private.auth_limits set max_count = 3
where kind = 'send' and scope = 'phone' and per = interval '1 day';
update private.auth_limits set max_count = 100
where kind = 'send' and scope = 'caller';
update private.auth_limits set max_count = 3
where kind = 'verify' and scope = 'phone' and per = interval '15 minutes';
update private.auth_limits set max_count = 5
where kind = 'verify' and scope = 'phone' and per = interval '1 day';
update private.auth_limits set max_count = 2
where kind = 'verify' and scope = 'caller';
-- As on a hosted project.
update private.auth_send_wait set per = interval '65 seconds';

-- Numbers with an account: 5509 as the auth server keeps it, with no +, and
-- 5510 with one. 5508 has none.
insert into auth.users (id, aud, role, phone)
values
  ('55000000-0000-4000-a000-000000000009', 'authenticated', 'authenticated', '972500005509'),
  ('55000000-0000-4000-a000-000000000010', 'authenticated', 'authenticated', '+972500005510');

set local role service_role;

-- No code sent: nothing to check.
select is(
  public.note_auth_attempt('verify', '+972500005501', '7.7.7.1', '2026-11-20 08:00+00'),
  -1, 'a check for a number no code was sent to is refused: nothing to check'
);
select is(
  (select max(w) from (
    select public.note_auth_attempt('verify', '+972500005502', '7.7.7.2',
      '2026-11-20 08:00+00'::timestamptz + n * interval '1 second') as w
    from generate_series(1, 3) n
  ) tries),
  100898, 'with no code waiting, a check is still held by its caller''s limit, said as the caller''s'
);

-- A code's ten minutes.
select is(
  public.note_auth_attempt('send', '+972500005503', null, '2026-11-20 09:00+00'),
  0, 'a code goes to a number'
);
select is(
  public.note_auth_attempt('verify', '+972500005503', null, '2026-11-20 09:09:59+00'),
  0, 'within a code''s ten minutes a check is counted, to be checked'
);
select is(
  public.note_auth_attempt('verify', '+972500005503', null, '2026-11-20 09:10:01+00'),
  -1, 'past its ten minutes there is nothing to check'
);
select is(
  public.note_auth_attempt('verify', '+972500005504', null, '2026-11-20 09:01+00'),
  -1, 'a code sent to another number is no code for this one'
);
select is(
  public.note_auth_attempt('send', '+972500005505', null, '2026-11-20 09:30+00'),
  0, 'a code is counted'
);
select public.forget_auth_attempt('send', '+972500005505', '', '2026-11-20 09:30+00');
select is(
  public.note_auth_attempt('verify', '+972500005505', null, '2026-11-20 09:31+00'),
  -1, 'a code given back, which the auth server never sent, leaves nothing to check'
);

-- A number's checks: a quarter of an hour, and a day.
select is(
  public.note_auth_attempt('send', '+972500005506', null, '2026-11-20 10:00+00'),
  0, 'a code goes to a number'
);
select is(
  (select max(w) from (
    select public.note_auth_attempt('verify', '+972500005506', null,
      '2026-11-20 10:00+00'::timestamptz + n * interval '1 second') as w
    from generate_series(1, 4) n
  ) tries),
  897, 'the quarter of an hour still holds a number''s checks'
);
select is(
  public.note_auth_attempt('send', '+972500005506', null, '2026-11-20 10:20+00'),
  0, 'a second code goes to it, twenty minutes on'
);
select is(
  (select max(w) from (
    select public.note_auth_attempt('verify', '+972500005506', null,
      '2026-11-20 10:20+00'::timestamptz + n * interval '1 second') as w
    from generate_series(1, 3) n
  ) tries),
  85198, 'the day holds a number that checked its day''s codes, until the first leaves it'
);

-- A number's codes sent: a quarter of an hour, and a day.
select is(
  public.note_auth_attempt('send', '+972500005507', null, '2026-11-20 11:00+00'),
  0, 'a first code goes'
);
select is(
  public.note_auth_attempt('send', '+972500005507', null, '2026-11-20 11:01:30+00'),
  0, 'and a second, a minute and a half on'
);
select is(
  public.note_auth_attempt('send', '+972500005507', null, '2026-11-20 11:15:01+00'),
  0, 'a third once the first has left the quarter of an hour'
);
select is(
  public.note_auth_attempt('send', '+972500005507', null, '2026-11-20 11:30:31+00'),
  84569, 'the day holds a number sent its day''s codes'
);

-- A number with no account: sign-in counts what is sent to it and sends
-- nothing, so a stranger fills its day with nobody seeing a code. Joining
-- from its invite clears it.
select is(
  public.note_auth_attempt('send', '+972500005508', '7.7.7.3', '2026-11-20 12:00+00'),
  0, 'a stranger asks for a code for a number with no account'
);
select is(
  public.note_auth_attempt('send', '+972500005508', '7.7.7.3', '2026-11-20 12:01:30+00'),
  0, 'and again, a minute and a half on'
);
select is(
  public.note_auth_attempt('send', '+972500005508', '7.7.7.3', '2026-11-20 12:15:01+00'),
  0, 'and once more, past the quarter of an hour'
);
select is(
  public.note_auth_attempt('verify', '+972500005508', '7.7.7.3', '2026-11-20 12:16+00'),
  0, 'its checks count for the number, a send being counted'
);
select is(
  public.note_auth_attempt('send', '+972500005508', '7.7.7.3', '2026-11-20 12:30:31+00'),
  84569, 'the stranger has filled the number''s day'
);
select public.forget_number_attempts('+972500005508');
select is(
  public.note_auth_attempt('send', '+972500005508', null, '2026-11-20 12:30:32+00'),
  0, 'joining from its invite clears it, since none of those codes reached anyone'
);

-- A number with an account keeps its counts: its codes may have reached it.
select is(
  public.note_auth_attempt('send', '+972500005509', null, '2026-11-20 13:00+00'),
  0, 'a code goes to a number with an account'
);
select is(
  public.note_auth_attempt('verify', '+972500005509', null, '2026-11-20 13:01+00'),
  0, 'and is checked'
);
select is(
  public.note_auth_attempt('send', '+972500005510', null, '2026-11-20 13:00+00'),
  0, 'a code goes to a number the auth server keeps with its +'
);
select public.forget_number_attempts('+972500005509');
select public.forget_number_attempts('+972500005510');

-- The app's own wait between two codes to one number, the same for every
-- number: 5511 has no account, 5509 has one.
select is(
  public.note_auth_attempt('send', '+972500005511', '7.7.7.4', '2026-11-20 14:00+00'),
  0, 'a code is counted for a number'
);
select is(
  public.note_auth_attempt('verify', '+972500005511', '7.7.7.4', '2026-11-20 14:00:10+00'),
  0, 'a check is not held by the wait between codes'
);
select is(
  public.note_auth_attempt('send', '+972500005511', '7.7.7.4', '2026-11-20 14:01:04+00'),
  -2, 'a second send within the wait goes nowhere, a code having gone moments ago'
);
select is(
  public.note_auth_attempt('send', '+972500005511', '7.7.7.4', '2026-11-20 14:01:06+00'),
  0, 'the wait runs from the last counted send: one inside it does not lengthen it'
);
select is(
  public.note_auth_attempt('send', '+972500005509', '7.7.7.6', '2026-11-20 13:01:04+00'),
  -2, 'a number with an account meets the same wait'
);
select is(
  public.note_auth_attempt('send', '+972500005512', '7.7.7.4', '2026-11-20 14:10+00'),
  0, 'a code is counted for another number'
);
select public.forget_auth_attempt('send', '+972500005512', '7.7.7.4', '2026-11-20 14:10+00');
select is(
  public.note_auth_attempt('send', '+972500005512', '7.7.7.4', '2026-11-20 14:10:10+00'),
  0, 'a send given back, which the auth server never sent, starts no wait'
);
select is(
  (select max(w) from (
    select public.note_auth_attempt('send', '+97250000' || (5600 + n)::text, '7.7.7.5',
      '2026-11-20 15:00+00'::timestamptz + n * interval '1 second') as w
    from generate_series(1, 100) n
  ) tries),
  0, 'a caller sends its quarter of an hour''s codes, each to its own number'
);
select is(
  public.note_auth_attempt('send', '+972500005700', '7.7.7.5', '2026-11-20 15:01:50+00'),
  100791, 'within the wait, a send is still held by its caller''s limit, said as the caller''s'
);
-- Two codes asked for at once: the app stamps each before it reaches the
-- database, so the one stamped later may take the number's lock first.
select is(
  public.note_auth_attempt('send', '+972500005513', '7.7.7.7', '2026-11-20 16:00:01+00'),
  0, 'of two codes asked for at once, the one stamped later may be counted first'
);
select is(
  public.note_auth_attempt('send', '+972500005513', '7.7.7.7', '2026-11-20 16:00:00+00'),
  -2, 'and the one stamped a moment before it meets the wait all the same'
);

reset role;

select is(
  (select count(*)::int from private.auth_attempts
   where kind = 'verify'
     and key_hash = encode(sha256(convert_to('phone:+972500005501', 'UTF8')), 'hex')),
  0, 'a check with nothing to check is not counted for the number'
);
select is(
  (select count(*)::int from private.auth_attempts
   where kind = 'verify'
     and key_hash = encode(sha256(convert_to('caller:7.7.7.1', 'UTF8')), 'hex')),
  1, 'but it is counted for its caller'
);
select is(
  (select count(*)::int from private.auth_attempts
   where kind = 'verify'
     and key_hash = encode(sha256(convert_to('phone:+972500005503', 'UTF8')), 'hex')),
  1, 'a check with a code waiting is counted for the number'
);
select ok(
  (select count(*) from private.auth_attempts
   where kind = 'verify'
     and key_hash = encode(sha256(convert_to('phone:+972500005502', 'UTF8')), 'hex')) = 0
  and (select count(*) from private.auth_attempts
   where kind = 'verify'
     and key_hash = encode(sha256(convert_to('caller:7.7.7.2', 'UTF8')), 'hex')) = 2,
  'a check the caller''s limit held is counted nowhere'
);
select is(
  (select count(*)::int from private.auth_attempts
   where key_hash = encode(sha256(convert_to('phone:+972500005508', 'UTF8')), 'hex')),
  1, 'the cleared tries are gone, sent and checked, and only the code joining asked for stays'
);
select is(
  (select count(*)::int from private.auth_attempts
   where key_hash = encode(sha256(convert_to('caller:7.7.7.3', 'UTF8')), 'hex')),
  4, 'the stranger''s own counts stay: three sends and a check, the refused send counted nowhere'
);
select ok(
  (select count(*) from private.auth_attempts
   where key_hash = encode(sha256(convert_to('phone:+972500005509', 'UTF8')), 'hex')) = 2
  and (select count(*) from private.auth_attempts
   where key_hash = encode(sha256(convert_to('phone:+972500005510', 'UTF8')), 'hex')) = 1,
  'a number with an account keeps its counts, however the auth server spells it'
);
select is(
  (select count(*)::int from private.auth_attempts
   where kind = 'send'
     and key_hash = encode(sha256(convert_to('phone:+972500005511', 'UTF8')), 'hex')),
  2, 'a send within the wait is not counted for its number'
);
select is(
  (select count(*)::int from private.auth_attempts
   where kind = 'send'
     and key_hash = encode(sha256(convert_to('caller:7.7.7.4', 'UTF8')), 'hex')),
  4, 'but it is counted for its caller, and the send given back for neither'
);
select is(
  (select count(*)::int from private.auth_attempts
   where kind = 'send'
     and key_hash = encode(sha256(convert_to('phone:+972500005513', 'UTF8')), 'hex')),
  1, 'of two codes asked for at once, one is counted for the number'
);
select ok(
  not has_table_privilege('authenticated', 'private.auth_send_wait', 'select, insert, update, delete')
  and not has_table_privilege('anon', 'private.auth_send_wait', 'select, insert, update, delete'),
  'nobody but the server reads or changes the wait'
);
select ok(
  not has_function_privilege('authenticated', 'public.forget_number_attempts(text)', 'execute')
  and not has_function_privilege('anon', 'public.forget_number_attempts(text)', 'execute')
  and has_function_privilege('service_role', 'public.forget_number_attempts(text)', 'execute'),
  'only the server clears a number'
);

select * from finish();
rollback;
