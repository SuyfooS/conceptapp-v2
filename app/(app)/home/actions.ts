"use server";

import { canWrite } from "@domain/view-as";
import { refresh } from "next/cache";
import { rememberFirstStepsHidden } from "../business-cookie";
import { currentMember } from "../member";

/**
 * The owner hid the first steps on Today: kept on this device for the
 * business open now (`rememberFirstStepsHidden`), and Today is drawn again
 * without them. It takes nothing from the page: the business is the
 * session's. Nothing for anyone signed out, viewing as someone or not an
 * owner, who never has the card.
 */
export async function hideFirstStepsAction(): Promise<void> {
  const member = await currentMember();
  const membership = member?.membership;
  if (!member || !canWrite(member.viewing) || membership?.role !== "owner") {
    return;
  }
  await rememberFirstStepsHidden(membership.business.id);
  refresh();
}
