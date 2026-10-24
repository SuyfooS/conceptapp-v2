"use server";

import { getPlatformStaff } from "@db/admin";
import { issueInviteLink } from "@db/invites";
import { inviteLink } from "@domain/invites";
import { platformCan } from "@domain/platform";
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
