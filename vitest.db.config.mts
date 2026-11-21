import { defineConfig } from "vitest/config";

/** Tests against the local database (`pnpm db:start` first): `pnpm test:db`. */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["**/*.db.test.ts"],
    exclude: ["node_modules/**"],
    environment: "node",
    // A hiring-file key of the run's own, for the sealing against the database.
    setupFiles: ["tooling/vitest-setup.ts"],
  },
});
