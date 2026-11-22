import { defineManifest } from "@domain/modules";
import { z } from "zod";

/**
 * The hiring file (תיק עובד, profile design #82): what a business needs of a
 * worker to pay them, the ID, the address, the bank account and the pension,
 * kept sealed per business and person, with every view logged, a refused one
 * too. H4 is the database and the server alone
 * (supabase/migrations/20261126000200_employee_files.sql, @db/crypto,
 * @db/employee-files, @domain/employee-file): no screen. H5 brings the
 * worker's /me/file, H6 the owner's and the accountant's view, H7 Form 101,
 * H8 retention.
 *
 * Off in every template and every business, the demo ones included (their
 * files are made up), until Orel approves the screens. Even switched on, a
 * business that isn't a demo takes no real values until Orel opens them on
 * the production project (`private.file_settings`).
 *
 * Its one key, people.files, is given by an owner, as pay is: owners always
 * hold it and accountants through their fixed grant
 * (`private.accountant_perms`). Never switched per role on the roles screen:
 * it is the owner's own switch, on /manage/access in H6.
 */
export const manifest = defineManifest({
  key: "employee_files",
  requires: [],
  nav: null,
  icon: "documents",
  homeWidget: null,
  permissions: [
    {
      key: "people.files",
      area: "employee_files",
      defaultRole: "owner",
      byOwner: true,
    },
  ],
  // H5 brings what each business asks (bank, address, the contact, the 101's
  // way); nothing yet.
  settings: z.object({}),
});
