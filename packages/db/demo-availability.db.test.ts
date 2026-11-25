import { addDays } from "@domain/availability";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * The demo's sample availability (`public.renew_demo_availability`,
 * 20261128000100_demo_sample_availability.sql) beside an answer the form
 * sends at the same moment (`public.submit_availability`, as
 * `packages/db/availability.ts` calls it), each in a session of its own,
 * which pgTAP, in one session, can't show. An answer being sent as the sample
 * runs stays the sender's; one sent while the sample is being written
 * replaces it; and while the week's reminders lock is held
 * (`private.lock_availability_week`, which the trigger on a new answer
 * takes), the two wait for each other in turn, never in a circle, so neither
 * fails and the trigger gives up on nothing. The sessions must see the
 * business, so unlike the other database tests it is committed: made before
 * the tests and taken away after them, with ids and numbers of its own
 * (050-000-53xx). Needs the local database (`pnpm db:start`); run with
 * `pnpm test:db`.
 */

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** What the form's session was told, such as the trigger giving up. */
const formNotices: string[] = [];

const sql = postgres(url, { max: 1, onnotice: () => {} });
const form = postgres(url, {
  max: 1,
  onnotice: (notice) => {
    formNotices.push(`${notice.severity}: ${notice.message}`);
  },
});
const sample = postgres(url, { max: 1, onnotice: () => {} });
const holder = postgres(url, { max: 1, onnotice: () => {} });

const BUSINESS = "dd000000-0000-4000-b000-000000000001";
const MANAGER = "dd000000-0000-4000-a000-000000000001";
const WORKER = "dd000000-0000-4000-a000-000000000002";
const PEOPLE = [
  [MANAGER, "972500005301", "manager"],
  [WORKER, "972500005302", "worker"],
] as const;

// Open on Shabbat, weeks from Sunday: the manager's sample is Sunday's
// 09:00-17:00, the worker's Monday's.
const DEFINITION = {
  slug: "demo-avail-race",
  sampleAvailability: [
    {
      user_id: MANAGER,
      ranges: [{ weekday: 0, start: "09:00", end: "17:00" }],
    },
    {
      user_id: WORKER,
      ranges: [{ weekday: 1, start: "09:00", end: "17:00" }],
    },
  ],
};

/** Next week's first day, as the renewal works it out, and its row. */
let startsOn = "";
let week = "";
const pids = { form: 0, sample: 0, holder: 0 };

async function pidOf(on: postgres.Sql): Promise<number> {
  const [row] = await on<{ pid: number }[]>`select pg_backend_pid() as pid`;
  return row?.pid ?? 0;
}

/** The business and its people gone, with everything of theirs. */
async function takeAway() {
  await sql.begin(async (tx) => {
    await tx`delete from private.demo_businesses where business_id = ${BUSINESS}`;
    const found =
      await tx`select 1 from public.businesses where id = ${BUSINESS}`;
    if (found.length > 0) {
      await tx`select private.purge_business_records(${BUSINESS}::uuid)`;
      await tx`delete from public.businesses where id = ${BUSINESS}`;
    }
    await tx`delete from auth.users where id in ${tx([MANAGER, WORKER])}`;
  });
}

async function make() {
  await sql.begin(async (tx) => {
    for (const [id, phone] of PEOPLE) {
      await tx`
        insert into auth.users (
          instance_id, id, aud, role, phone, phone_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
          confirmation_token, recovery_token, email_change,
          email_change_token_new, email_change_token_current, phone_change,
          phone_change_token, reauthentication_token
        )
        values (
          '00000000-0000-0000-0000-000000000000', ${id}, 'authenticated',
          'authenticated', ${phone}, now(),
          '{"provider":"phone","providers":["phone"]}', '{}', now(), now(),
          '', '', '', '', '', '', '', ''
        )`;
    }
    await tx`
      insert into public.businesses (id, slug, name)
      values (${BUSINESS}, ${DEFINITION.slug}, 'Demo availability race')`;
    for (const [id, , role] of PEOPLE) {
      await tx`
        insert into public.memberships (business_id, user_id, role)
        values (${BUSINESS}, ${id}, ${role}::public.member_role)`;
    }
    await tx`
      insert into public.business_modules (business_id, module_key, enabled, settings)
      values (${BUSINESS}, 'scheduling', true,
        '{"weekStartsOn": 0, "closedOnShabbat": false}')`;
    await tx`
      insert into private.demo_businesses (business_id, definition)
      values (${BUSINESS}, ${JSON.stringify(DEFINITION)}::jsonb)`;
  });
}

/** Next week opened afresh, with no answer, as the form opens it. */
async function freshWeek() {
  await sql`delete from public.schedule_weeks where business_id = ${BUSINESS}`;
  const [next] = await sql<{ starts_on: string }[]>`
    select private.week_start_after(now(), r.tz_name, r.first_day)::text as starts_on
    from private.availability_rules(${BUSINESS}::uuid) r`;
  startsOn = next?.starts_on ?? "";
  const [opened] = await sql<{ id: string }[]>`
    select public.open_schedule_week(${BUSINESS}::uuid, ${startsOn}::date,
      private.availability_due_at(${BUSINESS}::uuid, ${startsOn}::date)) as id`;
  week = opened?.id ?? "";
}

/** The worker's own answer, Wednesday's 10:00-14:00 with a note, as the form sends it. */
const sendOwn = (tx: postgres.TransactionSql) => tx`
  select public.submit_availability(${WORKER}::uuid, ${week}::uuid,
    jsonb_build_array(jsonb_build_object(
      'day', (${startsOn}::date + 3)::text, 'start', '10:00', 'end', '14:00')),
    'mine')`;

