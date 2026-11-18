import { getNotification, readNotifications } from "@db/notifications";
import { isUuid } from "@domain/activity";
import { BUSINESS_COOKIE } from "@domain/businesses";
import { INBOX_PATH, isAppPath, linkFor } from "@domain/notifications";
import { canWrite } from "@domain/view-as";
import { NextResponse } from "next/server";
import { requestOrigin } from "@/app/origin";
import { businessCookieOptions } from "../../../business-cookie";
import { currentMember } from "../../../member";

/** A prefetch or a page asking for data, rather than a person opening a link. */
function isPrefetch(request: Request): boolean {
  const h = request.headers;
  return (
    h.has("next-router-prefetch") ||
    h.has("rsc") ||
    /prefetch/i.test(h.get("sec-purpose") ?? h.get("purpose") ?? "")
  );
}

/**
 * Open one line from outside the app's pages: the phone's notification (the
 * inbox's own rows use a server action). Marks the line read and sends the
 * person where it leads, which comes from the line as stored, never from the
 * address, so this can't send anyone elsewhere. A line from another of the
 * person's businesses (payroll P3b) opens that business: the switch is made
 * first, once the line shows it is theirs (RLS reads only their own lines in
 * the businesses they are in). Only a person's own opening marks it or
 * switches: never a prefetch, and never a link on another site, which goes to
 * the inbox of the business they are in. Behind the sign-in guard (proxy.ts).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (isPrefetch(request)) {
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  }
  // The origin the person opened the app on, not request.url, which names
  // the host the server listens on (localhost under next start): a redirect
  // there would leave the session cookie, set for the real host, behind.
  const origin = await requestOrigin();
  const go = (path: string) =>
    NextResponse.redirect(new URL(path, origin), {
      status: 303,
      headers: { "Cache-Control": "no-store" },
    });

  const [{ id }, member] = await Promise.all([params, currentMember()]);
  if (!member?.membership) return go("/home");
  const line = isUuid(id) ? await getNotification(id) : null;
  if (!line) return go(INBOX_PATH);

  const site = request.headers.get("sec-fetch-site");
  const ownOpening = site === null || site === "same-origin" || site === "none";
  const acting = ownOpening && canWrite(member.viewing);
  const here = line.businessId === member.membership.business.id;
  const switching =
    !here &&
    acting &&
    member.businesses.some((own) => own.business.id === line.businessId);
  if (acting) {
    await readNotifications(member.userId, line.businessId, [line.id]);
  }
  if (!here && !switching) return go(INBOX_PATH);

  const target = linkFor(line.kind, line.params, line.resolvedAt !== null);
  const response = go(isAppPath(target) ? target : INBOX_PATH);
  if (switching) {
    response.cookies.set(
      BUSINESS_COOKIE,
      line.businessId,
      await businessCookieOptions(),
    );
  }
  return response;
}
