import { ROLES, type Role } from "@domain/modules";
import { canRemoveMember, mayChangeRole } from "@domain/team";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Who may take someone off the team or change their role is one rule in the
 * database (`public.remove_member`, `public.set_member_role`,
 * `private.gives_role`) and on the screens (`canRemoveMember`,
 * `mayChangeRole` in @domain/team): every role against every role, and every
 * change between them, asked of both. pgTAP can't read TypeScript, so this
 * asks SQL, in one transaction it rolls back, each try in a savepoint of its
 * own. Needs the local database (`pnpm db:start`); run with `pnpm test:db`.
 */

const sql = postgres(
  process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 1, onnotice: () => {} },
);

afterAll(() => sql.end());

class Rollback extends Error {}
class Tried extends Error {}

type Tx = postgres.TransactionSql;

const BUSINESS = "8e000000-0000-4000-b000-0000000000f1";
const AT = "2026-11-24 08:00+00";

// One person who acts and one who is acted on, in each role. Numbers of their
// own (050-000-72xx), apart from every other test's.
const ACTORS = Object.fromEntries(
  ROLES.map((role, i) => [role, `8e000000-0000-4000-a000-0000000000a${i}`]),
) as Record<Role, string>;
const TARGETS = Object.fromEntries(
  ROLES.map((role, i) => [role, `8e000000-0000-4000-a000-0000000000b${i}`]),
) as Record<Role, string>;

async function team(tx: Tx) {
  await tx`
    insert into public.businesses (id, slug, name)
    values (${BUSINESS}, 'tc-parity', 'Team parity')`;
  let phone = 7200;
  for (const [role, id] of [
    ...Object.entries(ACTORS),
    ...Object.entries(TARGETS),
  ]) {
    phone += 1;
    await tx`
      insert into auth.users (id, aud, role, phone)
      values (${id}, 'authenticated', 'authenticated', ${`97250000${phone}`})`;
    await tx`
      insert into public.memberships (business_id, user_id, role)
      values (${BUSINESS}, ${id}, ${role}::public.member_role)`;
  }
}

/** 'ok', or the refusal's code; whatever it did is undone. */
async function attempt(
  tx: Tx,
  run: (sp: postgres.TransactionSql) => Promise<unknown>,
): Promise<string> {
  try {
    await tx.savepoint(async (sp) => {
      await run(sp);
      throw new Tried();
    });
  } catch (error) {
    if (error instanceof Tried) return "ok";
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : String(error);
  }
  return "ok";
}

/** Runs `check` against the team, then rolls everything back. */
async function withTeam(check: (tx: Tx) => Promise<void>) {
  await sql
    .begin(async (tx) => {
      await team(tx);
      await check(tx);
      throw new Rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) throw error;
    });
}

describe("team changes, in the database as on the screens", () => {
  it("remove the same people", async () => {
    await withTeam(async (tx) => {
      for (const actor of ROLES) {
        for (const target of ROLES) {
          const outcome = await attempt(
            tx,
            (sp) => sp`
              select public.remove_member(
                ${ACTORS[actor]}, ${BUSINESS}, ${TARGETS[target]}, ${AT}
              )`,
          );
          const allowed = canRemoveMember(
            { userId: ACTORS[actor], role: actor },
            { userId: TARGETS[target], role: target },
          );
          expect(outcome, `${actor} removes ${target}`).toBe(
            allowed ? "ok" : "42501",
          );
        }
      }
    });
  });

  it("change the same roles", async () => {
    await withTeam(async (tx) => {
      for (const actor of ROLES) {
        for (const from of ROLES) {
          for (const to of ROLES) {
            const outcome = await attempt(
              tx,
              (sp) => sp`
                select public.set_member_role(
                  ${ACTORS[actor]}, ${BUSINESS}, ${TARGETS[from]},
                  ${to}::public.member_role, at_time => ${AT}
                )`,
            );
            expect(outcome, `${actor}: ${from} -> ${to}`).toBe(
              mayChangeRole(actor, from, to) ? "ok" : "42501",
            );
          }
        }
      }
    });
  });
});
