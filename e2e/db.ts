import { randomUUID } from "node:crypto";
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
 * A real business goes with its records: its log is kept
 * (20261110000100_hours_kept.sql), so the purge, which only the database's
 * owner may run, clears it first, in the same transaction.
 */
async function deleteRealBusiness(id: string): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`select private.purge_business_records(${id}::uuid)`;
    await tx`delete from public.businesses where id = ${id}`;
  });
}

type RealPerson = { id: string; name: string; e164: string };

/** Logins for people of a real business, made when missing, with their names. */
async function ensureLogins(people: readonly RealPerson[]): Promise<void> {
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
}

/**
 * A real business made afresh, from the shop's template, through the
 * database functions the app uses: its owner and worker (their logins made
 * when missing, their devices forgotten), the worker on a published morning
 * shift next Sunday.
 */
async function openRealBusiness(business: {
  id: string;
  slug: string;
  name: string;
  owner: RealPerson;
  worker: RealPerson;
}): Promise<void> {
  const people = [business.owner, business.worker];
  await deleteRealBusiness(business.id);
  await ensureLogins(people);
  await sql`delete from public.push_subscriptions
    where user_id in ${sql(people.map((p) => p.id))}`;
  await sql`insert into public.businesses (id, slug, name)
    values (${business.id}, ${business.slug}, ${business.name})`;
  await sql`select public.apply_template(${business.id}, 'retail')`;
  await sql`insert into public.memberships (business_id, user_id, role)
    values (${business.id}, ${business.owner.id}, 'owner'),
      (${business.id}, ${business.worker.id}, 'worker')`;

  const [week] = await sql<{ id: string; starts_on: string }[]>`
    with business as (
      select (now() at time zone b.timezone)::date as today,
        coalesce((m.settings ->> 'weekStartsOn')::int, 0) as starts_on
      from public.businesses b
      join public.business_modules m
        on m.business_id = b.id and m.module_key = 'scheduling'
      where b.id = ${business.id}
    ),
    next_week as (
      select today - ((extract(dow from today)::int - starts_on + 7) % 7)
        + 7 as starts_on
      from business
    )
    select public.open_schedule_week(${business.id}, starts_on,
        now() + interval '1 day')::text as id,
      starts_on::text as starts_on
    from next_week`;
  if (!week) throw new Error("Could not open next week");
  await sql`select public.publish_week_schedule(${business.owner.id}, ${week.id},
    ${sql.json([
      {
        day: week.starts_on,
        name: "בוקר",
        start: "09:00",
        end: "16:00",
        needed: 1,
        assignees: [{ user: business.worker.id, position: null }],
      },
    ])})`;
}

export async function openPushBusiness(): Promise<void> {
  await openRealBusiness({
    id: PUSH_BUSINESS,
    slug: "push-e2e",
    name: "עסק להתראות",
    ...PUSH_PEOPLE,
  });
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
  await deleteRealBusiness(PUSH_BUSINESS);
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
 * its lines, and the example lists sent again (the kitchen's opening list to
 * Noa with two checks done, the floor's to the floor, both by the manager,
 * and from L5 the bar's order to the storeroom, sent by Shiran of the bar
 * with its first item given by Yoav), through the same function the reset
 * ends with.
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

/*
 * Lists' times (L4). The minute job is off locally and in CI, and the local
 * demo's reset opens no scheduled list (only a hosted definition says
 * "scheduledLists": true), so a test opens them itself with `tickLists`, at
 * the time it chooses.
 */

/**
 * A template of a test's own at the demo restaurant, for its kitchen: a
 * fridge reading from 0 to 5 °C and a check. Its id. `removeDemoTemplates`
 * takes it away with its times and lists.
 */
export async function makeDemoTemplate(name: string): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into public.list_templates (
      business_id, name, recipient_kind, recipient_department, position
    )
    select ${DEMO_RESTAURANT}, ${name}, 'department', d.id, 99
    from public.departments d
    where d.business_id = ${DEMO_RESTAURANT} and d.key = 'kitchen'
    returning id`;
  if (!row) throw new Error("The demo restaurant has no kitchen");
  await sql`
    insert into public.list_template_items (
      template_id, business_id, position, kind, label, unit, min_value, max_value
    )
    values
      (${row.id}, ${DEMO_RESTAURANT}, 0, 'number', 'מקרר', '°C', 0, 5),
      (${row.id}, ${DEMO_RESTAURANT}, 1, 'check', 'ניקוי', null, null, null)`;
  return row.id;
}

/** How many times a demo template has. */
export async function demoScheduleCount(templateId: string): Promise<number> {
  const [row] = await sql<{ count: number }[]>`
    select count(*)::int as count from public.list_schedules
    where template_id = ${templateId}`;
  return row?.count ?? 0;
}

/**
 * A template's times as old as a business's that had them all along (a day
 * old, counting from yesterday), so a time already gone by today opens when
 * ticked.
 */
export async function ageDemoSchedules(templateId: string): Promise<void> {
  await sql`
    update public.list_schedules
    set created_at = created_at - interval '1 day',
      opens_from = opens_from - interval '1 day',
      starts_on = starts_on - 1
    where template_id = ${templateId}`;
}

/**
 * Pauses every other time of the demo restaurant, so a tick opens only the
 * test's own lists whatever the hour. The ids it paused, for `resumeDemoSchedules`.
 */
export async function pauseOtherDemoSchedules(
  templateId: string,
): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    update public.list_schedules set active = false
    where business_id = ${DEMO_RESTAURANT} and template_id <> ${templateId}
      and active
    returning id`;
  return rows.map((row) => row.id);
}

export async function resumeDemoSchedules(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await sql`update public.list_schedules set active = true where id in ${sql(ids)}`;
}

/** What the minute job does, for the demo restaurant, now or at `at`. How many lists it opened. */
export async function tickLists(at: Date = new Date()): Promise<number> {
  const [row] = await sql<{ opened: number }[]>`
    select private.lists_tick(${at}::timestamptz, ${DEMO_RESTAURANT}::uuid) as opened`;
  return row?.opened ?? 0;
}

export type ScheduledDemoList = {
  id: string;
  status: string;
  late: boolean;
  reminded: boolean;
};

/** The lists a demo template's times opened, newest first. */
export async function scheduledDemoLists(
  templateId: string,
): Promise<ScheduledDemoList[]> {
  return await sql<ScheduledDemoList[]>`
    select l.id, l.status, l.late_at is not null as late,
      l.reminded_at is not null as reminded
    from public.lists l
    where l.business_id = ${DEMO_RESTAURANT} and l.template_id = ${templateId}
      and l.origin = 'scheduled'
    order by l.opens_at desc`;
}

/** How many of the demo restaurant's lines of `kind` name a list of this name. */
export async function demoListLines(
  kind: string,
  name: string,
): Promise<number> {
  const [row] = await sql<{ count: number }[]>`
    select count(*)::int as count from public.notifications n
    where n.business_id = ${DEMO_RESTAURANT} and n.kind = ${kind}
      and n.params ->> 'name' = ${name}`;
  return row?.count ?? 0;
}

