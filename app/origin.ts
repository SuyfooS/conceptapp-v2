import "server-only";
import { isSameOriginPost } from "@domain/punch-code";
import { requestProtocol } from "@domain/request-origin";
import { headers } from "next/headers";

/** The origin the app was opened on, so an invite link works where it is sent. */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) throw new Error("No host header");
  return `${requestProtocol(host, h.get("x-forwarded-proto"))}://${host}`;
}

/**
 * A POST to a route handler sent by the app's own pages, not by another site
 * riding on the session's cookie (@domain/punch-code's isSameOriginPost).
 */
export async function sameOriginRequest(request: Request): Promise<boolean> {
  return isSameOriginPost(
    {
      secFetchSite: request.headers.get("sec-fetch-site"),
      origin: request.headers.get("origin"),
    },
    await requestOrigin(),
  );
}
