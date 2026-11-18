"use server";

import { getPlatformStaff } from "@db/admin";
import { setPersonalPayAccess, setRolePayAccess } from "@db/payroll";
import { PAY_ROLES, type PayRole } from "@domain/payroll-access";
import { consolePayAccess } from "@domain/platform";
import { z } from "zod";
import type { AccessResult } from "@/app/(app)/manage/access/access-types";
import { pushSoon } from "@/app/push/server";
import { payAccessIn } from "./pay-access";

const roleChange = z.object({
  business: z.uuid(),
  role: z.enum(PAY_ROLES),
  granted: z.boolean(),
});
const personChange = z.object({
  business: z.uuid(),
  person: z.uuid(),
  granted: z.boolean(),
});

/*
 * Who sees pay, from the console (Orel's payroll decision 1, 9 November 2026:
 * the owner, and the ConceptApp team from the console). The same screen as
 * the owner's keeps what it shows itself, so nothing here reads the page
 * again. Each action is bound on the page to the business it was drawn for,
 * and checks the team member and that it applies there again: the page's
 * checks are never trusted. The
 * write names the team member as its actor, so the business's log says the
 * ConceptApp team did it, and the database checks again that they are on the
 * team (private.check_permission_giver).
 */

/**
 * The team member signed in, when their role may change who sees pay
 * (`consolePayAccess`) and it applies in the business: its failure
 * otherwise, "viewOnly" for a role that only reads businesses, and
 * "notInUse" where no module that is on uses it any more, as the page
 * decides (`payAccessIn`), so a screen drawn before the time clock and chat
 * went off writes nothing.
 */
async function payAccessChanger(
  business: string,
): Promise<
  | { ok: true; userId: string }
  | { ok: false; failure: "noAccess" | "viewOnly" | "notInUse" }
> {
  const staff = await getPlatformStaff();
  const may = consolePayAccess(staff?.role ?? null);
  if (!staff || may === null) return { ok: false, failure: "noAccess" };
  if (may !== "change") return { ok: false, failure: "viewOnly" };
  // Read with the secret key, only now that they are on the team.
  if (!(await payAccessIn(business))) return { ok: false, failure: "notInUse" };
  return { ok: true, userId: staff.userId };
}

/** Someone on the team gives everyone in a role pay access, or takes it back. */
export async function setTeamRolePayAction(
  business: string,
  role: PayRole,
  granted: boolean,
): Promise<AccessResult> {
  const parsed = roleChange.safeParse({ business, role, granted });
  if (!parsed.success) return { ok: false, failure: "failed" };
  const staff = await payAccessChanger(parsed.data.business);
  if (!staff.ok) return staff;
  return setRolePayAccess(
    staff.userId,
    parsed.data.business,
    parsed.data.role,
    parsed.data.granted,
  );
}

/**
 * Someone on the team gives one person pay access, or takes it back. Giving
 * it tells them (`access.pay_granted`, from the ConceptApp team), so their
 * phone hears of it soon, as when the owner gives it.
 */
export async function setTeamPersonalPayAction(
  business: string,
  person: string,
  granted: boolean,
): Promise<AccessResult> {
  const parsed = personChange.safeParse({ business, person, granted });
  if (!parsed.success) return { ok: false, failure: "failed" };
  const staff = await payAccessChanger(parsed.data.business);
  if (!staff.ok) return staff;
  // Someone on the team who is also in the business: never their own, which
  // the database refuses too, in words of its own rather than its code's.
  if (parsed.data.person.toLowerCase() === staff.userId.toLowerCase()) {
    return { ok: false, failure: "self" };
  }
  const result = await setPersonalPayAccess(
    staff.userId,
    parsed.data.business,
    parsed.data.person,
    parsed.data.granted,
  );
  if (result.ok && parsed.data.granted) pushSoon();
  return result;
}
