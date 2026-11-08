import { PUNCH_CODE_TTL_SECONDS } from "@domain/time-clock";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

/**
 * The code lifetime the screens plan for is the one the database enforces.
 * Needs the local database (`pnpm db:start`); run with `pnpm test:db`.
 */

const sql = postgres(
  process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 1, onnotice: () => {} },
);

afterAll(() => sql.end());

describe("punch codes", () => {
  it("live as long in the app as in the database", async () => {
    const [row] = await sql<{ seconds: number }[]>`
      select extract(epoch from private.punch_code_ttl())::int as seconds`;
    expect(row?.seconds).toBe(PUNCH_CODE_TTL_SECONDS);
  });
});
