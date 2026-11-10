"use server";

import { notePayrollAccess, type PayViewKind } from "@db/payroll";
import { setHourlyWage } from "@db/wages";
import { canWrite } from "@domain/view-as";
import { parseWageForm, type WageForm } from "@domain/wages";
import { refresh } from "next/cache";
import { z } from "zod";
import { pushSoon } from "../../../push/server";
import { currentMember } from "../../member";
import { payAccess } from "./pay";
import type { WageActionResult } from "./pay-types";

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

const wageForm = z.object({
  amount: z.string().max(40),
  from: z.string().max(20),
  note: z.string().max(1000),
});

/**
 * Set someone's hourly wage from a day, for a pay holder who isn't viewing as
 * someone else. The form is read by the same rules the screen checks; the
 * database checks the actor again (pay access, never their own, an owner's
 * only by an owner), keeps the wage before in the log, and tells the person.
 */
export async function setWageAction(
  personId: string,
  values: WageForm,
): Promise<WageActionResult> {
  const person = z.uuid().safeParse(personId);
  const form = wageForm.safeParse(values);
  if (!person.success || !form.success) {
    return { ok: false, failure: "invalid" };
  }
  const member = await currentMember();
  if (!member?.membership) return { ok: false, failure: "noAccess" };
  if (!canWrite(member.viewing)) return { ok: false, failure: "viewOnly" };
  const access = await payAccess();
  if (!access) return { ok: false, failure: "noAccess" };
  if (person.data === access.userId) return { ok: false, failure: "ownWage" };

  const parsed = parseWageForm(form.data, access.today);
  if (!parsed.ok) {
    return { ok: false, failure: "invalid", errors: parsed.errors };
  }
  const result = await setHourlyWage(
    access.userId,
    access.businessId,
    person.data,
    { agorot: parsed.agorot, from: parsed.from, note: parsed.note },
  );
  if (!result.ok) return { ok: false, failure: result.failure };
  // The person hears of it, on their phone too.
  pushSoon();
  refresh();
  return { ok: true };
}
