-- Limits on sign-in codes, after 20261127000200_sign_in_windows.sql: a
-- number has a quarter-hour window and a day's for each kind, and a check is
-- counted for its number only while a code sent to it may still be waiting
-- (ten minutes). Without one there is nothing to check: the check answers -1
-- and is counted for its caller alone. The limits are set here, since the
-- local seed lifts them for the browser tests.
begin;
select plan(22);

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
  898, 'with no code waiting, a check is still held by its caller''s limit'
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
  public.note_auth_attempt('send', '+972500005507', null, '2026-11-20 11:00:30+00'),
  0, 'and a second'
);
select is(
  public.note_auth_attempt('send', '+972500005507', null, '2026-11-20 11:15:01+00'),
  0, 'a third once the first has left the quarter of an hour'
);
select is(
  public.note_auth_attempt('send', '+972500005507', null, '2026-11-20 11:30:31+00'),
  84569, 'the day holds a number sent its day''s codes'
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

select * from finish();
rollback;