/*
 * Between departments (L5), in the demo shop: its floor asks the stock for
 * what it needs (the template's order, "הזמנה מהמחסן"), the stock gives and
 * passes it back. The restaurant's lists stay as the other specs left them.
 */

/**
 * The demo shop's lists as its reset leaves them: every list gone with its
 * lines, and the example lists sent again, the floor's order among them,
 * waiting at the stock with its first item given.
 */
export async function resetShopLists(): Promise<void> {
  await sql`delete from public.lists where business_id = ${DEMO_SHOP}`;
  await sql`delete from public.notifications
    where business_id = ${DEMO_SHOP} and kind like 'lists.%'`;
  await sql`select private.seed_demo_lists(${DEMO_SHOP})`;
}

/** None of the demo shop's lists or their lines, for a test that sends its own. */
export async function clearShopLists(): Promise<void> {
  await sql`delete from public.lists where business_id = ${DEMO_SHOP}`;
  await sql`delete from public.notifications
    where business_id = ${DEMO_SHOP} and kind like 'lists.%'`;
}

/**
 * The demo shop's live template `name`, sent by Omer, its manager, to every
 * worker by their role: someone who holds it by that alone no longer reads it
 * once they pass it on. Its id.
 */
export async function sendShopListToWorkers(name: string): Promise<string> {
  const [row] = await sql<{ id: string | null }[]>`
    select public.send_list(${SHOP_MANAGER}::uuid, ${DEMO_SHOP}::uuid,
      jsonb_build_object(
        'template', t.id,
        'recipient', jsonb_build_object('kind', 'role', 'role', 'worker')
      )) as id
    from public.list_templates t
    where t.business_id = ${DEMO_SHOP} and t.name = ${name}
      and t.archived_at is null
    limit 1`;
  if (!row?.id) throw new Error(`The demo shop has no template ${name}`);
  return row.id;
}

export type ShopList = {
  status: string;
  /** The department holding it, by name; null when a person, a shift or a role does. */
  holder: string | null;
  items: {
    label: string;
    requested: number | null;
    given: number | null;
    comment: string | null;
  }[];
  passes: { from: string | null; to: string; note: string | null }[];
};

/** One of the demo shop's lists, with its items in order and its passes. */
export async function shopList(id: string): Promise<ShopList | null> {
  const [row] = await sql<ShopList[]>`
    select l.status,
      (select d.name from public.departments d where d.id = l.recipient_department) as holder,
      coalesce((
        select jsonb_agg(jsonb_build_object('label', i.label, 'requested', i.requested,
            'given', i.given, 'comment', i.comment) order by i.position)
        from public.list_items i where i.list_id = l.id
      ), '[]'::jsonb) as items,
      coalesce((
        select jsonb_agg(jsonb_build_object(
            'from', (select d.name from public.departments d where d.id = p.from_department),
            'to', (select d.name from public.departments d where d.id = p.to_department),
            'note', p.note) order by p.passed_at)
        from public.list_passes p where p.list_id = l.id
      ), '[]'::jsonb) as passes
    from public.lists l
    where l.business_id = ${DEMO_SHOP} and l.id = ${id}`;
  return row ?? null;
}

/** Who in the demo shop has a line of `kind` about this list: their ids, in order. */
export async function shopListLines(
  kind: string,
  listId: string,
): Promise<string[]> {
  const rows = await sql<{ user_id: string }[]>`
    select n.user_id from public.notifications n
    where n.business_id = ${DEMO_SHOP} and n.kind = ${kind}
      and n.params ->> 'list' = ${listId}
    order by n.user_id`;
  return rows.map((row) => row.user_id);
}

const RESTAURANT_MANAGER = "00000000-0000-4000-a000-000000000002";
const NOA_ID = "00000000-0000-4000-a000-000000000003";
const TAMAR_ID = "00000000-0000-4000-a000-000000000010";

/**
 * A list with one photo item (L6), typed now and sent by the business's
 * manager to one person: Noa in the demo restaurant, which takes photos
 * ("photos": true in supabase/seed.sql), or Tamar in the demo shop, which
 * takes none. Its id.
 */
export async function sendPhotoList(
  business: "restaurant" | "shop",
  name: string,
  label: string,
): Promise<string> {
  const [sender, place, person] =
    business === "restaurant"
      ? [RESTAURANT_MANAGER, DEMO_RESTAURANT, NOA_ID]
      : [SHOP_MANAGER, DEMO_SHOP, TAMAR_ID];
  const list = {
    name,
    items: [{ kind: "photo", label }],
    recipient: { kind: "person", user: person },
  };
  const [row] = await sql<{ id: string | null }[]>`
    select public.send_list(${sender}::uuid, ${place}::uuid,
      ${sql.json(list)}::jsonb) as id`;
  if (!row?.id) throw new Error(`No photo list was sent in the ${business}`);
  return row.id;
}

/** The photo a list's first photo item points at now, as the database keeps it. */
export async function photoListPath(listId: string): Promise<string | null> {
  const [row] = await sql<{ photo_path: string | null }[]>`
    select i.photo_path from public.list_items i
    where i.list_id = ${listId} and i.kind = 'photo'
    order by i.position limit 1`;
  return row?.photo_path ?? null;
}

/**
 * Makes a list's photo as old as if it was taken `days` days ago, for the
 * daily clean-up (L6, `public.expired_list_photos`) to find once that is past
 * the days its business keeps photos.
 */
export async function agePhotoList(
  listId: string,
  days: number,
): Promise<void> {
  await sql`update public.list_items
    set done_at = now() - make_interval(days => ${days}::integer)
    where list_id = ${listId} and kind = 'photo' and photo_path is not null`;
}

/** Whether the daily clean-up removed a list's first photo: its item says so. */
export async function photoListRemoved(listId: string): Promise<boolean> {
  const [row] = await sql<{ removed: boolean }[]>`
    select i.photo_removed_at is not null as removed from public.list_items i
    where i.list_id = ${listId} and i.kind = 'photo'
    order by i.position limit 1`;
  return row?.removed ?? false;
}

/**
 * Removes the photo lists a test sent, in both demo businesses. Their files,
 * if any are left, are the local Storage's, unread by anyone.
 */
export async function removePhotoLists(name: string): Promise<void> {
  await sql`delete from public.lists
    where business_id in (${DEMO_RESTAURANT}, ${DEMO_SHOP}) and name = ${name}`;
  await sql`delete from public.notifications
    where business_id in (${DEMO_RESTAURANT}, ${DEMO_SHOP})
      and kind like 'lists.%' and params ->> 'name' = ${name}`;
}

/**
 * The demo restaurant's lines of a kind about a list by name, and how many
 * people they went to: other specs may give the restaurant another manager
 * while this one runs, so a spec checks one line each, not a fixed count.
 */
