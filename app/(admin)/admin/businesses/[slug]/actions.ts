"use server";

import { getPlatformStaff } from "@db/admin";
import { issueInviteLink } from "@db/invites";
import { startViewing } from "@db/view-as";
import { inviteLink } from "@domain/invites";
import { platformCan } from "@domain/platform";
import { parseViewAsRole } from "@domain/view-as";
import { notFound, redirect } from "next/navigation";
import { requestOrigin } from "@/app/origin";

export type InviteLinkState =
  | { link?: undefined; failure?: "failed" | "noPermission" }
  | { link: string; failure?: undefined };

/**
 * A fresh invite link for one open invite, shown to the team member to
 * send on (WhatsApp, SMS from their phone). Nothing is sent from here: in
 * development the link is also written to the server log. The old link
 * stops working.
 */
export async function inviteLinkAction(
  inviteId: string,
  _prev: InviteLinkState,
  _form: FormData,
): Promise<InviteLinkState> {
  const staff = await getPlatformStaff();
  if (!staff || !platformCan(staff.role, "staff.invite")) {
    return { failure: "noPermission" };
  }
  try {
    const { token, phone } = await issueInviteLink(staff.userId, inviteId);
    const link = inviteLink(await requestOrigin(), token);
    if (process.env.NODE_ENV !== "production") {
      console.info(`[invite] not sent, link for ${phone}: ${link}`);
    }
    return { link };
  } catch (error) {
    console.error("issueInviteLink failed", (error as Error).message);
    return { failure: "failed" };
  }
}

/**
 * Open the business's app as the role in the form, read only. The session
 * and the audit log entry are written by the database; the app then reads
 * the business as that role until the session ends (two hours at most).
 */
export async function viewAsAction(
  business: { id: string; slug: string },
  form: FormData,
): Promise<never> {
  const staff = await getPlatformStaff();
  const role = parseViewAsRole(form.get("role"));
  if (!staff || !platformCan(staff.role, "businesses.view_as") || !role) {
    notFound();
  }
  try {
    await startViewing(staff.userId, business.id, role);
  } catch (error) {
    console.error("startViewing failed", (error as Error).message);
    redirect(`/admin/businesses/${business.slug}?view=failed`);
  }
  redirect("/home");
}
