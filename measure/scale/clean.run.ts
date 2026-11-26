import { test } from "@playwright/test";
import postgres from "postgres";
import { removeScaleBusiness } from "./clean";
import { databaseUrl, refuseUnlessLocal } from "./guard";

/**
 * `pnpm measure:clean`: takes the test business and its people off the local
 * stack (docs/measure.md). Run it before `pnpm db:test` or the browser
 * tests on a database that was measured: their global counts don't expect it.
 */

test("the test business, taken off the local stack", async () => {
  test.setTimeout(10 * 60_000);
  const url = databaseUrl(process.env);
  refuseUnlessLocal(url, process.env);
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql.begin((tx) => removeScaleBusiness(tx));
  } finally {
    await sql.end();
  }
});
