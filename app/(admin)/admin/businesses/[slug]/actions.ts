"use server";

import { getPlatformStaff } from "@db/admin";
import { issueInviteLink } from "@db/invites";
import { inviteLink } from "@domain/invites";
import { platformCan } from "@domain/platform";
import { headers } from "next/headers";

export type InviteLinkState =
  | { link?: undefined; failure?: "failed" | "noPermission" }
  | { link: string; failure?: undefined };

/** The origin the console was opened on, so the link works where it is sent. */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) throw new Error("No host header");
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const proto = h.get("x-forwarded-proto") ?? (local ? "http" : "https");
  return `${proto}://${host}`;
}

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
