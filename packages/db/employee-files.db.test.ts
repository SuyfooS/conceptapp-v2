import {
  addressFromText,
  addressText,
  BANK_INSTRUCTION_VERSION,
  DENIAL_REASONS,
  FILE_DUTIES_VERSION,
  FILE_GROUPS,
} from "@domain/employee-file";
import postgres from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const crypto = await import("./crypto");

/**
 * The hiring file's demo of H4, against the local database, with the real
 * sealing: a worker's ID and address sealed here with the run's own key
 * (tooling/vitest-setup.ts) and written through the database's function,
 * kept as ciphertext only, nobody selecting the table, the person's own read
 * opening again, the log naming the groups and never a value, and a manager
 * without the files refused, logged, and told only how complete the file
 * is. And the database's constants are @domain/employee-file's. pgTAP can't
 * run TypeScript, so this does, in one transaction it rolls back. Needs the
 * local database (`pnpm db:start`); run with `pnpm test:db`.
 */

const sql = postgres(
  process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 1, onnotice: () => {} },
);

afterAll(() => sql.end());

class Rollback extends Error {}
type Tx = postgres.TransactionSql;

const BUSINESS = "f4000000-0000-4000-b000-00000000000b";
const OWNER = "f4000000-0000-4000-a000-00000000000a";
const MANAGER = "f4000000-0000-4000-a000-00000000000b";
const WORKER = "f4000000-0000-4000-a000-00000000000c";
const ACCOUNTANT = "f4000000-0000-4000-a000-00000000000d";
const ID = "000000018";

