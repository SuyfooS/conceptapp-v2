import { sql } from "./pg";

export type OpenedBusiness = {
  name: string;
  accent: string;
  templateKey: string | null;
  modules: number;
  audited: number;
};

/** A business the wizard opened, as the database has it. */
export async function businessBySlug(
  slug: string,
): Promise<OpenedBusiness | null> {
  const rows = await sql<OpenedBusiness[]>`
    select b.name, b.accent, b.template_key as "templateKey",
      (select count(*)::int from public.business_modules m
        where m.business_id = b.id) as modules,
      (select count(*)::int from public.audit_log a
        where a.business_id = b.id and a.action = 'business.create') as audited
    from public.businesses b where b.slug = ${slug}`;
  return rows[0] ?? null;
}

export type OpenInvite = { name: string | null; phone: string; role: string };

/** The open invites of a business, by phone number. */
export async function invitesBySlug(slug: string): Promise<OpenInvite[]> {
  return await sql<OpenInvite[]>`
    select i.full_name as name, i.phone, i.role::text as role
    from public.invites i join public.businesses b on b.id = i.business_id
    where b.slug = ${slug} and i.claimed_at is null
    order by i.phone`;
}

const DEMO_RESTAURANT = "00000000-0000-4000-b000-000000000001";

/**
 * An open invite to the demo restaurant, as the wizard leaves one. Clears
 * an earlier run's invite and membership for the number first, so the
 * spec can run again on the same local database.
 */
export async function inviteToDemo(invite: {
  name: string;
  phone: string;
  role: "owner" | "manager" | "worker";
  /** Days until it expires; negative for one that already has. */
  expiresInDays?: number;
}): Promise<void> {
  await sql`delete from public.invites
    where business_id = ${DEMO_RESTAURANT} and phone = ${invite.phone}`;
  // A wage, payroll details and employment periods are kept
  // (20261110000500_hourly_wages.sql, 20261110000600_payroll_details.sql) and
  // hold their membership: only a purge that names the business deletes them,
  // for this transaction, and they go first.
  await sql.begin(async (tx) => {
    await tx`select set_config('ca.records_purge', ${DEMO_RESTAURANT}, true)`;
    await tx`delete from public.member_wages w using public.profiles p
      where w.business_id = ${DEMO_RESTAURANT} and w.user_id = p.id
        and p.phone = ${invite.phone}`;
    await tx`delete from public.member_payroll_details d using public.profiles p
      where d.business_id = ${DEMO_RESTAURANT} and d.user_id = p.id
        and p.phone = ${invite.phone}`;
    await tx`delete from public.employment_periods e using public.profiles p
      where e.business_id = ${DEMO_RESTAURANT} and e.user_id = p.id
        and p.phone = ${invite.phone}`;
    await tx`delete from public.memberships m using public.profiles p
      where m.business_id = ${DEMO_RESTAURANT} and m.user_id = p.id
        and p.phone = ${invite.phone}`;
  });
  await sql`insert into public.invites
      (business_id, phone, role, full_name, token_hash, expires_at)
    values (${DEMO_RESTAURANT}, ${invite.phone}, ${invite.role},
      ${invite.name}, md5(random()::text) || md5(random()::text),
      now() + make_interval(days => ${invite.expiresInDays ?? 14}))`;
}

/**
 * The demo restaurant's unclaimed invite to this number: its role, whether
 * it is still open, and whether someone on the ConceptApp team sent it.
 */
export async function demoInvite(phone: string): Promise<{
  role: string;
  open: boolean;
  byTeam: boolean;
} | null> {
  const rows = await sql<{ role: string; open: boolean; byTeam: boolean }[]>`
    select i.role::text as role, i.expires_at > now() as open,
      exists (select 1 from public.platform_staff s
        where s.user_id = i.invited_by) as "byTeam"
    from public.invites i
    where i.business_id = ${DEMO_RESTAURANT} and i.phone = ${phone}
      and i.claimed_at is null`;
  return rows[0] ?? null;
}

/** The person's role in the demo restaurant, or null when not a member. */
export async function demoRole(phone: string): Promise<string | null> {
  const rows = await sql<{ role: string }[]>`
    select m.role::text as role from public.memberships m
    join public.profiles p on p.id = m.user_id
    where m.business_id = ${DEMO_RESTAURANT} and p.phone = ${phone}
      and m.active`;
  return rows[0]?.role ?? null;
}

/** Remove the demo restaurant's invites to these numbers. */
export async function removeDemoInvites(phones: string[]): Promise<void> {
  await sql`delete from public.invites
    where business_id = ${DEMO_RESTAURANT} and phone in ${sql(phones)}`;
}

/** How many `view_as.start` and `view_as.end` entries the person has. */
export async function viewAudit(
  phone: string,
): Promise<{ start: number; end: number }> {
  const rows = await sql<{ start: number; end: number }[]>`
    select
      count(*) filter (where a.action = 'view_as.start')::int as start,
      count(*) filter (where a.action = 'view_as.end')::int as end
    from public.audit_log a join public.profiles p on p.id = a.actor_id
    where p.phone = ${phone}`;
  return rows[0] ?? { start: 0, end: 0 };
}

/**
 * End the person's open view session, so a failed spec never leaves the
 * console's platform admin inside a business for the specs after it.
 */
export async function endViewSessions(phone: string): Promise<void> {
  await sql`update public.view_sessions v set ended_at = now()
    from public.profiles p
    where p.id = v.staff_id and p.phone = ${phone} and v.ended_at is null`;
}

/** Remove everything the person sent as availability to the demo restaurant. */
export async function clearAvailability(phone: string): Promise<void> {
  await sql`delete from public.availability_submissions s
    using public.profiles p
    where s.business_id = ${DEMO_RESTAURANT} and s.user_id = p.id
      and p.phone = ${phone}`;
}

/**
 * A person starts with nothing on the clock. Hours are kept
 * (20261110000100_hours_kept.sql): only a purge that names the business may
 * delete them, for this transaction, and an entry's breaks go first. Never the
 * whole purge, which would take every person's hours and the restaurant's log
 * from under the specs running beside this one.
 */
export async function clearTimeEntries(phone: string): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`select set_config('ca.records_purge', ${DEMO_RESTAURANT}, true)`;
    await tx`delete from public.time_breaks b
      using public.profiles p
      where b.business_id = ${DEMO_RESTAURANT} and b.user_id = p.id
        and p.phone = ${phone}`;
    await tx`delete from public.time_entries e
      using public.profiles p
      where e.business_id = ${DEMO_RESTAURANT} and e.user_id = p.id
        and p.phone = ${phone}`;
  });
}

