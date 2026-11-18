"use server";

import { getNotification, readNotifications } from "@db/notifications";
import { isUuid } from "@domain/activity";
import { INBOX_PATH, linkFor } from "@domain/notifications";
import { canWrite } from "@domain/view-as";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { rememberBusiness } from "../business-cookie";
import { currentMember } from "../member";

/**
 * Open one of the signed-in person's lines: mark it read and go where it
 * leads. Where comes from the line's kind as stored, never from the browser,
 * so it can only be a screen of the app. A line from another of their
 * businesses opens that business (payroll P3b), as the phone's do. Nothing is
 * marked or switched while viewing as someone; a line that isn't theirs (or
 * is gone) leads back to the inbox.
 */
export async function openNotificationAction(id: string): Promise<void> {
  const member = await currentMember();
  if (!member?.membership) redirect("/home");
  const line = isUuid(id) ? await getNotification(id) : null;
  if (!line) {
    refresh();
    redirect(INBOX_PATH);
  }
  if (canWrite(member.viewing)) {
    await readNotifications(member.userId, line.businessId, [line.id]);
    if (
      line.businessId !== member.membership.business.id &&
      member.businesses.some((own) => own.business.id === line.businessId)
    ) {
      await rememberBusiness(line.businessId);
    }
  }
  // The counts on the bell and the Home tab are read with the layout.
  refresh();
  redirect(linkFor(line.kind, line.params, line.resolvedAt !== null));
}

/** Mark every line the signed-in person has in their business read. */
export async function readAllNotificationsAction(): Promise<void> {
  const member = await currentMember();
  const business = member?.membership?.business;
  if (!member || !business || !canWrite(member.viewing)) return;
  await readNotifications(member.userId, business.id, null);
  refresh();
}
