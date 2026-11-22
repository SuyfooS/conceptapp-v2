import "server-only";
import { getEmployeeFile } from "@db/employee-files";
import { cityOf } from "@domain/cities";
import {
  BANK_CHANGE_SEEN_COOKIE,
  bankChangeSeen,
  bankChangeToTell,
} from "@domain/employee-file-settings";
import { phoneTail } from "@domain/employee-file-steps";
import { canOpenModule } from "@domain/modules";
import { clockAt } from "@domain/today";
import { manifestFor } from "@modules/registry";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { currentMember } from "../../member";
import { currentModuleSettings, currentModules } from "../../modules";
import { fileSettingsParts } from "./file-parts";
import type { FileScreen, FileToday } from "./file-types";

/**
 * The signed-in person's own hiring file in the business they are in (profile
 * H5a): the module on, their role on the staff (`canOpenModule` by the
 * module's page), and read under their own session through
 * `public.employee_file`, which logs nothing for a person's own read. A view
 * session never reads it: the database would only log a refusal. What the
 * business asks, and how it takes Form 101, are its settings (H5b), read
 * here, never from the browser. Never cached: the answer is the person's,
 * for this request alone. Nothing here logs a value; @db/employee-files logs
 * a failure's code.
 */
export async function currentFileScreen(): Promise<FileScreen> {
  const [member, enabled, settings] = await Promise.all([
    currentMember(),
    currentModules(),
    currentModuleSettings("employee_files"),
  ]);
  const membership = member?.membership;
  if (
    !member ||
    !membership ||
    !canOpenModule(manifestFor("employee_files"), enabled, membership)
  ) {
    return { kind: "closed" };
  }
  if (member.viewing) return { kind: "viewing" };

  const business = membership.business;
  const read = await getEmployeeFile(business.id, member.userId);
  if (!read.ok) {
    if (read.failure !== "denied") {
      return { kind: "unavailable", reason: read.failure };
    }
    // Off in the database a moment after the app read it on: no such screen.
    if (read.reason === "off") return { kind: "closed" };
    if (read.reason === "viewing") return { kind: "viewing" };
    return { kind: "unavailable", reason: "failed" };
  }
  const timeZone = business.place.timeZone;
  const today = clockAt(new Date(), timeZone).date;
  const year = Number(today.slice(0, 4));
  return {
    kind: "file",
    data: {
      businessId: business.id,
      businessName: business.name,
      accent: business.accent,
      timeZone,
      today,
      year,
      locale: member.profile.locale,
      addressForm: member.profile.addressForm,
      role: membership.role,
      demo: read.demo,
      file: read.file,
      address: read.address,
      city: cityOf(read.address?.cityCode ?? read.file?.city_code),
      email: read.email,
      documentName: read.documentName,
      holderName: read.holderName,
      masked: read.masked,
      missing: read.missing,
      ...fileSettingsParts(settings, read.file, read.emergency !== null),
      workLanguage: read.workLanguage,
      emergency: read.emergency,
      youthUntil: read.youthUntil,
      pensionDueOn: read.pensionDueOn,
      taxYear: read.taxYears.find((row) => row.year === year) ?? null,
      phoneTail: phoneTail(member.phone),
    },
  };
}

/**
 * What Today's cards need of the person's own file (H5b), and never a
 * value: how much of it is missing, and the account's last change while
 * Today tells it (14 days), unless they said they saw it on this device.
 * Null where there is no file to show (the module off, off the staff,
 * viewing as a role) and when anything went wrong, which never takes Today
 * down with it.
 */
export async function currentFileToday(): Promise<FileToday | null> {
  try {
    const screen = await currentFileScreen();
    if (screen.kind !== "file") return null;
    const { data } = screen;
    const changedAt = data.file?.bank_changed_at ?? null;
    const on = bankChangeToTell(changedAt, new Date(), data.timeZone);
    const seen =
      changedAt !== null &&
      bankChangeSeen(
        (await cookies()).get(BANK_CHANGE_SEEN_COOKIE)?.value,
        data.businessId,
        changedAt,
      );
    return {
      businessId: data.businessId,
      businessName: data.businessName,
      role: data.role,
      asked: data.asked.length,
      missing: data.missing.length,
      bank:
        on && !seen
          ? { on, disputed: data.file?.bank_review === "disputed" }
          : null,
    };
  } catch (error) {
    // Next's own throws (a prefetch's render stopping at a request-time
    // read, a redirect) go on to Next: they are no failure of the file.
    unstable_rethrow(error);
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : "without a code";
    // The error's kind, never its message: a message could carry a value.
    const kind = error instanceof Error ? error.name : typeof error;
    console.error("reading the file for Today failed", code, kind);
    return null;
  }
}
