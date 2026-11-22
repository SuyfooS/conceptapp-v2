-- The hiring file (profile H5a, issue #82): when the person's bank change
-- opens again after a phone change, read before an SMS code goes.
--
-- set_employee_details (20261126000200_employee_files.sql) refuses a bank
-- write in the week after a phone change, measured at the write's own time.
-- The server tries the account whole before a code goes (@db/employee-files
-- `checkBankChange`), dated past any code's ten minutes so the try always
-- stops at the code and keeps nothing; dated that far on, it would miss a
-- week that ends in between, send the SMS, and spend the code on a write that
-- then can't go. So the week is read here at the real time: when it ends and
-- its day in the business's zone (the day set_employee_details's refusal
-- names), or null once it has ended, or with no change (a first number is
-- not one). The secret key's alone; nothing is logged, and nothing changes.

create function public.bank_change_hold(
  business uuid,
  person uuid,
  at_time timestamptz default now()
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'opens_at', h.opens_at,
    'opens_on', to_char((h.opens_at at time zone b.timezone)::date, 'YYYY-MM-DD')
  )
  from (
    select max(pc.changed_at) + interval '7 days' as opens_at
    from private.phone_changes pc
    where pc.user_id = bank_change_hold.person
  ) as h
  join public.businesses b on b.id = bank_change_hold.business
  where h.opens_at > coalesce(bank_change_hold.at_time, now())
$$;

revoke execute on function public.bank_change_hold(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.bank_change_hold(uuid, uuid, timestamptz)
  to service_role;