/** A shift already worked: on the 1st of this month, or the 10th of an earlier one. */
export async function addDemoShift(
  phone: string,
  shift: { monthsAgo: number; minutes: number; unpaidBreak: number },
): Promise<void> {
  // The month as the business counts it, which is not always UTC's.
  const [year = 0, month = 1] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
  })
    .format(new Date())
    .split("-")
    .map(Number);
  const day = shift.monthsAgo === 0 ? 1 : 10;
  const start = new Date(Date.UTC(year, month - 1 - shift.monthsAgo, day, 6));
  const end = new Date(start.getTime() + shift.minutes * 60_000);
  const [entry] = await sql<{ id: string; user_id: string }[]>`
    insert into public.time_entries (business_id, user_id, clock_in, clock_out)
    select ${DEMO_RESTAURANT}::uuid, p.id, ${start}::timestamptz, ${end}::timestamptz
    from public.profiles p where p.phone = ${phone}
    returning id, user_id`;
  if (!entry) throw new Error(`no profile for ${phone}`);
  if (shift.unpaidBreak > 0) {
    const breakEnd = new Date(
      start.getTime() + (10 + shift.unpaidBreak) * 60_000,
    );
    await sql`
      insert into public.time_breaks
        (entry_id, business_id, user_id, started_at, ended_at, unpaid)
      values (${entry.id}, ${DEMO_RESTAURANT}, ${entry.user_id},
        ${new Date(start.getTime() + 10 * 60_000)}, ${breakEnd}, true)`;
  }
}

/**
 * Someone who clocked in some hours ago and is still on the clock, by default
 * with no proof, as before codes; `inProof: "none"` as if without a code.
 */
export async function addOpenDemoEntry(
  phone: string,
  hoursAgo: number,
  inProof: "none" | "typed" | null = null,
): Promise<void> {
  await sql`
    insert into public.time_entries (business_id, user_id, clock_in, in_proof)
    select ${DEMO_RESTAURANT}::uuid, p.id,
      ${new Date(Date.now() - hoursAgo * 3_600_000)}::timestamptz, ${inProof}
    from public.profiles p where p.phone = ${phone}`;
}

/** Whether the demo restaurant asks for the clock's code to clock in and out. */
export async function setDemoRequirePunchCode(on: boolean): Promise<void> {
  await sql`
    update public.business_modules
    set settings = settings || ${sql.json({ requirePunchCode: on })}::jsonb
    where business_id = ${DEMO_RESTAURANT} and module_key = 'time_clock'`;
}

/** No live codes at the demo restaurant, and nobody's typing blocked. */
export async function clearPunchState(): Promise<void> {
  await sql`delete from public.punch_codes
    where business_id = ${DEMO_RESTAURANT}`;
  await sql`delete from private.punch_attempts
    where business_id = ${DEMO_RESTAURANT}`;
}

/** How many typed codes the person has had counted at the demo restaurant. */
export async function demoPunchAttempts(phone: string): Promise<number> {
  const [row] = await sql<{ count: number }[]>`
    select count(*)::int as count from private.punch_attempts a
    join public.profiles p on p.id = a.user_id
    where a.business_id = ${DEMO_RESTAURANT} and p.phone = ${phone}`;
  return row?.count ?? 0;
}

export type EntryProofs = {
  inProof: string | null;
  outProof: string | null;
  confirmed: boolean;
};

/** How each of the person's entries at the demo restaurant was made, oldest first. */
export async function demoEntryProofs(phone: string): Promise<EntryProofs[]> {
  return await sql<EntryProofs[]>`
    select e.in_proof as "inProof", e.out_proof as "outProof",
      e.confirmed_at is not null as confirmed
    from public.time_entries e
    join public.profiles p on p.id = e.user_id
    where e.business_id = ${DEMO_RESTAURANT} and p.phone = ${phone}
    order by e.clock_in`;
}

/**
 * How many rows of `action` the demo restaurant's log has had since `since`:
 * the log keeps earlier runs' rows on the same local database.
 */
export async function demoActivityActions(
  action: string,
  since: Date,
): Promise<number> {
  const [row] = await sql<{ count: number }[]>`
    select count(*)::int as count from public.audit_log
    where business_id = ${DEMO_RESTAURANT} and action = ${action}
      and created_at >= ${since}`;
  return row?.count ?? 0;
}

/** Whether breaks come off the hours at the demo restaurant. */
export async function setDemoUnpaidBreaks(unpaid: boolean): Promise<void> {
  await sql`
    update public.business_modules
    set settings = settings || ${sql.json({ unpaidBreaks: unpaid })}::jsonb
    where business_id = ${DEMO_RESTAURANT} and module_key = 'time_clock'`;
}

/** A module's stored settings at the demo restaurant, to put back afterwards. */
export async function demoModuleSettings(
  module: string,
): Promise<Record<string, unknown>> {
  const rows = await sql<{ settings: Record<string, unknown> }[]>`
    select settings from public.business_modules
    where business_id = ${DEMO_RESTAURANT} and module_key = ${module}`;
  return rows[0]?.settings ?? {};
}

/** Whether a module is on at the demo restaurant. */
export async function demoModuleEnabled(module: string): Promise<boolean> {
  const rows = await sql<{ enabled: boolean }[]>`
    select enabled from public.business_modules
    where business_id = ${DEMO_RESTAURANT} and module_key = ${module}`;
  return rows[0]?.enabled ?? false;
}

export async function setDemoModuleSettings(
  module: string,
  settings: Record<string, unknown>,
): Promise<void> {
  await sql`
    update public.business_modules
    set settings = ${sql.json(settings as never)}::jsonb
    where business_id = ${DEMO_RESTAURANT} and module_key = ${module}`;
}

export type DemoDetails = {
  name: string;
  accent: string;
  address: string | null;
  shabbatCity: string | null;
};

/** The demo restaurant's own details, to check a save and put them back. */
export async function demoBusinessDetails(): Promise<DemoDetails> {
  const rows = await sql<DemoDetails[]>`
    select name, accent, address, shabbat_city as "shabbatCity"
    from public.businesses where id = ${DEMO_RESTAURANT}`;
  const row = rows[0];
  if (!row) throw new Error("The demo restaurant is missing");
  return row;
}

/**
 * Whether the demo shop's week has a published schedule, and how many people
 * it puts on shifts. This week is the one today falls in, in the shop's zone.
 */
export async function demoShopWeek(): Promise<{
  published: boolean;
  assigned: number;
}> {
  const [row] = await sql<{ published: boolean; assigned: number }[]>`
    with week as (
      select w.id, w.schedule_published_at
      from public.schedule_weeks w
      join public.businesses b on b.id = w.business_id
      where b.slug = 'demo-shop'
        and (now() at time zone b.timezone)::date
          between w.starts_on and w.starts_on + 6
    )
    select
      coalesce(bool_or(week.schedule_published_at is not null), false) as published,
      (select count(*)::int from public.shift_assignments a
       join public.schedule_shifts s on s.id = a.shift_id
       where s.week_id in (select id from week)) as assigned
    from week`;
  return row ?? { published: false, assigned: 0 };
}

