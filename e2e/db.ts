import postgres from "postgres";

/** The local database started by the Supabase CLI. Never a real project. */
const DB_URL =
  process.env.E2E_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

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
  const sql = postgres(DB_URL, { max: 1 });
  try {
    const rows = await sql<OpenedBusiness[]>`
      select b.name, b.accent, b.template_key as "templateKey",
        (select count(*)::int from public.business_modules m
          where m.business_id = b.id) as modules,
        (select count(*)::int from public.audit_log a
          where a.business_id = b.id and a.action = 'business.create') as audited
      from public.businesses b where b.slug = ${slug}`;
    return rows[0] ?? null;
  } finally {
    await sql.end();
  }
}

export type OpenInvite = { name: string | null; phone: string; role: string };

/** The open invites of a business, by phone number. */
export async function invitesBySlug(slug: string): Promise<OpenInvite[]> {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    return await sql<OpenInvite[]>`
      select i.full_name as name, i.phone, i.role::text as role
      from public.invites i join public.businesses b on b.id = i.business_id
      where b.slug = ${slug} and i.claimed_at is null
      order by i.phone`;
  } finally {
    await sql.end();
  }
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
  const sql = postgres(DB_URL, { max: 1 });
  try {
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
  } finally {
    await sql.end();
  }
}

/** The person's role in the demo restaurant, or null when not a member. */
export async function demoRole(phone: string): Promise<string | null> {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    const rows = await sql<{ role: string }[]>`
      select m.role::text as role from public.memberships m
      join public.profiles p on p.id = m.user_id
      where m.business_id = ${DEMO_RESTAURANT} and p.phone = ${phone}
        and m.active`;
    return rows[0]?.role ?? null;
  } finally {
    await sql.end();
  }
}

/** Remove the demo restaurant's invites to these numbers. */
export async function removeDemoInvites(phones: string[]): Promise<void> {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    await sql`delete from public.invites
      where business_id = ${DEMO_RESTAURANT} and phone in ${sql(phones)}`;
  } finally {
    await sql.end();
  }
}

/** How many `view_as.start` and `view_as.end` entries the person has. */
export async function viewAudit(
  phone: string,
): Promise<{ start: number; end: number }> {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    const rows = await sql<{ start: number; end: number }[]>`
      select
        count(*) filter (where a.action = 'view_as.start')::int as start,
        count(*) filter (where a.action = 'view_as.end')::int as end
      from public.audit_log a join public.profiles p on p.id = a.actor_id
      where p.phone = ${phone}`;
    return rows[0] ?? { start: 0, end: 0 };
  } finally {
    await sql.end();
  }
}

/**
 * End the person's open view session, so a failed spec never leaves the
 * console's platform admin inside a business for the specs after it.
 */
export async function endViewSessions(phone: string): Promise<void> {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    await sql`update public.view_sessions v set ended_at = now()
      from public.profiles p
      where p.id = v.staff_id and p.phone = ${phone} and v.ended_at is null`;
  } finally {
    await sql.end();
  }
}

/** Remove everything the person sent as availability to the demo restaurant. */
export async function clearAvailability(phone: string): Promise<void> {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    await sql`delete from public.availability_submissions s
      using public.profiles p
      where s.business_id = ${DEMO_RESTAURANT} and s.user_id = p.id
        and p.phone = ${phone}`;
  } finally {
    await sql.end();
  }
}

/** A person starts with nothing on the clock. */
export async function clearTimeEntries(phone: string): Promise<void> {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    await sql`delete from public.time_entries e
      using public.profiles p
      where e.business_id = ${DEMO_RESTAURANT} and e.user_id = p.id
        and p.phone = ${phone}`;
  } finally {
    await sql.end();
  }
}

/** A shift already worked: on the 1st of this month, or the 10th of an earlier one. */
export async function addDemoShift(
  phone: string,
  shift: { monthsAgo: number; minutes: number; unpaidBreak: number },
): Promise<void> {
  const sql = postgres(DB_URL, { max: 1 });
  try {
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
  } finally {
    await sql.end();
  }
}