export async function demoListLineSpread(
  kind: string,
  name: string,
): Promise<{ lines: number; people: number }> {
  const [row] = await sql<{ lines: number; people: number }[]>`
    select count(*)::int as lines, count(distinct n.user_id)::int as people
    from public.notifications n
    where n.business_id = ${DEMO_RESTAURANT} and n.kind = ${kind}
      and n.params ->> 'name' = ${name}`;
  return row ?? { lines: 0, people: 0 };
}

/*
 * Chat (C2). The demo's conversations are written by its reset
 * (private.seed_demo_chat): in the restaurant, Uri's thanks and Shiran's two
 * morning messages (read by Noa and Yoav) in the whole team's group, Noa's
 * message and Shiran's answer in the kitchen, and Shiran's
 * private chat with Noa (her question read, Noa's answer not yet); the same
 * shape in the shop with Michal, Omer, Tamar, Itai and the checkout. A spec
 * that writes puts them back first and after, and never counts what another
 * spec may add.
 */

type DemoChatBusiness = "restaurant" | "shop";

const chatBusiness = (business: DemoChatBusiness) =>
  business === "shop" ? DEMO_SHOP : DEMO_RESTAURANT;

/**
 * A demo business's chats as its reset leaves them: every message (with its
 * confirmations), read mark, private chat and chat line gone, then the demo's
 * own conversations written again by the function the reset ends with.
 * `notices` also forgets who read chat's notice, so a first visit shows it.
 */
export async function clearDemoChat(
  business: DemoChatBusiness = "restaurant",
  { notices = false }: { notices?: boolean } = {},
): Promise<void> {
  const id = chatBusiness(business);
  await sql`delete from public.chat_messages where business_id = ${id}`;
  await sql`delete from public.chat_reads where business_id = ${id}`;
  await sql`delete from public.chat_conversations
    where business_id = ${id} and kind = 'direct'`;
  await sql`update public.chat_conversations
    set last_message_at = null, changed_at = now()
    where business_id = ${id}`;
  await sql`delete from public.notifications
    where business_id = ${id} and kind like 'chat.%'`;
  if (notices) {
    await sql`delete from public.chat_notices where business_id = ${id}`;
  }
  await sql`select private.seed_demo_chat(${id}::uuid)`;
}

/**
 * A message in a demo business's team group from before its people came onto
 * the staff (40 days ago; the seed moves them a month back), as its first
 * manager wrote it: management reads it, and nobody who joined after it
 * does. Kept until the next clearDemoChat.
 */
export async function demoOldTeamMessage(
  words: string,
  business: DemoChatBusiness = "restaurant",
): Promise<void> {
  await sql`insert into public.chat_messages
      (business_id, conversation_id, author_id, draft_id, body, created_at, seeded)
    select c.business_id, c.id, m.user_id, gen_random_uuid(), ${words},
      now() - interval '40 days', true
    from public.chat_conversations c
    join public.memberships m
      on m.business_id = c.business_id and m.role = 'manager' and m.active
    where c.business_id = ${chatBusiness(business)} and c.kind = 'team'
    order by m.created_at
    limit 1`;
}

/** The person (by phone, E.164) read chat's notice, as "הבנתי" keeps it. */
export async function seeDemoChatNotice(
  phone: string,
  business: DemoChatBusiness = "restaurant",
): Promise<void> {
  await sql`insert into public.chat_notices (business_id, user_id)
    select m.business_id, m.user_id from public.memberships m
    join public.profiles p on p.id = m.user_id
    where m.business_id = ${chatBusiness(business)} and p.phone = ${phone}
    on conflict (business_id, user_id) do nothing`;
}

export type DemoChat =
  | { kind: "team" }
  /** A department's group, by the department's name. */
  | { kind: "department"; name: string }
  /** Two people's private chat, by their phones (E.164). */
  | { kind: "direct"; between: [string, string] };

/** A demo business's conversation's id, for its address; null when there is none. */
export async function demoConversation(
  which: DemoChat,
  business: DemoChatBusiness = "restaurant",
): Promise<string | null> {
  const id = chatBusiness(business);
  if (which.kind === "team") {
    const [row] = await sql<{ id: string }[]>`
      select c.id from public.chat_conversations c
      where c.business_id = ${id} and c.kind = 'team'`;
    return row?.id ?? null;
  }
  if (which.kind === "department") {
    const [row] = await sql<{ id: string }[]>`
      select c.id from public.chat_conversations c
      join public.departments d on d.id = c.department_id
      where c.business_id = ${id} and c.kind = 'department'
        and d.name = ${which.name} and d.archived_at is null`;
    return row?.id ?? null;
  }
  const [one, two] = which.between;
  const [row] = await sql<{ id: string }[]>`
    select c.id from public.chat_conversations c
    join public.profiles a on a.id = c.person_a
    join public.profiles b on b.id = c.person_b
    where c.business_id = ${id} and c.kind = 'direct'
      and ((a.phone = ${one} and b.phone = ${two})
        or (a.phone = ${two} and b.phone = ${one}))`;
  return row?.id ?? null;
}

export type DemoChatLine = {
  kind: string;
  conversation: string | null;
  /** How many messages wait, for a chat's own line; null for an announcement. */
  count: number | null;
  read: boolean;
  /** none, queued, sending, sent, skipped… (a demo business never queues). */
  pushState: string;
};

/** The person's chat lines in a demo business (by phone, E.164), newest first. */
export async function demoChatLines(
  phone: string,
  business: DemoChatBusiness = "restaurant",
): Promise<DemoChatLine[]> {
  return await sql<DemoChatLine[]>`
    select n.kind, n.params ->> 'conversation' as conversation,
      (n.params ->> 'count')::int as count,
      n.read_at is not null as read,
      n.push_state as "pushState"
    from public.notifications n
    join public.profiles p on p.id = n.user_id
    where n.business_id = ${chatBusiness(business)} and p.phone = ${phone}
      and n.kind like 'chat.%'
    order by n.created_at desc, n.id`;
}

/*
 * Announcements, removing and muting (C3). The reset's seed pins Shiran's
 * 08:10 line in the restaurant's whole team's group as an announcement, which
 * Noa and Yoav confirmed; clearDemoChat puts it back. The log keeps every
 * chat.remove and chat.restore (it is append-only), so a spec counts its own
 * from when it started.
 */

/**
 * How many people a demo business's conversation has now, as the database
 * counts them (private.chat_members): an announcement there asks every one of
 * them but its author for "קראתי".
 */
export async function demoChatMembers(conversation: string): Promise<number> {
  const [row] = await sql<{ count: number }[]>`
    select cardinality(private.chat_members(${conversation}::uuid))::int as count`;
  return row?.count ?? 0;
}

/**
 * Whether the person (by phone, E.164) read the conversation up to its newest
 * message, as the open screen marks it (public.read_chat).
 */
export async function demoChatRead(
  phone: string,
  conversation: string,
): Promise<boolean> {
  const [row] = await sql<{ read: boolean }[]>`
    select coalesce(r.read_at >= c.last_message_at, false) as read
    from public.chat_conversations c
    join public.chat_reads r on r.conversation_id = c.id
    join public.profiles p on p.id = r.user_id
    where c.id = ${conversation} and p.phone = ${phone}`;
  return row?.read ?? false;
}

