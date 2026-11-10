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
    ],
    // Database tests run on their own: `pnpm test:db`.
    exclude: ["**/*.db.test.ts", "node_modules/**"],
    environment: "node",
  },
});
