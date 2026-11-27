import { appendFileSync } from "node:fs";
import { MAX_PEOPLE_ON_A_SHIFT } from "@domain/staffing";
import type postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { BUDGET, budgetOf } from "./budget";
import { removeScaleBusiness } from "./clean";
import { localDatabase } from "./guard";
import { choice, FICTIONAL_NUMBER, importNumber } from "./ids";
import { type SeedReport, seedScaleBusiness } from "./seed";
import { type Shape, type ShapeOptions, shape } from "./shape";

/**
 * The test business of a few hundred people, made in the database job
 * (docs/measure.md): 30 people with two months of everything, and 300 with
 * their team, invites and next week's draft, each in a transaction of its
 * own that is rolled back. The seed itself checks every count against
 * shape.ts after each of its parts; this checks what the counts can't see
 * (nothing switched off, history read from the day each person joined, the
 * neighbour reading none of it), the caps and the writes at 300, the
 * never-send rules this job can see, and that removal leaves nothing.
 * Times and counts are printed, and to the step summary on GitHub. Needs the
 * local database (`pnpm db:start`); run with `pnpm test:db`.
 */

const sql = localDatabase(process.env);

afterAll(() => sql.end());

class Rollback extends Error {}
class Tried extends Error {}
type Tx = postgres.TransactionSql;

/** Each size's time, for the budget, which is the file's: both sizes together (budget.ts). */
const took: { label: string; ms: number }[] = [];

const summary: string[] = [];
function note(line: string) {
  summary.push(line);
  console.log(line);
}
afterAll(() => {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file && summary.length > 0) {
    appendFileSync(
      file,
      `\n### The test business (measure/scale)\n\n${summary.join("\n")}\n`,
    );
  }
});

/** Seeds the size in a transaction, runs `check`, and rolls it all back. */
async function withSeed(
  options: Omit<ShapeOptions, "anchor" | "marginMinutes">,
  check: (tx: Tx, s: Shape, report: SeedReport) => Promise<void>,
): Promise<number> {
  const started = performance.now();
  await sql
    .begin(async (tx) => {
      const [now] = await tx<{ now: Date }[]>`select now() as now`;
      if (!now) throw new Error("No time from the database");
      // The transaction's clock stands still, so no margin from a week's start is needed.
      const s = shape({ ...options, anchor: now.now, marginMinutes: 0 });
      const report = await seedScaleBusiness(tx, s);
      await check(tx, s, report);
      await removeScaleBusiness(tx);
      throw new Rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) throw error;
    });
  return Math.round(performance.now() - started);
}

/** Runs `run` in a savepoint and undoes it; its value, or the error's message. */
async function tried<T>(
  tx: Tx,
  run: (sp: Tx) => Promise<T>,
): Promise<T | Error> {
  let value: T | undefined;
  try {
    await tx.savepoint(async (sp) => {
      value = await run(sp);
      throw new Tried();
    });
  } catch (error) {
    if (!(error instanceof Tried))
      return error instanceof Error ? error : new Error(String(error));
  }
  return value as T;
}

