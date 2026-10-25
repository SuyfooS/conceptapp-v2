"use server";

import { inviteToTeam, issueTeamInviteLink } from "@db/invites";
import { inviteLink } from "@domain/invites";
import {
  canSeeTeam,
  parseTeamInvite,
  type TeamInviteErrors,
} from "@domain/team";
import { canWrite } from "@domain/view-as";
import { refresh, revalidatePath } from "next/cache";
import { requestOrigin } from "@/app/origin";
import { currentMember } from "../member";

export type TeamFailure =
  | "alreadyMember"
  | "notAllowed"
  | "notOpen"
  | "failed"
  | "noPermission"
  | "viewOnly";

export type InviteState =
  | {
      done?: undefined;
      errors?: TeamInviteErrors;
      failure?: TeamFailure;
      /** What was typed, so the form keeps it after an error. */
      values?: { name: string; phone: string; role: string };
    }
  | { done: { name: string; phone: string; link: string } };

export type ResendState =
  | { link?: undefined; failure?: TeamFailure }
  | { link: string; failure?: undefined };

/**
 * The signed-in owner or manager, or why they may not invite. The
 * ConceptApp team viewing as a role sees the screens but changes nothing.
 */
async function inviter() {
  const member = await currentMember();
  const membership = member?.membership;
  if (!member || !membership || !canSeeTeam(membership.role)) {
    return { failure: "noPermission" as const };
  }
  if (!canWrite(member.viewing)) return { failure: "viewOnly" as const };
  return { userId: member.userId, membership };
}

async function linkFor(token: string, phone: string): Promise<string> {
  const link = inviteLink(await requestOrigin(), token);
  // Nothing is sent from the app; in development the link is also logged.
  if (process.env.NODE_ENV !== "production") {
    console.info(`[invite] not sent, link for ${phone}: ${link}`);
  }
  return link;
}

/**
 * An owner or manager invites someone by phone from the Team screen. The
 * result is a link for them to send on; a number with an unclaimed invite
 * gets that invite refreshed with a new link.
 */
export async function inviteAction(
  _prev: InviteState,
  form: FormData,
): Promise<InviteState> {
  const values = {
    name: String(form.get("name") ?? ""),
    phone: String(form.get("phone") ?? ""),
    role: String(form.get("role") ?? ""),
  };
  const actor = await inviter();
  if ("failure" in actor) return { failure: actor.failure, values };

  const parsed = parseTeamInvite(values, actor.membership.role);
  if (!parsed.ok) return { errors: parsed.errors, values };

  try {
    const result = await inviteToTeam(
      actor.userId,
      actor.membership.business.id,
      parsed.value,
    );
    if (!result.ok) return { failure: result.error, values };
    revalidatePath("/team");
    return {
      done: {
        name: parsed.value.name,
        phone: parsed.value.phone,
        link: await linkFor(result.token, result.phone),
      },
    };
  } catch (error) {
    console.error("inviteToTeam failed", (error as Error).message);
    return { failure: "failed", values };
  }
}

/** A fresh link for an invite nobody claimed; the old link stops working. */
export async function resendInviteAction(
  inviteId: string,
  _prev: ResendState,
  _form: FormData,
): Promise<ResendState> {
  const actor = await inviter();
  if ("failure" in actor) return { failure: actor.failure };
  try {
    const result = await issueTeamInviteLink(actor.userId, inviteId);
    if (!result.ok) return { failure: result.error };
    const link = await linkFor(result.token, result.phone);
    // The invite is open again: the screen re-reads its list and counts.
    refresh();
    return { link };
  } catch (error) {
    console.error("issueTeamInviteLink failed", (error as Error).message);
    return { failure: "failed" };
  }
}
