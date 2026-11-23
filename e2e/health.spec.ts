import { expect, test } from "@playwright/test";

// The address an uptime monitor asks (docs/production.md, B11), against the
// served build: 200 at once, never a redirect, never kept, no cookie, and
// nothing in it but its status. The site with the demo door closed is asked
// the same in the check job (.github/scripts/door-closed.sh).

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
