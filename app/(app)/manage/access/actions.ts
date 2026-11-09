"use server";

import { setPersonalPayAccess, setRolePayAccess } from "@db/payroll";
import { PAY_ROLES, type PayRole } from "@domain/payroll-access";
import { z } from "zod";
import { pushSoon } from "../../../push/server";
import { accessAccess } from "./access";
import type { AccessResult } from "./access-types";

const roleChange = z.object({
  role: z.enum(PAY_ROLES),
  granted: z.boolean(),
});
const personChange = z.object({ person: z.uuid(), granted: z.boolean() });

/*
 * The screen keeps what it shows itself (each switch and row changes at
 * once, with its undo), so nothing here asks for the page again.
 */

/** The owner gives everyone in a role pay access, or takes it back. */
export async function setRolePayAction(
  role: PayRole,
  granted: boolean,
): Promise<AccessResult> {
  const parsed = roleChange.safeParse({ role, granted });
  if (!parsed.success) return { ok: false, failure: "failed" };
  const access = await accessAccess();
  if (!access) return { ok: false, failure: "noAccess" };
  if (access.viewOnly) return { ok: false, failure: "viewOnly" };
  const result = await setRolePayAccess(
    access.userId,
    access.businessId,
    parsed.data.role,
    parsed.data.granted,
  );
  return result;
}

/**
 * The owner gives one person pay access, or takes it back. Giving it tells
 * them (`access.pay_granted`), so their phone hears of it soon.
 */
export async function setPersonalPayAction(
  person: string,
  granted: boolean,
): Promise<AccessResult> {
  const parsed = personChange.safeParse({ person, granted });
  if (!parsed.success) return { ok: false, failure: "failed" };
  const access = await accessAccess();
  if (!access) return { ok: false, failure: "noAccess" };
  if (access.viewOnly) return { ok: false, failure: "viewOnly" };
  const result = await setPersonalPayAccess(
    access.userId,
    access.businessId,
    parsed.data.person,
    parsed.data.granted,
  );
  if (result.ok && parsed.data.granted) pushSoon();
  return result;
}
