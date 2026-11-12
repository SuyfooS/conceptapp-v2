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
  // A demo business's sample documents, read from public/demo-documents/ by
  // the routes that serve documents (app/document-files/served.ts): public/
  // is the CDN's, so a function has them only when traced in.
  outputFileTracingIncludes: {
    "/document-files/**": ["./public/demo-documents/**"],
  },
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
