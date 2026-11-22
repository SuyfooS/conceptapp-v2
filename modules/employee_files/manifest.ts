import {
  DEDUCTIONS_FILE,
  FILE_SETTING_LINE_MAX,
  FORM101_LINK_MAX,
  FORM101_WAYS,
  isForm101Link,
  settingLine,
  tidyDeductionsFile,
  tidyForm101Link,
} from "@domain/employee-file-settings";
import { defineManifest } from "@domain/modules";
import { ISRAELI_PHONE_E164, normalizeIsraeliPhone } from "@domain/phone";
import { z } from "zod";

/**
 * The hiring file (תיק עובד, profile design #82): what a business needs of a
 * worker to pay them, the ID, the address, the bank account and the pension,
 * kept sealed per business and person, with every view logged, a refused one
 * too. H4 is the database and the server alone
 * (supabase/migrations/20261126000200_employee_files.sql, @db/crypto,
 * @db/employee-files, @domain/employee-file). H5a built the worker's own
 * /me/file, the module's page (no tab: the profile leads there); H5b brought
 * what each business asks, Today's cards and the landing after joining
 * (20261126000400_employee_files_settings.sql); H6a brought the owners' and
 * the accountant's view (the status on /team, /team/[person]/file), the
 * duties and the SMS step-up (20261126000500_file_holder_state.sql); H6b to
 * H6d follow (bank reviews, who sees the files, the payroll export), H7
 * Form 101, H8 retention.
 *
 * Off in every template and every business, the demo ones included (their
 * files are made up), until Orel approves the screens. Even switched on, a
 * business that isn't a demo takes no real values until Orel opens them on
 * the production project (`private.file_settings`).
 *
 * Its one key, people.files, is given by an owner, as pay is: owners always
 * hold it and accountants through their fixed grant
 * (`private.accountant_perms`). Never switched per role on the roles screen:
 * it is the owner's own switch, on /manage/access in H6c.
 */
export const manifest = defineManifest({
  key: "employee_files",
  requires: [],
  nav: null,
  icon: "documents",
  // Today's card while something is missing, else its quiet row; and the
  // card for whoever's account for wages changed.
  homeWidget: { minRole: "worker" },
  page: { href: "/me/file", minRole: "worker" },
  permissions: [
    {
      key: "people.files",
      area: "employee_files",
      defaultRole: "owner",
      byOwner: true,
    },
  ],
  // What each business asks of its workers, and who the notice names. Every
  // one is an owner's and the team's (the H5 plan's default 9): the database
  // refuses each from anyone else (public.set_module_settings, 42501) and
  // checks each value as these fields do (22023).
  // private.employee_files_settings holds the same defaults
  // (settings.db.test.ts keeps the two equal), and private.file_groups reads
  // askAddress and askBank, so what the file counts missing follows them.
  settings: z.object({
    /** The account for wages, with its SMS code. Off: wages are paid another way. */
    askBank: z.boolean().default(true).meta({ level: "owner" }),
    /** The home address, for Form 101 and the notice of working conditions. */
    askAddress: z.boolean().default(true).meta({ level: "owner" }),
    /** Someone to call, never required of the worker; managers see it. */
    askEmergencyContact: z.boolean().default(false).meta({ level: "owner" }),
    /** A language for work and safety instructions, never required either. */
    askWorkLanguage: z.boolean().default(false).meta({ level: "owner" }),
    /** On paper, by an approved system's link (with the two below), or not in the app. */
    form101: z.enum(FORM101_WAYS).default("print").meta({ level: "owner" }),
    /** The approved system's name, on the worker's button ("מילוי הטופס אצל"). */
    form101Provider: settingLine(FILE_SETTING_LINE_MAX)
      .default("")
      .meta({ level: "owner" }),
    /**
     * The approved system's link: https only, its scheme and host kept in
     * lower case. An owner's, never a manager's: it is where workers type
     * their ID. The approved vendors' list is H7's.
     */
    form101Link: z
      .string()
      .max(FORM101_LINK_MAX)
      .transform(tidyForm101Link)
      .refine(isForm101Link)
      .default("")
      .meta({ level: "owner", entry: "link" }),
    /** Who prepares the payroll, named in the notice as who receives the details. */
    payrollProvider: settingLine(FILE_SETTING_LINE_MAX)
      .default("")
      .meta({ level: "owner" }),
    /** The employer's legal name, in the notice and on Form 101. */
    employerName: settingLine(FILE_SETTING_LINE_MAX)
      .default("")
      .meta({ level: "owner" }),
    /** The phone for questions about the file, a mobile or a landline, kept as E.164. */
    employerPhone: z
      .string()
      .max(20)
      .transform((typed) =>
        typed.trim() === "" ? "" : (normalizeIsraeliPhone(typed) ?? typed),
      )
      .refine((phone) => phone === "" || ISRAELI_PHONE_E164.test(phone))
      .default("")
      .meta({ level: "owner", entry: "phone" }),
    /** The deductions file (תיק ניכויים), nine digits starting with 9, for Form 101. */
    deductionsFile: z
      .string()
      .max(20)
      .transform(tidyDeductionsFile)
      .refine((digits) => digits === "" || DEDUCTIONS_FILE.test(digits))
      .default("")
      .meta({ level: "owner", entry: "digits" }),
  }),
});
