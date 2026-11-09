"use server";

import { notePayrollAccess, type PayViewKind } from "@db/payroll";
import { z } from "zod";
import { currentMember } from "../../member";
import { payAccess } from "./pay";

const viewed = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  kind: z.enum(["month", "person", "access"]),
});

/**
 * A pay screen is on screen: noted once a day, with the person's own session,
 * when they may open the pay screens. Called by the screen after it mounts
 * (`NoteView`), never while it renders. A view as an accountant is noted too,
 * as the team's own: it reads pay.
 */
export async function notePayViewAction(
  month: string,
  kind: PayViewKind,
): Promise<void> {
  const parsed = viewed.safeParse({ month, kind });
  if (!parsed.success) return;
  const member = await currentMember();
  const businessId = member?.membership?.business.id;
  if (!businessId) return;
  // The access screen is the owner's, who holds pay access always.
  if (parsed.data.kind !== "access" && !(await payAccess())) return;
  try {
    await notePayrollAccess(businessId, parsed.data.month, parsed.data.kind);
  } catch (error) {
    console.error(
      "noting a pay view failed",
      error instanceof Error ? error.message : error,
    );
  }
}
