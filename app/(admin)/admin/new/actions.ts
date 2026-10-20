"use server";

import { createBusiness, getPlatformStaff } from "@db/admin";
import {
  NEW_BUSINESS_FIELDS,
  type NewBusinessErrors,
  parseNewBusiness,
} from "@domain/business";
import { platformCan } from "@domain/platform";
import { redirect } from "next/navigation";

export type NewBusinessState = {
  errors?: NewBusinessErrors;
  /** A problem that is not about one field. */
  failure?: "failed" | "noPermission";
};

/**
 * The wizard's last step: check who is asking and what they typed, then
 * open the business and invite its staff with the secret key
 * (`createBusiness`). On success the business's checklist opens; otherwise
 * the form goes back to the step with the first error.
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
    result = await createBusiness(staff.userId, parsed.value);
  } catch (error) {
    console.error("createBusiness failed", (error as Error).message);
    return { failure: "failed" };
  }
  if (!result.ok) return { errors: { slug: "taken" } };

  redirect(`/admin/businesses/${parsed.value.slug}?created=1`);
}