/** Whether the person (by phone, E.164) muted the conversation. */
export async function demoChatMuted(
  phone: string,
  conversation: string,
): Promise<boolean> {
  const [row] = await sql<{ muted: boolean }[]>`
    select r.muted from public.chat_reads r
    join public.profiles p on p.id = r.user_id
    where r.conversation_id = ${conversation} and p.phone = ${phone}`;
  return row?.muted ?? false;
}

/**
 * How many rows about chats (chat.*) the person (by phone, E.164) wrote to a
 * demo business's log since `since`: removing one's own message writes none.
 */
export async function demoChatLogBy(
  phone: string,
  since: Date,
  business: DemoChatBusiness = "restaurant",
): Promise<number> {
  const [row] = await sql<{ count: number }[]>`
    select count(*)::int as count from public.audit_log a
    join public.profiles p on p.id = a.actor_id
    where a.business_id = ${chatBusiness(business)} and p.phone = ${phone}
      and a.action like 'chat.%' and a.created_at >= ${since}`;
  return row?.count ?? 0;
}

/** Thrown to take back what demoChatPushStates wrote. */
class TakenBack extends Error {}

/**
 * What a message from `from` in a demo restaurant conversation would queue
 * for each of `to`'s phones, were the restaurant a business whose lines reach
 * phones and each of them had one: `push_state` of each one's line about the
 * conversation, by phone (E.164). A demo business never queues
 * (private.push_business_ok), so demoChatLines says "none" there muted or
 * not; this asks the database what the mute decides, inside a transaction it
 * takes back: the restaurant off the demo list for that moment, a device for
 * each of `to`, and the message sent through public.send_chat_message, as the
 * app sends it. Nothing of it stays: no message, device, line or change to
 * the demo.
 */
export async function demoChatPushStates(
  conversation: string,
  from: string,
  to: string[],
): Promise<Record<string, string>> {
  let states: Record<string, string> = {};
  try {
    await sql.begin(async (tx) => {
      await tx`delete from private.demo_businesses
        where business_id = ${DEMO_RESTAURANT}`;
      await tx`insert into public.push_subscriptions
          (user_id, endpoint, endpoint_hash, p256dh, auth_secret)
        select p.id, 'https://push.invalid/e2e-chat-' || p.id::text,
          md5('e2e-chat-a-' || p.id::text) || md5('e2e-chat-b-' || p.id::text),
          'BOr8a4N2Qbv1dDdEh5a3X9nTq0wKcY6UoL1mZpR4sVf8gJ2kHtE7yWiAxC3uNbQ5lMzO9vP0rS6eTgIjFhDwKy0',
          'aW5zdGFudC1hdXRoLWtleQ'
        from public.profiles p where p.phone in ${tx(to)}`;
      const sent = await tx`select public.send_chat_message(
          p.id, ${DEMO_RESTAURANT}::uuid, gen_random_uuid(),
          'הודעה לבדיקה, שלא נשמרת'::text, ${conversation}::uuid)
        from public.profiles p where p.phone = ${from}`;
      if (sent.length !== 1) throw new Error(`No one at ${from}`);
      const rows = await tx<{ phone: string; state: string }[]>`
        select p.phone, n.push_state as state from public.notifications n
        join public.profiles p on p.id = n.user_id
        where n.business_id = ${DEMO_RESTAURANT}
          and n.dedupe_key = ${`chat.${conversation}`}
          and p.phone in ${tx(to)}`;
      states = Object.fromEntries(rows.map((r) => [r.phone, r.state]));
      throw new TakenBack();
    });
  } catch (error) {
    if (!(error instanceof TakenBack)) throw error;
  }
  return states;
}

/*
 * Pictures in chat (C4, supabase/migrations/20261111000500_chat_files.sql).
 * The demo restaurant takes them for these tests ("chatFiles": true in
 * supabase/seed.sql); the demo shop takes none, like the hosted demo
 * businesses. SQL reads Storage's rows but never removes its files: a spec
 * that sends a picture ages it and runs the clean-up (/cron/chat-files), which
 * removes it through Storage.
 */

/** A message's picture, as the database keeps it. */
export type DemoChatFile = {
  message: string;
  filePath: string;
  thumbPath: string;
  /** The picture and its thumbnail together, as reserved. */
  fileSize: number;
  removed: boolean;
};

/** The newest picture in a demo restaurant conversation sent with these words. */
export async function demoChatFile(
  conversation: string,
  words: string,
): Promise<DemoChatFile | null> {
  const [row] = await sql<DemoChatFile[]>`
    select m.id as message, m.file_path as "filePath",
      m.thumb_path as "thumbPath", m.file_size as "fileSize",
      m.file_removed_at is not null as removed
    from public.chat_messages m
    where m.business_id = ${DEMO_RESTAURANT}
      and m.conversation_id = ${conversation}
      and m.body = ${words} and m.file_kind = 'image'
    order by m.created_at desc limit 1`;
  return row ?? null;
}

/** What Storage keeps of chat files, by path: their sizes and types. */
export async function chatFileObjects(
  paths: string[],
): Promise<{ name: string; size: number; type: string }[]> {
  if (paths.length === 0) return [];
  return await sql<{ name: string; size: number; type: string }[]>`
    select o.name, (o.metadata ->> 'size')::int as size,
      o.metadata ->> 'mimetype' as type
    from storage.objects o
    where o.bucket_id = 'chat-files' and o.name in ${sql(paths)}
    order by o.name`;
}

/**
 * Makes a chat message's picture as old as if it was sent `days` days ago,
 * its message and both files in Storage, for the clean-up to find once that
 * is past the days its business keeps files (`public.expired_files`; 90 by
 * default).
 */
export async function ageChatFile(
  message: string,
  days: number,
): Promise<void> {
  await sql`update storage.objects o
    set created_at = now() - make_interval(days => ${days}::integer)
    from public.chat_messages m
    where m.id = ${message} and o.bucket_id = 'chat-files'
      and o.name in (m.file_path, m.thumb_path)`;
  await sql`update public.chat_messages
    set created_at = now() - make_interval(days => ${days}::integer)
    where id = ${message}`;
}

/** Whether the clean-up removed a chat message's picture: the message says so. */
export async function chatFileRemoved(message: string): Promise<boolean> {
  const [row] = await sql<{ removed: boolean }[]>`
    select m.file_removed_at is not null as removed
    from public.chat_messages m where m.id = ${message}`;
  return row?.removed ?? false;
}

/**
 * The pictures the demo restaurant's messages still hold with words that
 * start so: what a spec sent and hasn't had removed yet.
 */
export async function demoChatFilesLeft(prefix: string): Promise<string[]> {
  const rows = await sql<{ message: string }[]>`
    select m.id as message from public.chat_messages m
    where m.business_id = ${DEMO_RESTAURANT} and m.file_path is not null
      and m.file_removed_at is null and starts_with(m.body, ${prefix})`;
  return rows.map((row) => row.message);
}

