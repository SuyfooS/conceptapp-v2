import { z } from "zod";

/**
 * Which release a build is, for Next.js's `deploymentId` (next.config.ts;
 * closing the pilot, PR 1a). With one set, Next.js puts it on every asset
 * (`?dpl=`), on the router's requests and in the `'use cache'` key, and loads
 * the whole page when a navigation finds the server on another release
 * (`node_modules/next/dist/docs/…/deploymentId.md`).
 *
 * Next.js's own `NEXT_DEPLOYMENT_ID` comes first: Next.js takes it over the
 * config's value anyway, and on Vercel a config's value that differs from it
 * fails the build (`next/dist/server/config.js`). Vercel sets it with Skew
 * Protection (Pro). Without it, Vercel's `VERCEL_DEPLOYMENT_ID`, one for each
 * deployment (`dpl_…`), at build time as well as at run time while the
 * project exposes its system variables, as it does unless switched off. A
 * commit's SHA would not do: a redeploy of the same commit is a new build
 * with the same SHA. None for a local build or CI's, as before: then Next.js
 * tells builds apart by its own build id.
 */
export type DeploymentEnv = {
  NEXT_DEPLOYMENT_ID?: string;
  VERCEL_DEPLOYMENT_ID?: string;
};

/** Safe in a query string as it is: Vercel's are `dpl_` and 28 more. */
const DeploymentId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

/**
 * The first of the two that is set, when it reads as an id; none otherwise,
 * so a value that would break an asset's address keeps the build as before.
 */
export function deploymentIdOf(env: DeploymentEnv): string | undefined {
  const value = env.NEXT_DEPLOYMENT_ID || env.VERCEL_DEPLOYMENT_ID;
  if (!value) return undefined;
  const parsed = DeploymentId.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
