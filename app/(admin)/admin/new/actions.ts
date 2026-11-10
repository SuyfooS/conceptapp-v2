"use server";

import { createBusiness, getPlatformStaff } from "@db/admin";
import { onAnotherStaff } from "@db/invites";
import {
  NEW_BUSINESS_FIELDS,
  type NewBusinessErrors,
  parseNewBusiness,
} from "@domain/business";
import { platformCan } from "@domain/platform";
import { redirect } from "next/navigation";

export type NewBusinessState = {
  errors?: NewBusinessErrors;
  /**
   * With `errors.staff` "elsewhere": the staff list's numbers already on
   * another business's staff (E.164), to name them.
   */
  elsewhere?: string[];
  /** A problem that is not about one field. */
  failure?: "failed" | "noPermission";
};

/**
 * The wizard's last step: check who is asking and what they typed, then
 * open the business and invite its staff with the secret key
 * (`createBusiness`). A number on the list that is on another business's
 * staff can't be on this one's too (one place on a staff per login, payroll
 * P3b): the list goes back with those numbers named, before anything is
 * written, as the Team screen and the business's page in the console say it
 * for one person. On success the business's checklist opens; otherwise the
 * form goes back to the step with the first error.
 */
export async function createBusinessAction(
  _prev: NewBusinessState,
  form: FormData,
): Promise<NewBusinessState> {
  const staff = await getPlatformStaff();
  if (!staff || !platformCan(staff.role, "businesses.create")) {
    return { failure: "noPermission" };
  }

  const parsed = parseNewBusiness(
    Object.fromEntries(NEW_BUSINESS_FIELDS.map((f) => [f, form.get(f)])),
  );
  if (!parsed.ok) return { errors: parsed.errors };

  let result: Awaited<ReturnType<typeof createBusiness>>;
  try {
    const elsewhere = await onAnotherStaff(parsed.value.staff);
    if (elsewhere.length > 0) {
      return { errors: { staff: "elsewhere" }, elsewhere };
    }
    result = await createBusiness(staff.userId, parsed.value);
  } catch (error) {
    console.error("createBusiness failed", (error as Error).message);
    return { failure: "failed" };
  }
  if (!result.ok) return { errors: { slug: "taken" } };

  redirect(`/admin/businesses/${parsed.value.slug}?created=1`);
}
