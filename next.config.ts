import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { headerRules } from "./packages/domain/security-headers";

const nextConfig: NextConfig = {
  /* config options here */
  // The security headers on every response, the paths kept out of search,
  // and the service worker's own (packages/domain/security-headers.ts).
  async headers() {
    return headerRules();
  },
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);
