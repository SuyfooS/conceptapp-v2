"use server";

import { isUuid } from "@domain/activity";
import { signInPath } from "@domain/passive-sign-in";
import { canWrite } from "@domain/view-as";
import { redirect } from "next/navigation";
import { rememberBusiness } from "./business-cookie";
import { currentMember } from "./member";

/**
 * Switch to another of the person's businesses (payroll P3b): the form's
 * `business` is checked against their active memberships, remembered in the
 * cookie, and the app opens that business's Home, read afresh. Anything else
 * (a business they aren't in, a view as someone, which changes nothing)
 * leaves the choice as it was and opens Home all the same. A form post, never
 * a GET that changes what the app opens.
 */
export async function chooseBusinessAction(form: FormData): Promise<void> {
  const member = await currentMember();
  if (!member) redirect(signInPath);
  const id = form.get("business");
  if (
    canWrite(member.viewing) &&
    isUuid(id) &&
    member.businesses.some((own) => own.business.id === id)
  ) {
    await rememberBusiness(id);
  }
  redirect("/home");
}
