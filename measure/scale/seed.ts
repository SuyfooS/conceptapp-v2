import { instantIn } from "@domain/availability";
import type postgres from "postgres";
import { removeScaleBusiness } from "./clean";
import { ZONE } from "./ids";
import { type PartName, runPart, type StepRows, type StepTime } from "./parts";
import {
  type BusinessShape,
  confirmLines,
  payrollViewDays,
  readLines,
  SHIFT_LEAD_ROLE,
  type Shape,
  type Shift,
  thisWeekLines,
  waits,
} from "./shape";

/**
 * Writes the shape (./shape.ts) into the database, part by part
 * (./sql/*.sql), inside the caller's transaction: the measuring run commits
 * it, the database job rolls it back. It cleans first, so it can run again
 * on the same database. After each part the counts read back must equal the
 * shape's, or it stops naming every one that differs.
 */

export type BusinessCounts = Record<string, number>;

export type SeedReport = {
  version: string;
  size: number;
  depth: string;
  months: number;
  anchor: string;
  counts: {
    scale: BusinessCounts;
    neighbour: BusinessCounts;
    people: BusinessCounts;
  };
  times: StepTime[];
  ms: number;
};

export type SeedOptions = {
  /** Run ANALYZE on the large tables at the end, so plans see real statistics. */
  analyze?: boolean;
};

const DAY = 86_400_000;
const iso = (time: number) => new Date(time).toISOString();

/** A shift as the app's week functions take it (private.sent_shifts). */
function sent(shift: Shift) {
  return {
    day: shift.day,
    name: shift.name,
    start: shift.start,
    end: shift.end,
    needed: shift.needed,
    pattern: shift.pattern,
    assignees: shift.assignees.map((a) => ({
      user: a.user,
      position: a.position,
    })),
  };
}

const both = (s: Shape) => [s.scale, s.neighbour] as const;
const each = <T>(s: Shape, rows: (b: BusinessShape) => T[]): T[] =>
  both(s).flatMap(rows);

/** The rows of every step, part by part. */
export function partData(
  s: Shape,
): Record<
  Exclude<PartName, "00-guard" | "99-counts">,
  Record<string, StepRows>
