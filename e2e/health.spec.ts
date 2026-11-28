import { expect, test } from "./test";

// The addresses the uptime check asks (docs/production.md, B11 and "בדיקה
// שהאתר באוויר"), against the served build: 200 at once, never a redirect, never
// kept, no cookie, and nothing in them but their status. /health/db asks the
// local database its one question (public.ping) with the publishable key and
// no session, so this is where the route and the grant to anon meet for real
// (without the grant, 42501, it answers 503). Not the migration: before it,
// PostgREST's "no such function" (PGRST202) also answers 200 (@db/health);
// pgTAP ping.test.sql holds the function itself. The site with the demo door
// closed is asked /health the same in the check job
// (.github/scripts/door-closed.sh).

test("/health answers a monitor with its status alone", async ({ request }) => {
  const response = await request.get("/health", { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["set-cookie"]).toBeUndefined();
  expect(await response.json()).toEqual({ status: "ok" });

  const head = await request.head("/health", { maxRedirects: 0 });
  expect(head.status()).toBe(200);
  expect(head.headers()["cache-control"]).toContain("no-store");
  expect(await head.body()).toHaveLength(0);
});

test("/health/db answers once the database does, with its status alone", async ({
  request,
}) => {
  const response = await request.get("/health/db", { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["set-cookie"]).toBeUndefined();
  expect(await response.json()).toEqual({ status: "ok" });

  const head = await request.head("/health/db", { maxRedirects: 0 });
  expect(head.status()).toBe(200);
  expect(head.headers()["cache-control"]).toContain("no-store");
  expect(await head.body()).toHaveLength(0);
});
