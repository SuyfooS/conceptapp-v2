import type { Role, Viewer } from "@domain/modules";
import {
  againstTeam,
  type ImportOutcome,
  type ImportPerson,
  type KnownInvite,
  knownTeamOf,
  type ParsedPeople,
} from "@domain/people-import";
import { canResendInvite, type GivableNamedRole } from "@domain/team";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Inviting from a list (20261128000300_people_import.sql) where pgTAP, in
 * one session, can't look. First, the screen's reading of a paste against
 * the team (`againstTeam` in @domain/people-import, with the team as each
 * door reads it) and the database's answer for the same rows agree, for an
 * owner, a manager and the console, in every state a number can be in: "the
 * database decides the same again" holds only if both are asked. That runs
 * in one transaction it rolls back, each import in a savepoint of its own.
 * Then two sessions at once: a single invite made while an import runs, two
 * imports into one business, and an undo while a link is being made. Those
 * sessions must see the business, so it is committed: made before the tests
 * and taken away after them. Ids and numbers of its own (d73…, 050-000-73xx),
 * apart from every other test's. Needs the local database (`pnpm db:start`);
 * run with `pnpm test:db`.
 */

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const sql = postgres(url, { max: 1, onnotice: () => {} });
const first = postgres(url, { max: 1, onnotice: () => {} });
const second = postgres(url, { max: 1, onnotice: () => {} });

class Rollback extends Error {}
class Tried extends Error {}

type Tx = postgres.TransactionSql;
type Answer = { import: string | null; rows: { i: number; status: string }[] };

/** One person as the import sends them, as the database takes them. */
const asRow = (person: ImportPerson) => ({
  name: person.name,
  phone: person.phone,
  role: person.role,
  ...(person.namedRole ? { named_role: person.namedRole } : {}),
  role_from_line: person.roleFromLine,
});

const person = (
  phone: string,
  name: string,
  role: "manager" | "worker" = "worker",
  roleFromLine = false,
): ImportPerson => ({ name, phone, role, namedRole: null, roleFromLine });

/** A paste of these people, each on a line of its own, as the reader gives it. */
function parsedOf(people: readonly ImportPerson[]): ParsedPeople {
  return {
    lines: people.map((one, at) => ({
      line: at + 1,
      text: one.name,
      dropped: [],
      kind: "person" as const,
      person: one,
      roleLabel: one.role,
      notes: [],
    })),
    header: false,
    ignored: [],
    people: people.length,
    error: null,
  };
}

/** What the database answers for each outcome the screen shows. */
const STATUS: Record<ImportOutcome, string> = {
  new: "created",
  update: "updated",
  updateName: "updated",
  updateRole: "updated",
  same: "same",
  member: "member",
  invited: "invited",
  locked: "invited",
  expired: "expired",
  otherRole: "kept",
};

// ---------------------------------------------------------------------------
// The screen and the database, state by state

const P_BUSINESS = "d7300000-0000-4000-b000-000000000002";
const P = {
  owner: "d7300000-0000-4000-a000-000000000011",
  manager: "d7300000-0000-4000-a000-000000000012",
  console: "d7300000-0000-4000-a000-000000000013",
  worker: "d7300000-0000-4000-a000-000000000014",
  former: "d7300000-0000-4000-a000-000000000015",
};
const n = (last: number) => `+9725000073${String(last).padStart(2, "0")}`;

/** The paste: one line for each state a number can be in. */
const PASTE: ImportPerson[] = [
  person(n(54), "Worker Member"), //  1 a member
  person(n(55), "Former"), //  2 left the team
  person(n(61), "Same"), //  3 no link yet, as it is
  person(n(62), "New"), //  4 another name
  person(n(63), "Role", "manager", true), //  5 another role, named on the line
  person(n(64), "Both New", "manager", true), //  6 both
  person(n(65), "Mgr"), //  7 a manager's, the list's role
  person(n(66), "Barman"), //  8 a named role holding what a manager doesn't
  person(n(67), "Owner Two"), //  9 an owner's invite
  person(n(68), "Books"), // 10 an accountant's
  person(n(69), "Linked"), // 11 its link sent
  person(n(70), "Lapsed"), // 12 its link run out
  person(n(71), "Cancelled"), // 13 deleted before
  person(n(72), "Fresh"), // 14 nothing
  person(n(73), "Archived"), // 15 its named role archived since
  person(n(74), "Mgr Two Renamed"), // 16 a manager's, another name
];