> {
  const people = [...each(s, (b) => b.people), s.admin];
  return {
    "10-people": {
      logins: people.map((p) => ({
        id: p.id,
        email: p.email,
        created_at: iso(Date.parse(p.joinedAt) - DAY),
      })),
      profiles: people.map((p) => ({
        id: p.id,
        name: p.name,
        address_form: p.addressForm,
        phone: p.phone,
      })),
      platform: [{ id: s.admin.id, created_at: s.admin.joinedAt }],
    },
    "20-business": {
      businesses: both(s).map((b) => ({
        id: b.id,
        slug: b.slug,
        name: b.name,
        created_at: b.createdAt,
      })),
      templates: both(s).map((b) => ({ id: b.id })),
      settings: each(s, (b) => [
        {
          business: b.id,
          module: "scheduling",
          settings: b.settings.scheduling,
        },
        {
          business: b.id,
          module: "time_clock",
          settings: b.settings.time_clock,
        },
      ]),
      departments: each(s, (b) =>
        b.departments.map((d) => ({
          id: d.id,
          business: b.id,
          key: d.key,
          name: d.name,
          position: d.position,
          created_at: b.createdAt,
        })),
      ),
      owners: each(s, (b) =>
        b.people
          .filter((p) => p.id === b.owner)
          .map((p) => ({ business: b.id, id: p.id, created_at: p.joinedAt })),
      ),
      named_role: each(s, (b) =>
        b.people.some((p) => p.lead)
          ? [{ business: b.id, owner: b.owner, name: SHIFT_LEAD_ROLE }]
          : [],
      ),
      role_edits_clock: each(s, (b) =>
        b.people.some((p) => p.lead)
          ? [{ business: b.id, owner: b.owner, name: SHIFT_LEAD_ROLE }]
          : [],
      ),
    },
    "30-team": {
      memberships: each(s, (b) =>
        b.people
          .filter((p) => p.id !== b.owner)
          .map((p) => ({
            business: b.id,
            id: p.id,
            role: p.role,
            lead: p.lead,
            lead_role: SHIFT_LEAD_ROLE,
            active: p.kind !== "left",
            left_at: p.leftAt,
            created_at: p.joinedAt,
          })),
      ),
      member_names: each(s, (b) =>
        b.people
          .filter((p) => p.businessName)
          .map((p) => ({
            business: b.id,
            id: p.id,
            name: p.businessName,
            stamp: p.joinedAt,
          })),
      ),
      department_members: each(s, (b) =>
        b.people
          .filter((p) => p.kind === "staff")
          .flatMap((p) =>
            [p.department, p.second]
              .filter((d): d is number => d !== null)
              .map((d) => ({
                department: b.departments[d]?.id,
                business: b.id,
                id: p.id,
                stamp: p.joinedAt,
              })),
          ),
      ),
      periods: each(s, (b) =>
        b.periods.map((p) => ({
          id: p.id,
          business: b.id,
          person: p.user,
          started_on: p.startedOn,
          ended_on: p.endedOn,
          stamp: b.people.find((x) => x.id === p.user)?.leftAt ?? null,
        })),
      ),
      wages: each(s, (b) =>
        b.wages.map((w) => ({
          id: w.id,
          business: b.id,
          person: w.user,
          agorot: w.hourlyAgorot,
          effective_from: w.effectiveFrom,
          set_by: b.owner,
          set_at: w.setAt,
        })),
      ),
      payroll_details: each(s, (b) =>
        b.payrollNumbers.map((n) => ({
          business: b.id,
          person: n.user,
          payroll_number: n.number,
          updated_by: b.owner,
        })),
      ),
      invites: each(s, (b) =>
        b.invites.map((i) => ({
          id: i.id,
          business: b.id,
          phone: i.phone,
          name: i.name,
          token_hash: i.tokenHash,
          invited_by: b.owner,
          created_at: i.createdAt,
          expires_at: i.expiresAt,
        })),
      ),
    },
    "50-hours": {
      entries: each(s, (b) =>
        b.entries.map((e) => ({
          id: e.id,
          business: b.id,
          person: e.user,
          clock_in: e.clockIn,
          clock_out: e.clockOut,
          in_proof: e.inProof,
          out_proof: e.outProof,
          confirmed_by: e.confirmedBy,
          confirmed_at: e.confirmedAt,
          edited_by: e.editedBy,
          edited_at: e.editedAt,
          note: e.note,
          cancelled_at: e.cancelledAt,
          cancelled_by: e.cancelledBy,
          cancel_reason: e.cancelReason,
        })),
      ),
      breaks: each(s, (b) =>
        b.breaks.map((x) => ({
          id: x.id,
          entry: x.entry,
          business: b.id,
          person: x.user,
          started_at: x.startedAt,
          ended_at: x.endedAt,
        })),
      ),
    },
    "60-chat": {
      directs: each(s, (b) =>
        b.chat.directs.map((c) => ({
          id: c.id,
          business: b.id,
          person_a: c.a,
          person_b: c.b,
          created_at: c.createdAt,
        })),
      ),
      messages: each(s, (b) =>
        b.chat.messages.map((m) => ({
          id: m.id,
          business: b.id,
          conversation: m.conversation,
          author: m.author,
          draft: m.draft,
          kind: m.kind,
          body: m.body,
          pinned: m.pinned,
          created_at: m.createdAt,
        })),
      ),
      acks: each(s, (b) =>
        b.chat.acks.map((a) => ({
          message: a.message,
          business: b.id,
          person: a.user,
          acked_at: a.ackedAt,
        })),
      ),
      reads: each(s, (b) =>
        b.chat.reads.map((r) => ({
          business: b.id,
          conversation: r.conversation,
          person: r.user,
          read_at: r.readAt,
        })),
      ),
    },
    "70-documents": {
      uploads: each(s, (b) =>
        b.documents.map((d) => ({
          id: d.upload,
          business: b.id,
          author: d.author,
          path: d.path,
          file_size: d.fileSize,
          file_name: d.fileName,
          sent_at: d.sentAt,
        })),
      ),
      objects: each(s, (b) =>
        b.documents.map((d) => ({
          path: d.path,
          file_size: d.fileSize,
          sent_at: d.sentAt,
        })),
      ),
      documents: each(s, (b) =>
        b.documents.map((d) => ({
          id: d.id,
          business: b.id,
          author: d.author,
          category: d.category,
          title: d.title,
          path: d.path,
          file_name: d.fileName,
          file_size: d.fileSize,
          asks: d.asks,
          sent_at: d.sentAt,
        })),
      ),
      recipients: each(s, (b) =>
        b.documents.flatMap((d) =>
          d.recipients.map((r) => ({
            document: d.id,
            business: b.id,
            person: r.user,
            opened_at: r.openedAt,
            confirmed_at: r.confirmedAt,
          })),
        ),
      ),
    },
    "80-lines": {
      joined: each(s, (b) =>
        b.joined.map((j) => ({
          business: b.id,
          person: j.person,
          recipients: j.recipients,
          joined_at: j.at,
        })),
      ),
      published: each(s, (b) =>
        b.published.map((p) => ({
          business: b.id,
          person: p.user,
          week: p.week,
          starts_on: p.startsOn,
          mine: p.mine,
          actor: b.scheduler,
          published_at: p.at,
        })),
      ),
      read: both(s).map((b) => b.id),
    },
    "90-log": {
      history: {
        businesses: both(s).map((b) => b.id),
        corrections: each(s, (b) =>
          b.entries
            .filter((e) => e.fromIn !== null)
            .map((e) => ({
              entry: e.id,
              from_in: e.fromIn,
              from_out: e.fromOut,
            })),
        ),
        views: each(s, (b) =>
          b.payrollViews.holders.map((holder) => ({
            business: b.id,
            holder,
            first_day: b.payrollViews.from,
            last_day: b.payrollViews.to,
          })),
        ),
      },
    },
    "92-weeks": {
      weeks: each(s, (b) =>
        b.weeks.map((w) => ({
          id: w.id,
          business: b.id,
          starts_on: w.startsOn,
          due_at: w.dueAt,
          published_at: w.publishedAt,
        })),
      ),
      opened: each(s, (b) =>
        b.weeks
          .filter((w) => w.via !== "direct")
          .map((w) => ({
            id: w.id,
            business: b.id,
            starts_on: w.startsOn,
            due_at: w.dueAt,
          })),
      ),
      history_shifts: each(s, (b) =>
        b.weeks
          .filter((w) => w.via === "direct")
          .flatMap((w) =>
            w.shifts.map((x) => ({
              id: x.id,
              business: b.id,
              week: w.id,
              day: x.day,
              pattern: x.pattern,
              name: x.name,
              starts_at: x.start,
              ends_at: x.end,
              needed: x.needed,
              published_at: w.publishedAt,
            })),
          ),
      ),
      history_assignments: each(s, (b) =>
        b.weeks
          .filter((w) => w.via === "direct")
          .flatMap((w) =>
            w.shifts.flatMap((x) =>
              x.assignees.map((a) => ({
                shift: x.id,
                business: b.id,
                person: a.user,
                position_key: a.position,
              })),
            ),
          ),
      ),
      published: each(s, (b) =>
        b.weeks
          .filter((w) => w.via === "publish")
          .map((w) => ({
            actor: b.scheduler,
            week: w.id,
            shifts: w.shifts.map(sent),
          })),
      ),
      draft: each(s, (b) =>
        b.weeks
          .filter((w) => w.via === "draft")
          .map((w) => ({
            actor: b.scheduler,
            week: w.id,
            shifts: w.shifts.map(sent),
          })),
      ),
      availability: each(s, (b) =>
        b.availability.map((a) => ({
          id: a.id,
          business: b.id,
          week: a.week,
          person: a.user,
          submitted_at: a.submittedAt,
        })),
      ),
      ranges: each(s, (b) =>
        b.availability.flatMap((a) =>
          a.ranges.map((r) => ({
            id: r.id,
            submission: a.id,
            day: r.day,
            starts_at: r.start,
            ends_at: r.end,
          })),
        ),
      ),
      swaps: each(s, (b) =>
        b.swaps.map((w) => ({
          id: w.id,
          business: b.id,
          shift: w.shift,
          week_start: w.weekStart,
          day: w.day,
          pattern: w.pattern,
          requested_by: w.requestedBy,
          status: w.status,
          taken_by: w.takenBy,
          decided_by: w.decidedBy,
          decided_at: w.decidedAt,
          cancelled_because: w.cancelledBecause,
          created_at: w.createdAt,
        })),
      ),
    },
    "93-absences": {
      absences: each(s, (b) =>
        b.absences.map((a) => ({
          actor: b.owner,
          business: b.id,
          person: a.user,
          kind: a.kind,
          first_day: a.from,
          last_day: a.to,
        })),
      ),
    },
    "95-waiting": {
      waiting: both(s).map((b) => b.id),
    },
  };
}

