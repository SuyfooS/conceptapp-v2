import { defineConfig } from "vitest/config";

export default defineConfig({
  // The @domain/@db/@modules aliases from tsconfig.json.
  resolve: { tsconfigPaths: true },
  test: {
    include: [
      "packages/**/*.test.ts",
      "modules/**/*.test.ts",
      "tooling/**/*.test.ts",
    ],
    environment: "node",
  },
});