async function parityTeam(tx: Tx) {
  await tx`
    insert into auth.users (id, aud, role, phone)
    values
      (${P.owner}, 'authenticated', 'authenticated', '972500007351'),
      (${P.manager}, 'authenticated', 'authenticated', '972500007352'),
      (${P.console}, 'authenticated', 'authenticated', '972500007353'),
      (${P.worker}, 'authenticated', 'authenticated', '972500007354'),
      (${P.former}, 'authenticated', 'authenticated', '972500007355')`;
  await tx`
    insert into public.businesses (id, slug, name)
    values (${P_BUSINESS}, 'pim-parity', 'Import parity')`;
  await tx`
    insert into public.memberships (business_id, user_id, role, active, left_at)
    values
      (${P_BUSINESS}, ${P.owner}, 'owner', true, null),
      (${P_BUSINESS}, ${P.manager}, 'manager', true, null),
      (${P_BUSINESS}, ${P.worker}, 'worker', true, null),
      (${P_BUSINESS}, ${P.former}, 'worker', false, now())`;
  await tx`
    insert into public.platform_staff (user_id, role)
    values (${P.console}, 'onboarder')`;
  // A bar lead holding the lists, which the business's managers don't; one
  // to archive.
  const [bar] = await tx<{ id: string }[]>`
    select public.create_business_role(${P.owner}::uuid, ${P_BUSINESS}::uuid,
      'worker', 'Bar lead') as id`;
  const [old] = await tx<{ id: string }[]>`
    select public.create_business_role(${P.owner}::uuid, ${P_BUSINESS}::uuid,
      'worker', 'Old role') as id`;
  await tx`
    select public.set_role_permission(${P.owner}::uuid, ${P_BUSINESS}::uuid,
      'worker', 'lists.manage', true, ${bar?.id ?? null}::uuid)`;
  await tx`
    select public.set_role_permission(${P.owner}::uuid, ${P_BUSINESS}::uuid,
      'manager', 'lists.manage', false)`;
  const invite = (
    phone: string,
    name: string,
    role: Role,
    extra: {
      named?: string | null;
      pending?: boolean;
      expires?: string;
      cancelled?: boolean;
    } = {},
  ) => tx`
    insert into public.invites (
      business_id, phone, role, named_role, full_name, token_hash, invited_by,
      link_pending, expires_at, claimed_at, cancelled_at
    )
    values (
      ${P_BUSINESS}, ${phone}, ${role}::public.member_role, ${extra.named ?? null}::uuid,
      ${name}, md5(${`parity ${phone}`}) || md5(${`parity b ${phone}`}),
      ${P.owner}, ${extra.pending ?? true},
      now() + ${extra.expires ?? "10 days"}::interval,
      ${extra.cancelled ? new Date().toISOString() : null}::timestamptz,
      ${extra.cancelled ? new Date().toISOString() : null}::timestamptz
    )`;
  await invite(n(61), "Same", "worker");
  await invite(n(62), "Old", "worker");
  await invite(n(63), "Role", "worker");
  await invite(n(64), "Both Old", "worker");
  await invite(n(65), "Mgr", "manager");
  await invite(n(66), "Barman", "worker", { named: bar?.id });
  await invite(n(67), "Owner Two", "owner");
  await invite(n(68), "Books", "accountant");
  await invite(n(69), "Linked", "worker", { pending: false });
  await invite(n(70), "Lapsed", "worker", {
    pending: false,
    expires: "-1 day",
  });
  await invite(n(71), "Cancelled", "worker", {
    pending: false,
    cancelled: true,
  });
  await invite(n(73), "Archived", "worker", {
    named: old?.id,
    pending: false,
    expires: "-1 day",
  });
  await invite(n(74), "Mgr Two", "manager");
  // The archive waits for an invite with no link whatever its date, so none
  // is left to an archived role by the app: this one's link ran out first,
  // and it is then marked as never linked, by hand.
  await tx`select public.archive_business_role(${P.owner}::uuid, ${old?.id ?? null}::uuid)`;
  await tx`
    update public.invites set link_pending = true
    where business_id = ${P_BUSINESS} and phone = ${n(73)} and claimed_at is null`;
}