/** What each business holds after each part, as the shape says. */
export function expectations(
  s: Shape,
): Record<string, { scale: BusinessCounts; neighbour: BusinessCounts }> {
  const of =
    (part: string) =>
    (b: BusinessShape): BusinessCounts => {
      const staff = b.people.filter((p) => p.kind === "staff");
      const left = b.people.filter((p) => p.kind === "left");
      const shifts = b.weeks.flatMap((w) => w.shifts);
      const thisWeek = thisWeekLines(b, s.anchor);
      const joined = b.joined.reduce((sum, j) => sum + j.recipients.length, 0);
      const published = b.published.length;
      const waiting = b.entries.filter(waits);
      const confirm = confirmLines(b);
      const notWaiting = b.entries.filter((e) => !waits(e));
      // Until 80-lines writes the bell, no part tells anyone, so a stray
      // line fails in the part that wrote it.
      const quiet = { lines: 0, lines_pushing: 0 };
      // The log as a whole, so a row of an action the shape doesn't plan
      // fails in its part: the named role's two (role.create and
      // role.permission, 20-business), then the history's (90-log), the
      // publishing (92-weeks), the days away (93-absences) and the waiting
      // entries' arrivals and departures (95-waiting).
      const roleLog = b.people.some((p) => p.lead) ? 2 : 0;
      const history = {
        log_clock_in: notWaiting.length,
        log_clock_out: notWaiting.filter(
          (e) => e.clockOut !== null && e.kind !== "missed",
        ).length,
        log_clock_confirm: b.entries.filter((e) => e.confirmedAt !== null)
          .length,
        log_clock_correct: b.entries.filter((e) => e.fromIn !== null).length,
        log_break_start: b.breaks.length,
        log_break_end: b.breaks.length,
        log_payroll_view:
          b.payrollViews.holders.length *
          payrollViewDays(b.payrollViews.from, b.payrollViews.to),
      };
      const historyLog =
        roleLog + Object.values(history).reduce((sum, n) => sum + n, 0);
      const publishes = b.weeks.filter((w) => w.via === "publish").length;
      const weeksLog = historyLog + publishes;
      const absencesLog = weeksLog + b.absences.length;
      const waitingLog =
        absencesLog +
        waiting.length +
        waiting.filter(
          (e) =>
            e.clockOut !== null &&
            (e.outProof === "none" || e.outProof === "self"),
        ).length;
      const counts: Record<string, Record<string, number>> = {
        "20-business": {
          departments: b.departments.length,
          named_roles: b.people.some((p) => p.lead) ? 1 : 0,
          conversations: 1 + b.departments.length,
          log: roleLog,
          ...quiet,
        },
        "30-team": {
          memberships: b.people.length,
          memberships_active: b.people.length - left.length,
          member_names: b.people.filter((p) => p.businessName).length,
          department_members: staff.reduce(
            (sum, p) =>
              sum +
              (p.department === null ? 0 : 1) +
              (p.second === null ? 0 : 1),
            0,
          ),
          periods: staff.length + left.length,
          periods_ended: left.length,
          periods_on_joining: staff.length + left.length,
          wages: b.wages.length,
          payroll_details: b.payrollNumbers.length,
          invites: b.invites.length,
          invites_waiting: b.invites.filter(
            (i) => Date.parse(i.expiresAt) > Date.parse(s.anchor),
          ).length,
          log: roleLog,
          ...quiet,
        },
        "50-hours": {
          entries: b.entries.length,
          entries_open: b.entries.filter((e) => e.clockOut === null).length,
          entries_waiting_none: waiting.filter((e) => e.inProof === "none")
            .length,
          entries_waiting_self: waiting.filter((e) => e.inProof === "self")
            .length,
          breaks: b.breaks.length,
          log: roleLog,
          ...quiet,
        },
        "60-chat": {
          conversations: 1 + b.departments.length + b.chat.directs.length,
          messages: b.chat.messages.length,
          acks: b.chat.acks.length,
          reads: b.chat.reads.length,
          log: roleLog,
          ...quiet,
        },
        "70-documents": {
          documents: b.documents.length,
          recipients: b.documents.reduce(
            (sum, d) => sum + d.recipients.length,
            0,
          ),
          uploads: b.documents.length,
          objects: b.documents.length,
          log: roleLog,
          ...quiet,
        },
        "80-lines": {
          lines_joined: joined,
          lines_published: published,
          lines_read: readLines(b, s.weekStart),
          lines_pushing: 0,
          lines: published + joined,
          log: roleLog,
        },
        "90-log": {
          ...history,
          log: historyLog,
          // The history's log told nobody.
          lines: published + joined,
          lines_read: readLines(b, s.weekStart),
        },
        "92-weeks": {
          weeks: b.weeks.length,
          shifts: shifts.length,
          assignments: shifts.reduce((sum, x) => sum + x.assignees.length, 0),
          submissions: b.availability.length,
          ranges: b.availability.reduce((sum, a) => sum + a.ranges.length, 0),
          swaps: b.swaps.length,
          swaps_open: b.swaps.filter((w) => w.status === "open").length,
          log_schedule_publish: publishes,
          log: weeksLog,
          lines_published: thisWeek + published,
          lines: thisWeek + published + joined,
        },
        "93-absences": {
          absences: b.absences.length,
          log_absence_add: b.absences.length,
          log: absencesLog,
        },
        "95-waiting": {
          log: waitingLog,
          lines_confirm: confirm,
          lines: thisWeek + published + joined + confirm,
          lines_pushing: 0,
        },
      };
      return counts[part] ?? {};
    };
  const parts = [
    "20-business",
    "30-team",
    "50-hours",
    "60-chat",
    "70-documents",
    "80-lines",
    "90-log",
    "92-weeks",
    "93-absences",
    "95-waiting",
  ];
  return Object.fromEntries(
    parts.map((part) => [
      part,
      { scale: of(part)(s.scale), neighbour: of(part)(s.neighbour) },
    ]),
  );
}

