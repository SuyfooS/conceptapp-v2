import "server-only";
import { getEmployeeFile } from "@db/employee-files";
import { cityOf } from "@domain/cities";
import { FILE_GROUPS } from "@domain/employee-file";
import { phoneTail } from "@domain/employee-file-steps";
import { canOpenModule } from "@domain/modules";
import { clockAt } from "@domain/today";
import { manifestFor } from "@modules/registry";
import { currentMember } from "../../member";
import { currentModules } from "../../modules";
import type { FileScreen } from "./file-types";

/**
 * The signed-in person's own hiring file in the business they are in (profile
 * H5a): the module on, their role on the staff (`canOpenModule` by the
 * module's page), and read under their own session through
 * `public.employee_file`, which logs nothing for a person's own read. A view
 * session never reads it: the database would only log a refusal. Never
 * cached: the answer is the person's, for this request alone. Nothing here logs a
 * value; @db/employee-files logs a failure's code.
 */
export async function currentFileScreen(): Promise<FileScreen> {
  const [member, enabled] = await Promise.all([
    currentMember(),
    currentModules(),
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
      asked: [...FILE_GROUPS],
      youthUntil: read.youthUntil,
      pensionDueOn: read.pensionDueOn,
      taxYear: read.taxYears.find((row) => row.year === year) ?? null,
      phoneTail: phoneTail(member.phone),
    },
  };
}