export async function setDemoBusinessDetails(
  details: DemoDetails,
): Promise<void> {
  await sql`
    update public.businesses
    set name = ${details.name}, accent = ${details.accent},
      address = ${details.address}, shabbat_city = ${details.shabbatCity}
    where id = ${DEMO_RESTAURANT}`;
}

/** How many saves of the demo restaurant's details its log holds. */
export async function demoDetailsLogged(): Promise<number> {
  const rows = await sql<{ count: number }[]>`
    select count(*)::int as count from public.audit_log
    where business_id = ${DEMO_RESTAURANT} and action = 'business.details'`;
  return rows[0]?.count ?? 0;
}

export type SavedAvailability = {
  weekday: number;
  start: string;
  end: string;
  note: string | null;
};

/** The person's saved ranges in the demo restaurant, by weekday (0 = Sunday). */
export async function availabilityOf(
  phone: string,
): Promise<SavedAvailability[]> {
  return await sql<SavedAvailability[]>`
    select extract(dow from r.day)::int as weekday,
      to_char(r.starts_at, 'HH24:MI') as start,
      to_char(r.ends_at, 'HH24:MI') as end, s.note
    from public.availability_submissions s
    join public.profiles p on p.id = s.user_id
    join public.availability_ranges r on r.submission_id = s.id
    where s.business_id = ${DEMO_RESTAURANT} and p.phone = ${phone}
    order by r.day, r.starts_at`;
}

/**
 * Send availability for next week to the demo restaurant as the person,
 * through the same database functions the app uses: 09:00–17:00 on the
 * week's first day. Opens the week if nobody has yet.
 */
export async function sendDemoAvailability(
  phone: string,
  note: string,
): Promise<void> {
  await sql`
    with business as (
      select (now() at time zone b.timezone)::date as today,
        coalesce((m.settings ->> 'weekStartsOn')::int, 0) as starts_on
      from public.businesses b
      join public.business_modules m
        on m.business_id = b.id and m.module_key = 'scheduling'
      where b.id = ${DEMO_RESTAURANT}
    ),
    next_week as (
      select today - ((extract(dow from today)::int - starts_on + 7) % 7)
        + 7 as starts_on
      from business
    ),
    week as (
      select starts_on,
        public.open_schedule_week(${DEMO_RESTAURANT}, starts_on,
          now() + interval '1 day') as id
      from next_week
    )
    select public.submit_availability(p.id, week.id,
      jsonb_build_array(jsonb_build_object(
        'day', week.starts_on::text, 'start', '09:00', 'end', '17:00')),
      ${note})
    from week, public.profiles p where p.phone = ${phone}`;
}

/** Remove the demo restaurant's saved schedules, back to drafts. */
export async function clearSchedule(): Promise<void> {
  await sql`delete from public.schedule_shifts
    where business_id = ${DEMO_RESTAURANT}`;
  await sql`update public.schedule_weeks
    set schedule_saved_at = null, schedule_published_at = null
    where business_id = ${DEMO_RESTAURANT}`;
}

/** Whether any of the demo restaurant's weeks has a published schedule. */
export async function schedulePublished(): Promise<boolean> {
  const [row] = await sql<{ published: boolean }[]>`
    select exists (
      select 1 from public.schedule_weeks
      where business_id = ${DEMO_RESTAURANT}
        and schedule_published_at is not null
    ) as published`;
  return row?.published ?? false;
}

export type SavedAssignment = {
  weekday: number;
  pattern: string | null;
  phone: string;
  /** The position key the person works in, or null. */
  position: string | null;
};

/** Who the demo restaurant's saved schedules put on which shift, and in
 * which position. */
export async function scheduleAssignments(): Promise<SavedAssignment[]> {
  return await sql<SavedAssignment[]>`
    select extract(dow from s.day)::int as weekday,
      s.pattern_key as pattern, p.phone, a.position_key as position
    from public.schedule_shifts s
    join public.shift_assignments a on a.shift_id = s.id
    join public.profiles p on p.id = a.user_id
    where s.business_id = ${DEMO_RESTAURANT}
    order by s.day, s.starts_at, p.phone`;
}

export type SavedShift = {
  weekday: number;
  name: string;
  start: string;
  end: string;
  needed: number;
  pattern: string | null;
};

/** The demo restaurant's saved shifts, day by day and earliest first. */
export async function scheduleShifts(): Promise<SavedShift[]> {
  return await sql<SavedShift[]>`
    select extract(dow from day)::int as weekday, name,
      to_char(starts_at, 'HH24:MI') as start,
      to_char(ends_at, 'HH24:MI') as "end",
      needed, pattern_key as pattern
    from public.schedule_shifts
    where business_id = ${DEMO_RESTAURANT}
    order by day, starts_at, name`;
}

/**
 * Put people on next week's Sunday shifts of the demo restaurant through
 * the database functions the app uses, as its manager: a draft, or
 * published to the team. `morning` and `evening` are phone numbers, each
 * with a position key or null. Opens the week if nobody has yet.
 */
export async function scheduleDemoSunday(
  people: {
    morning: [phone: string, position: string | null][];
    evening: [phone: string, position: string | null][];
  },
  publish: boolean,
): Promise<void> {
  const ids = await sql<{ phone: string; id: string }[]>`
    select phone, id::text from public.profiles
    where phone in ${sql([...people.morning, ...people.evening].map(([p]) => p))}`;
  const id = (phone: string) => ids.find((r) => r.phone === phone)?.id;
  const [week] = await sql<{ id: string; starts_on: string }[]>`
    with business as (
      select (now() at time zone b.timezone)::date as today,
        coalesce((m.settings ->> 'weekStartsOn')::int, 0) as starts_on
      from public.businesses b
      join public.business_modules m
        on m.business_id = b.id and m.module_key = 'scheduling'
      where b.id = ${DEMO_RESTAURANT}
    ),
    next_week as (
      select today - ((extract(dow from today)::int - starts_on + 7) % 7)
        + 7 as starts_on
      from business
    )
    select public.open_schedule_week(${DEMO_RESTAURANT}, starts_on,
        now() + interval '1 day')::text as id,
      starts_on::text as starts_on
    from next_week`;
  if (!week) throw new Error("Could not open next week");
  const assignees = (list: [string, string | null][]) =>
    list.map(([phone, position]) => ({ user: id(phone), position }));
  const shifts = [
    {
      day: week.starts_on,
      name: "בוקר",
      start: "09:00",
      end: "16:00",
      needed: 3,
      pattern: "morning",
      assignees: assignees(people.morning),
    },
    {
      day: week.starts_on,
      name: "ערב",
      start: "16:00",
      end: "23:30",
      needed: 4,
      pattern: "evening",
      assignees: assignees(people.evening),
    },
  ];
  const manager = "00000000-0000-4000-a000-000000000002";
  if (publish) {
    await sql`select public.publish_week_schedule(${manager}, ${week.id},
      ${sql.json(shifts)})`;
  } else {
    await sql`select public.save_week_schedule(${manager}, ${week.id},
      ${sql.json(shifts)})`;
  }
}

