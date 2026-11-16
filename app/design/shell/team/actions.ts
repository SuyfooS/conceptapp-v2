"use server";

import { randomBytes } from "node:crypto";
import { inviteLink } from "@domain/invites";
import type { ProfileSaveResult } from "@domain/profile";
import { parseTeamInvite, type RoleChoice } from "@domain/team";
import { requestOrigin } from "@/app/origin";
import type { InviteState, ResendState } from "../../../(app)/team/actions";
import {
  type InviteCancelResult,
  type MemberChangeResult,
  NOTHING_LEFT,
} from "../../../(app)/team/team-change-types";
import { demoNamedRole, shiftsAheadOf, swapsLeftOf } from "../data";

// Stand-ins for the Team screen's actions on the design demo: the same
// checks, and a link that leads nowhere. Nothing is stored.

const demoLink = async () =>
  inviteLink(await requestOrigin(), randomBytes(32).toString("base64url"));

export async function demoInviteAction(
  _prev: InviteState,
  form: FormData,
): Promise<InviteState> {
  const values = {
    name: String(form.get("name") ?? ""),
    phone: String(form.get("phone") ?? ""),
    role: String(form.get("role") ?? ""),
  };
  const parsed = parseTeamInvite(values, { role: "owner", perms: [] }, [
    demoNamedRole,
  ]);
  if (!parsed.ok) return { errors: parsed.errors, values };
  return {
    done: {
      name: parsed.value.name,
      phone: parsed.value.phone,
      link: await demoLink(),
    },
  };
}

export async function demoResendAction(
  _inviteId: string,
  _prev: ResendState,
  _form: FormData,
): Promise<ResendState> {
  return { link: await demoLink() };
}

/** Deleting a line on a demo profile: nothing is stored, so it comes back on reload. */
export async function demoClearBioAction(
  _personId: string,
  _seenBio: string,
): Promise<ProfileSaveResult> {
  return { ok: true };
}

/**
 * Taking someone off the demo's team: nothing is stored, so they are back on
 * reload. What came off them is what their page said would
 * (`shiftsAheadOf`), with the swap requests it settles (`swapsLeftOf`), and
 * nothing revalidates, as on the real page.
 */
export async function demoRemoveMemberAction(
  personId: string,
): Promise<MemberChangeResult> {
  return {
    ok: true,
    left: { ...shiftsAheadOf(personId), ...swapsLeftOf(personId) },
  };
}

/** Changing a role on the demo: shown at once, back as it was on reload. */
export async function demoSetMemberRoleAction(
  _personId: string,
  _to: RoleChoice,
  _seen: RoleChoice,
): Promise<MemberChangeResult> {
  return { ok: true, left: NOTHING_LEFT };
}

/** Deleting an invite on the demo: back on reload. */
export async function demoCancelInviteAction(
  _inviteId: string,
): Promise<InviteCancelResult> {
  return { ok: true };
}