/** As a signed-in person, under row-level security, in a savepoint undone after. */
async function asPerson<T>(
  tx: Tx,
  person: string,
  read: (sp: Tx) => Promise<T>,
): Promise<T> {
  const result = await tried(tx, async (sp) => {
    await sp`select set_config('request.jwt.claims', ${JSON.stringify({ sub: person, role: "authenticated" })}, true)`;
    await sp`set local role authenticated`;
    return await read(sp);
  });
  if (result instanceof Error) throw result;
  return result;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** One size's time, printed; the budget is read on their sum, in the last test. */
function time(label: string, ms: number) {
  took.push({ label, ms });
  note(`- ${label}: ${seconds(ms)}`);
}

function printCounts(label: string, report: SeedReport) {
  const pick = (c: Record<string, number>, keys: string[]) =>
    keys.map((k) => `${k} ${c[k] ?? 0}`).join(", ");
  note(
    `- ${label}: ${pick(report.counts.scale, [
      "memberships",
      "shifts",
      "assignments",
      "entries",
      "breaks",
      "messages",
      "documents",
      "lines",
      "log",
    ])}; the neighbour: ${pick(report.counts.neighbour, ["memberships", "entries", "lines", "log"])}`,
  );
  const slowest = [...report.times].sort((a, b) => b.ms - a.ms).slice(0, 5);
  note(
    `  slowest steps: ${slowest.map((t) => `${t.part} ${t.step} ${t.ms} ms`).join(", ")}`,
  );
}

/** Never-send, as far as a database with no auth server can see. */
async function neverSend(tx: Tx) {
  const [row] = await tx<
    {
      phones: number;
      profiles: number;
      invites: number;
      demo: number;
      devices: number;
      jobs: number;
    }[]
  >`
    select
      (select count(*)::int from auth.users u
        where u.id::text like '5ca1e300-%' and coalesce(u.phone, '') <> '') as phones,
      (select count(*)::int from public.profiles p
        where p.id::text like '5ca1e300-%' and p.phone is not null
          and p.phone !~ '^\\+12(0[1-9]|1[0-2])55501[0-9]{2}$') as profiles,
      (select count(*)::int from public.invites i
        where i.business_id::text like '5ca1e300-%'
          and i.phone !~ '^\\+12(0[1-9]|1[0-2])55501[0-9]{2}$'
          and i.phone !~ '^\\+97250000(6[1-3][0-9]{2})$') as invites,
      (select count(*)::int from private.demo_businesses d
        where d.business_id::text like '5ca1e300-%') as demo,
      (select count(*)::int from public.push_subscriptions p
        where p.user_id::text like '5ca1e300-%') as devices,
      (select count(*)::int from cron.job j where j.active and j.jobname in (
        'notifications', 'notifications-clean', 'payroll', 'lists', 'list-photos', 'chat',
        'order-taking', 'audit-guard')) as jobs`;
  expect(row).toEqual({
    phones: 0,
    profiles: 0,
    invites: 0,
    demo: 0,
    devices: 0,
    jobs: 0,
  });
}

/** The tables the seed writes, whose own triggers must all be on. */
const WRITTEN = [
  "profiles",
  "platform_staff",
  "businesses",
  "business_modules",
  "departments",
  "memberships",
  "business_roles",
  "role_permissions",
  "member_names",
  "department_members",
  "employment_periods",
  "member_wages",
  "member_payroll_details",
  "invites",
  "schedule_weeks",
  "schedule_shifts",
  "shift_assignments",
  "availability_submissions",
  "availability_ranges",
  "shift_swaps",
  "time_entries",
  "time_breaks",
  "absences",
  "chat_conversations",
  "chat_messages",
  "chat_acks",
  "chat_reads",
  "documents",
  "document_recipients",
  "notifications",
  "audit_log",
];

describe("the test business, made in the database", () => {
  it("30 people with two months: every count as planned, nothing switched off, history from joining, and removed whole", async () => {
    let report: SeedReport | undefined;
    const ms = await withSeed(
      { people: 30, depth: "history", months: 2, chat: "ci" },
      async (tx, s, seeded) => {
        report = seeded;

        // The md5 choices read the same in SQL as in shape.ts.
        const vector = Array.from({ length: 40 }, (_, i) => ({
          kind: ["read", "wait", "kind", "absent"][i % 4] ?? "read",
          subject: s.scale.people[i % s.scale.people.length]?.id ?? "",
          day: `2026-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
        }));
        const fromSql = await tx<
          { kind: string; subject: string; day: string; n: string }[]
        >`
          select r.kind, r.subject, r.day,
            (('x' || substr(md5(current_setting('scale.version') || ':' || r.kind || ':'
              || r.subject || ':' || r.day), 1, 8))::bit(32)::bigint)::text as n
          from jsonb_to_recordset(${tx.json(vector)}::jsonb)
            as r (kind text, subject text, day text)`;
        const key = (v: { kind: string; subject: string; day: string }) =>
          `${v.kind}|${v.subject}|${v.day}`;
        expect(new Map(fromSql.map((r) => [key(r), Number(r.n)]))).toEqual(
          new Map(
            vector.map((v) => [
              key(v),
              choice(v.kind, v.subject, v.day) * 2 ** 32,
            ]),
          ),
        );

        // Nothing was switched off to get the rows in.
        const [role] = await tx<
          { role: string }[]
        >`select current_setting('session_replication_role') as role`;
        expect(role?.role).toBe("origin");
        const off = await tx<{ name: string }[]>`
          select c.relname || '.' || t.tgname as name
          from pg_trigger t
          join pg_class c on c.oid = t.tgrelid
          join pg_namespace n on n.oid = c.relnamespace
          where not t.tgisinternal
            and t.tgenabled not in ('O', 'A')
            and ((n.nspname = 'public' and c.relname in ${tx(WRITTEN)})
              or (n.nspname = 'private' and c.relname = 'file_uploads')
              or (n.nspname = 'auth' and c.relname = 'users' and t.tgname like 'on_auth_user_%'))`;
        expect(off).toEqual([]);

        // History from the day each joined: an old hand reads the team
        // group's oldest message as themself, someone new does not.
        const team = s.scale.chat.messages.filter(
          (m) => m.conversation === "team",
        );
        const oldest = team[0];
        if (!oldest) throw new Error("No team messages");
        const workers = s.scale.people.filter(
          (p) => p.kind === "staff" && p.role === "worker" && !p.lead,
        );
        const veteran = workers.find(
          (p) =>
            Date.parse(p.joinedAt) < Date.parse(s.anchor) - 700 * 86_400_000,
        );
        const newest = [...workers].sort((a, b) =>
          b.joinedAt.localeCompare(a.joinedAt),
        )[0];
        if (!veteran || !newest)
          throw new Error("No veteran or newcomer in the shape");
        expect(newest.joinedAt > oldest.createdAt).toBe(true);
        const [conversation] = await tx<{ id: string }[]>`
          select id from public.chat_conversations where business_id = ${s.scale.id} and kind = 'team'`;
        const oldestSeen = async (person: string) =>
          asPerson(tx, person, async (sp) => {
            const rows = await sp<{ id: string }[]>`
              select id from public.chat_page(
                ${s.scale.id}::uuid, ${conversation?.id ?? null}::uuid,
                ${oldest.createdAt}::timestamptz, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)`;
            return rows.map((r) => r.id);
          });
        expect(await oldestSeen(veteran.id)).toEqual([oldest.id]);
        expect(await oldestSeen(newest.id)).toEqual([]);

        // Those who left: their period ended on a past day.
        const [periods] = await tx<{ future: number; ended: number }[]>`
          select count(*) filter (where p.ended_on >= (now() at time zone 'Asia/Jerusalem')::date)::int as future,
            count(*) filter (where p.ended_on is not null)::int as ended
          from public.employment_periods p where p.business_id = ${s.scale.id}`;
        expect(periods).toEqual({ future: 0, ended: 6 });

        // The business's own names: the shape's, never the owner's.
        const names = await tx<{ user_id: string; name: string }[]>`
          select user_id::text, name from public.member_names
          where business_id = ${s.scale.id} order by user_id`;
        expect(names).toEqual(
          s.scale.people
            .filter((p) => p.businessName)
            .map((p) => ({ user_id: p.id, name: p.businessName }))
            .sort((a, b) => (a.user_id < b.user_id ? -1 : 1)),
        );
        expect(names.some((n) => n.user_id === s.scale.owner)).toBe(false);

        // The activity feed reads by id: what the app wrote at the anchor
        // (this week's publishing, the days away) after every row of the
        // history's log, so the feed shows it first.
        const [order] = await tx<{ after: boolean | null }[]>`
          select (select max(a.id) from public.audit_log a
              where a.business_id = ${s.scale.id}
                and a.action in ('clock.confirm', 'clock.correct'))
            < (select min(a.id) from public.audit_log a
              where a.business_id = ${s.scale.id}
                and a.action in ('schedule.publish', 'clock.absence_add')) as after`;
        expect(order?.after).toBe(true);

        // Only the lines the seed meant: no reminder, nothing for a phone.
        const kinds = await tx<{ kind: string }[]>`
          select distinct kind from public.notifications
          where business_id in (${s.scale.id}, ${s.neighbour.id}) order by kind`;
        expect(kinds.map((k) => k.kind)).toEqual([
          "clock.confirm",
          "schedule.published",
          "team.joined",
        ]);

        // The neighbour's owner, as themself, sees their own and none of the big business.
        const seen = await asPerson(tx, s.neighbour.owner, async (sp) => {
          const [row] = await sp<
            {
              entries: number;
              log: number;
              lines: number;
              members: number;
              own: number;
            }[]
          >`
            select
              (select count(*)::int from public.time_entries where business_id = ${s.scale.id}) as entries,
              (select count(*)::int from public.audit_log where business_id = ${s.scale.id}) as log,
              (select count(*)::int from public.notifications where business_id = ${s.scale.id}) as lines,
              (select count(*)::int from public.memberships where business_id = ${s.scale.id}) as members,
              (select count(*)::int from public.time_entries where business_id = ${s.neighbour.id}) as own`;
          return row;
        });
        expect(seen).toMatchObject({
          entries: 0,
          log: 0,
          lines: 0,
          members: 0,
        });
        expect(seen?.own).toBeGreaterThan(0);

        await neverSend(tx);
      },
    );
    if (report) printCounts("30 people, 2 months", report);
    time("30 people, 2 months: seeded, checked and removed", ms);
  }, 120_000);

  it("300 people: next week's 200 shifts pass the caps, and the writes tell exactly 299", async () => {
    let report: SeedReport | undefined;
    const ms = await withSeed(
      { people: 300, depth: "people" },
      async (tx, s, seeded) => {
        report = seeded;
        const next = s.scale.weeks.find((w) => w.kind === "next");
        if (!next) throw new Error("No next week");
        const scheduler = s.scale.scheduler;

        // The draft the database took: 200 shifts, the biggest with 50 on it.
        const [draft] = await tx<{ shifts: number; most: number }[]>`
        select count(distinct s.id)::int as shifts,
          coalesce(max(per.n), 0)::int as most
        from public.schedule_shifts s
        left join (
          select shift_id, count(*) as n from public.shift_assignments group by shift_id
        ) per on per.shift_id = s.id
        where s.week_id = ${next.id}`;
        expect(draft).toEqual({ shifts: 200, most: 50 });

        // 201 are refused.
        const many = Array.from({ length: 201 }, (_, i) => ({
          day: next.startsOn,
          name: `משמרת ${i + 1}`,
          start: "08:00",
          end: "09:00",
          needed: 1,
          pattern: null,
          assignees: [],
        }));
        const refused = await tried(
          tx,
          (sp) =>
            sp`select public.save_week_schedule(${scheduler}::uuid, ${next.id}::uuid, ${sp.json(many)}::jsonb)`,
        );
        expect(refused instanceof Error ? refused.message : "taken").toMatch(
          /Too many shifts/,
        );

        // 51 people on a shift that needs 50 are refused by the database too
        // (20261128000500_shift_cap.sql: 22023, hint 'full'), as the app
        // refuses them, the 50 above still taken.
        const staff = s.scale.people.filter(
          (p) => p.kind === "staff" && p.role === "worker",
        );
        const wednesday =
          next.shifts.find((x) => x.day > next.startsOn)?.day ?? next.startsOn;
        const crowded = await tried(
          tx,
          (sp) =>
            sp`select public.save_week_schedule(${scheduler}::uuid, ${next.id}::uuid, ${sp.json(
              [
                {
                  day: wednesday,
                  name: "משמרת צפופה",
                  start: "10:00",
                  end: "12:00",
                  needed: MAX_PEOPLE_ON_A_SHIFT,
                  pattern: null,
                  assignees: staff
                    .slice(0, MAX_PEOPLE_ON_A_SHIFT + 1)
                    .map((p) => ({ user: p.id, position: null })),
                },
              ],
            )}::jsonb)`,
        );
        note(
          `- 300: ${MAX_PEOPLE_ON_A_SHIFT + 1} people on a shift that needs ${MAX_PEOPLE_ON_A_SHIFT}: ${crowded instanceof Error ? `refused by the database (${crowded.message})` : "taken by the database"}`,
        );
        expect(crowded).toBeInstanceOf(Error);
        expect(crowded).toMatchObject({
          code: "22023",
          hint: "full",
          message: "More than 50 people on a shift",
        });

        // Publishing next week, the first time: a line to each of the 299 on
        // the staff but the one who published, none to the accountant, none
        // for a phone.
        const published = await tried(tx, async (sp) => {
          await sp`select public.publish_week_schedule(${scheduler}::uuid, ${next.id}::uuid, ${sp.json(
            next.shifts.map((x) => ({
              day: x.day,
              name: x.name,
              start: x.start,
              end: x.end,
              needed: x.needed,
              pattern: x.pattern,
              assignees: x.assignees,
            })),
          )}::jsonb)`;
          const [row] = await sp<
            {
              lines: number;
              accountant: number;
              pushing: number;
              unfilled: number;
            }[]
          >`
          select
            count(*) filter (where kind = 'schedule.published')::int as lines,
            count(*) filter (where kind = 'schedule.published'
              and user_id = ${s.viewers.accountant})::int as accountant,
            count(*) filter (where push_state <> 'none')::int as pushing,
            count(*) filter (where kind = 'schedule.unfilled')::int as unfilled
          from public.notifications where business_id = ${s.scale.id}`;
          return row;
        });
        if (published instanceof Error) throw published;
        expect(published).toMatchObject({
          lines: 299,
          accountant: 0,
          pushing: 0,
        });
        note(
          `- 300: publishing next week: ${published?.lines} lines, ${published?.unfilled} "unfilled" lines for its builders`,
        );

        // A message from a worker in the team group of 300.
        const worker = s.viewers.worker;
        const message = await tried(tx, async (sp) => {
          const [conversation] = await sp<{ id: string }[]>`
          select id from public.chat_conversations where business_id = ${s.scale.id} and kind = 'team'`;
          await sp`select public.send_chat_message(
          actor => ${worker}::uuid, business => ${s.scale.id}::uuid,
          draft => '5ca1e300-0011-4fff-8fff-000000000001'::uuid,
          words => 'בדיקה לכל הקבוצה', conversation => ${conversation?.id ?? null}::uuid)`;
          const [row] = await sp<{ lines: number; pushing: number }[]>`
          select count(*)::int as lines, count(*) filter (where push_state <> 'none')::int as pushing
          from public.notifications
          where business_id = ${s.scale.id} and kind = 'chat.group'`;
          return row;
        });
        if (message instanceof Error) throw message;
        expect(message).toEqual({ lines: 299, pushing: 0 });

        // A document to everyone: its file reserved, put in place as Storage
        // would, then sent to the 299 others on the staff.
        const owner = s.scale.owner;
        const everyone = s.scale.people
          .filter((p) => p.kind === "staff" && p.id !== owner)
          .map((p) => p.id);
        expect(everyone).toHaveLength(299);
        const document = await tried(tx, async (sp) => {
          const [place] = await sp<
            { place: { upload: string; path: string } }[]
          >`
          select public.reserve_document_upload(
            actor => ${owner}::uuid, business => ${s.scale.id}::uuid,
            upload_direction => 'to_people', upload_kind => 'pdf',
            upload_type => 'application/pdf', upload_size => 4043,
            upload_name => 'procedure.pdf') as place`;
          if (!place) throw new Error("No place for the file");
          await sp`insert into storage.objects (bucket_id, name, metadata)
          values ('documents', ${place.place.path},
            jsonb_build_object('size', 4043, 'mimetype', 'application/pdf'))`;
          await sp`select public.send_document(
          actor => ${owner}::uuid, business => ${s.scale.id}::uuid,
          send_direction => 'to_people', send_category => 'procedure',
          send_title => 'נוהל לכולם', send_to => ${sp.array(everyone)}::uuid[],
          asks => true, upload => ${place.place.upload}::uuid)`;
          const [row] = await sp<
            { recipients: number; lines: number; pushing: number }[]
          >`
          select
            (select count(*)::int from public.document_recipients where business_id = ${s.scale.id}) as recipients,
            (select count(*)::int from public.notifications
              where business_id = ${s.scale.id} and kind like 'documents.%') as lines,
            (select count(*)::int from public.notifications
              where business_id = ${s.scale.id} and push_state <> 'none') as pushing`;
          return row;
        });
        if (document instanceof Error) throw document;
        expect(document).toEqual({ recipients: 299, lines: 299, pushing: 0 });

        // An import of 300 at the plan's own numbers (050-000-6100 to 6399):
        // 300 invites, 400 waiting with the 100 seeded, nobody sent anything.
        const imported = await tried(tx, async (sp) => {
          await sp`select public.team_import_people(${owner}::uuid, ${s.scale.id}::uuid, ${sp.json(
            Array.from({ length: 300 }, (_, i) => ({
              name: `מיובא/ת בדיקה ${String(i + 1).padStart(3, "0")}`,
              phone: importNumber(i),
              role: "worker",
            })),
          )}::jsonb)`;
          const [row] = await sp<{ imported: number; waiting: number }[]>`
          select count(*) filter (where import_id is not null)::int as imported,
            count(*) filter (where claimed_at is null and expires_at > now())::int as waiting
          from public.invites where business_id = ${s.scale.id}`;
          await neverSend(sp);
          return row;
        });
        if (imported instanceof Error) throw imported;
        expect(imported).toEqual({ imported: 300, waiting: 400 });

        for (const person of s.scale.people) {
          if (person.phone) expect(person.phone).toMatch(FICTIONAL_NUMBER);
        }
        await neverSend(tx);
      },
    );
    if (report) printCounts("300 people, the team and next week", report);
    time("300 people: seeded, checked, written and removed", ms);
  }, 120_000);

  it("both sizes together stay inside the time the database job allows the file", () => {
    const { ms, verdict } = budgetOf(took);
    note(
      `- both sizes together: ${seconds(ms)} (${took.map((t) => seconds(t.ms)).join(" + ")}), against a target of ${seconds(BUDGET.targetMs)}`,
    );
    if (verdict === "warn") {
      console.warn(
        `::warning::The test business took ${seconds(ms)} with both sizes, past the ${seconds(BUDGET.warnMs)} the database job allows it`,
      );
    }
    expect(
      ms,
      `The test business took ${seconds(ms)} with both sizes, past ${seconds(BUDGET.failMs)}: the database job waits on it, and all six e2e shards on that`,
    ).toBeLessThanOrEqual(BUDGET.failMs);
  });
});