/**
 * Put people on a morning shift today at the demo restaurant, in this week's
 * schedule published to the team, through the database functions the app
 * uses, as its manager. Phone numbers, each with a position key or null.
 */
export async function scheduleDemoToday(
  people: [phone: string, position: string | null][],
  times: { start: string; end: string } = { start: "09:00", end: "16:00" },
): Promise<void> {
  const ids = await sql<{ phone: string; id: string }[]>`
    select phone, id::text from public.profiles
    where phone in ${sql(people.map(([phone]) => phone))}`;
  const [week] = await sql<{ id: string; today: string }[]>`
    with business as (
      select (now() at time zone b.timezone)::date as today,
        coalesce((m.settings ->> 'weekStartsOn')::int, 0) as starts_on
      from public.businesses b
      join public.business_modules m
        on m.business_id = b.id and m.module_key = 'scheduling'
      where b.id = ${DEMO_RESTAURANT}
    )
    select public.open_schedule_week(${DEMO_RESTAURANT},
        today - ((extract(dow from today)::int - starts_on + 7) % 7),
        now() + interval '1 day')::text as id,
      today::text as today
    from business`;
  if (!week) throw new Error("Could not open this week");
  const shifts = [
    {
      day: week.today,
      name: "בוקר",
      ...times,
      needed: 3,
      pattern: "morning",
      assignees: people.map(([phone, position]) => ({
        user: ids.find((row) => row.phone === phone)?.id,
        position,
      })),
    },
  ];
  const manager = "00000000-0000-4000-a000-000000000002";
  await sql`select public.publish_week_schedule(${manager}, ${week.id},
    ${sql.json(shifts)})`;
}

export type SavedSwap = {
  status: string;
  from: string;
  to: string | null;
};

/** The demo restaurant's shift swaps, oldest first, by phone number. */
export async function demoSwaps(): Promise<SavedSwap[]> {
  return await sql<SavedSwap[]>`
    select w.status::text as status, r.phone as "from", t.phone as "to"
    from public.shift_swaps w
    join public.profiles r on r.id = w.requested_by
    left join public.profiles t on t.id = w.taken_by
    where w.business_id = ${DEMO_RESTAURANT}
    order by w.created_at`;
}

/**
 * One worker gives away their shift of next week's Sunday (`pattern`) and
 * a colleague takes it, through the database functions the app uses, so
 * the request waits for a manager. By phone number.
 */
export async function takenDemoSwap(
  pattern: string,
  from: string,
  to: string,
): Promise<void> {
  await sql`
    with people as (
      select
        (select id from public.profiles where phone = ${from}) as giver,
        (select id from public.profiles where phone = ${to}) as taker
    ),
    shift as (
      select s.id from public.schedule_shifts s
      where s.business_id = ${DEMO_RESTAURANT} and s.pattern_key = ${pattern}
      order by s.day desc limit 1
    )
    select public.take_shift_swap(people.taker,
      public.request_shift_swap(people.giver, shift.id))
    from people, shift`;
}

/**
 * Lets the door's reset run now: it skips a demo business reset in the last
 * few seconds, which another screen size's run may have just done.
 */
export async function allowDemoReset(): Promise<void> {
  await sql`update private.demo_businesses set reset_at = null`;
}

/**
 * One of the demo restaurant's own sentences (`business_wording`), written
 * straight to the local database as the console will. Null clears it.
 */
export async function setDemoWording(
  key: string,
  sentence: string | null,
  base: string,
): Promise<void> {
  if (sentence === null) {
    await sql`delete from public.business_wording
      where business_id = ${DEMO_RESTAURANT} and key = ${key}`;
  } else {
    await sql`insert into public.business_wording
        (business_id, key, sentence, base_sentence)
      values (${DEMO_RESTAURANT}, ${key}, ${sentence}, ${base})
      on conflict (business_id, key) do update
      set sentence = excluded.sentence, base_sentence = excluded.base_sentence`;
  }
}

/** One of the demo restaurant's own sentences, or null when it has none. */
export async function demoWording(key: string): Promise<string | null> {
  const rows = await sql<{ sentence: string }[]>`
    select sentence from public.business_wording
    where business_id = ${DEMO_RESTAURANT} and key = ${key}`;
  return rows[0]?.sentence ?? null;
}

/** Remove the person's notifications at the demo restaurant: an empty inbox. */
export async function clearNotifications(phone: string): Promise<void> {
  await sql`delete from public.notifications n using public.profiles p
    where n.business_id = ${DEMO_RESTAURANT} and n.user_id = p.id
      and p.phone = ${phone}`;
}

/**
 * The person gives away their shift of next week's Sunday (`pattern`) at the
 * demo restaurant, through the database function the app uses.
 */
export async function requestDemoSwap(
  pattern: string,
  phone: string,
): Promise<void> {
  await sql`
    with shift as (
      select s.id from public.schedule_shifts s
      where s.business_id = ${DEMO_RESTAURANT} and s.pattern_key = ${pattern}
      order by s.day desc limit 1
    )
    select public.request_shift_swap(p.id, shift.id)
    from public.profiles p, shift where p.phone = ${phone}`;
}

/** The person takes the demo restaurant's open request. */
export async function takeDemoSwap(phone: string): Promise<void> {
  await sql`
    select public.take_shift_swap(p.id, w.id)
    from public.profiles p, public.shift_swaps w
    where p.phone = ${phone} and w.business_id = ${DEMO_RESTAURANT}
      and w.status = 'open'`;
}

/** The demo restaurant's manager approves or declines its taken request. */
export async function decideDemoSwap(approve: boolean): Promise<void> {
  const manager = "00000000-0000-4000-a000-000000000002";
  await sql`
    select public.decide_shift_swap(${manager}, w.id, ${approve})
    from public.shift_swaps w
    where w.business_id = ${DEMO_RESTAURANT} and w.status = 'taken'`;
}

/** A person's stored photo path, by phone number; null when they have none. */
export async function demoPhotoPath(phone: string): Promise<string | null> {
  const rows = await sql<{ path: string | null }[]>`
    select avatar_path as path from public.profiles where phone = ${phone}`;
  return rows[0]?.path ?? null;
}

/**
 * The person's profile back to how the demo starts: no photo, no line, the
 * default cover, no form of address. The file stays in Storage,
 * unreferenced, as after the door's reset.
 */
export async function clearDemoProfile(phone: string): Promise<void> {
  await sql`update public.profiles
    set avatar_path = null, bio = null, cover = null, address_form = null
    where phone = ${phone}`;
}

/**
 * A real business for the notifications that reach a phone, which demo
 * businesses never get: an owner and a worker of their own (their numbers
 * are in no other spec), with the worker on a published shift next Sunday.
 * Made afresh each run, through the database functions the app uses.
 */