/*
 * PDFs in chat (C5, supabase/migrations/20261111000600_chat_pdfs.sql): the
 * browser puts one in Storage itself through a signed upload for the path the
 * server reserved (private.file_uploads), and the server sends it once it read
 * its start. As for pictures, SQL reads Storage's rows and never removes its
 * files.
 */

/** A message's PDF, as the database keeps it. */
export type DemoChatPdf = {
  message: string;
  filePath: string;
  fileName: string | null;
  fileSize: number;
  body: string | null;
};

/** The newest PDF in a demo restaurant conversation kept with this name. */
export async function demoChatPdf(
  conversation: string,
  name: string,
): Promise<DemoChatPdf | null> {
  const [row] = await sql<DemoChatPdf[]>`
    select m.id as message, m.file_path as "filePath",
      m.file_name as "fileName", m.file_size as "fileSize", m.body
    from public.chat_messages m
    where m.business_id = ${DEMO_RESTAURANT}
      and m.conversation_id = ${conversation}
      and m.file_kind = 'pdf' and m.file_name = ${name}
    order by m.created_at desc limit 1`;
  return row ?? null;
}

/**
 * The PDF places the person (by phone, E.164) reserved in the demo
 * restaurant, newest first: where the browser was to put each, whether a
 * message holds it, and the name it was reserved with.
 */
export async function demoPdfPlaces(
  phone: string,
): Promise<{ path: string; used: boolean; name: string | null }[]> {
  return await sql<{ path: string; used: boolean; name: string | null }[]>`
    select u.path, u.used_at is not null as used, u.file_name as name
    from private.file_uploads u
    join public.profiles p on p.id = u.owner_id
    where u.business_id = ${DEMO_RESTAURANT} and p.phone = ${phone}
      and u.file_kind = 'pdf'
    order by u.created_at desc`;
}

/*
 * Official documents (chat C6, C7; 20261111000700_documents.sql). Nothing
 * deletes a document but a purge that names its business, so a spec takes
 * its own away: their files first, through the clean-up (/cron/chat-files,
 * once their removal's 10 minutes are made to be over), then their rows,
 * lines and log rows, inside a transaction that names the business
 * (`ca.records_purge`). SQL reads Storage's rows and never removes its files.
 * A demo document's title is its category's words, so a spec finds its own
 * by when they were sent and by whom.
 */

/** A demo business's document, as the database keeps it. */
export type DemoDocument = {
  id: string;
  direction: "to_people" | "from_person";
  category: string;
  /** Its sender's phone (E.164). */
  author: string | null;
  filePath: string | null;
  fileKind: string | null;
  sample: string | null;
  openedAt: Date | null;
  removedAt: Date | null;
  removedReason: string | null;
};

/** The documents the person (by phone, E.164) sent in a demo business since `since`, newest first. */
export async function demoDocumentsBy(
  phone: string,
  since: Date,
  business: DemoChatBusiness = "restaurant",
): Promise<DemoDocument[]> {
  return await sql<DemoDocument[]>`
    select d.id, d.direction, d.category, p.phone as author,
      d.file_path as "filePath", d.file_kind as "fileKind", d.sample,
      d.opened_at as "openedAt", d.removed_at as "removedAt",
      d.removed_reason as "removedReason"
    from public.documents d
    join public.profiles p on p.id = d.author_id
    where d.business_id = ${chatBusiness(business)} and p.phone = ${phone}
      and d.sent_at >= ${since}
    order by d.sent_at desc`;
}

/** One document, as the database keeps it; null when there is none. */
export async function demoDocument(id: string): Promise<DemoDocument | null> {
  const [row] = await sql<DemoDocument[]>`
    select d.id, d.direction, d.category, p.phone as author,
      d.file_path as "filePath", d.file_kind as "fileKind", d.sample,
      d.opened_at as "openedAt", d.removed_at as "removedAt",
      d.removed_reason as "removedReason"
    from public.documents d
    left join public.profiles p on p.id = d.author_id
    where d.id = ${id}`;
  return row ?? null;
}

/** A recipient's marks on a document, by their phone (E.164). */
export async function demoDocumentMark(
  id: string,
  phone: string,
): Promise<{ openedAt: Date | null; confirmedAt: Date | null } | null> {
  const [row] = await sql<
    { openedAt: Date | null; confirmedAt: Date | null }[]
  >`
    select r.opened_at as "openedAt", r.confirmed_at as "confirmedAt"
    from public.document_recipients r
    join public.profiles p on p.id = r.person_id
    where r.document_id = ${id} and p.phone = ${phone}`;
  return row ?? null;
}

/**
 * A demo business's seeded sick note: the sample its first worker sent to
 * the business at the reset. Null when there is none.
 */
export async function demoSeededSickNote(
  business: DemoChatBusiness = "restaurant",
): Promise<string | null> {
  const [row] = await sql<{ id: string }[]>`
    select d.id from public.documents d
    where d.business_id = ${chatBusiness(business)}
      and d.direction = 'from_person' and d.sample = 'sick_note'
    order by d.sent_at limit 1`;
  return row?.id ?? null;
}

/**
 * A sample sick note the person (by phone, E.164) sends to a demo business
 * now, as the app's demo does (public.send_document with its sample): a
 * document with nothing stored, which its spec takes away
 * (`forgetDemoDocuments`). Returns its id.
 */
export async function sendDemoSickNote(
  phone: string,
  business: DemoChatBusiness = "restaurant",
): Promise<string> {
  const id = chatBusiness(business);
  const [row] = await sql<{ id: string }[]>`
    select public.send_document(
      p.id, ${id}::uuid, 'from_person', 'sick_note',
      private.document_title('sick_note'), null, null, false, null,
      'sick_note'
    ) as id
    from public.profiles p where p.phone = ${phone}`;
  if (!row) throw new Error(`No profile for ${phone}`);
  return row.id;
}

/** How many messages a conversation got since `since`. */
export async function demoChatMessagesSince(
  conversation: string,
  since: Date,
): Promise<number> {
  const [row] = await sql<{ count: number }[]>`
    select count(*)::int as count from public.chat_messages m
    where m.conversation_id = ${conversation} and m.created_at >= ${since}`;
  return row?.count ?? 0;
}

/**
 * Makes these documents' files due for the clean-up: removed (or still
 * removed) with their 10 minutes to undo over, so /cron/chat-files takes
 * their files out of Storage and the rows say their file is gone. Returns
 * the paths still held, for the spec to wait on.
 */
export async function retireDemoDocuments(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  await sql`update public.documents
    set removed_at = coalesce(removed_at, now() - interval '20 minutes'),
      removed_reason = coalesce(removed_reason, 'other'),
      file_gone_after = now() - interval '1 minute'
    where id in ${sql(ids)} and file_path is not null`;
  const rows = await sql<{ path: string }[]>`
    select d.file_path as path from public.documents d
    where d.id in ${sql(ids)} and d.file_path is not null`;
  return rows.map((row) => row.path);
}

