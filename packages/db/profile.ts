import "server-only";
import type { ProfilePatch } from "@domain/profile";
import { isMissingFunction } from "./missing";
import { createAdminClient } from "./supabase/admin";

/*
 * The profile's line, cover and form of address (issue #82, H2). Every write
 * runs with the secret key, through the database's own functions
 * (20261109000400_profile_about.sql), which hold the rules: the table's
 * checks, demo people keeping their name and writing no line, and who may
 * clear someone's line. Nothing written here is logged, the line least of all.
 */

export type ProfileWritten =
  | { ok: true }
  | {
      ok: false;
      failure:
        | "demo"
        | "invalid"
        | "noAccess"
        | "changed"
        | "notYet"
        | "failed";
    };

function written(
  error: { code?: string; message: string } | null,
  what: string,
): ProfileWritten {
  if (!error) return { ok: true };
  // A demo business that keeps its people: no line, no new name.
  if (error.code === "55000") return { ok: false, failure: "demo" };
  // The table's checks, or a field the function doesn't take.
  if (error.code === "23514" || error.code === "22023") {
    return { ok: false, failure: "invalid" };
  }
  if (error.code === "42501") return { ok: false, failure: "noAccess" };
  // The line was rewritten since the manager read it, so it stays.
  if (error.code === "40001") return { ok: false, failure: "changed" };
  // Before the migration reaches the project.
  if (isMissingFunction(error)) return { ok: false, failure: "notYet" };
  // The message only: the details could hold the row, and with it the line.
  console.error(`${what} failed`, error.message);
  return { ok: false, failure: "failed" };
}

/**
 * The signed-in person changes their own profile; what the patch leaves out
 * stays. Callers make sure `actorId` is that person, not someone viewing as
 * a role.
 */
export async function setOwnProfile(
  actorId: string,
  patch: ProfilePatch,
): Promise<ProfileWritten> {
  const { error } = await createAdminClient().rpc("set_own_profile", {
    actor: actorId,
    patch,
  });
  return written(error, "set_own_profile");
}

/**
 * An owner or manager clears a colleague's line in their business, when it
 * is abusive; the database logs it without the text. `seenBio` is the line
 * as they read it: one rewritten since stays ("changed"). Clearing a line
 * that is already gone changes nothing.
 */
export async function clearProfileBio(
  actorId: string,
  businessId: string,
  personId: string,
  seenBio: string,
): Promise<ProfileWritten> {
  const { error } = await createAdminClient().rpc("clear_profile_bio", {
    actor: actorId,
    business: businessId,
    person: personId,
    seen: seenBio,
  });
  return written(error, "clear_profile_bio");
}
