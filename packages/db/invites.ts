import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { INVITE_STATUSES, isInviteToken } from "@domain/invites";
import { ROLES, type Role } from "@domain/modules";
import { z } from "zod";
import { createAdminClient } from "./supabase/admin";

/** A new link token: 32 random bytes, base64url (see @domain/invites). */
export function newInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What the database stores for a token: its SHA-256 in hex. */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Issue a fresh link for an invite nobody claimed, open or expired: the old
 * link stops working and the invite gets another 14 days
 * (`public.issue_invite_link`). Returns the token to put in the link and the
 * number to send it to. Runs with the secret key: callers check the person
 * may invite staff first, and the database checks again that `actorId` is on
 * the team. Throws when the invite was claimed or is unknown.
 */
export async function issueInviteLink(
  actorId: string,
  inviteId: string,
): Promise<{ token: string; phone: string }> {
  const token = newInviteToken();
  const { data, error } = await createAdminClient().rpc("issue_invite_link", {
    actor: actorId,
    invite: inviteId,
    new_token_hash: hashInviteToken(token),
  });
  if (error) throw new Error(`Could not issue invite link: ${error.message}`);
  return { token, phone: z.string().parse(data) };
}

const InviteRow = z.object({
  id: z.uuid(),
  phone: z.string(),
  role: z.enum(ROLES),
  name: z.string().nullable(),
  business: z.object({ id: z.uuid(), name: z.string(), accent: z.string() }),
  status: z.enum(INVITE_STATUSES),
});

export type Invite = {
  id: string;
  phone: string;
  role: Role;
  name: string | null;
  business: { id: string; name: string; accent: string };
  status: (typeof INVITE_STATUSES)[number];
};

/**
 * The invite behind a link, or null for a malformed token or one nobody
 * issued (or that a newer link replaced). Read with the secret key: the
 * person opening the link is usually not signed in yet.
 */
export async function findInvite(token: string): Promise<Invite | null> {
  if (!isInviteToken(token)) return null;
  const { data, error } = await createAdminClient().rpc("invite_by_token", {
    token_hash: hashInviteToken(token),
  });
  if (error) throw error;
  return data === null ? null : InviteRow.parse(data);
}

/**
 * Make sure the invited number has an account, so the sign-in code can be
 * sent to it: sign-in itself never creates accounts. Only for a number
 * taken from an open invite.
 */
export async function ensurePhoneAccount(phone: string): Promise<void> {
  const { error } = await createAdminClient().auth.admin.createUser({
    phone,
    phone_confirm: true,
  });
  if (error && error.code !== "phone_exists") {
    throw new Error(`Could not prepare the account: ${error.message}`);
  }
}

export type ClaimResult =
  | { ok: true; businessId: string }
  | { ok: false; error: "notOpen" | "otherNumber" };

/**
 * The signed-in person joins the invite's business with its role, in one
 * transaction (`public.claim_invite`). The database refuses a link that is
 * used, expired or replaced, and anyone but the invited number.
 */
export async function claimInvite(
  token: string,
  userId: string,
): Promise<ClaimResult> {
  if (!isInviteToken(token)) return { ok: false, error: "notOpen" };
  const { data, error } = await createAdminClient().rpc("claim_invite", {
    token_hash: hashInviteToken(token),
    claimant: userId,
  });
  if (error) {
    if (error.code === "P0002") return { ok: false, error: "notOpen" };
    if (error.code === "42501") return { ok: false, error: "otherNumber" };
    throw new Error(`Could not claim invite: ${error.message}`);
  }
  return { ok: true, businessId: z.uuid().parse(data) };
}

export type TeamInviteResult =
  | { ok: true; token: string; phone: string }
  | { ok: false; error: "alreadyMember" | "notAllowed" | "notOpen" };

/** The database's refusals, as the Team screen explains them. */
function teamInviteError(code: string | undefined) {
  if (code === "23505") return "alreadyMember" as const;
  if (code === "42501") return "notAllowed" as const;
  if (code === "P0002") return "notOpen" as const;
  return null;
}

/**
 * An owner or manager invites someone to their business from the Team
 * screen (`public.team_invite`): a new invite, or a fresh name, role and
 * link for the number's unclaimed one. Returns the token for the link.
 * Runs with the secret key: callers check the role with `parseTeamInvite`
 * first, and the database checks it again against the actor's membership.
 */
export async function inviteToTeam(
  actorId: string,
  businessId: string,
  invite: { name: string; phone: string; role: Role },
): Promise<TeamInviteResult> {
  const token = newInviteToken();
  const { error } = await createAdminClient().rpc("team_invite", {
    actor: actorId,
    business: businessId,
    invite_name: invite.name,
    invite_phone: invite.phone,
    invite_role: invite.role,
    new_token_hash: hashInviteToken(token),
  });
  if (error) {
    const known = teamInviteError(error.code);
    if (known) return { ok: false, error: known };
    throw new Error(`Could not invite: ${error.message}`);
  }
  return { ok: true, token, phone: invite.phone };
}

/**
 * A fresh link for an invite nobody claimed, open or expired, from an
 * owner or manager of its business (`public.team_invite_link`). The old
 * link stops working and the invite gets another 14 days.
 */
export async function issueTeamInviteLink(
  actorId: string,
  inviteId: string,
): Promise<TeamInviteResult> {
  const token = newInviteToken();
  const { data, error } = await createAdminClient().rpc("team_invite_link", {
    actor: actorId,
    invite: inviteId,
    new_token_hash: hashInviteToken(token),
  });
  if (error) {
    const known = teamInviteError(error.code);
    if (known) return { ok: false, error: known };
    throw new Error(`Could not issue invite link: ${error.message}`);
  }
  return { ok: true, token, phone: z.string().parse(data) };
}

/**
 * Someone on the ConceptApp team invites a number to a business from the
 * console, in any role (`public.admin_invite`): a new invite, or a fresh
 * name, role and link for the invite the number already has, open or
 * expired. Returns the token for the link. Runs with the secret key: callers
 * check the person may invite staff first, and the database checks again
 * that `actorId` is on the team.
 */
export async function inviteFromConsole(
  actorId: string,
  businessId: string,
  invite: { name: string; phone: string; role: Role },
): Promise<TeamInviteResult> {
  const token = newInviteToken();
  const { error } = await createAdminClient().rpc("admin_invite", {
    actor: actorId,
    business: businessId,
    invite_name: invite.name,
    invite_phone: invite.phone,
    invite_role: invite.role,
    new_token_hash: hashInviteToken(token),
  });
  if (error) {
    const known = teamInviteError(error.code);
    if (known) return { ok: false, error: known };
    throw new Error(`Could not invite: ${error.message}`);
  }
  return { ok: true, token, phone: invite.phone };
}

/**
 * Whether the number is already active in another business. Such a person
 * would never see a second one: the app opens the oldest membership, and
 * there is no switching between businesses yet.
 */
export async function activeElsewhere(
  phone: string,
  businessId: string,
): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("memberships")
    .select("business_id, profiles!inner(phone)")
    .eq("active", true)
    .eq("profiles.phone", phone)
    .neq("business_id", businessId)
    .limit(1);
  if (error) throw error;
  return data.length > 0;
}