export const PUSH_BUSINESS = "00000000-0000-4000-b000-0000000000e2";
export const PUSH_PEOPLE = {
  owner: {
    id: "00000000-0000-4000-a000-000000000961",
    name: "אורית התראות",
    local: "050-000-0961",
    e164: "+972500000961",
  },
  worker: {
    id: "00000000-0000-4000-a000-000000000962",
    name: "גיל התראות",
    local: "050-000-0962",
    e164: "+972500000962",
  },
} as const;

/**
 * The push business goes with its records: its log is kept
 * (20261110000100_hours_kept.sql), so the purge, which only the database's
 * owner may run, clears it first, in the same transaction.
 */
async function deletePushBusiness(): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`select private.purge_business_records(${PUSH_BUSINESS}::uuid)`;
    await tx`delete from public.businesses where id = ${PUSH_BUSINESS}`;
  });
}

export async function openPushBusiness(): Promise<void> {
  const people = Object.values(PUSH_PEOPLE);
  await deletePushBusiness();
  for (const person of people) {
    await sql`
      insert into auth.users (
        instance_id, id, aud, role, phone, phone_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change,
        email_change_token_new, email_change_token_current, phone_change,
        phone_change_token, reauthentication_token
      )
      values (
        '00000000-0000-0000-0000-000000000000', ${person.id}, 'authenticated',
        'authenticated', ${person.e164.slice(1)}, now(),
        '{"provider":"phone","providers":["phone"]}', '{}', now(), now(),
        '', '', '', '', '', '', '', ''
      )
      on conflict (id) do nothing`;
    await sql`update public.profiles set full_name = ${person.name}
      where id = ${person.id}`;
  }
  await sql`delete from public.push_subscriptions
    where user_id in ${sql(people.map((p) => p.id))}`;
  await sql`insert into public.businesses (id, slug, name)
    values (${PUSH_BUSINESS}, 'push-e2e', 'עסק להתראות')`;
  await sql`select public.apply_template(${PUSH_BUSINESS}, 'retail')`;
  await sql`insert into public.memberships (business_id, user_id, role)
    values (${PUSH_BUSINESS}, ${PUSH_PEOPLE.owner.id}, 'owner'),
      (${PUSH_BUSINESS}, ${PUSH_PEOPLE.worker.id}, 'worker')`;

  const [week] = await sql<{ id: string; starts_on: string }[]>`
    with business as (
      select (now() at time zone b.timezone)::date as today,
        coalesce((m.settings ->> 'weekStartsOn')::int, 0) as starts_on
      from public.businesses b
      join public.business_modules m
        on m.business_id = b.id and m.module_key = 'scheduling'
      where b.id = ${PUSH_BUSINESS}
    ),
    next_week as (
      select today - ((extract(dow from today)::int - starts_on + 7) % 7)
        + 7 as starts_on
      from business
    )
    select public.open_schedule_week(${PUSH_BUSINESS}, starts_on,
        now() + interval '1 day')::text as id,
      starts_on::text as starts_on
    from next_week`;
  if (!week) throw new Error("Could not open next week");
  await sql`select public.publish_week_schedule(${PUSH_PEOPLE.owner.id}, ${week.id},
    ${sql.json([
      {
        day: week.starts_on,
        name: "בוקר",
        start: "09:00",
        end: "16:00",
        needed: 1,
        assignees: [{ user: PUSH_PEOPLE.worker.id, position: null }],
      },
    ])})`;
}

/** The person's saved devices: where each sends, and its kind. */
export async function pushDevices(
  userId: string,
): Promise<{ endpoint: string; label: string | null }[]> {
  return await sql<{ endpoint: string; label: string | null }[]>`
    select endpoint, label from public.push_subscriptions
    where user_id = ${userId} order by created_at`;
}

/** When the person's newest device last asked /push/inbox what to show. */
export async function pushFetchedAt(userId: string): Promise<string | null> {
  const [row] = await sql<{ at: string | null }[]>`
    select max(last_fetched_at)::text as at from public.push_subscriptions
    where user_id = ${userId}`;
  return row?.at ?? null;
}

/**
 * A line for the push business's owner, written as the producers write them:
 * queued for their phone when they have a device.
 */
export async function notifyPushOwner(): Promise<void> {
  await sql`select private.notify(
    ${PUSH_BUSINESS}::uuid, array[${PUSH_PEOPLE.owner.id}::uuid], 'team.joined',
    ${sql.json({ person: PUSH_PEOPLE.worker.id })}::jsonb,
    actor => ${PUSH_PEOPLE.worker.id}::uuid,
    audience => 'manager',
    dedupe => ${`team.joined:e2e:${Date.now()}`}
  )`;
}

/** Forget the business and its people's devices, when the spec is done. */
export async function closePushBusiness(): Promise<void> {
  await sql`delete from public.push_subscriptions
    where user_id in ${sql(Object.values(PUSH_PEOPLE).map((p) => p.id))}`;
  await deletePushBusiness();
}

/**
 * Two real businesses whose books one person keeps (payroll P3b), for what
 * demo businesses never do: lines that reach a phone. Rotem's number is in
 * no other spec. She joined the first a day before the second, so with no
 * choice made the app opens the first. Made afresh each run.
 */
export const SWITCH_PERSON = {
  id: "00000000-0000-4000-a000-000000000981",
  name: "רותם ספרים",
  local: "050-000-0981",
  e164: "+972500000981",
} as const;
export const SWITCH_BUSINESSES = {
  first: {
    id: "00000000-0000-4000-b000-0000000000e5",
    slug: "switch-e2e-first",
    name: "המאפייה של רותם",
  },
  second: {
    id: "00000000-0000-4000-b000-0000000000e6",
    slug: "switch-e2e-second",
    name: "המספרה של רותם",
  },
} as const;

/** Both go with their records, which only the purge may delete. */
async function deleteSwitchBusinesses(): Promise<void> {
  await sql.begin(async (tx) => {
    for (const business of Object.values(SWITCH_BUSINESSES)) {
      await tx`select private.purge_business_records(${business.id}::uuid)`;
      await tx`delete from public.businesses where id = ${business.id}`;
    }
  });
}

