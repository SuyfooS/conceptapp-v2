"use server";

import { notePayrollAccess, type PayViewKind } from "@db/payroll";
import { setEmploymentPeriod, setPayrollDetails } from "@db/payroll-details";
import { setHourlyWage } from "@db/wages";
import {
  type DetailsForm,
  type PeriodForm,
  parseDetailsForm,
  parsePeriodForm,
} from "@domain/payroll-details";
import { canWrite } from "@domain/view-as";
import { parseWageForm, type WageForm } from "@domain/wages";
import { refresh } from "next/cache";
import { z } from "zod";
import { pushSoon } from "../../../push/server";
import { currentMember } from "../../member";
import { payAccess } from "./pay-access";
import type {
  DetailsActionResult,
  PeriodActionResult,
  WageActionResult,
} from "./pay-types";

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

/**
 * Who may change a person's details or periods, from the page: a pay holder
 * who isn't viewing as someone else, for someone else. The database checks
 * the actor again (pay access, never their own, an owner's only by an owner).
 */
async function detailsWriter(personId: string) {
  const person = z.uuid().safeParse(personId);
  if (!person.success) return { ok: false, failure: "invalid" } as const;
  const member = await currentMember();
  if (!member?.membership) return { ok: false, failure: "noAccess" } as const;
  if (!canWrite(member.viewing)) {
    return { ok: false, failure: "viewOnly" } as const;
  }
  const access = await payAccess();
  if (!access) return { ok: false, failure: "noAccess" } as const;
  if (person.data === access.userId) {
    return { ok: false, failure: "ownDetails" } as const;
  }
  return { ok: true, access, personId: person.data } as const;
}

const typedDate = z.object({
  day: z.string().max(8),
  month: z.string().max(8),
  year: z.string().max(8),
});

const detailsForm = z.object({
  payrollNumber: z.string().max(40),
  restDay: z.string().max(4),
  hoursLaw: z.string().max(20),
  compulsoryEducation: z.boolean(),
  birth: typedDate,
});

/**
 * Set a person's details for payroll. A birth date is read only from an
 * owner or the accountant, and sent once: the database keeps only the day
 * they turn 18, and the log only the names of the fields that changed.
 */
export async function setDetailsAction(
  personId: string,
  values: DetailsForm,
): Promise<DetailsActionResult> {
  const form = detailsForm.safeParse(values);
  if (!form.success) return { ok: false, failure: "invalid" };
  const writer = await detailsWriter(personId);
  if (!writer.ok) return writer;
  const { access } = writer;
  const parsed = parseDetailsForm(form.data, access.today, {
    birth: access.birth,
  });
  if (!parsed.ok) {
    return { ok: false, failure: "invalid", errors: parsed.errors };
  }
  const result = await setPayrollDetails(
    access.userId,
    access.businessId,
    writer.personId,
    parsed.patch,
  );
  if (!result.ok) return result;
  refresh();
  return { ok: true };
}

const periodForm = z.object({
  from: typedDate,
  to: typedDate,
  paid: typedDate,
});

/**
 * Add a period of a person's work, or change one of theirs (`periodId`).
 * The form is read by the same rules the sheet checks; the database refuses
 * one that shares a day with another of theirs.
 */
export async function setPeriodAction(
  personId: string,
  values: PeriodForm,
  periodId: string | null,
): Promise<PeriodActionResult> {
  const form = periodForm.safeParse(values);
  const period = z.uuid().nullable().safeParse(periodId);
  if (!form.success || !period.success) {
    return { ok: false, failure: "invalid" };
  }
  const writer = await detailsWriter(personId);
  if (!writer.ok) return writer;
  const { access } = writer;
  // The other periods are the database's to check: it refuses an overlap.
  const parsed = parsePeriodForm(form.data, access.today, []);
  if (!parsed.ok) {
    return { ok: false, failure: "invalid", errors: parsed.errors };
  }
  const result = await setEmploymentPeriod(
    access.userId,
    access.businessId,
    writer.personId,
    {
      from: parsed.from,
      to: parsed.to,
      paid: parsed.paid,
      periodId: period.data,
    },
  );
  if (!result.ok) return result;
  refresh();
  return { ok: true };
}
