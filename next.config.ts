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
  // No deployment id set here (closing the pilot, PR 1a): with one, Next.js
  // leaves its build id out of a server action's answer, so an answer from
  // the next release would be drawn into a page from the one before instead
  // of being dropped. Vercel's Skew Protection would set one all the same:
  // Next.js takes NEXT_DEPLOYMENT_ID as its deployment id whatever this file
  // says, and Skew Protection keeps a page on its own release only for its
  // maximum age, so a clock left open longer would be back to that. Turning
  // it on needs this checked again. A press the new release doesn't know is
  // app/stale-build.ts's.
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