export async function openSwitchBusinesses(): Promise<void> {
  await deleteSwitchBusinesses();
  await sql`
    insert into auth.users (
      instance_id, id, aud, role, phone, phone_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change,
      email_change_token_new, email_change_token_current, phone_change,
      phone_change_token, reauthentication_token
    )
    values (
      '00000000-0000-0000-0000-000000000000', ${SWITCH_PERSON.id}, 'authenticated',
      'authenticated', ${SWITCH_PERSON.e164.slice(1)}, now(),
      '{"provider":"phone","providers":["phone"]}', '{}', now(), now(),
      '', '', '', '', '', '', '', ''
    )
    on conflict (id) do nothing`;
  await sql`update public.profiles set full_name = ${SWITCH_PERSON.name}
    where id = ${SWITCH_PERSON.id}`;
  for (const business of Object.values(SWITCH_BUSINESSES)) {
    await sql`insert into public.businesses (id, slug, name)
      values (${business.id}, ${business.slug}, ${business.name})`;
    await sql`select public.apply_template(${business.id}, 'retail')`;
  }
  await sql`insert into public.memberships (business_id, user_id, role, created_at)
    values
      (${SWITCH_BUSINESSES.first.id}, ${SWITCH_PERSON.id}, 'accountant',
        now() - interval '1 day'),
      (${SWITCH_BUSINESSES.second.id}, ${SWITCH_PERSON.id}, 'accountant', now())`;
}

/** Forget both businesses, when the spec is done. */
export async function closeSwitchBusinesses(): Promise<void> {
  await deleteSwitchBusinesses();
}

/**
 * A line for Rotem in one of the two businesses, written as the producers
 * write them: she was given access to the hours there. `pushed`, as if it
 * had gone to her phone just now. Returns its id.
 */
export async function notifySwitchPerson(
  business: keyof typeof SWITCH_BUSINESSES,
  pushed: boolean,
): Promise<string> {
  const id = SWITCH_BUSINESSES[business].id;
  const dedupe = `access.pay_granted:e2e:${business}:${Date.now()}`;
  await sql`select private.notify(
    ${id}::uuid, array[${SWITCH_PERSON.id}::uuid], 'access.pay_granted',
    actor => null::uuid,
    about => 'time_clock'::public.module_key,
    dedupe => ${dedupe}
  )`;
  const [line] = await sql<{ id: string }[]>`
    select n.id from public.notifications n
    where n.business_id = ${id} and n.user_id = ${SWITCH_PERSON.id}
      and n.dedupe_key = ${dedupe}`;
  if (!line) throw new Error(`No line for Rotem in the ${business} business`);
  if (pushed) {
    await sql`update public.notifications
      set push_state = 'sent', pushed_at = now() where id = ${line.id}`;
  }
  return line.id;
}

/** Whether a line has been read. */
export async function notificationRead(id: string): Promise<boolean> {
  const [row] = await sql<{ read: boolean }[]>`
    select read_at is not null as read from public.notifications
    where id = ${id}`;
  return row?.read ?? false;
}

/** A demo person's line about themselves, written straight to the local database. */
export async function setDemoBio(
  phone: string,
  bio: string | null,
): Promise<void> {
  await sql`update public.profiles set bio = ${bio} where phone = ${phone}`;
}

/** How the app addresses a demo person, written straight to the local database. */
export async function setDemoAddressForm(
  phone: string,
  form: "f" | "m" | "x" | null,
): Promise<void> {
  await sql`update public.profiles set address_form = ${form}
    where phone = ${phone}`;
}

/** The line, the cover and the form of address a demo person has now. */
export async function demoProfile(phone: string): Promise<{
  bio: string | null;
  cover: string | null;
  addressForm: string | null;
}> {
  const [row] = await sql<
    { bio: string | null; cover: string | null; addressForm: string | null }[]
  >`
    select bio, cover, address_form as "addressForm" from public.profiles
    where phone = ${phone}`;
  return row ?? { bio: null, cover: null, addressForm: null };
}

/**
 * The demo shop back to how it starts, as the door's reset does it: its
 * people, their profiles and this week's published schedule.
 */
export async function resetDemoShop(): Promise<void> {
  await allowDemoReset();
  await sql`select public.reset_demo_business(
    '00000000-0000-4000-b000-000000000002')`;
}

/**
 * The demo restaurant's lists as its reset leaves them: every list gone with
 * its lines, and the two example lists sent again by the manager (the
 * kitchen's opening list to Noa with two checks done, the floor's to the
 * floor), through the same function the reset ends with.
 */
export async function resetDemoLists(): Promise<void> {
  await sql`delete from public.lists where business_id = ${DEMO_RESTAURANT}`;
  await sql`delete from public.notifications
    where business_id = ${DEMO_RESTAURANT} and kind like 'lists.%'`;
  await sql`select private.seed_demo_lists(${DEMO_RESTAURANT})`;
}

export type DemoList = {
  id: string;
  name: string;
  status: string;
  done: number;
  total: number;
};

/** The demo restaurant's lists by name, newest first. */
export async function demoLists(name: string): Promise<DemoList[]> {
  return await sql<DemoList[]>`
    select l.id, l.name, l.status,
      (select count(*)::int from public.list_items i where i.list_id = l.id and i.done) as done,
      (select count(*)::int from public.list_items i where i.list_id = l.id) as total
    from public.lists l
    where l.business_id = ${DEMO_RESTAURANT} and l.name = ${name}
    order by l.created_at desc`;
}

/** Who is in a demo restaurant department, by its name: their phones. */
export async function demoDepartmentPhones(name: string): Promise<string[]> {
  const rows = await sql<{ phone: string }[]>`
    select '+' || ltrim(p.phone, '+') as phone
    from public.department_members dm
    join public.departments d on d.id = dm.department_id
    join public.profiles p on p.id = dm.user_id
    where d.business_id = ${DEMO_RESTAURANT} and d.name = ${name}
      and d.archived_at is null
    order by p.phone`;
  return rows.map((row) => row.phone);
}

/** The demo restaurant's live departments, in order. */
export async function demoDepartmentNames(): Promise<string[]> {
  const rows = await sql<{ name: string }[]>`
    select name from public.departments
    where business_id = ${DEMO_RESTAURANT} and archived_at is null
    order by position, key`;
  return rows.map((row) => row.name);
}

export type DemoTemplate = {
  id: string;
  name: string;
  note: string | null;
  version: number;
  archived: boolean;
  recipient: string | null;
  items: {
    kind: string;
    label: string;
    required: boolean;
    min: number | null;
    max: number | null;
  }[];
};

/** The demo restaurant's list templates by name, removed ones too (L3). */
export async function demoTemplates(name: string): Promise<DemoTemplate[]> {
  return await sql<DemoTemplate[]>`
    select t.id, t.name, t.note, t.version, t.archived_at is not null as archived,
      t.recipient_kind as recipient,
      coalesce((
        select jsonb_agg(jsonb_build_object(
            'kind', i.kind, 'label', i.label, 'required', i.required,
            'min', i.min_value, 'max', i.max_value)
          order by i.position)
        from public.list_template_items i where i.template_id = t.id
      ), '[]'::jsonb) as items
    from public.list_templates t
    where t.business_id = ${DEMO_RESTAURANT} and t.name = ${name}
    order by t.created_at desc`;
}

/**
 * Someone else saves a demo template meanwhile: its version moves on, as
 * another screen's save would move it, so the next save from a screen that
 * read it before is refused (40001).
 */