/** The renewal, as the door or Today calls it: how many answers it wrote. */
async function renew(tx: postgres.TransactionSql): Promise<number> {
  const [row] = await tx<{ written: number }[]>`
    select public.renew_demo_availability() as written`;
  return row?.written ?? -1;
}

/**
 * `first` run in a transaction of `on`'s, which then stays open until the
 * returned function is called: it commits, and resolves once it has.
 */
async function begun(
  on: postgres.Sql,
  first: (tx: postgres.TransactionSql) => Promise<unknown>,
): Promise<() => Promise<void>> {
  let release = () => {};
  const open = new Promise<void>((resolve) => {
    release = resolve;
  });
  let ran = () => {};
  let failed: (error: unknown) => void = () => {};
  const started = new Promise<void>((resolve, reject) => {
    ran = resolve;
    failed = reject;
  });
  const committed = on.begin(async (tx) => {
    await first(tx);
    ran();
    await open;
  });
  committed.catch(failed);
  await started;
  return async () => {
    release();
    await committed;
  };
}

/** A promise kept from rejecting unseen while the test waits on something else. */
function underWay<T>(running: Promise<T>): Promise<T> {
  running.catch(() => {});
  return running;
}

/** Resolves once `waiter`'s session waits on a lock `holding`'s holds or waits ahead for. */
async function waitsOn(waiter: number, holding: number): Promise<void> {
  const until = Date.now() + 10_000;
  while (Date.now() < until) {
    const [row] = await sql<{ waits: boolean }[]>`
      select ${holding}::int = any(pg_blocking_pids(${waiter}::int)) as waits`;
    if (row?.waits) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Session ${waiter} never waited on ${holding}`);
}

/** A person's answer for next week: its note and its ranges, earliest first. */
async function answerOf(person: string) {
  const [row] = await sql<{ note: string | null; ranges: string }[]>`
    select s.note,
      coalesce(string_agg(
        r.day::text || ' ' || to_char(r.starts_at, 'HH24:MI') || '-'
          || to_char(r.ends_at, 'HH24:MI'),
        ', ' order by r.day, r.starts_at), '') as ranges
    from public.availability_submissions s
    left join public.availability_ranges r on r.submission_id = s.id
    where s.week_id = ${week}::uuid and s.user_id = ${person}::uuid
    group by s.id, s.note`;
  return row ?? null;
}

/** The manager's sample, as sent: Sunday's hours, no note. */
const managersSample = () => ({
  note: null,
  ranges: `${startsOn} 09:00-17:00`,
});
const theirOwn = () => ({
  note: "mine",
  ranges: `${addDays(startsOn, 3)} 10:00-14:00`,
});

beforeAll(async () => {
  await takeAway();
  await make();
  pids.form = await pidOf(form);
  pids.sample = await pidOf(sample);
  pids.holder = await pidOf(holder);
});

beforeEach(async () => {
  await freshWeek();
  formNotices.length = 0;
});

afterAll(async () => {
  try {
    await takeAway();
  } finally {
    await Promise.all([sql, form, sample, holder].map((on) => on.end()));
  }
});

describe("the demo's sample availability beside an answer sent at the same moment", () => {
  it("leaves an answer being sent as it runs to the one who sends it", async () => {
    const commitForm = await begun(form, sendOwn);
    let written: Promise<number> | null = null;
    try {
      written = underWay(sample.begin(renew));
      await waitsOn(pids.sample, pids.form);
    } finally {
      await commitForm();
    }
    expect(await written).toBe(1);
    expect(await answerOf(WORKER)).toEqual(theirOwn());
    expect(await answerOf(MANAGER)).toEqual(managersSample());
    expect(formNotices).toEqual([]);
  }, 30_000);

  it("lets an answer sent while it is being written replace it", async () => {
    let written = -1;
    const commitSample = await begun(sample, async (tx) => {
      written = await renew(tx);
    });
    let sent: Promise<unknown> | null = null;
    try {
      sent = underWay(form.begin(sendOwn));
      await waitsOn(pids.form, pids.sample);
    } finally {
      await commitSample();
    }
    await sent;
    expect(written).toBe(2);
    expect(await answerOf(WORKER)).toEqual(theirOwn());
    expect(await answerOf(MANAGER)).toEqual(managersSample());
    expect(formNotices).toEqual([]);
  }, 30_000);

  it("waits in turn with it while the week's reminders are locked, never in a circle", async () => {
    // The sample's claims done, its trigger waits for the lock; the form's
    // answer then waits on the sample's row. Claimed one at a time, the
    // sample would hold the lock from its first claim and wait on the form's
    // row, whose trigger waits for the lock: a deadlock, which fails the
    // sample or makes the trigger give up.
    const release = await begun(
      holder,
      (tx) =>
        tx`select private.lock_availability_week(${BUSINESS}::uuid, ${startsOn}::date)`,
    );
    let written: Promise<number> | null = null;
    let sent: Promise<unknown> | null = null;
    try {
      written = underWay(sample.begin(renew));
      await waitsOn(pids.sample, pids.holder);
      sent = underWay(form.begin(sendOwn));
      await waitsOn(pids.form, pids.sample);
    } finally {
      await release();
    }
    expect(await written).toBe(2);
    await sent;
    expect(formNotices).toEqual([]);
    expect(await answerOf(WORKER)).toEqual(theirOwn());
    expect(await answerOf(MANAGER)).toEqual(managersSample());
  }, 30_000);
});
