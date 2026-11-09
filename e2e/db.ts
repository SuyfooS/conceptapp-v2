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
  await sql`delete from public.memberships m using public.profiles p
    where m.business_id = ${DEMO_RESTAURANT} and m.user_id = p.id
      and p.phone = ${invite.phone}`;
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

/** A person starts with nothing on the clock. */
export async function clearTimeEntries(phone: string): Promise<void> {
  await sql`delete from public.time_entries e
    using public.profiles p
    where e.business_id = ${DEMO_RESTAURANT} and e.user_id = p.id
      and p.phone = ${phone}`;
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

export async function openPushBusiness(): Promise<void> {
  const people = Object.values(PUSH_PEOPLE);
  await sql`delete from public.businesses where id = ${PUSH_BUSINESS}`;
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
  await sql`delete from public.businesses where id = ${PUSH_BUSINESS}`;
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

/** Removes a department a test added (archived, as the screen removes them). */
export async function archiveDemoDepartment(name: string): Promise<void> {
  await sql`update public.departments set archived_at = now()
    where business_id = ${DEMO_RESTAURANT} and name = ${name}
      and archived_at is null`;
}