/** What the person holds in the business, as the database answers it. */
async function viewerOf(tx: Tx, userId: string, role: Role): Promise<Viewer> {
  const [row] = await tx<{ perms: string[] }[]>`
    select coalesce(array_agg(k.key order by k.key), '{}') as perms
    from public.permission_keys k
    where private.holds_perm(${P_BUSINESS}, ${userId}, k.key)`;
  return { role, perms: row?.perms ?? [] };
}

/** The business's live named roles, each with what it holds, as the server reads them. */
async function givableNamed(tx: Tx): Promise<GivableNamedRole[]> {
  const rows = await tx<
    {
      id: string;
      name: string;
      name_en: string | null;
      base: "manager" | "worker";
      holds: string[];
    }[]
  >`
    select br.id, br.name, br.name_en, br.base::text as base,
      coalesce(array(
        select k.key from public.permission_keys k
        where k.settable and private.role_holds(${P_BUSINESS}, br.base, k.key, br.id)
        order by k.key
      ), '{}') as holds
    from public.business_roles br
    where br.business_id = ${P_BUSINESS} and br.archived_at is null`;
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    nameEn: row.name_en,
    base: row.base,
    holds: row.holds,
  }));
}

/** The team as a door reads it, with whom `touchable` says the giver may update. */
async function knownBy(
  tx: Tx,
  touchable: (invite: { role: Role; namedRole: string | null }) => boolean,
) {
  const members = await tx<{ phone: string | null; name: string | null }[]>`
    select p.phone, p.full_name as name
    from public.memberships m
    join public.profiles p on p.id = m.user_id
    where m.business_id = ${P_BUSINESS} and m.active`;
  const invites = await tx<
    {
      id: string;
      phone: string;
      full_name: string | null;
      role: Role;
      named_role: string | null;
      link_pending: boolean;
      expired: boolean;
    }[]
  >`
    select i.id, i.phone, i.full_name, i.role::text as role, i.named_role,
      i.link_pending, i.expires_at <= now() as expired
    from public.invites i
    where i.business_id = ${P_BUSINESS} and i.claimed_at is null`;
  return knownTeamOf(
    members,
    invites.map(
      (row): KnownInvite => ({
        id: row.id,
        phone: row.phone,
        name: row.full_name,
        role: row.role,
        namedRole: row.named_role,
        linkPending: row.link_pending,
        expired: row.expired,
        touchable: touchable({ role: row.role, namedRole: row.named_role }),
      }),
    ),
  );
}

/** The database's status for each row, or the refusal's code; undone after. */
async function answered(
  tx: Tx,
  door: "team" | "console",
  actor: string,
  people: readonly ImportPerson[],
): Promise<string[] | string> {
  let statuses: string[] = [];
  try {
    await tx.savepoint(async (sp) => {
      const rows = sp.json(people.map(asRow));
      const [row] =
        door === "team"
          ? await sp<{ answer: Answer }[]>`
              select public.team_import_people(${actor}::uuid, ${P_BUSINESS}::uuid,
                ${rows}::jsonb) as answer`
          : await sp<{ answer: Answer }[]>`
              select public.admin_import_people(${actor}::uuid, ${P_BUSINESS}::uuid,
                ${rows}::jsonb) as answer`;
      statuses = (row?.answer.rows ?? []).map((one) => one.status);
      throw new Tried();
    });
  } catch (error) {
    if (error instanceof Tried) return statuses;
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : String(error);
  }
  return statuses;
}

