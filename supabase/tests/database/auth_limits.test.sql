-- Limits on sign-in codes (20261108000300_sealed.sql): each code sent or
-- checked is counted per number and per caller, and one over the limit is
-- refused, with the seconds to wait, and not counted. Numbers and addresses
-- are kept only as hashes, for a day. The limits are set here, since the
-- local seed lifts them for the browser tests.
begin;
select plan(19);

update private.auth_limits set max_count = 2, per = interval '15 minutes'
where kind = 'send' and scope = 'phone';
update private.auth_limits set max_count = 3, per = interval '10 minutes'
where kind = 'send' and scope = 'caller';
update private.auth_limits set max_count = 4, per = interval '15 minutes'
where kind = 'verify';

-- An attempt from two days ago, to be cleared.
insert into private.auth_attempts (kind, key_hash, at)
values ('send', repeat('0', 64), '2026-11-08 08:00+00');

set local role service_role;

-- Per number.
select is(
  public.note_auth_attempt('send', '+972500000981', '1.1.1.1', '2026-11-10 08:00+00'),
  0, 'a first code is sent'
);
select is(
  public.note_auth_attempt('send', '+972500000981', '2.2.2.2', '2026-11-10 08:00:20+00'),
  0, 'a second one, from anywhere'
);
select is(
  public.note_auth_attempt('send', '+972500000981', '3.3.3.3', '2026-11-10 08:01+00'),
  840, 'a third within the window waits until the first leaves it'
);
select is(
  public.note_auth_attempt('send', '+972500000982', '3.3.3.3', '2026-11-10 08:01:10+00'),
  0, 'another number is not held up'
);
select is(
  public.note_auth_attempt('send', '+972500000981', '3.3.3.3', '2026-11-10 08:15:01+00'),
  0, 'once the first has left the window, a code is sent again'
);

-- Per caller.
select is(
  public.note_auth_attempt('send', '+972500000983', '4.4.4.4', '2026-11-10 09:00+00'),
  0, 'a caller sends a code'
);
select is(
  public.note_auth_attempt('send', '+972500000984', '4.4.4.4', '2026-11-10 09:00:10+00'),
  0, 'to a second number'
);
select is(
  public.note_auth_attempt('send', '+972500000985', '4.4.4.4', '2026-11-10 09:00:20+00'),
  0, 'and a third'
);
select is(
  public.note_auth_attempt('send', '+972500000986', '4.4.4.4', '2026-11-10 09:00:30+00'),
  570, 'a fourth number from the same caller waits'
);
select is(
  public.note_auth_attempt('send', '+972500000986', null, '2026-11-10 09:00:40+00'),
  0, 'the number itself was not held against its limit'
);

-- Checking codes is counted apart from sending them.
select is(
  public.note_auth_attempt('verify', '+972500000981', '1.1.1.1', '2026-11-10 08:15:02+00'),
  0, 'a number that sent its limit still checks a code'
);
select is(
  (select max(w) from (
    select public.note_auth_attempt('verify', '+972500000987', null,
      '2026-11-10 10:00+00'::timestamptz + n * interval '1 second') as w
    from generate_series(1, 5) n
  ) tries),
  896, 'the fifth check in the window waits'
);

select is(
  public.note_auth_attempt('send', null, null, '2026-11-10 11:00+00'),
  0, 'with no number and no caller there is nothing to count'
);
select throws_ok(
  $$select public.note_auth_attempt('call', '+972500000981', null, '2026-11-10 11:00+00')$$,
  '22023', null, 'only sending and checking are counted'
);

-- A try the auth server sent nothing for is given back.
select is(
  public.note_auth_attempt('send', '+972500000988', '5.5.5.5', '2026-11-10 12:00+00'),
  0, 'a code is counted'
);
select public.forget_auth_attempt('send', '+972500000988', '5.5.5.5', '2026-11-10 12:00+00');

reset role;
select is(
  (select count(*)::int from private.auth_attempts
   where key_hash = encode(sha256(convert_to('phone:+972500000981', 'UTF8')), 'hex')
     and kind = 'send'),
  3,
  'a number is kept as its hash, and a refused try is not counted'
);
select is(
  (select count(*)::int from private.auth_attempts where at < '2026-11-09 11:00+00'),
  0,
  'attempts older than a day are cleared'
);
select is(
  (select count(*)::int from private.auth_attempts where at = '2026-11-10 12:00+00'),
  0,
  'and the try that sent nothing is given back, for the number and the caller'
);

select ok(
  not has_function_privilege('authenticated', 'public.note_auth_attempt(text, text, text, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.note_auth_attempt(text, text, text, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.forget_auth_attempt(text, text, text, timestamptz)', 'execute')
  and not has_table_privilege('authenticated', 'private.auth_attempts', 'select, insert, update, delete')
  and not has_table_privilege('anon', 'private.auth_limits', 'select, insert, update, delete'),
  'only the server counts, and nobody reads the counts'
);

select * from finish();
rollback;