/** How many of these documents still hold a file. */
export async function demoDocumentFilesLeft(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const [row] = await sql<{ count: number }[]>`
    select count(*)::int as count from public.documents d
    where d.id in ${sql(ids)} and d.file_path is not null`;
  return row?.count ?? 0;
}

/**
 * Takes these documents away for good, as only a purge that names their
 * business may: their recipients, their rows, the lines and the log rows
 * about them. Their files must be gone first (`retireDemoDocuments` and the
 * clean-up); one that still holds a file is left, and named in the answer.
 */
export async function forgetDemoDocuments(
  ids: string[],
  business: DemoChatBusiness = "restaurant",
): Promise<string[]> {
  if (ids.length === 0) return [];
  const id = chatBusiness(business);
  const held = await sql<{ id: string }[]>`
    select d.id from public.documents d
    where d.id in ${sql(ids)} and d.file_path is not null`;
  const gone = ids.filter((each) => !held.some((row) => row.id === each));
  if (gone.length > 0) {
    const keys = gone.map((each) => `documents.${each}`);
    await sql.begin(async (tx) => {
      await tx`select set_config('ca.records_purge', ${id}, true)`;
      await tx`delete from public.notifications n
        where n.business_id = ${id} and n.dedupe_key in ${tx(keys)}`;
      await tx`delete from public.audit_log a
        where a.business_id = ${id} and a.action like 'document.%'
          and a.details ->> 'document' in ${tx(gone)}`;
      await tx`delete from public.document_recipients r
        where r.business_id = ${id} and r.document_id in ${tx(gone)}`;
      await tx`delete from public.documents d
        where d.business_id = ${id} and d.id in ${tx(gone)}`;
    });
  }
  return held.map((row) => row.id);
}

/**
 * A real business for each person's notification choices (notifications
 * part 3), which a demo business doesn't offer: an owner and a worker of
 * their own (their numbers are in no other spec), the worker on a published
 * shift next Sunday. Made afresh each run; their choices and devices go with
 * it when the spec is done.
 */
export const SETTINGS_BUSINESS = "00000000-0000-4000-b000-0000000000e3";
export const SETTINGS_PEOPLE = {
  owner: {
    id: "00000000-0000-4000-a000-000000000967",
    name: "דפנה בחירות",
    local: "050-000-0967",
    e164: "+972500000967",
  },
  worker: {
    id: "00000000-0000-4000-a000-000000000968",
    name: "עמית בחירות",
    local: "050-000-0968",
    e164: "+972500000968",
  },
} as const;

const settingsPeople = () =>
  Object.values(SETTINGS_PEOPLE).map((person) => person.id);

/** The business afresh, its people with no choices made and no devices. */
export async function openSettingsBusiness(): Promise<void> {
  await sql`delete from public.notification_preferences
    where user_id in ${sql(settingsPeople())}`;
  await openRealBusiness({
    id: SETTINGS_BUSINESS,
    slug: "settings-e2e",
    name: "עסק לבחירות",
    ...SETTINGS_PEOPLE,
  });
}

/** Forget the business, its people's choices and devices. */
export async function closeSettingsBusiness(): Promise<void> {
  await sql`delete from public.push_subscriptions
    where user_id in ${sql(settingsPeople())}`;
  await sql`delete from public.notification_preferences
    where user_id in ${sql(settingsPeople())}`;
  await deleteRealBusiness(SETTINGS_BUSINESS);
}

export type StoredPreferences = {
  pushOff: string[];
  quietFrom: string | null;
  quietTo: string | null;
  previews: boolean;
  askedAt: string | null;
};

/** A person's choices as stored, or null before they made any. */
export async function storedPreferences(
  userId: string,
): Promise<StoredPreferences | null> {
  const [row] = await sql<StoredPreferences[]>`
    select push_off as "pushOff",
      to_char(quiet_from, 'HH24:MI') as "quietFrom",
      to_char(quiet_to, 'HH24:MI') as "quietTo",
      previews, push_asked_at::text as "askedAt"
    from public.notification_preferences where user_id = ${userId}`;
  return row ?? null;
}

/** Back to no choices made. */
export async function forgetPreferences(userId: string): Promise<void> {
  await sql`delete from public.notification_preferences
    where user_id = ${userId}`;
}

/**
 * Quiet hours straight into the database, on Israel's clock: from an hour
 * ago until `minutes` minutes from now, in whole minutes (so they end at
 * least `minutes - 1` minutes from now), with the moment inside them. Written
 * this way nothing already waiting is planned again: set them before the
 * line. Returns when they end, "HH:MM".
 */
export async function quietUntilSoon(
  userId: string,
  minutes: number,
): Promise<string> {
  const [row] = await sql<{ stops: string }[]>`
    insert into public.notification_preferences as p
      (user_id, quiet_from, quiet_to, time_zone)
    select ${userId}::uuid,
      date_trunc('minute', here.t - interval '1 hour')::time,
      date_trunc('minute', here.t + make_interval(mins => ${minutes}::int))::time,
      'Asia/Jerusalem'
    from (select now() at time zone 'Asia/Jerusalem' as t) here
    on conflict (user_id) do update
      set quiet_from = excluded.quiet_from, quiet_to = excluded.quiet_to,
        time_zone = excluded.time_zone, updated_at = now()
    returning to_char(p.quiet_to, 'HH24:MI') as stops`;
  if (!row) throw new Error("No quiet hours written");
  return row.stops;
}

/**
 * A device for the person, as saving one leaves it, sending to `origin`
 * (the tests' loopback push service). Returns its endpoint.
 */
export async function addTestDevice(
  userId: string,
  origin: string,
): Promise<string> {
  const endpoint = `${origin}/push/${randomUUID()}`;
  await sql`insert into public.push_subscriptions
      (user_id, endpoint, endpoint_hash, p256dh, auth_secret, label)
    values (${userId}, ${endpoint}, private.endpoint_hash(${endpoint}),
      ${`B${"A".repeat(86)}`}, 'aW5zdGFudC1hdXRoLWtleQ', 'computer')`;
  return endpoint;
}

/** Forget the person's devices. */
export async function forgetDevices(userId: string): Promise<void> {
  await sql`delete from public.push_subscriptions where user_id = ${userId}`;
}

/**
 * The settings business's worker gives away their shift, through the
 * database function the app uses: whoever could take it gets a line.
 */
export async function giveSettingsShift(): Promise<void> {
  await sql`
    select public.request_shift_swap(${SETTINGS_PEOPLE.worker.id}::uuid, s.id)
    from public.schedule_shifts s
    where s.business_id = ${SETTINGS_BUSINESS}
    order by s.day limit 1`;
}

/** The worker's requests in the settings business, withdrawn. */
export async function withdrawSettingsShift(): Promise<void> {
  await sql`
    select public.cancel_shift_swap(${SETTINGS_PEOPLE.worker.id}::uuid, w.id)
    from public.shift_swaps w
    where w.business_id = ${SETTINGS_BUSINESS} and w.status = 'open'`;
}

