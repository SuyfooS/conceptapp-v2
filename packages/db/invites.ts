import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { INVITE_STATUSES, isInviteToken } from "@domain/invites";
import { isStaff, ROLES, type Role } from "@domain/modules";
import { z } from "zod";
import { isMissingFunction } from "./missing";
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
 * the team. Refused in a demo business, for an owner invite nobody may claim
 * any more, and for an invite whose role the business named was removed
 * since (`roleGone`, 22023 with hint `archived`; the roles plan's R11b): the
 * number is invited again instead. An invite closed only because someone
 * other than an owner sent it to a role that sees pay becomes the team's,
 * and opens again (the roles plan's R6). Throws when the invite was claimed
 * or is unknown.
 */
export async function issueInviteLink(
  actorId: string,
  inviteId: string,
): Promise<
  | { ok: true; token: string; phone: string }
  | { ok: false; error: "demo" | "hasOwner" | "roleGone" }
> {
  const token = newInviteToken();
  const { data, error } = await createAdminClient().rpc("issue_invite_link", {
    actor: actorId,
    invite: inviteId,
    new_token_hash: hashInviteToken(token),
  });
  if (error) {
    const known = teamInviteError(error.code, error.hint);
    if (known === "demo" || known === "hasOwner" || known === "roleGone") {
      return { ok: false, error: known };
    }
    throw new Error(`Could not issue invite link: ${error.message}`);
  }
  return { ok: true, token, phone: z.string().parse(data) };
}

// Before 20261115001600_named_roles_give.sql reaches a project the invite
// names no role of the business's own: its names are missing.
const InviteRow = z.object({
  id: z.uuid(),
  phone: z.string(),
  role: z.enum(ROLES),
  role_name: z.string().nullable().optional(),
  role_name_en: z.string().nullable().optional(),
  name: z.string().nullable(),
  business: z.object({ id: z.uuid(), name: z.string(), accent: z.string() }),
  status: z.enum(INVITE_STATUSES),
});

export type Invite = {
  id: string;
  phone: string;
  role: Role;
  /**
   * The names of the role the business named that the invite gives (the
   * roles plan's R11b), built on `role`; null for the role itself.
   */
  namedRole: { name: string; nameEn: string | null } | null;
  name: string | null;
  business: { id: string; name: string; accent: string };
  status: (typeof INVITE_STATUSES)[number];
};

/**
 * The invite behind a link, or null for a malformed token or one nobody
 * issued (or that a newer link replaced). Read with the secret key: the
 * person opening the link is usually not signed in yet. An invite to a role
 * the business named says its names, and one whose role was removed since
 * reads as expired.
 */
export async function findInvite(token: string): Promise<Invite | null> {
  if (!isInviteToken(token)) return null;
  const { data, error } = await createAdminClient().rpc("invite_by_token", {
    token_hash: hashInviteToken(token),
  });
  if (error) throw error;
  if (data === null) return null;
  const { role_name, role_name_en, ...row } = InviteRow.parse(data);
  return {
    ...row,
    namedRole: role_name
      ? { name: role_name, nameEn: role_name_en ?? null }
      : null,
  };
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
  | {
      ok: false;
      error: "notOpen" | "otherNumber" | "shiftsLeft" | "elsewhere";
    };

/**
 * The signed-in person joins the invite's business with its role, in one
 * transaction (`public.claim_invite`). The database refuses a link that is
 * used, expired or replaced, anyone but the invited number, someone who
 * comes back as an accountant with an open entry or shifts still ahead, a
 * staff place for someone on another business's staff (23505), and, as not
 * open, an invite to a role that sees pay that neither an owner nor the team
 * sent (the roles plan's R6). The invite's name, read as `parseTeamName`
 * keeps one, becomes the business's own name for them
 * (`public.member_names`) unless it is their own or they join as an owner;
 * their own name stays, or is the invite's if they had none
 * (20261127000500_invite_names.sql).
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
    if (error.code === "55000") return { ok: false, error: "shiftsLeft" };
    if (error.code === "23505") return { ok: false, error: "elsewhere" };
    throw new Error(`Could not claim invite: ${error.message}`);
  }
  return { ok: true, businessId: z.uuid().parse(data) };
}

export type TeamInviteResult =
  | { ok: true; token: string; phone: string }
  | {
      ok: false;
      error:
        | "alreadyMember"
        | "notAllowed"
        | "givesPay"
        | "notOpen"
        | "demo"
        | "hasOwner"
        // The role the business named was removed since the screen was drawn.
        | "roleGone";
    };

/**
 * Whether the business takes invites (`public.closed_to_invites`): false for
 * a demo business its definition doesn't open (every hosted one), so the
 * Team screen offers no invite and no new link there (#80). The database
 * refuses them anyway (55000, `demo`). Before the migration reaches a
 * project, true, as the screen was.
 */
export async function invitesOpen(businessId: string): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("closed_to_invites", {
    business: businessId,
  });
  if (error) {
    if (isMissingFunction(error)) return true;
    throw error;
  }
  return !data;
}

/**
 * The database's refusals, as the screens explain them: a demo business takes
 * no invites, the console makes no second owner, nobody but an owner gives a
 * role that sees pay (42501, hint `pay`; the roles plan's R6), and a role
 * the business named that was removed meanwhile is given to nobody (22023,
 * hint `archived`; R11b).
 */
function teamInviteError(code: string | undefined, hint?: string | null) {
  if (code === "23505") return "alreadyMember" as const;
  if (code === "42501") {
    return hint === "pay" ? ("givesPay" as const) : ("notAllowed" as const);
  }
  if (code === "P0002") return "notOpen" as const;
  if (code === "55000") return "demo" as const;
  if (code === "23P01") return "hasOwner" as const;
  if (code === "22023" && hint === "archived") return "roleGone" as const;
  return null;
}

/**
 * Someone who edits the team invites someone to their business from the
 * Team screen (`public.team_invite`): a new invite, or a fresh name, role and
 * link for the number's unclaimed one, to a built-in role or to one the
 * business named (`namedRole`, on its base `role`; the roles plan's R11b).
 * Returns the token for the link. Runs with the secret key: callers check
 * the role with `parseTeamInvite` first, and the database checks it again
 * against the actor's membership (team.edit and the rank rule), that nobody
 * but an owner gives a role that sees pay (`givesPay`) or holds what they
 * don't, and that a named role is live (`roleGone`).
 */
export async function inviteToTeam(
  actorId: string,
  businessId: string,
  invite: {
    name: string;
    phone: string;
    role: Role;
    namedRole?: string | null;
  },
): Promise<TeamInviteResult> {
  const token = newInviteToken();
  const { error } = await createAdminClient().rpc("team_invite", {
    actor: actorId,
    business: businessId,
    invite_name: invite.name,
    invite_phone: invite.phone,
    invite_role: invite.role,
    new_token_hash: hashInviteToken(token),
    // Only for a named role: a project before its migration takes the rest.
    ...(invite.namedRole ? { invite_named: invite.namedRole } : {}),
  });
  if (error) {
    const known = teamInviteError(error.code, error.hint);
    if (known) return { ok: false, error: known };
    throw new Error(`Could not invite: ${error.message}`);
  }
  return { ok: true, token, phone: invite.phone };
}

/**
 * A fresh link for an invite nobody claimed, open or expired, from someone
 * who edits its business's team and gives its role
 * (`public.team_invite_link`; `givesPay` for a role that sees pay, which
 * only an owner gives). The old link stops working and the invite gets
 * another 14 days.
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
    const known = teamInviteError(error.code, error.hint);
    if (known) return { ok: false, error: known };
    throw new Error(`Could not issue invite link: ${error.message}`);
  }
  return { ok: true, token, phone: z.string().parse(data) };
}

/**
 * The first link of an invite nobody got one for yet (`link_pending`: the
 * console's wizard saved it so), as `issueTeamInviteLink`, through
 * `public.team_invite_first_link`: `linked` once any link was made for it
 * meanwhile (another screen, someone else, the console), and then none is
 * made, so the link already sent keeps working. Only someone who may send
 * the invite's links learns that; anyone else is refused as ever.
 */
export async function issueFirstInviteLink(
  actorId: string,
  inviteId: string,
): Promise<TeamInviteResult | { ok: false; error: "linked" }> {
  const token = newInviteToken();
  const { data, error } = await createAdminClient().rpc(
    "team_invite_first_link",
    {
      actor: actorId,
      invite: inviteId,
      new_token_hash: hashInviteToken(token),
    },
  );
  if (error) {
    if (error.code === "P0002" && error.hint === "linked") {
      return { ok: false, error: "linked" };
    }
    const known = teamInviteError(error.code, error.hint);
    if (known) return { ok: false, error: known };
    throw new Error(`Could not issue a first invite link: ${error.message}`);
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
    const known = teamInviteError(error.code, error.hint);
    if (known) return { ok: false, error: known };
    throw new Error(`Could not invite: ${error.message}`);
  }
  return { ok: true, token, phone: invite.phone };
}

/**
 * Whether inviting the number in this role would put them on a second staff
 * (payroll P3b; Orel, 8 November 2026): one place on a staff per login, and
 * any number as an accountant. False for an accountant's invite, and false
 * when every other business has them as its accountant. The database refuses
 * the claim anyway (`memberships_one_staff_idx`); this says it before the
 * link goes out, in the console only ("הוספת אדם" on a business's page). The
 * Team screen never asks (#80): an owner or manager doesn't learn where else
 * a number works, and /join tells the person themselves. It asks
 * `public.admin_staff_elsewhere`, which checks that `actorId` is on the
 * ConceptApp team, with the number in the request's body and this business
 * left out (`except_business`), never in an address a request log keeps
 * (known issue 109; the read before put it in a GET's query string). Before
 * the function reaches a project it finds no other staff, as
 * `onAnotherStaff` does, and asks no other way.
 */
export async function activeElsewhere(
  actorId: string,
  phone: string,
  businessId: string,
  role: Role,
): Promise<boolean> {
  if (!isStaff(role)) return false;
  const { data, error } = await createAdminClient().rpc(
    "admin_staff_elsewhere",
    { actor: actorId, phones: [phone], except_business: businessId },
  );
  if (error) {
    if (isMissingFunction(error)) return false;
    // The function's refusals hold no number, nor does this.
    throw new Error(`Could not ask about other staffs: ${error.message}`);
  }
  return z.array(z.string()).parse(data).includes(phone);
}

/**
 * Which of the staff list's numbers are on a business's staff already, for a
 * business not opened yet (the console's new-business wizard): `activeElsewhere`
 * for the whole list in one call, `public.admin_staff_elsewhere`, which asks
 * that `actorId` is on the ConceptApp team. The numbers go in the request's
 * body, never in an address a request log keeps (inviting from a list, part
 * 6; the read before put them in a GET's query string), and nothing writes
 * them down. Only the entries in a staff role count: an accountant may keep
 * the books of any number of businesses. The numbers come back as given
 * (E.164), in the list's order. Before the function reaches a project none
 * is found, never asked another way: a claim refuses a second place on a
 * staff anyway, and /join says why.
 */
export async function onAnotherStaff(
  actorId: string,
  entries: readonly { phone: string; role: Role }[],
): Promise<string[]> {
  const phones = [
    ...new Set(entries.filter((e) => isStaff(e.role)).map((e) => e.phone)),
  ];
  if (phones.length === 0) return [];
  const { data, error } = await createAdminClient().rpc(
    "admin_staff_elsewhere",
    { actor: actorId, phones },
  );
  if (error) {
    if (isMissingFunction(error)) return [];
    // The function's refusals hold no number, nor does this.
    throw new Error(`Could not ask about other staffs: ${error.message}`);
  }
  const taken = new Set(z.array(z.string()).parse(data));
  return phones.filter((phone) => taken.has(phone));
}
