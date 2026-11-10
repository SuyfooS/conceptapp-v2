"use server";

import type { PayRole } from "@domain/payroll-access";
import type { AccessResult } from "../../../../(app)/manage/access/access-types";

// Stand-ins for the demo: every change goes through, nothing is stored.

export async function demoSetRolePay(
  _role: PayRole,
  _granted: boolean,
): Promise<AccessResult> {
  return { ok: true };
}

export async function demoSetPersonalPay(
  _person: string,
  _granted: boolean,
): Promise<AccessResult> {
  return { ok: true };
}
