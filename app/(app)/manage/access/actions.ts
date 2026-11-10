"use server";

import { setPersonalPayAccess, setRolePayAccess } from "@db/payroll";
import { PAY_ROLES, type PayRole } from "@domain/payroll-access";
import { z } from "zod";
import { pushSoon } from "../../../push/server";
import { accessAccess } from "./access";
import type { AccessResult } from "./access-types";

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
 * The screen keeps what it shows itself (each switch and row changes at
 * once, with its undo), so nothing here asks for the page again. Each action
 * is bound on the page to the business the screen was drawn for (payroll
 * P3b): the business the app opens is one cookie for the whole browser, so a
 * write held for its undo, or sent from a tab left open, may arrive after the
 * person switched business. It is refused then ("businessChanged"), never
 * written in the other business.
 */

/** The owner gives everyone in a role pay access, or takes it back. */
export async function setRolePayAction(
  business: string,
  role: PayRole,
  granted: boolean,
): Promise<AccessResult> {
  const parsed = roleChange.safeParse({ business, role, granted });
  if (!parsed.success) return { ok: false, failure: "failed" };
  const access = await accessAccess();
  if (!access) return { ok: false, failure: "noAccess" };
  if (access.businessId !== parsed.data.business) {
    return { ok: false, failure: "businessChanged" };
  }
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
  business: string,
  person: string,
  granted: boolean,
): Promise<AccessResult> {
  const parsed = personChange.safeParse({ business, person, granted });
  if (!parsed.success) return { ok: false, failure: "failed" };
  const access = await accessAccess();
  if (!access) return { ok: false, failure: "noAccess" };
  if (access.businessId !== parsed.data.business) {
    return { ok: false, failure: "businessChanged" };
  }
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