/**
 * A line for the settings business's owner, written as the producers write
 * them: someone joined. `pushed`: as if it had just gone to their phone,
 * for /push/inbox to show. Returns its id.
 */
export async function notifySettingsOwner({
  pushed = false,
}: {
  pushed?: boolean;
} = {}): Promise<string> {
  const dedupe = `team.joined:e2e:settings:${Date.now()}`;
  await sql`select private.notify(
    ${SETTINGS_BUSINESS}::uuid, array[${SETTINGS_PEOPLE.owner.id}::uuid],
    'team.joined',
    ${sql.json({ person: SETTINGS_PEOPLE.worker.id })}::jsonb,
    actor => ${SETTINGS_PEOPLE.worker.id}::uuid,
    audience => 'manager',
    dedupe => ${dedupe}
  )`;
  const [line] = await sql<{ id: string }[]>`
    select id from public.notifications
    where business_id = ${SETTINGS_BUSINESS}
      and user_id = ${SETTINGS_PEOPLE.owner.id} and dedupe_key = ${dedupe}`;
  if (!line) throw new Error("No line for the settings business's owner");
  if (pushed) {
    await sql`update public.notifications
      set push_state = 'sent', pushed_at = now() where id = ${line.id}`;
  }
  return line.id;
}

/**
 * What still waits for a person's phone in the settings business goes no
 * more. Nothing sends between the spec's tests (the minute job is off in
 * the tests, and no action of theirs asks for a send), so a line one test
 * leaves waiting would go to the next test's device on its first send.
 */
export async function skipWaitingPushes(userId: string): Promise<void> {
  await sql`update public.notifications set push_state = 'skipped'
    where business_id = ${SETTINGS_BUSINESS}
      and user_id = ${userId} and push_state = 'queued'`;
}

/** A line and what waits for the phone. */
export type PushPlan = {
  id: string;
  state: string;
  /** When it goes to the phone, "HH:MM" in Israel; null for not at all. */
  after: string | null;
  /** Whether that moment is still to come. */
  later: boolean;
};

/** The settings business owner's newest line of a kind, and its push. */
export async function ownerLine(kind: string): Promise<PushPlan | null> {
  const [row] = await sql<PushPlan[]>`
    select id, push_state as state,
      to_char(push_after at time zone 'Asia/Jerusalem', 'HH24:MI') as after,
      coalesce(push_after > now(), false) as later
    from public.notifications
    where business_id = ${SETTINGS_BUSINESS}
      and user_id = ${SETTINGS_PEOPLE.owner.id} and kind = ${kind}
    order by created_at desc limit 1`;
  return row ?? null;
}

/**
 * As if the person's quiet hours ended now: they stop at this minute on
 * their clock (the end isn't inside them), and the line that waited for
 * them is due. A send holds whatever comes due while they last, so ending
 * them is what lets it go.
 */
export async function endQuietNow(userId: string, id: string): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`update public.notification_preferences p
      set quiet_to = date_trunc('minute', now() at time zone p.time_zone)::time,
        updated_at = now()
      where p.user_id = ${userId} and p.quiet_to is not null`;
    await tx`update public.notifications set push_after = now()
      where id = ${id} and push_state = 'queued'`;
  });
}

/**
 * A real business for the reminders (notifications part 4), which a demo
 * business never gets: an owner and two workers of their own (their numbers
 * are in no other spec). Next week is open and not published, and one of the
 * workers has sent availability for it; one press clocks in and out. Made
 * afresh by each test that uses it; its people's devices and choices go with
 * it when the test is done.
 */
export const REMINDERS_BUSINESS = "00000000-0000-4000-b000-0000000000e7";
export const REMINDERS_PEOPLE = {
  owner: {
    id: "00000000-0000-4000-a000-000000000971",
    name: "רונית תזכורות",
    local: "050-000-0971",
    e164: "+972500000971",
  },
  /** Hasn't sent next week's availability. */
  missing: {
    id: "00000000-0000-4000-a000-000000000972",
    name: "טל תזכורות",
    local: "050-000-0972",
    e164: "+972500000972",
  },
  /** Sent it when the business opened. */
  sent: {
    id: "00000000-0000-4000-a000-000000000973",
    name: "שחר תזכורות",
    local: "050-000-0973",
    e164: "+972500000973",
  },
} as const;

const remindersPeople = () =>
  Object.values(REMINDERS_PEOPLE).map((person) => person.id);

/** Next week as the database's reminders read it, and when it is due. */
export type RemindersWeek = {
  /** YYYY-MM-DD */
  startsOn: string;
  /** The week as the lines name it, "29.11". */
  date: string;
  /** When its availability is due, by the business's settings. */
  dueAt: Date;
  /** That moment's weekday (0 = Sunday) and time, on the business's clock. */
  dueDay: number;
  dueTime: string;
};

/** The business afresh: its people with no devices and no choices made. */
export async function openRemindersBusiness(): Promise<RemindersWeek> {
  await deleteRealBusiness(REMINDERS_BUSINESS);
  await ensureLogins(Object.values(REMINDERS_PEOPLE));
  await sql`delete from public.push_subscriptions
    where user_id in ${sql(remindersPeople())}`;
  await sql`delete from public.notification_preferences
    where user_id in ${sql(remindersPeople())}`;
  await sql`insert into public.businesses (id, slug, name)
    values (${REMINDERS_BUSINESS}, 'reminders-e2e', 'עסק לתזכורות')`;
  await sql`select public.apply_template(${REMINDERS_BUSINESS}, 'retail')`;
  await sql`insert into public.memberships (business_id, user_id, role)
    values (${REMINDERS_BUSINESS}, ${REMINDERS_PEOPLE.owner.id}, 'owner'),
      (${REMINDERS_BUSINESS}, ${REMINDERS_PEOPLE.missing.id}, 'worker'),
      (${REMINDERS_BUSINESS}, ${REMINDERS_PEOPLE.sent.id}, 'worker')`;
  await sql`update public.business_modules
    set settings = settings || ${sql.json({ requirePunchCode: false })}::jsonb
    where business_id = ${REMINDERS_BUSINESS} and module_key = 'time_clock'`;
  // Next week and its due moment, from the same functions the reminders use.
  const [week] = await sql<RemindersWeek[]>`
    select w.starts_on::text as "startsOn",
      to_char(w.starts_on, 'FMDD.FMMM') as date,
      d.due as "dueAt",
      extract(dow from d.due at time zone r.tz_name)::int as "dueDay",
      to_char(d.due at time zone r.tz_name, 'HH24:MI') as "dueTime"
    from private.availability_rules(${REMINDERS_BUSINESS}::uuid) r
    cross join lateral (
      select private.week_start_after(now(), r.tz_name, r.first_day) as starts_on
    ) w
    cross join lateral (
      select private.availability_due_at(${REMINDERS_BUSINESS}::uuid, w.starts_on)
        as due
    ) d`;
  if (!week) throw new Error("No next week for the reminders");
  await sql`select public.open_schedule_week(${REMINDERS_BUSINESS},
    ${week.startsOn}::date, ${week.dueAt}::timestamptz)`;
  await sendRemindersAvailability(REMINDERS_PEOPLE.sent.id);
  return week;
}

