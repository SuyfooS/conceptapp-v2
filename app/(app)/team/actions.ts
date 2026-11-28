"use server";

import {
  inviteToTeam,
  issueFirstInviteLink,
  issueTeamInviteLink,
} from "@db/invites";
import { clearProfileBio } from "@db/profile";
import {
  cancelTeamInvite,
  removeMember,
  setMemberName,
  setMemberRole,
} from "@db/team";
import { isUuid } from "@domain/activity";
import { inviteLink } from "@domain/invites";
import { ROLES, type Role } from "@domain/modules";
import { type ProfileSaveResult, seenBioOf } from "@domain/profile";
import {
  canEditTeam,
  parseTeamInvite,
  parseTeamName,
  type TeamInviteErrors,
} from "@domain/team";
import { canWrite } from "@domain/view-as";
import { refresh, revalidatePath } from "next/cache";
import { z } from "zod";
import { requestOrigin } from "@/app/origin";
import { pushSoon } from "../../push/server";
import { currentMember } from "../member";
import { currentGivableNamedRoles } from "../team";
import type {
  InviteCancelResult,
  MemberChangeResult,
  MemberNameResult,
  TeamChangeActionFailure,
} from "./team-change-types";

export type TeamFailure =
  | "alreadyMember"
  // The console's alone (its add-a-person form shares this state): the Team
  // screen never says a number is on another business's staff.
  | "elsewhere"
  | "notAllowed"
  // The role sees pay, which only an owner gives (the roles plan's R6).
  | "givesPay"
  // The role the business named was removed meanwhile (R11b).
  | "roleGone"
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
  | {
      /**
       * The invite made: its name, its number in E.164 (where WhatsApp
       * opens a chat), the role it gives, built-in or the one a named role
       * is built on (an owner's link goes with the owner's sentence from the
       * console), and its link.
       */
      done: { name: string; phone: string; role: Role; link: string };
    };

export type ResendState =
  // A fresh link is for someone already invited here, never refused for
  // being in another business; only the console is refused an owner's. A
  // first link is refused once one was made meanwhile elsewhere ("linked").
  | {
      link?: undefined;
      failure?: Exclude<TeamFailure, "elsewhere" | "hasOwner"> | "linked";
    }
  | { link: string; failure?: undefined };

/**
 * The signed-in person who edits the team (`canEditTeam`: team.edit, the
 * roles plan's R6), or why they may not invite. The ConceptApp team viewing
 * as a role sees the screens but changes nothing.
 */
async function inviter() {
  const member = await currentMember();
  const membership = member?.membership;
  if (!member || !membership || !canEditTeam(membership)) {
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
 * Someone who edits the team invites someone by phone from the Team screen,
 * to a role they give: a built-in one, or one the business named that they
 * give (the roles plan's R11b; the form's role is its id). The result is a
 * link for them to send on; a number with an unclaimed invite gets that
 * invite refreshed with a new link.
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

  const parsed = parseTeamInvite(
    values,
    actor.membership,
    await currentGivableNamedRoles(),
  );
  if (!parsed.ok) return { errors: parsed.errors, values };

  try {
    // Every number gets the same answer here (#80): whether someone is on
    // another business's staff is not this business's to learn. One place on
    // a staff per login (payroll P3b) still holds, at /join, which tells the
    // person themselves; only the console says it to the inviter.
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
        role: parsed.value.role,
        link: await linkFor(result.token, result.phone),
      },
    };
  } catch (error) {
    console.error("inviteToTeam failed", (error as Error).message);
    return { failure: "failed", values };
  }
}

/**
 * Someone who edits the team deletes a colleague's line about themselves,
 * when it is hurtful or out of place: `seenBio`, the line as the screen
 * showed it, so a line rewritten since stays ("changed", and the screen reads
 * it again). The database checks team.edit and the roles (nobody clears a
 * higher role's) and logs it without the text. The screen holds the delete for a moment first, so it can
 * be undone before it is sent. The page binds it to the business the screen
 * was drawn for (payroll P3b): a delete that arrives after the person
 * switched business is refused, never made in the other one.
 */