/** Whether breaks come off the hours at the demo restaurant. */
export async function setDemoUnpaidBreaks(unpaid: boolean): Promise<void> {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    await sql`
      update public.business_modules
      set settings = settings || ${sql.json({ unpaidBreaks: unpaid })}::jsonb
      where business_id = ${DEMO_RESTAURANT} and module_key = 'time_clock'`;
  } finally {
    await sql.end();
  }
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
  const sql = postgres(DB_URL, { max: 1 });
  try {
    return await sql<SavedAvailability[]>`
      select extract(dow from r.day)::int as weekday,
        to_char(r.starts_at, 'HH24:MI') as start,
        to_char(r.ends_at, 'HH24:MI') as end, s.note
      from public.availability_submissions s
      join public.profiles p on p.id = s.user_id
      join public.availability_ranges r on r.submission_id = s.id
      where s.business_id = ${DEMO_RESTAURANT} and p.phone = ${phone}
      order by r.day, r.starts_at`;
  } finally {
    await sql.end();
  }
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
  const sql = postgres(DB_URL, { max: 1 });
  try {
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
  } finally {
    await sql.end();
  }
}

/** Remove the demo restaurant's saved schedules, back to drafts. */
export async function clearSchedule(): Promise<void> {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    await sql`delete from public.schedule_shifts
      where business_id = ${DEMO_RESTAURANT}`;
    await sql`update public.schedule_weeks
      set schedule_saved_at = null, schedule_published_at = null
      where business_id = ${DEMO_RESTAURANT}`;
  } finally {
    await sql.end();
  }
}

/** Whether any of the demo restaurant's weeks has a published schedule. */
export async function schedulePublished(): Promise<boolean> {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    const [row] = await sql<{ published: boolean }[]>`
      select exists (
        select 1 from public.schedule_weeks
        where business_id = ${DEMO_RESTAURANT}
          and schedule_published_at is not null
      ) as published`;
    return row?.published ?? false;
  } finally {
    await sql.end();
  }
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
  const sql = postgres(DB_URL, { max: 1 });
  try {
    return await sql<SavedAssignment[]>`
      select extract(dow from s.day)::int as weekday,
        s.pattern_key as pattern, p.phone, a.position_key as position
      from public.schedule_shifts s
      join public.shift_assignments a on a.shift_id = s.id
      join public.profiles p on p.id = a.user_id
      where s.business_id = ${DEMO_RESTAURANT}
      order by s.day, s.starts_at, p.phone`;
  } finally {
    await sql.end();
  }
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
  const sql = postgres(DB_URL, { max: 1 });
  try {
    return await sql<SavedShift[]>`
      select extract(dow from day)::int as weekday, name,
        to_char(starts_at, 'HH24:MI') as start,
        to_char(ends_at, 'HH24:MI') as "end",
        needed, pattern_key as pattern
      from public.schedule_shifts
      where business_id = ${DEMO_RESTAURANT}
      order by day, starts_at, name`;
  } finally {
    await sql.end();
  }
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
  const sql = postgres(DB_URL, { max: 1 });
  try {
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
  } finally {
    await sql.end();
  }
}

/**
 * Put people on a morning shift today at the demo restaurant, in this week's
 * schedule published to the team, through the database functions the app
 * uses, as its manager. Phone numbers, each with a position key or null.
 */
export async function scheduleDemoToday(
  people: [phone: string, position: string | null][],
): Promise<void> {
  const sql = postgres(DB_URL, { max: 1 });
  try {
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
        start: "09:00",
        end: "16:00",
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
  } finally {
    await sql.end();
  }
}

export type SavedSwap = {
  status: string;
  from: string;
  to: string | null;
};

/** The demo restaurant's shift swaps, oldest first, by phone number. */
export async function demoSwaps(): Promise<SavedSwap[]> {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    return await sql<SavedSwap[]>`
      select w.status::text as status, r.phone as "from", t.phone as "to"
      from public.shift_swaps w
      join public.profiles r on r.id = w.requested_by
      left join public.profiles t on t.id = w.taken_by
      where w.business_id = ${DEMO_RESTAURANT}
      order by w.created_at`;
  } finally {
    await sql.end();
  }
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
  const sql = postgres(DB_URL, { max: 1 });
  try {
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
  } finally {
    await sql.end();
  }
}