export async function bumpDemoTemplate(id: string): Promise<void> {
  await sql`update public.list_templates
    set version = version + 1, note = 'נשמר במסך אחר'
    where id = ${id} and business_id = ${DEMO_RESTAURANT}`;
}

/** Removes for good the demo templates a test made, and the lists sent from them. */
export async function removeDemoTemplates(names: string[]): Promise<void> {
  await sql`delete from public.lists
    where business_id = ${DEMO_RESTAURANT} and name in ${sql(names)}`;
  await sql`delete from public.list_templates
    where business_id = ${DEMO_RESTAURANT} and name in ${sql(names)}`;
}

export type SentDemoList = {
  name: string;
  status: string;
  recipient: string;
  due: boolean;
  people: number;
  items: { kind: string; label: string }[];
};

/** How the demo restaurant's lists of this name were sent, newest first. */
export async function sentDemoLists(name: string): Promise<SentDemoList[]> {
  return await sql<SentDemoList[]>`
    select l.name, l.status, l.recipient_kind as recipient,
      l.due_at is not null as due,
      (select count(*)::int from public.list_people p where p.list_id = l.id) as people,
      coalesce((
        select jsonb_agg(jsonb_build_object('kind', i.kind, 'label', i.label)
          order by i.position)
        from public.list_items i where i.list_id = l.id
      ), '[]'::jsonb) as items
    from public.lists l
    where l.business_id = ${DEMO_RESTAURANT} and l.name = ${name}
    order by l.created_at desc`;
}

/** Removes a department a test added (archived, as the screen removes them). */
export async function archiveDemoDepartment(name: string): Promise<void> {
  await sql`update public.departments set archived_at = now()
    where business_id = ${DEMO_RESTAURANT} and name = ${name}
      and archived_at is null`;
}

const DEMO_SHOP = "00000000-0000-4000-b000-000000000002";
const SHOP_OWNER = "00000000-0000-4000-a000-000000000007";

/**
 * The month the demo shop's hours were seeded for (private.seed_demo_pay): the
 * month before its last reset, in its own time zone. The pay screens open on
 * last month only until the 10th, so every visit names this month instead. A
 * spec that let the next reset through (`allowDemoReset`) leaves no reset time:
 * the newest hours the reset wrote say it then.
 */
export async function seededPayMonth(
  business: "shop" | "restaurant" = "shop",
): Promise<string> {
  const id = business === "shop" ? DEMO_SHOP : DEMO_RESTAURANT;
  const [row] = await sql<{ month: string }[]>`
    select to_char(
      date_trunc('month', coalesce(d.reset_at,
        (select max(e.created_at) from public.time_entries e
         where e.business_id = d.business_id),
        now()) at time zone b.timezone) - interval '1 month',
      'YYYY-MM') as month
    from private.demo_businesses d
    join public.businesses b on b.id = d.business_id
    where d.business_id = ${id}`;
  if (!row) throw new Error(`The demo ${business} is missing`);
  return row.month;
}

/** A demo shop person's wage today, as the database has it (the latest day, then the latest set). */
export async function shopWageToday(
  userId: string,
): Promise<{ agorot: number; from: string } | null> {
  const [row] = await sql<{ agorot: number; from: string }[]>`
    select w.hourly_agorot as agorot, w.effective_from::text as "from"
    from public.member_wages w
    join public.businesses b on b.id = w.business_id
    where w.business_id = ${DEMO_SHOP} and w.user_id = ${userId}
      and w.effective_from <= (now() at time zone b.timezone)::date
    order by w.effective_from desc, w.set_at desc
    limit 1`;
  return row ?? null;
}

/**
 * The wages a spec set for a demo shop person since `since` go, so the shop
 * is as the seed left it for the next run. Wages are kept
 * (20261110000500_hourly_wages.sql): only a purge that names the business may
 * delete one, for this transaction. The log keeps its rows.
 */
export async function forgetShopWages(
  userId: string,
  since: Date,
): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`select set_config('ca.records_purge', ${DEMO_SHOP}, true)`;
    await tx`delete from public.member_wages
      where business_id = ${DEMO_SHOP} and user_id = ${userId}
        and set_at >= ${since}`;
  });
}

/** The first of this month in the demo shop's own days, `YYYY-MM-DD`. */
export async function shopFirstOfMonth(): Promise<string> {
  const [row] = await sql<{ day: string }[]>`
    select date_trunc('month', now() at time zone b.timezone)::date::text as day
    from public.businesses b where b.id = ${DEMO_SHOP}`;
  if (!row) throw new Error("The demo shop is missing");
  return row.day;
}

/**
 * Whether everyone in a role at the demo shop sees pay, as its owner switches
 * it, through the same database function the app uses. The shop starts with
 * its managers on.
 */
export async function setShopPayRole(
  role: "manager" | "worker",
  granted: boolean,
): Promise<void> {
  await sql`select public.set_role_permission(${SHOP_OWNER}, ${DEMO_SHOP},
    ${role}, 'clock.payroll', ${granted})`;
}

/** The roles the demo shop gives pay access to, in order. */
export async function shopPayRoles(): Promise<string[]> {
  const rows = await sql<{ role: string }[]>`
    select role::text as role from public.role_permissions
    where business_id = ${DEMO_SHOP} and perm = 'clock.payroll'
    order by role`;
  return rows.map((row) => row.role);
}

/** How many times the person's opening of the demo shop's pay screens was noted today. */
export async function shopPayViewsToday(phone: string): Promise<number> {
  const [row] = await sql<{ count: number }[]>`
    select count(*)::int as count from public.audit_log a
    join public.profiles p on p.id = a.actor_id
    join public.businesses b on b.id = a.business_id
    where a.business_id = ${DEMO_SHOP} and a.action = 'payroll.view'
      and p.phone = ${phone}
      and a.created_at >= date_trunc('day', now() at time zone b.timezone)
        at time zone b.timezone`;
  return row?.count ?? 0;
}

/** How many of the demo shop's log rows of `action` there are since `since`. */
export async function shopActivityActions(
  action: string,
  since: Date,
): Promise<number> {
  const [row] = await sql<{ count: number }[]>`
    select count(*)::int as count from public.audit_log
    where business_id = ${DEMO_SHOP} and action = ${action}
      and created_at >= ${since}`;
  return row?.count ?? 0;
}

export type ShopDetailsRow = {
  payroll_number: string | null;
  rest_day: number;
  hours_law: string;
  youth_until: string | null;
  compulsory_education: boolean;
};

/** A demo shop person's details for payroll as the database has them, or null without a row. */
export async function shopPayrollDetails(
  userId: string,
): Promise<ShopDetailsRow | null> {
  const [row] = await sql<ShopDetailsRow[]>`
    select payroll_number, rest_day, hours_law,
      youth_until::text as youth_until, compulsory_education
    from public.member_payroll_details
    where business_id = ${DEMO_SHOP} and user_id = ${userId}`;
  return row ?? null;
}

