import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { deploymentIdOf } from "./packages/domain/deployment-id";
import { headerRules } from "./packages/domain/security-headers";

const nextConfig: NextConfig = {
  /* config options here */
  // The security headers on every response, the paths kept out of search,
  // and the service worker's own (packages/domain/security-headers.ts).
  async headers() {
    return headerRules();
  },
  cacheComponents: true,
  // Each Vercel deployment's own id, so a page left open across a release is
  // told by its deployment, not its build, loads whole on its next
  // navigation and asks for its assets by release; none on a local build or
  // CI's, which tell builds apart as before (packages/domain/deployment-id.ts).
  // A press on such a page is app/stale-build.ts's.
  deploymentId: deploymentIdOf({
    NEXT_DEPLOYMENT_ID: process.env.NEXT_DEPLOYMENT_ID,
    VERCEL_DEPLOYMENT_ID: process.env.VERCEL_DEPLOYMENT_ID,
  }),
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
