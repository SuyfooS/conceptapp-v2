import { getNotification, readNotifications } from "@db/notifications";
import { isUuid } from "@domain/activity";
import { INBOX_PATH, isAppPath, linkFor } from "@domain/notifications";
import { canWrite } from "@domain/view-as";
import { NextResponse } from "next/server";
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
 * Open one line from outside the app's pages: the phone's notification, from
 * the next part (the inbox's own rows use a server action). Marks the line
 * read and sends the person where it leads, which comes from the line as
 * stored, never from the address, so this can't send anyone elsewhere. Only
 * a person's own opening marks it: never a prefetch, and never a link on
 * another site. Behind the sign-in guard (proxy.ts).
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
  const go = (path: string) =>
    NextResponse.redirect(new URL(path, request.url), {
      status: 303,
      headers: { "Cache-Control": "no-store" },
    });

  const [{ id }, member] = await Promise.all([params, currentMember()]);
  if (!member?.membership) return go("/home");
  const line = isUuid(id) ? await getNotification(id) : null;
  if (!line) return go(INBOX_PATH);

  const site = request.headers.get("sec-fetch-site");
  const ownOpening = site === null || site === "same-origin" || site === "none";
  if (ownOpening && canWrite(member.viewing)) {
    await readNotifications(member.userId, line.businessId, [line.id]);
  }
  const target = linkFor(line.kind, line.params, line.resolvedAt !== null);
  return go(isAppPath(target) ? target : INBOX_PATH);
}