async function withParityTeam(check: (tx: Tx) => Promise<void>) {
  await sql
    .begin(async (tx) => {
      await parityTeam(tx);
      await check(tx);
      throw new Rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) throw error;
    });
}

const isStaffRole = (role: Role) => role === "manager" || role === "worker";

describe("a list against the team, on the screen as in the database", () => {
  it("leaves out, keeps, updates and makes the same invites for an owner, a manager and the console", async () => {
    await withParityTeam(async (tx) => {
      const named = await givableNamed(tx);
      const [pay] = await tx<{ roles: Role[] }[]>`
        select coalesce(array_agg(r::text), '{}') as roles
        from unnest(array['manager', 'worker']::public.member_role[]) as r
        where private.role_holds_pay(${P_BUSINESS}, r)`;
      const payRoles = pay?.roles ?? [];
      const teamDoor = (viewer: Viewer) => {
        // ownerOnlyRoles: none for an owner, the roles that see pay for anyone else.
        const ownerOnly = viewer.role === "owner" ? [] : payRoles;
        return (invite: { role: Role; namedRole: string | null }) =>
          isStaffRole(invite.role) &&
          canResendInvite(viewer, invite, named) &&
          !ownerOnly.includes(invite.role);
      };
      const live = new Set(named.map((role) => role.id));
      const consoleDoor = (invite: { role: Role; namedRole: string | null }) =>
        isStaffRole(invite.role) &&
        (invite.namedRole === null || live.has(invite.namedRole));

      const doors = [
        {
          who: "owner",
          door: "team" as const,
          actor: P.owner,
          touchable: teamDoor(await viewerOf(tx, P.owner, "owner")),
        },
        {
          who: "manager",
          door: "team" as const,
          actor: P.manager,
          touchable: teamDoor(await viewerOf(tx, P.manager, "manager")),
        },
        {
          who: "console",
          door: "console" as const,
          actor: P.console,
          touchable: consoleDoor,
        },
      ];
      const shown: Record<string, (ImportOutcome | undefined)[]> = {};
      for (const { who, door, actor, touchable } of doors) {
        const checked = againstTeam(
          parsedOf(PASTE),
          await knownBy(tx, touchable),
        );
        const outcomes = checked.lines.map((line) => line.outcome);
        shown[who] = outcomes;
        expect(
          await answered(tx, door, actor, PASTE),
          `${who}: the database's statuses`,
        ).toEqual(outcomes.map((outcome) => (outcome ? STATUS[outcome] : "")));
      }

      // Every state of the plan's table is met, by whom it should be.
      const everyone: ImportOutcome[] = [
        "member",
        "new",
        "same",
        "updateName",
        "updateRole",
        "update",
        "same",
        "same",
        "otherRole",
        "otherRole",
        "invited",
        "expired",
        "new",
        "new",
        "locked",
        "updateName",
      ];
      expect(shown.owner).toEqual(everyone);
      expect(shown.console).toEqual(everyone);
      expect(shown.manager).toEqual(
        everyone.map((outcome, at) => (at === 7 ? "locked" : outcome)),
      );
    });
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Two sessions at once

const RACE = "d7300000-0000-4000-b000-000000000001";
const OWNER = "d7300000-0000-4000-a000-000000000001";
const MANAGER = "d7300000-0000-4000-a000-000000000002";
const RACE_PEOPLE = [
  [OWNER, "972500007301", "owner"],
  [MANAGER, "972500007302", "manager"],
] as const;

const pids = { first: 0, second: 0 };

async function pidOf(on: postgres.Sql): Promise<number> {
  const [row] = await on<{ pid: number }[]>`select pg_backend_pid() as pid`;
  return row?.pid ?? 0;
}

/** The business and its people gone, with everything of theirs. */
async function takeAway() {
  await sql.begin(async (tx) => {
    const found = await tx`select 1 from public.businesses where id = ${RACE}`;
    if (found.length > 0) {
      await tx`select private.purge_business_records(${RACE}::uuid)`;
      await tx`delete from public.businesses where id = ${RACE}`;
    }
    await tx`delete from auth.users where id in ${tx([OWNER, MANAGER])}`;
  });
}

async function make() {
  await sql.begin(async (tx) => {
    for (const [id, phone] of RACE_PEOPLE) {
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
      values (${RACE}, 'pim-race', 'Import race')`;
    for (const [id, , role] of RACE_PEOPLE) {
      await tx`
        insert into public.memberships (business_id, user_id, role)
        values (${RACE}, ${id}, ${role}::public.member_role)`;
    }
  });
}

/**
 * `start` run in a transaction of `on`'s, which then stays open until the
 * returned function is called: it commits, and resolves once it has.
 */
async function begun<T>(
  on: postgres.Sql,
  start: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<{ result: T; commit: () => Promise<void> }> {
  let release = () => {};
  const open = new Promise<void>((resolve) => {
    release = resolve;
  });
  let ran: (value: T) => void = () => {};
  let failed: (error: unknown) => void = () => {};
  const started = new Promise<T>((resolve, reject) => {
    ran = resolve;
    failed = reject;
  });
  const committed = on.begin(async (tx) => {
    ran(await start(tx));
    await open;
  });
  committed.catch(failed);
  const result = await started;
  return {
    result,
    commit: async () => {
      release();
      await committed;
    },
  };
}

/** A promise kept from rejecting unseen while the test waits on something else. */
function underWay<T>(running: Promise<T>): Promise<T> {
  running.catch(() => {});
  return running;
}

/** Resolves once `waiter`'s session waits on a lock `holding`'s holds. */
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

const raceNumber = (last: number) => `+9725000073${last}`;

/** An import by `actor` into the race's business, in `tx`: its answer. */
async function importIn(
  tx: postgres.TransactionSql,
  actor: string,
  people: readonly ImportPerson[],
): Promise<Answer> {
  const [row] = await tx<{ answer: Answer }[]>`
    select public.team_import_people(${actor}::uuid, ${RACE}::uuid,
      ${tx.json(people.map(asRow))}::jsonb) as answer`;
  if (!row) throw new Error("No answer");
  return row.answer;
}

const statusesOf = (answer: Answer) => answer.rows.map((row) => row.status);

/** The race's open invites to these numbers: each one's number and name, by number. */
async function openTo(phones: readonly string[]) {
  return sql<{ phone: string; full_name: string; link_pending: boolean }[]>`
    select i.phone, i.full_name, i.link_pending
    from public.invites i
    where i.business_id = ${RACE} and i.claimed_at is null
      and i.phone in ${sql(phones)}
    order by i.phone`;
}

beforeAll(async () => {
  await takeAway();
  await make();
  pids.first = await pidOf(first);
  pids.second = await pidOf(second);
});

afterAll(async () => {
  try {
    await takeAway();
  } finally {
    await Promise.all([sql, first, second].map((on) => on.end()));
  }
});

describe("an import beside another write at the same moment", () => {
  it("waits for a single invite made meanwhile to the same number, then leaves it as it was sent", async () => {
    const x = raceNumber(10);
    const y = raceNumber(11);
    // The owner's invite to x, with its link, not committed yet: the import
    // doesn't see it when it looks, and its new row waits on the number.
    const single = await begun(
      first,
      (tx) => tx`
        select public.team_invite(${OWNER}::uuid, ${RACE}::uuid, ${x},
          'Single Invite', 'worker'::public.member_role,
          md5('race single') || md5('race single b'))`,
    );
    let imported: Promise<Answer> | null = null;
    try {
      imported = underWay(
        second.begin((tx) =>
          importIn(tx, MANAGER, [
            person(y, "Listed First"),
            person(x, "Listed Too"),
          ]),
        ),
      );
      await waitsOn(pids.second, pids.first);
    } finally {
      await single.commit();
    }
    if (!imported) throw new Error("The import never ran");
    const answer = await imported;
    expect(statusesOf(answer)).toEqual(["created", "invited"]);
    expect(answer.rows[1]).toMatchObject({ i: 2, invite: null });
    // One open invite each: x the single one, with its link and its name.
    expect(await openTo([x, y])).toEqual([
      { phone: x, full_name: "Single Invite", link_pending: false },
      { phone: y, full_name: "Listed First", link_pending: true },
    ]);
  }, 30_000);

  it("takes two imports into one business in turn: the second finds the first's invites", async () => {
    const shared = [
      person(raceNumber(20), "Both Lists A"),
      person(raceNumber(21), "Both Lists B"),
    ];
    const owners = await begun(first, (tx) => importIn(tx, OWNER, shared));
    let managers: Promise<Answer> | null = null;
    try {
      managers = underWay(
        second.begin((tx) =>
          importIn(tx, MANAGER, [
            ...shared,
            person(raceNumber(22), "Second List Only"),
          ]),
        ),
      );
      // On the business's row, which the first holds until it commits.
      await waitsOn(pids.second, pids.first);
    } finally {
      await owners.commit();
    }
    if (!managers) throw new Error("The second import never ran");
    const theirs = await managers;
    expect(statusesOf(owners.result)).toEqual(["created", "created"]);
    expect(statusesOf(theirs)).toEqual(["same", "same", "created"]);
    const [counted] = await sql<{ open: number; logged: number }[]>`
      select
        (select count(*)::integer from public.invites i
          where i.business_id = ${RACE} and i.claimed_at is null
            and i.phone in ${sql([raceNumber(20), raceNumber(21), raceNumber(22)])}) as open,
        (select count(*)::integer from public.audit_log a
          where a.business_id = ${RACE} and a.action = 'invite.import'
            and a.details ->> 'import' in ${sql(
              [owners.result.import, theirs.import].filter(
                (id): id is string => id !== null,
              ),
            )}) as logged`;
    // One invite a number, and each import its own row.
    expect(counted).toEqual({ open: 3, logged: 2 });
  }, 30_000);

  it("leaves to an undo an invite whose link is being made, once it is", async () => {
    const linked = raceNumber(30);
    const left = raceNumber(31);
    const answer = await sql.begin((tx) =>
      importIn(tx, OWNER, [
        person(linked, "Link Being Made"),
        person(left, "Nobody Linked"),
      ]),
    );
    const batch = answer.import;
    if (!batch) throw new Error("The import made nothing");
    const [invite] = await sql<{ id: string }[]>`
      select i.id from public.invites i
      where i.business_id = ${RACE} and i.phone = ${linked} and i.claimed_at is null`;
    // "יצירת קישור" pressed for one of them, not committed yet.
    const link = await begun(
      first,
      (tx) => tx`
        select public.team_invite_first_link(${OWNER}::uuid, ${invite?.id ?? null}::uuid,
          md5('race link') || md5('race link b'))`,
    );
    type Undone = { cancelled: number; kept: number; joined: number };
    let undone: Promise<Undone> | null = null;
    try {
      undone = underWay(
        second.begin(async (tx) => {
          const [row] = await tx<
            { result: Undone }[]
          >`select public.team_import_undo(${OWNER}::uuid, ${RACE}::uuid, ${batch}::uuid) as result`;
          if (!row) throw new Error("No answer");
          return row.result;
        }),
      );
      await waitsOn(pids.second, pids.first);
    } finally {
      await link.commit();
    }
    // The link made is kept, and works; the other goes.
    if (!undone) throw new Error("The undo never ran");
    expect(await undone).toEqual({ cancelled: 1, kept: 1, joined: 0 });
    expect(await openTo([linked, left])).toEqual([
      { phone: linked, full_name: "Link Being Made", link_pending: false },
    ]);
  }, 30_000);
});
