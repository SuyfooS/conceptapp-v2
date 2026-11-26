import { defineConfig } from "@playwright/test";

/**
 * Making and removing the test business (`pnpm measure:seed`,
 * `pnpm measure:clean`, docs/measure.md): two projects of one file each,
 * no browser and no web server. Playwright runs them because it runs
 * TypeScript with the repo's aliases, so the seed has one implementation,
 * shared with the database job's test (measure/scale/scale.db.test.ts).
 */
export default defineConfig({
  testDir: "./scale",
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  outputDir: "./out/seed-results",
  projects: [
    { name: "seed", testMatch: "seed.run.ts" },
    { name: "clean", testMatch: "clean.run.ts" },
  ],
});