export async function clearBioAction(
  businessId: string,
  personId: string,
  seenBio: string,
): Promise<ProfileSaveResult> {
  const member = await currentMember();
  const membership = member?.membership;
  if (!member || !membership || !canEditTeam(membership)) {
    return { ok: false, failure: "noAccess" };
  }
  if (membership.business.id !== businessId) {
    return { ok: false, failure: "businessChanged" };
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
  return await issueLink(inviteId, issueTeamInviteLink, "issueTeamInviteLink");
}

/**
 * The first link of an invite nobody got one for yet, from "עוד לא קיבלו
 * קישור" (`SendLinkRow`): as `resendInviteAction`, but refused ("linked")
 * once a link was made for it meanwhile, on another screen, by someone else
 * or from the console, so a screen not read again since never replaces a
 * link already sent. Then too the screen reads its list again, where the
 * invite is open now.
 */
export async function firstLinkAction(
  inviteId: string,
  _prev: ResendState,
  _form: FormData,
): Promise<ResendState> {
  return await issueLink(
    inviteId,
    issueFirstInviteLink,
    "issueFirstInviteLink",
  );
}

/**
 * The invite's link by `issue`. Its id comes from the browser (the row binds
 * it there), so anything but a uuid (`isUuid`, any the database writes) is
 * refused here, as no open invite, before the database is asked or anything
 * is logged; `label` names the write in the log.
 */
async function issueLink(
  inviteId: string,
  issue: typeof issueFirstInviteLink,
  label: string,
): Promise<ResendState> {
  if (!isUuid(inviteId)) return { failure: "notOpen" };
  const actor = await inviter();
  if ("failure" in actor) return { failure: actor.failure };
  try {
    const result = await issue(actor.userId, inviteId);
    if (!result.ok) {
      if (result.error === "linked") refresh();
      return {
        failure: result.error === "hasOwner" ? "notAllowed" : result.error,
      };
    }
    const link = await linkFor(result.token, result.phone);
    // The invite is open again: the screen re-reads its list and counts.
    refresh();
    return { link };
  } catch (error) {
    console.error(
      `${label} failed`,
      error instanceof Error ? error.message : "unknown",
    );
    return { failure: "failed" };
  }
}

/*
 * Team changes (Orel, 14 November 2026): taking someone off the team,
 * changing their role, cancelling an invite. Each is bound on its page to the
 * business the screen was drawn for (payroll P3b, as /manage/access binds
 * its writes): one held for its undo, or sent from a tab left open, may
 * arrive after the person switched business, and is refused then
 * ("businessChanged"), never made in the other. Who may act on whom is the
 * rule of inviting (`canRemoveMember`, `mayChangeRole`, `canCancelInvite`):
 * the screens offer only what it allows, and the database checks it again,
 * with the secret key, for the signed-in person.
 */

const memberChange = z.object({ business: z.uuid(), person: z.uuid() });
/** A built-in role, or one the business named, by its id, on its base. */
const roleChoice = z.object({
  role: z.enum(ROLES),
  namedRole: z.uuid().nullable(),
});
const roleChange = memberChange.extend({ to: roleChoice, seen: roleChoice });
/** A name as typed, or none; `parseTeamName` reads it after. */
const nameChange = memberChange.extend({
  to: z.string().max(400).nullable(),
  seen: z.string().max(400).nullable(),
});
const inviteCancel = z.object({ business: z.uuid(), invite: z.uuid() });

/**
 * The signed-in person who edits the team of `business` (`canEditTeam`), or
 * why they may not act.
 */
async function changer(
  business: string,
): Promise<{ userId: string } | { failure: TeamChangeActionFailure }> {
  const member = await currentMember();
  const membership = member?.membership;
  if (!member || !membership || !canEditTeam(membership)) {
    return { failure: "noAccess" };
  }
  if (membership.business.id !== business) {
    return { failure: "businessChanged" };
  }
  if (!canWrite(member.viewing)) return { failure: "viewOnly" };
  return { userId: member.userId };
}

/**
 * Someone who edits the team takes someone off it: their place stays,
 * inactive, with their hours and history; their shifts still to start come
 * off them and show as missing, and the schedule's other builders are told
 * (on the phone too). The person is told nothing. Nothing is revalidated:
 * any revalidation (`revalidatePath` of any path, or `refresh`) draws the
 * page the action came from again in its answer, and the person page reads
 * active people only, so it would turn at once into the page of someone no
 * longer on the team and lose the card with what came off them, the only
 * place the one who removed them reads how many shifts now need someone.
 * The Team screen is drawn afresh when "לרשימת הצוות" (a link) opens it, and
 * the person page says what happened again when opened afresh.
 */
export async function removeMemberAction(
  business: string,
  person: string,
): Promise<MemberChangeResult> {
  const parsed = memberChange.safeParse({ business, person });
  if (!parsed.success) return { ok: false, failure: "invalid" };
  const actor = await changer(parsed.data.business);
  if ("failure" in actor) return { ok: false, failure: actor.failure };
  if (parsed.data.person === actor.userId) {
    return { ok: false, failure: "yourself" };
  }
  try {
    const result = await removeMember(
      actor.userId,
      parsed.data.business,
      parsed.data.person,
    );
    if (!result.ok) return { ok: false, failure: result.error };
    pushSoon();
    return { ok: true, left: result.left };
  } catch (error) {
    console.error(
      "removeMember failed",
      error instanceof Error ? error.message : "unknown",
    );
    return { ok: false, failure: "failed" };
  }
}

/**
 * Someone who edits the team gives someone another role, built-in or one the
 * business named (`to`, the roles plan's R11b): `seen`, the role and named
 * role the screen showed, so one changed meanwhile stays ("changed", and the
 * page reads it again). Becoming an accountant takes them off the staff as
 * removing does, and the schedule's builders hear of the shifts it freed.
 * The page reads the person again.
 */
export async function setMemberRoleAction(
  business: string,
  person: string,
  to: unknown,
  seen: unknown,
): Promise<MemberChangeResult> {
  const parsed = roleChange.safeParse({ business, person, to, seen });
  if (!parsed.success) return { ok: false, failure: "invalid" };
  const actor = await changer(parsed.data.business);
  if ("failure" in actor) return { ok: false, failure: actor.failure };
  if (parsed.data.person === actor.userId) {
    return { ok: false, failure: "yourself" };
  }
  try {
    const result = await setMemberRole(
      actor.userId,
      parsed.data.business,
      parsed.data.person,
      parsed.data.to,
      parsed.data.seen,
    );
    if (!result.ok) {
      if (result.error === "changed") refresh();
      return { ok: false, failure: result.error };
    }
    // Shifts freed, swaps cancelled and swaps open again wrote lines for others.
    if (result.left.shifts + result.left.swaps + result.left.reopened > 0) {
      pushSoon();
    }
    revalidatePath("/team");
    refresh();
    return { ok: true, left: result.left };
  } catch (error) {
    console.error(
      "setMemberRole failed",
      error instanceof Error ? error.message : "unknown",
    );
    return { ok: false, failure: "failed" };
  }
}

/**
 * Someone who may change a person's role fixes the name the business shows
 * for them (ROADMAP "תיקון שם"): in this business only, everywhere in it;
 * their own name stays theirs. Never an owner's, who appears by their own
 * name (`canFixName`; the database refuses one, "notAllowed"). `to` null
 * keeps none of the business's own (the undo of a first fix); `seen`, the
 * name the screen showed, so one changed meanwhile stays ("changed", and the
 * page reads it again). Logged without the name, and nothing logged here
 * holds it either. The page reads the person again.
 */
export async function renameMemberAction(
  business: string,
  person: string,
  to: unknown,
  seen: unknown,
): Promise<MemberNameResult> {
  const parsed = nameChange.safeParse({ business, person, to, seen });
  if (!parsed.success) return { ok: false, failure: "invalid" };
  const actor = await changer(parsed.data.business);
  if ("failure" in actor) return { ok: false, failure: actor.failure };
  if (parsed.data.person === actor.userId) {
    return { ok: false, failure: "yourself" };
  }
  let name: string | null = null;
  if (parsed.data.to !== null) {
    const kept = parseTeamName(parsed.data.to);
    if (!kept.ok) return { ok: false, failure: "invalid" };
    name = kept.name;
  }
  try {
    const result = await setMemberName(
      actor.userId,
      parsed.data.business,
      parsed.data.person,
      name,
      parsed.data.seen,
    );
    if (!result.ok) {
      if (result.error === "changed") refresh();
      return { ok: false, failure: result.error };
    }
    if (result.changed) {
      revalidatePath("/team");
      refresh();
    }
    return { ok: true, changed: result.changed, name: result.name };
  } catch (error) {
    console.error(
      "setMemberName failed",
      error instanceof Error ? error.message : "unknown",
    );
    return { ok: false, failure: "failed" };
  }
}

/**
 * Someone who edits the team cancels an invite nobody claimed, open or expired: its
 * link stops working at once, and the number may be invited again. The
 * screen reads its list and counts again, also when it was claimed or
 * cancelled meanwhile ("gone").
 */
export async function cancelInviteAction(
  business: string,
  invite: string,
): Promise<InviteCancelResult> {
  const parsed = inviteCancel.safeParse({ business, invite });
  if (!parsed.success) return { ok: false, failure: "invalid" };
  const actor = await changer(parsed.data.business);
  if ("failure" in actor) return { ok: false, failure: actor.failure };
  try {
    const result = await cancelTeamInvite(actor.userId, parsed.data.invite);
    if (!result.ok) {
      if (result.error === "gone") refresh();
      return { ok: false, failure: result.error };
    }
    refresh();
    return { ok: true };
  } catch (error) {
    console.error(
      "cancelTeamInvite failed",
      error instanceof Error ? error.message : "unknown",
    );
    return { ok: false, failure: "failed" };
  }
}
