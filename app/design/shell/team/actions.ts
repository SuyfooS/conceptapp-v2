"use server";

import { randomBytes } from "node:crypto";
import { inviteLink } from "@domain/invites";
import type { ProfileSaveResult } from "@domain/profile";
import { parseTeamInvite } from "@domain/team";
import { requestOrigin } from "@/app/origin";
import type { InviteState, ResendState } from "../../../(app)/team/actions";

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
  const parsed = parseTeamInvite(values, "owner");
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
