"use server";

import {
  activeElsewhere,
  inviteToTeam,
  issueTeamInviteLink,
} from "@db/invites";
import { clearProfileBio } from "@db/profile";
import { isUuid } from "@domain/activity";
import { inviteLink } from "@domain/invites";
import { type ProfileSaveResult, seenBioOf } from "@domain/profile";
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
  | "elsewhere"
  | "notAllowed"
  | "notOpen"
  | "demo"
  | "hasOwner"
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
  // A fresh link is for someone already invited here, never refused for
  // being in another business; only the console is refused an owner's.
  | {
      link?: undefined;
      failure?: Exclude<TeamFailure, "elsewhere" | "hasOwner">;
    }
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
    // The app opens a person’s oldest business, so someone already working
    // in another one would never see this one.
    if (
      await activeElsewhere(parsed.value.phone, actor.membership.business.id)
    ) {
      return { failure: "elsewhere", values };
    }
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

/**
 * An owner or manager deletes a colleague's line about themselves, when it is
 * hurtful or out of place: `seenBio`, the line as the screen showed it, so a
 * line rewritten since stays ("changed", and the screen reads it again). The
 * database checks the roles (a manager doesn't clear an owner's) and logs it
 * without the text. The screen holds the delete for a moment first, so it can
 * be undone before it is sent.
 */
export async function clearBioAction(
  personId: string,
  seenBio: string,
): Promise<ProfileSaveResult> {
  const member = await currentMember();
  const membership = member?.membership;
  if (!member || !membership || !canSeeTeam(membership.role)) {
    return { ok: false, failure: "noAccess" };
  }
  if (!canWrite(member.viewing)) return { ok: false, failure: "viewOnly" };
  const seen = seenBioOf(seenBio);
  if (!isUuid(personId) || seen === null) {
    return { ok: false, failure: "invalid" };
  }
  try {
    const result = await clearProfileBio(
      member.userId,
      membership.business.id,
      personId,
      seen,
    );
    if (!result.ok) {
      if (result.failure === "changed") refresh();
      return result;
    }
  } catch (error) {
    console.error(
      "clearProfileBio failed",
      error instanceof Error ? error.message : "unknown",
    );
    return { ok: false, failure: "failed" };
  }
  refresh();
  return { ok: true };
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
    if (!result.ok) {
      return {
        failure: result.error === "hasOwner" ? "notAllowed" : result.error,
      };
    }
    const link = await linkFor(result.token, result.phone);
    // The invite is open again: the screen re-reads its list and counts.
    refresh();
    return { link };
  } catch (error) {
    console.error("issueTeamInviteLink failed", (error as Error).message);
    return { failure: "failed" };
  }
}