/** The seed's people as a whole, after its people are in. */
export function peopleExpected(s: Shape): BusinessCounts {
  const users = s.scale.people.length + s.neighbour.people.length + 1;
  return {
    users,
    users_with_phone: 0,
    users_elsewhere: 0,
    profiles: users,
    platform_staff: 1,
    push_subscriptions: 0,
    demo_businesses: 0,
  };
}

export async function countsOf(
  tx: postgres.TransactionSql,
  s: Shape,
): Promise<SeedReport["counts"]> {
  const read = async (business: string) => {
    const result = await runPart(tx, "99-counts", { business: [{ business }] });
    return (result.business?.[0]?.counts ?? {}) as BusinessCounts;
  };
  const people = await runPart(tx, "99-counts", { business: null });
  return {
    scale: await read(s.scale.id),
    neighbour: await read(s.neighbour.id),
    people: (people.people?.[0]?.counts ?? {}) as BusinessCounts,
  };
}

/** Every count that differs from what was expected, as words. */
export function differences(
  label: string,
  expected: BusinessCounts,
  actual: BusinessCounts,
): string[] {
  return Object.entries(expected)
    .filter(([key, value]) => Number(actual[key]) !== value)
    .map(
      ([key, value]) =>
        `${label} ${key}: the database holds ${actual[key] ?? "nothing"}, the shape says ${value}`,
    );
}