/** Forget the business, its people's devices and choices. */
export async function closeRemindersBusiness(): Promise<void> {
  await sql`delete from public.push_subscriptions
    where user_id in ${sql(remindersPeople())}`;
  await sql`delete from public.notification_preferences
    where user_id in ${sql(remindersPeople())}`;
  await deleteRealBusiness(REMINDERS_BUSINESS);
}

/**
 * What the minute job does, at a moment the test chooses, in the reminders
 * business alone. Returns how many lines it wrote there.
 */
export async function runReminders(at: Date = new Date()): Promise<number> {
  const [row] = await sql<{ written: number }[]>`
    select private.run_reminders(${at}::timestamptz,
      ${REMINDERS_BUSINESS}::uuid) as written`;
  return row?.written ?? 0;
}

/** A line in the reminders business, and what waits for the phone. */
export type ReminderLine = {
  id: string;
  read: boolean;
  settled: boolean;
  state: string;
  /** Whether its push waits for a moment still to come. */
  later: boolean;
  params: Record<string, unknown>;
};

/** A person's lines of a kind in the reminders business, oldest first. */
export async function reminderLines(
  userId: string,
  kind: string,
): Promise<ReminderLine[]> {
  return await sql<ReminderLine[]>`
    select id, read_at is not null as read, resolved_at is not null as settled,
      push_state as state, coalesce(push_after > now(), false) as later, params
    from public.notifications
    where business_id = ${REMINDERS_BUSINESS} and user_id = ${userId}
      and kind = ${kind}
    order by created_at, id`;
}

/**
 * The person sends next week's availability to the reminders business,
 * through the database function the app uses: 09:00–17:00 on its first day.
 */
export async function sendRemindersAvailability(userId: string): Promise<void> {
  await sql`
    select public.submit_availability(${userId}::uuid, w.id,
      jsonb_build_array(jsonb_build_object(
        'day', w.starts_on::text, 'start', '09:00', 'end', '17:00')),
      null::text)
    from public.schedule_weeks w
    where w.business_id = ${REMINDERS_BUSINESS}
    order by w.starts_on desc
    limit 1`;
}

/**
 * Someone in the reminders business clocked in `hoursAgo` hours ago and is
 * still on the clock, with no shift that day. Returns when they clocked in.
 */
export async function openReminderEntry(
  userId: string,
  hoursAgo: number,
): Promise<Date> {
  const since = new Date(Date.now() - hoursAgo * 3_600_000);
  await sql`insert into public.time_entries (business_id, user_id, clock_in)
    values (${REMINDERS_BUSINESS}, ${userId}, ${since})`;
  return since;
}

/** The reminders business's notification settings, as stored. */
export async function remindersSettings(): Promise<Record<string, unknown>> {
  const [row] = await sql<{ settings: Record<string, unknown> }[]>`
    select settings from public.business_modules
    where business_id = ${REMINDERS_BUSINESS}
      and module_key = 'notifications'`;
  return row?.settings ?? {};
}

/** Some of the reminders business's notification settings, written as is. */
export async function setRemindersSettings(
  settings: Record<string, number>,
): Promise<void> {
  await sql`update public.business_modules
    set settings = settings || ${sql.json(settings)}::jsonb
    where business_id = ${REMINDERS_BUSINESS}
      and module_key = 'notifications'`;
}

/**
 * Who sees pay from the console (Orel's payroll decision 1): a real business
 * the ConceptApp team changes it in, as its owner would, with an owner and a
 * worker of its own (their ids and numbers are in no other spec, and in no
 * pgTAP test either, which runs on the same local database and keeps its
 * logins), from the shop's template, so the time clock is on. Made afresh
 * each run, through the database functions the app uses.
 */
export const PAY_ACCESS_BUSINESS = {
  id: "00000000-0000-4000-b000-0000000000e8",
  slug: "pay-access-e2e",
  name: "החנות של מי רואה שכר",
} as const;
export const PAY_ACCESS_PEOPLE = {
  owner: {
    id: "00000000-0000-4000-a000-000000000947",
    name: "אביטל שכר",
    local: "050-000-0947",
    e164: "+972500000947",
  },
  worker: {
    id: "00000000-0000-4000-a000-000000000948",
    name: "עידו שכר",
    local: "050-000-0948",
    e164: "+972500000948",
  },
} as const;

export async function openPayAccessBusiness(): Promise<void> {
  await openRealBusiness({ ...PAY_ACCESS_BUSINESS, ...PAY_ACCESS_PEOPLE });
}

/** Forget the business, when the spec is done. */
export async function closePayAccessBusiness(): Promise<void> {
  await deleteRealBusiness(PAY_ACCESS_BUSINESS.id);
}

/**
 * The time clock and chat on or off in the business: with both off, pay
 * access opens nothing there, and the console offers none.
 */
export async function setPayAccessModules(on: boolean): Promise<void> {
  await sql`update public.business_modules set enabled = ${on}
    where business_id = ${PAY_ACCESS_BUSINESS.id}
      and module_key in ('time_clock', 'chat')`;
}

/** The roles the business gives pay access to, in order. */
export async function payAccessRoles(): Promise<string[]> {
  const rows = await sql<{ role: string }[]>`
    select role::text as role from public.role_permissions
    where business_id = ${PAY_ACCESS_BUSINESS.id} and perm = 'clock.payroll'
    order by role`;
  return rows.map((row) => row.role);
}

/** Whether the person was given pay access in the business on their own. */
export async function payAccessPersonal(userId: string): Promise<boolean> {
  const [row] = await sql<{ personal: boolean }[]>`
    select 'clock.payroll' = any (perms) as personal from public.memberships
    where business_id = ${PAY_ACCESS_BUSINESS.id} and user_id = ${userId}`;
  return row?.personal ?? false;
}

/**
 * The business's changes of who sees pay, oldest first: grant or revoke, by
 * whom (their id) and for whom (a role, or a person's id).
 */
export async function payAccessLog(): Promise<
  {
    action: string;
    actor: string | null;
    role: string | null;
    person: string | null;
  }[]
> {
  return await sql<
    {
      action: string;
      actor: string | null;
      role: string | null;
      person: string | null;
    }[]
  >`
    select action, actor_id::text as actor, details ->> 'role' as role,
      details ->> 'person' as person
    from public.audit_log
    where business_id = ${PAY_ACCESS_BUSINESS.id}
      and action in ('permission.grant', 'permission.revoke')
    order by created_at, id`;
}

/** The person's lines about their pay access in the business: who wrote them and whether settled. */
export async function payAccessLines(
  userId: string,
): Promise<{ actor: string | null; settled: boolean }[]> {
  return await sql<{ actor: string | null; settled: boolean }[]>`
    select actor_id::text as actor, resolved_at is not null as settled
    from public.notifications
    where business_id = ${PAY_ACCESS_BUSINESS.id} and user_id = ${userId}
      and kind = 'access.pay_granted'
    order by created_at`;
}
