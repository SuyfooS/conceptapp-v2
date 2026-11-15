"use server";

import { isUuid } from "@domain/activity";
import { signInPath } from "@domain/passive-sign-in";
import { canWrite } from "@domain/view-as";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { rememberBusiness, rememberDepartureSeen } from "./business-cookie";
import { currentDeparture } from "./departures";
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

/**
 * Someone taken off the team of a business, still in another, saw it said
 * (`DepartureNotice`, Orel's decision 3 of 14 November 2026): the moment of
 * the departure the notice told, worked out again here rather than taken
 * from the form, is kept on this device (`rememberDepartureSeen`), so each is
 * said once, and the screen is drawn again without it, or with the next.
 * Nothing while viewing as someone, whom it never tells.
 */
export async function seenDepartureAction(): Promise<void> {
  const member = await currentMember();
  if (!member) redirect(signInPath);
  if (canWrite(member.viewing) && member.membership) {
    const told = await currentDeparture(member);
    if (told) await rememberDepartureSeen(told.leftAt);
  }
  refresh();
}
