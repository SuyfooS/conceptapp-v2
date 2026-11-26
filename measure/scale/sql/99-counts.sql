-- 99-counts: what the database holds for one business, and for the seed's
-- people as a whole, read back after each part and compared with shape.ts.
-- Also the per-table sizes for the cost of a business (seed.ts).

-- step: business
select jsonb_build_object(
  'memberships', (select count(*) from public.memberships m where m.business_id = r.business),
  'memberships_active', (select count(*) from public.memberships m
    where m.business_id = r.business and m.active),
  'member_names', (select count(*) from public.member_names n where n.business_id = r.business),
  'departments', (select count(*) from public.departments d where d.business_id = r.business),
  'department_members', (select count(*) from public.department_members d
    where d.business_id = r.business),
  'named_roles', (select count(*) from public.business_roles br
    where br.business_id = r.business),
  'weeks', (select count(*) from public.schedule_weeks w where w.business_id = r.business),
  'shifts', (select count(*) from public.schedule_shifts s where s.business_id = r.business),
  'assignments', (select count(*) from public.shift_assignments a
    where a.business_id = r.business),
  'submissions', (select count(*) from public.availability_submissions s
    where s.business_id = r.business),
  'ranges', (select count(*) from public.availability_ranges ar
    join public.availability_submissions s on s.id = ar.submission_id
    where s.business_id = r.business),
  'swaps', (select count(*) from public.shift_swaps s where s.business_id = r.business),
  'swaps_open', (select count(*) from public.shift_swaps s
    where s.business_id = r.business and s.status = 'open'),
  'entries', (select count(*) from public.time_entries e where e.business_id = r.business),
  'entries_open', (select count(*) from public.time_entries e
    where e.business_id = r.business and e.clock_out is null),
  'entries_waiting_none', (select count(*) from public.time_entries e
    where e.business_id = r.business and e.in_proof = 'none' and e.confirmed_at is null),
  'entries_waiting_self', (select count(*) from public.time_entries e
    where e.business_id = r.business and e.in_proof = 'self' and e.confirmed_at is null),
  'breaks', (select count(*) from public.time_breaks b where b.business_id = r.business),
  'absences', (select count(*) from public.absences ab where ab.business_id = r.business),
  'wages', (select count(*) from public.member_wages w where w.business_id = r.business),
  'payroll_details', (select count(*) from public.member_payroll_details d
    where d.business_id = r.business),
  'periods', (select count(*) from public.employment_periods p where p.business_id = r.business),
  'periods_ended', (select count(*) from public.employment_periods p
    where p.business_id = r.business and p.ended_on is not null),
  'periods_on_joining', (select count(*) from public.employment_periods p
    join public.memberships m on m.business_id = p.business_id and m.user_id = p.user_id
    where p.business_id = r.business
      and p.started_on = (m.created_at at time zone 'Asia/Jerusalem')::date)
-- Two objects: a call takes at most 100 arguments.
) || jsonb_build_object(
  'conversations', (select count(*) from public.chat_conversations c
    where c.business_id = r.business),
  'messages', (select count(*) from public.chat_messages cm where cm.business_id = r.business),
  'acks', (select count(*) from public.chat_acks a where a.business_id = r.business),
  'reads', (select count(*) from public.chat_reads cr where cr.business_id = r.business),
  'documents', (select count(*) from public.documents d where d.business_id = r.business),
  'recipients', (select count(*) from public.document_recipients dr
    where dr.business_id = r.business),
  'uploads', (select count(*) from private.file_uploads u where u.business_id = r.business),
  'objects', (select count(*) from storage.objects o
    where o.name like r.business::text || '/%'),
  'lines', (select count(*) from public.notifications n where n.business_id = r.business),
  'lines_joined', (select count(*) from public.notifications n
    where n.business_id = r.business and n.kind = 'team.joined'),
  'lines_published', (select count(*) from public.notifications n
    where n.business_id = r.business and n.kind = 'schedule.published'),
  'lines_confirm', (select count(*) from public.notifications n
    where n.business_id = r.business and n.kind = 'clock.confirm'),
  'lines_read', (select count(*) from public.notifications n
    where n.business_id = r.business and n.read_at is not null),
  'lines_pushing', (select count(*) from public.notifications n
    where n.business_id = r.business and n.push_state <> 'none'),
  'invites', (select count(*) from public.invites i where i.business_id = r.business),
  'invites_waiting', (select count(*) from public.invites i
    where i.business_id = r.business and i.claimed_at is null and i.expires_at > now()),
  'log', (select count(*) from public.audit_log a where a.business_id = r.business),
  'log_clock_in', (select count(*) from public.audit_log a
    where a.business_id = r.business and a.action = 'clock.in'),
  'log_clock_out', (select count(*) from public.audit_log a
    where a.business_id = r.business and a.action = 'clock.out'),
  'log_clock_confirm', (select count(*) from public.audit_log a
    where a.business_id = r.business and a.action = 'clock.confirm'),
  'log_clock_correct', (select count(*) from public.audit_log a
    where a.business_id = r.business and a.action = 'clock.correct'),
  'log_break_start', (select count(*) from public.audit_log a
    where a.business_id = r.business and a.action = 'clock.break_start'),
  'log_break_end', (select count(*) from public.audit_log a
    where a.business_id = r.business and a.action = 'clock.break_end'),
  'log_payroll_view', (select count(*) from public.audit_log a
    where a.business_id = r.business and a.action = 'payroll.view'),
  'log_schedule_publish', (select count(*) from public.audit_log a
    where a.business_id = r.business and a.action = 'schedule.publish'),
  'log_absence_add', (select count(*) from public.audit_log a
    where a.business_id = r.business and a.action = 'clock.absence_add')
) as counts
from jsonb_to_recordset($1::jsonb) as r (business uuid);

-- step: people
select jsonb_build_object(
  'users', (select count(*) from auth.users u where u.id::text like '5ca1e300-%'),
  'users_with_phone', (select count(*) from auth.users u
    where u.id::text like '5ca1e300-%' and coalesce(u.phone, '') <> ''),
  'users_elsewhere', (select count(*) from auth.users u
    where u.id::text like '5ca1e300-%' and u.email not like '%@scale.conceptapp.invalid'),
  'profiles', (select count(*) from public.profiles p where p.id::text like '5ca1e300-%'),
  'platform_staff', (select count(*) from public.platform_staff s
    where s.user_id::text like '5ca1e300-%'),
  'push_subscriptions', (select count(*) from public.push_subscriptions p
    where p.user_id::text like '5ca1e300-%'),
  'demo_businesses', (select count(*) from private.demo_businesses d
    where d.business_id::text like '5ca1e300-%'),
  'businesses', (select count(*) from public.businesses b where b.id::text like '5ca1e300-%')
) as counts;