export async function seedScaleBusiness(
  tx: postgres.TransactionSql,
  s: Shape,
  options: SeedOptions = {},
): Promise<SeedReport> {
  const started = performance.now();
  const times: StepTime[] = [];
  await tx`select set_config('scale.version', ${s.version}, true),
    set_config('scale.anchor', ${s.anchor}, true),
    set_config('scale.week_start', ${weekStartInstant(s)}, true)`;
  await runPart(tx, "00-guard", {}, times);
  await removeScaleBusiness(tx);

  const data = partData(s);
  const expected = expectations(s);
  for (const [part, rows] of Object.entries(data) as [
    keyof typeof data,
    Record<string, StepRows>,
  ][]) {
    await runPart(tx, part, rows, times);
    const counts = await countsOf(tx, s);
    const wanted = expected[part];
    const wrong = [
      ...(part === "10-people"
        ? differences("people", peopleExpected(s), counts.people)
        : []),
      ...(wanted ? differences("scale", wanted.scale, counts.scale) : []),
      ...(wanted
        ? differences("neighbour", wanted.neighbour, counts.neighbour)
        : []),
    ];
    if (wrong.length > 0) {
      throw new Error(
        `The scale seed's counts after ${part} differ from its shape:\n  ${wrong.join("\n  ")}`,
      );
    }
  }

  if (options.analyze) {
    await tx.unsafe(
      `analyze public.time_entries, public.time_breaks, public.audit_log, public.notifications,
        public.shift_assignments, public.schedule_shifts, public.chat_messages, public.chat_reads,
        public.documents, public.document_recipients, public.memberships`,
    );
  }
  await runPart(tx, "00-guard", {}, times);
  const counts = await countsOf(tx, s);
  const wrong = differences("people", peopleExpected(s), counts.people);
  if (wrong.length > 0)
    throw new Error(`The scale seed's people differ:\n  ${wrong.join("\n  ")}`);
  return {
    version: s.version,
    size: s.size,
    depth: s.depth,
    months: s.months,
    anchor: s.anchor,
    counts,
    times,
    ms: Math.round(performance.now() - started),
  };
}

/** This week's first midnight, by the business's clock: the line between the bell's history and this week. */
function weekStartInstant(s: Shape): string {
  return instantIn(s.weekStart, "00:00", ZONE).toISOString();
}