/**
 * A demo shop person's details back as they were before a spec changed them.
 * Details are kept (20261110000600_payroll_details.sql): nothing deletes a row
 * but a purge that names the business, for this transaction; the database's
 * owner may change one.
 */
export async function restoreShopPayrollDetails(
  userId: string,
  row: ShopDetailsRow | null,
): Promise<void> {
  if (row === null) {
    await sql.begin(async (tx) => {
      await tx`select set_config('ca.records_purge', ${DEMO_SHOP}, true)`;
      await tx`delete from public.member_payroll_details
        where business_id = ${DEMO_SHOP} and user_id = ${userId}`;
    });
    return;
  }
  await sql`
    update public.member_payroll_details
    set payroll_number = ${row.payroll_number}, rest_day = ${row.rest_day},
      hours_law = ${row.hours_law}, youth_until = ${row.youth_until}::date,
      compulsory_education = ${row.compulsory_education}
    where business_id = ${DEMO_SHOP} and user_id = ${userId}`;
}

export type ShopPeriodRow = {
  id: string;
  started_on: string;
  ended_on: string | null;
  last_paid_on: string | null;
  source: string;
};

/** A demo shop person's employment periods, oldest first. */
export async function shopPeriods(userId: string): Promise<ShopPeriodRow[]> {
  return await sql<ShopPeriodRow[]>`
    select id::text, started_on::text, ended_on::text, last_paid_on::text, source
    from public.employment_periods
    where business_id = ${DEMO_SHOP} and user_id = ${userId}
    order by started_on`;
}

/** A demo shop person's periods back as they were, under a purge of this transaction. */
export async function restoreShopPeriods(
  userId: string,
  rows: readonly ShopPeriodRow[],
): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`select set_config('ca.records_purge', ${DEMO_SHOP}, true)`;
    await tx`delete from public.employment_periods
      where business_id = ${DEMO_SHOP} and user_id = ${userId}`;
    for (const row of rows) {
      await tx`insert into public.employment_periods
          (id, business_id, user_id, started_on, ended_on, last_paid_on, source)
        values (${row.id}, ${DEMO_SHOP}, ${userId}, ${row.started_on}::date,
          ${row.ended_on}::date, ${row.last_paid_on}::date, ${row.source})`;
    }
  });
}

/** The details of the demo shop's log rows of `action` since `since`, oldest first. */
export async function shopActivityDetails(
  action: string,
  since: Date,
): Promise<Record<string, unknown>[]> {
  const rows = await sql<{ details: Record<string, unknown> }[]>`
    select details from public.audit_log
    where business_id = ${DEMO_SHOP} and action = ${action}
      and created_at >= ${since}
    order by id`;
  return rows.map((row) => row.details);
}

/** The demo shop's time-clock settings as stored, to put back after a spec changes them. */
export async function shopClockSettings(): Promise<Record<string, unknown>> {
  const rows = await sql<{ settings: Record<string, unknown> }[]>`
    select settings from public.business_modules
    where business_id = ${DEMO_SHOP} and module_key = 'time_clock'`;
  return rows[0]?.settings ?? {};
}

/**
 * Lays settings over the demo shop's time clock, as the team and its owner
 * switch them (payroll P7: `payEstimate`, `workersSeeEstimate`), or puts back
 * what `shopClockSettings` read with `replace`.
 */
export async function setShopClockSettings(
  settings: Record<string, unknown>,
  replace = false,
): Promise<void> {
  if (replace) {
    await sql`
      update public.business_modules
      set settings = ${sql.json(settings as never)}::jsonb
      where business_id = ${DEMO_SHOP} and module_key = 'time_clock'`;
    return;
  }
  await sql`
    update public.business_modules
    set settings = settings || ${sql.json(settings as never)}::jsonb
    where business_id = ${DEMO_SHOP} and module_key = 'time_clock'`;
}

const SHOP_MANAGER = "00000000-0000-4000-a000-000000000008";

/** A month (`YYYY-MM`) of the demo shop as payroll keeps it (payroll P9), or null when it was never closed. */
export async function shopPayrollMonth(month: string): Promise<{
  closedBy: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
} | null> {
  const [row] = await sql<
    {
      closedBy: string | null;
      reopenedAt: string | null;
      reopenReason: string | null;
    }[]
  >`
    select closed_by::text as "closedBy", reopened_at::text as "reopenedAt",
      reopen_reason as "reopenReason"
    from public.payroll_months
    where business_id = ${DEMO_SHOP} and month = ${`${month}-01`}::date`;
  return row ?? null;
}

/**
 * The demo shop's month open again, as its owner would reopen it, when a
 * spec left it closed: the next spec sets wages in it.
 */
export async function reopenShopMonth(month: string): Promise<void> {
  await sql`
    select public.reopen_payroll_month(${SHOP_OWNER}, ${DEMO_SHOP},
      ${`${month}-01`}::date, 'e2e clean-up')
    where exists (
      select 1 from public.payroll_months
      where business_id = ${DEMO_SHOP} and month = ${`${month}-01`}::date
        and reopened_at is null
    )`;
}

/**
 * The demo shop's manager corrects a shift of `month` that ended, half an
 * hour later, through the database function the app uses: Roni's first one.
 * Returns the log row's `closed_month`, null when it names none.
 */
export async function correctShopShift(month: string): Promise<string | null> {
  const [entry] = await sql<{ id: string; clock_in: Date; clock_out: Date }[]>`
    select e.id, e.clock_in, e.clock_out
    from public.time_entries e
    join public.businesses b on b.id = e.business_id
    where e.business_id = ${DEMO_SHOP}
      and e.user_id = '00000000-0000-4000-a000-000000000012'
      and e.clock_out is not null
      and to_char(e.clock_in at time zone b.timezone, 'YYYY-MM') = ${month}
    order by e.clock_in
    limit 1`;
  if (!entry) throw new Error(`Roni has no shift in ${month}`);
  await sql`
    select public.correct_time_entry(${SHOP_MANAGER}, ${entry.id},
      ${entry.clock_in}::timestamptz,
      ${new Date(entry.clock_out.getTime() + 30 * 60_000)}::timestamptz,
      'e2e: stayed to close')`;
  const [row] = await sql<{ closed: string | null }[]>`
    select details ->> 'closed_month' as closed from public.audit_log
    where business_id = ${DEMO_SHOP} and action = 'clock.correct'
      and details ->> 'entry' = ${entry.id}
    order by id desc limit 1`;
  return row?.closed ?? null;
}

/** How many of the demo shop's lines of `kind` the person has, unread or not. */
export async function shopLines(phone: string, kind: string): Promise<number> {
  const [row] = await sql<{ count: number }[]>`
    select count(*)::int as count from public.notifications n
    join public.profiles p on p.id = n.user_id
    where n.business_id = ${DEMO_SHOP} and n.kind = ${kind}
      and p.phone = ${phone}`;
  return row?.count ?? 0;
}
