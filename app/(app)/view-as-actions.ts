"use server";

import { stopViewing } from "@db/view-as";
import { redirect } from "next/navigation";
import { currentMember } from "./member";

/**
 * End the ConceptApp team member's view session (recorded in the audit
 * log) and go back to the business's page in the console.
 */
export async function endViewAsAction(): Promise<never> {
  const member = await currentMember();
  if (!member?.viewing) redirect("/home");
  await stopViewing(member.userId);
  redirect(`/admin/businesses/${member.viewing.businessSlug}`);
}
