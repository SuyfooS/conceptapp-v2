import { defineConfig } from "vitest/config";

export default defineConfig({
  // The @domain/@db/@modules aliases from tsconfig.json.
  resolve: { tsconfigPaths: true },
  test: {
    include: [
      "packages/**/*.test.ts",
      "modules/**/*.test.ts",
      "tooling/**/*.test.ts",
      // Server code of the app with tests beside it (the file for payroll's
      // XLSX and ZIP writers).
      "app/**/*.test.ts",
      // The test business's plan and its guards (docs/measure.md).
      "measure/**/*.test.ts",
    ],
    // Database tests run on their own: `pnpm test:db`.
    exclude: ["**/*.db.test.ts", "node_modules/**"],
    environment: "node",
    // A hiring-file key of the run's own, never a real one.
    setupFiles: ["tooling/vitest-setup.ts"],
  },
});