/** Runs `run` in a transaction that is always rolled back. */
async function rolledBack(run: (tx: Tx) => Promise<void>): Promise<void> {
  try {
    await sql.begin(async (tx) => {
      await run(tx);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
}

/** A business with its four people, the module on and real values open. */
async function business(tx: Tx) {
  await tx`update private.file_settings set real_values = true`;
  let phone = 0;
  for (const id of [OWNER, MANAGER, WORKER, ACCOUNTANT]) {
    phone += 1;
    await tx`
      insert into auth.users (id, aud, role, phone)
      values (${id}, 'authenticated', 'authenticated', ${`97250077${String(phone).padStart(4, "0")}`})`;
  }
  await tx`
    insert into public.businesses (id, slug, name)
    values (${BUSINESS}, 'efdb-a', 'Files by the server')`;
  await tx`
    insert into public.memberships (business_id, user_id, role)
    values (${BUSINESS}, ${OWNER}, 'owner'), (${BUSINESS}, ${MANAGER}, 'manager'),
      (${BUSINESS}, ${WORKER}, 'worker'), (${BUSINESS}, ${ACCOUNTANT}, 'accountant')`;
  await tx`
    insert into public.business_modules (business_id, module_key, enabled, settings)
    values (${BUSINESS}, 'employee_files', true, '{}')`;
}

async function signIn(tx: Tx, user: string) {
  await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: user, role: "authenticated" })}, true)`;
  await tx`set local role authenticated`;
}

const place = (column: "id_enc" | "address_enc") => ({
  table: "employee_details" as const,
  column,
  business: BUSINESS,
  user: WORKER,
});

describe("the hiring file, sealed by the server", () => {
  it("keeps ciphertext only, opens for the person, and logs the groups, never a value", async () => {
    await rolledBack(async (tx) => {
      await business(tx);
      const ring = crypto.employeeKeyRing();
      expect(ring).not.toBeNull();
      if (!ring) return;

      // The worker's data key, offered and kept.
      const offered = crypto.wrapDataKey(
        ring,
        crypto.newDataKey(),
        BUSINESS,
        WORKER,
      );
      const [kept] = await tx<{ k: { kek_id: number; wrapped_dek: string } }[]>`
        select public.employee_data_key(${WORKER}, ${BUSINESS}, ${WORKER},
          ${offered.kekId}::smallint, ${crypto.toBase64(offered.wrapped)}) as k`;
      if (!kept) throw new Error("no key");
      const dek = crypto.unwrapDataKey(
        ring,
        kept.k.kek_id,
        crypto.fromBase64(kept.k.wrapped_dek),
        BUSINESS,
        WORKER,
      );

      const address = {
        kind: "street" as const,
        cityCode: 5000,
        street: "רחוב הבדיקה",
        number: "7",
      };
      const patch = {
        identity: {
          kind: "il",
          sealed: crypto.toBase64(crypto.seal(dek, ID, place("id_enc"))),
          hint: "0018",
        },
        address: {
          city_code: 5000,
          sealed: crypto.toBase64(
            crypto.seal(dek, addressText(address), place("address_enc")),
          ),
        },
      };
      const [saved] = await tx<{ r: { changed: string[] } }[]>`
        select public.set_employee_details(${WORKER}, ${BUSINESS}, ${WORKER},
          ${tx.json(patch)}::jsonb) as r`;
      expect(saved?.r.changed).toEqual(["identity", "address"]);

      // What the database holds: ciphertext, 0x01 first, no byte run of the values.
      const [stored] = await tx<{ id_enc: Buffer; address_enc: Buffer }[]>`
        select id_enc, address_enc from public.employee_details
        where business_id = ${BUSINESS} and user_id = ${WORKER}`;
      for (const [bytes, text] of [
        [stored?.id_enc, ID],
        [stored?.address_enc, address.street],
      ] as const) {
        expect(bytes?.[0]).toBe(1);
        expect(bytes?.length ?? 0).toBeGreaterThan(29);
        expect(bytes?.includes(Buffer.from(text, "utf8"))).toBe(false);
      }

      // Nobody selects the table, the person included; their own read opens.
      await signIn(tx, WORKER);
      const refused = await tx
        .savepoint((sp) => sp`select 1 from public.employee_details`)
        .then(
          () => "read",
          (error: { code?: string }) => error.code,
        );
      expect(refused).toBe("42501");
      const [own] = await tx<
        { f: { access: string; sealed: { address: string } } }[]
      >`select public.employee_file(${BUSINESS}, ${WORKER}) as f`;
      expect(own?.f.access).toBe("self");
      const opened = crypto.open(
        dek,
        crypto.fromBase64(own?.f.sealed.address ?? ""),
        place("address_enc"),
        { demo: false },
      );
      expect(addressFromText(opened, 5000)).toEqual(address);
      await tx`reset role`;

      const logged = await tx<{ details: unknown }[]>`
        select details from public.audit_log
        where business_id = ${BUSINESS} and action = 'employee.details'`;
      expect(logged.map((row) => row.details)).toEqual([
        { person: WORKER, fields: ["identity", "address"] },
      ]);
      expect(JSON.stringify(logged)).not.toMatch(/000000018|0018|הבדיקה/);

      // A manager without the files: refused without an error, logged, and
      // told only how complete the file is.
      await signIn(tx, MANAGER);
      const [denied] = await tx<{ f: unknown }[]>`
        select public.employee_file(${BUSINESS}, ${WORKER}) as f`;
      expect(denied?.f).toEqual({ access: "denied", reason: "not_holder" });
      const [revealed] = await tx<{ f: unknown }[]>`
        select public.reveal_employee_fields(${BUSINESS}, ${WORKER}, '{id}') as f`;
      expect(revealed?.f).toEqual({ access: "denied", reason: "not_holder" });
      const status = await tx<
        {
          user_id: string;
          complete: boolean;
          missing: number;
          form101_in: boolean;
          detail: unknown;
        }[]
      >`select * from public.employee_file_status(${BUSINESS})`;
      expect(status.find((row) => row.user_id === WORKER)).toEqual({
        user_id: WORKER,
        complete: false,
        missing: 3,
        form101_in: false,
        detail: null,
      });
      await tx`reset role`;

      const refusals = await tx<{ reason: string }[]>`
        select details ->> 'reason' as reason from public.audit_log
        where business_id = ${BUSINESS} and action = 'employee.view_denied'
          and actor_id = ${MANAGER}`;
      expect(refusals.map((row) => row.reason)).toEqual([
        "not_holder",
        "not_holder",
      ]);
      for (const { reason } of refusals) {
        expect(DENIAL_REASONS as readonly string[]).toContain(reason);
      }
    });
  });

  it("holds the constants the app holds", async () => {
    const [row] = await sql<
      { duties: string; versions: string[]; groups: string[] }[]
    >`
      select private.file_duties_version() as duties,
        private.bank_instruction_versions() as versions,
        private.file_groups(${BUSINESS}) as groups`;
    expect(row?.duties).toBe(FILE_DUTIES_VERSION);
    expect(row?.versions).toEqual([BANK_INSTRUCTION_VERSION]);
    expect(row?.groups).toEqual([...FILE_GROUPS]);
  });
});
